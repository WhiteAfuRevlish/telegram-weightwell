import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";

// ---- ENV ----
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY!;
const HMAC_SECRET = process.env.HMAC_SECRET!;
const SPIN_SECRET = process.env.SPIN_SECRET!;

// ---- DB ----
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

// ---- utils ----
function hmac(code: string) {
  return crypto.createHmac("sha256", HMAC_SECRET).update(code).digest("base64url");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
    }

    const { code } = (req.body || {}) as { code?: string };
    if (!code || typeof code !== "string") {
      return res.status(400).json({ ok: false, error: "CODE_REQUIRED" });
    }

    const code_hmac = hmac(code);
    const { data, error } = await supabase
      .from("promo_codes")
      .select("id, code_hash, used_at")
      .eq("code_hmac", code_hmac)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(400).json({ ok: false, error: "INVALID_CODE" });
    if (data.used_at) return res.status(400).json({ ok: false, error: "ALREADY_USED" });

    // Додаткова перевірка (не обов'язково, але безпечно)
    const ok = await bcrypt.compare(code, data.code_hash);
    if (!ok) return res.status(400).json({ ok: false, error: "INVALID_CODE" });

    // Короткоживучий токен на оберт
    const payload = {
      promo_code_id: data.id,
      exp: Date.now() + 5 * 60 * 1000, // 5 хв
    };
    const signature = crypto
      .createHmac("sha256", SPIN_SECRET)
      .update(JSON.stringify(payload))
      .digest("base64url");

    return res.status(200).json({ ok: true, token: { payload, signature } });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
}
