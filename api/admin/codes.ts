import type { VercelRequest, VercelResponse } from "@vercel/node";
import { setCors, handlePreflight, setJson } from "../_cors";
import { assertAdmin, supabase, asCsv } from "./_utils";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS preflight
  if (handlePreflight(req, res)) return;
  // CORS для основного запиту
  setCors(req, res);

  try {
    // тільки GET (якщо потрібно — додай інші)
    if (req.method !== "GET") {
      setJson(res);
      return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
    }

    // адмін-авторизація (кине помилку — перехопимо нижче)
    await assertAdmin(req);

    const { q, export: exportCSV } = (req.query || {}) as { q?: string; export?: string };

    let query = supabase
      .from("promo_codes")
      .select("id, code, code_hmac, campaign, used_at")
      .order("id", { ascending: false })
      .limit(2000); // захист від надвеликих відповідей

    if (q) {
      // пошук по точному code або по campaign LIKE
      query = query.or(`code.eq.${q},campaign.ilike.%${q}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Експорт CSV
    if (exportCSV === "1") {
      const csv = asCsv(data || []);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="promo_codes.csv"`);
      return res.status(200).send(csv);
    }

    // Звичайна JSON-відповідь
    setJson(res);
    return res.status(200).json({ ok: true, data });
  } catch (e: any) {
    console.error(e);
    setJson(res);
    const status = e?.status ?? 500;
    const message = e?.code || e?.message || "SERVER_ERROR";
    return res.status(status >= 400 && status < 600 ? status : 500).json({ ok: false, error: message });
  }
}
