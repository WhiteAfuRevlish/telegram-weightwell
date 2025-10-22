import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withCors } from "../_cors";
import { assertAdmin, supabase, asCsv } from "./_utils";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (withCors(req, res)) return;

  try {
    if (req.method !== "GET") return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });

    const {
      q = "",
      page = "1",
      page_size = "50",
      date_from,
      date_to,
      export: exportCSV
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(String(page_size), 10) || 50));
    const from = (pageNum - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("orders")
      .select("id, created_at, name, phone, city, total_amount, coupon_code, discount_amount, payment_method", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (q) {
      query = query.or(
        `phone.ilike.%${q}%,name.ilike.%${q}%,city.ilike.%${q}%,coupon_code.eq.${q},id.eq.${Number(q) || 0}`
      );
    }
    if (date_from) query = query.gte("created_at", new Date(date_from).toISOString());
    if (date_to)   query = query.lte("created_at", new Date(date_to).toISOString());

    const { data, error, count } = await query;
    if (error) throw error;

    if (exportCSV === "1") {
      const csv = asCsv(data || []);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="orders_${Date.now()}.csv"`);
      return res.status(200).send(csv);
    }

    return res.status(200).json({
      ok: true,
      data,
      page: pageNum,
      page_size: pageSize,
      total: count || 0,
      total_pages: Math.max(1, Math.ceil((count || 0) / pageSize)),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
}
