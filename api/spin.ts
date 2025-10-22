import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withCors } from "../_cors"; // шлях відносно файлу
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

// ---- ENV ----
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SPIN_SECRET = process.env.SPIN_SECRET!;

// ---- DB ----
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

// ---- utils ----
function verifyToken(token: any) {
  if (!token?.payload || !token?.signature) return false;
  const sig = crypto
    .createHmac("sha256", SPIN_SECRET)
    .update(JSON.stringify(token.payload))
    .digest("base64url");
  return sig === token.signature && token.payload.exp > Date.now();
}

type Prize = {
  id: number;
  name: string;
  type: "percent" | "amount";
  value: number;
  weight: number;
  stock: number | null;
  active: boolean;
};

function weightedPick(prizes: Prize[]) {
  const pool = (prizes || []).filter(
    (p) => p.active && (p.stock === null || p.stock > 0)
  );
  const sum = pool.reduce((s, p) => s + Number(p.weight || 0), 0);
  if (!sum) return null;
  const r = Math.random() * sum;
  let acc = 0;
  for (const p of pool) {
    acc += Number(p.weight || 0);
    if (r <= acc) return p;
  }
  return pool[pool.length - 1] || null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (withCors(req, res)) return;

    const { token } = (req.body || {}) as { token?: any };
    if (!verifyToken(token)) {
      return res.status(400).json({ ok: false, error: "INVALID_TOKEN" });
    }

    const promo_code_id: number = token.payload.promo_code_id;

    // Код ще не використаний?
    const { data: codeRow, error: codeErr } = await supabase
      .from("promo_codes")
      .select("id, used_at")
      .eq("id", promo_code_id)
      .maybeSingle();

    if (codeErr) throw codeErr;
    if (!codeRow || codeRow.used_at) {
      return res.status(400).json({ ok: false, error: "ALREADY_USED" });
    }

    // Призи
    const { data: prizes, error: pErr } = await supabase
      .from("prizes")
      .select("*")
      .eq("active", true);

    if (pErr) throw pErr;

    let prize = weightedPick((prizes || []) as Prize[]);
    if (!prize) return res.status(400).json({ ok: false, error: "NO_PRIZES" });

    // Дані для транзакції
    const couponCode = "C-" + crypto.randomBytes(4).toString("hex").toUpperCase();
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(); // 1 рік
    const user_ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || null;
    const client_signature = crypto.randomBytes(16).toString("base64url");

    // Фіксуємо результат в БД атомарно
    const { error: rpcErr } = await supabase.rpc("consummate_spin", {
      p_prize_id: prize.id,
      p_promo_code_id: promo_code_id,
      p_coupon_code: couponCode,
      p_expires_at: expiresAt,
      p_user_ip: user_ip,
      p_client_signature: client_signature,
    });

    if (rpcErr) {
      // якщо раптово закінчився stock — пробуємо один раз інший приз
      if (String(rpcErr.message || "").includes("PRIZE_OUT_OF_STOCK")) {
        const altPool = (prizes || []).filter((p: Prize) => p.id !== prize!.id);
        prize = weightedPick(altPool as Prize[]);
        if (!prize) return res.status(400).json({ ok: false, error: "NO_PRIZES" });

        const { error: rpcErr2 } = await supabase.rpc("consummate_spin", {
          p_prize_id: prize.id,
          p_promo_code_id: promo_code_id,
          p_coupon_code: couponCode,
          p_expires_at: expiresAt,
          p_user_ip: user_ip,
          p_client_signature: client_signature,
        });
        if (rpcErr2) throw rpcErr2;
      } else {
        throw rpcErr;
      }
    }

    return res.status(200).json({
      ok: true,
      prize: { id: prize.id, name: prize.name, type: prize.type, value: prize.value },
      coupon: { code: couponCode, expiresAt },
      client_signature,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
}
