import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE!);
const SPIN_SECRET = process.env.SPIN_SECRET!;

function verifyToken(token:any){
  if (!token?.payload || !token?.signature) return false;
  const sig = crypto.createHmac("sha256", SPIN_SECRET).update(JSON.stringify(token.payload)).digest("base64url");
  return sig === token.signature && token.payload.exp > Date.now();
}
function weightedPick(prizes:any[]){
  const pool = prizes.filter((p:any)=>p.active && (p.stock === null || p.stock > 0));
  const sum = pool.reduce((s:any,p:any)=>s + Number(p.weight||0), 0);
  if (!sum) return null;
  const r = Math.random()*sum;
  let acc = 0;
  for (const p of pool){ acc += Number(p.weight||0); if (r <= acc) return p; }
  return pool[pool.length-1] || null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method!=="POST") return res.status(405).json({ok:false,error:"METHOD_NOT_ALLOWED"});
    const { token } = req.body || {};
    if (!verifyToken(token)) return res.status(400).json({ok:false,error:"INVALID_TOKEN"});

    const promo_code_id = token.payload.promo_code_id;

    const { data: code } = await supabase.from("promo_codes").select("id, used_at").eq("id", promo_code_id).maybeSingle();
    if (!code || code.used_at) return res.status(400).json({ ok:false, error:"ALREADY_USED" });

    const { data: prizes, error: perr } = await supabase.from("prizes").select("*").eq("active", true);
    if (perr) throw perr;

    let prize:any = weightedPick(prizes || []);
    if (!prize) return res.status(400).json({ ok:false, error:"NO_PRIZES" });

    const couponCode = "C-" + crypto.randomBytes(4).toString("hex").toUpperCase();
    const expiresAt = new Date(Date.now() + 365*24*60*60*1000).toISOString();
    const user_ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || null;
    const client_signature = crypto.randomBytes(16).toString("base64url");

    const { error: rpcErr } = await supabase.rpc("consummate_spin", {
      p_prize_id: prize.id,
      p_promo_code_id: promo_code_id,
      p_coupon_code: couponCode,
      p_expires_at: expiresAt,
      p_user_ip: user_ip,
      p_client_signature: client_signature
    });

    if (rpcErr){
      if (String(rpcErr.message||"").includes("PRIZE_OUT_OF_STOCK")){
        const alt = (prizes||[]).filter((p:any)=>p.id!==prize.id);
        prize = weightedPick(alt);
        if (!prize) return res.status(400).json({ ok:false, error:"NO_PRIZES" });
        const { error: rpcErr2 } = await supabase.rpc("consummate_spin", {
          p_prize_id: prize.id,
          p_promo_code_id: promo_code_id,
          p_coupon_code: couponCode,
          p_expires_at: expiresAt,
          p_user_ip: user_ip,
          p_client_signature: client_signature
        });
        if (rpcErr2) throw rpcErr2;
      } else {
        throw rpcErr;
      }
    }

    res.status(200).json({
      ok:true,
      prize:{ id:prize.id, name:prize.name, type:prize.type, value:prize.value },
      coupon:{ code:couponCode, expiresAt },
      client_signature
    });
  } catch (e){
    console.error(e);
    res.status(500).json({ ok:false, error:"SERVER_ERROR" });
  }
}
