// /api/redeem-coupon.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ ok:false, error:"METHOD_NOT_ALLOWED" });
    const { code, order_total } = (req.body || {}) as { code?: string; order_total?: number };
    if (!code) return res.status(400).json({ ok:false, error:"CODE_REQUIRED" });

    // 1) шукаємо купон
    const { data, error } = await supabase
      .from("coupons")
      .select("id, redeemed, expires_at, prize:prize_id (type, value)")
      .eq("code", code)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ ok:false, error:"NOT_FOUND" });
    if (data.redeemed) return res.status(400).json({ ok:false, error:"ALREADY_REDEEMED" });
    if (data.expires_at && new Date(data.expires_at) < new Date())
      return res.status(400).json({ ok:false, error:"EXPIRED" });

    // 2) рахуємо знижку “по-чесному” на сервері
    const prize = data.prize as { type: "percent"|"amount"; value: number };
    const subtotal = Number(order_total || 0); // якщо треба
    let discount = 0;
    if (prize.type === "percent") discount = Math.round(subtotal * (prize.value / 100));
    if (prize.type === "amount")  discount = Math.min(subtotal, prize.value);

    // 3) позначаємо купон використаним
    const { error: updErr } = await supabase
      .from("coupons")
      .update({ redeemed: true })
      .eq("id", data.id);
    if (updErr) throw updErr;

    return res.status(200).json({ ok:true, discount, prize });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok:false, error:"SERVER_ERROR" });
  }
}
