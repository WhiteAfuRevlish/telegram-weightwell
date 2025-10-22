import type { VercelRequest, VercelResponse } from "@vercel/node";
import { assertAdmin, supabase, asCsv } from "./_utils";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!assertAdmin(req, res)) return;
  try {
    if (req.method !== "GET") return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });

    const { q, export: exportCSV } = req.query as any;

    let query = supabase.from("promo_codes")
      .select("id, code, code_hmac, campaign, used_at")
      .order("id", { ascending: false });

    if (q) {
      // пошук по точному code або по campaign LIKE
      query = query.or(`code.eq.${q},campaign.ilike.%${q}%`);
    }

    const { data, error } = await query.limit(2000); // захист від надвеликих відповідей
    if (error) throw error;

    if (exportCSV === "1") {
      const csv = asCsv(data || []);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="promo_codes.csv"`);
      return res.status(200).send(csv);
    }

    return res.status(200).json({ ok: true, data });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
}
