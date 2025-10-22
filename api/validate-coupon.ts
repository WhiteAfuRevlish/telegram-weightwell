// /api/validate-coupon.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withCors } from "../_cors"; // шлях відносно файлу
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (withCors(req, res)) return;

    const { data, error } = await supabase
      .from("coupons")
      .select("code, redeemed, expires_at, prize:prize_id (type, value)")
      .eq("code", code)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ ok:false, error:"NOT_FOUND" });
    if (data.redeemed) return res.status(400).json({ ok:false, error:"ALREADY_REDEEMED" });
    if (data.expires_at && new Date(data.expires_at) < new Date())
      return res.status(400).json({ ok:false, error:"EXPIRED" });

    return res.status(200).json({ ok:true, prize: data.prize }); // { type:'percent'|'amount', value:number }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok:false, error:"SERVER_ERROR" });
  }
}
