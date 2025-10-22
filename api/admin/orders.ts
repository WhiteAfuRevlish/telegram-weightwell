import type { VercelRequest, VercelResponse } from "@vercel/node";
import { assertAdmin, supabase } from "./_utils";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!assertAdmin(req, res)) return;
  try {
    if (req.method !== "GET") return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });

    const { q, limit = "100" } = req.query as any;

    let query = supabase
      .from("orders")
      .select("id, created_at, name, phone, city, total_amount, coupon_code, discount_amount, payment_method")
      .order("id", { ascending: false })
      .limit(Number(limit));

    if (q) {
      // пошук по телефону/імені/місту/купоні/id
      query = query.or(
        `phone.ilike.%${q}%,name.ilike.%${q}%,city.ilike.%${q}%,coupon_code.eq.${q},id.eq.${Number(q) || 0}`
      );
    }

    const { data, error } = await query;
    if (error) throw error;
    return res.status(200).json({ ok: true, data });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
}
