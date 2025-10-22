import type { VercelRequest, VercelResponse } from "@vercel/node";
import { assertAdmin, supabase } from "./_utils";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!assertAdmin(req, res)) return;

  try {
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("prizes")
        .select("*")
        .order("id", { ascending: true });
      if (error) throw error;
      return res.status(200).json({ ok: true, data });
    }

    if (req.method === "PATCH") {
      const { id, active, weight, stock, name, type, value } = req.body || {};
      if (!id) return res.status(400).json({ ok: false, error: "ID_REQUIRED" });

      const patch: any = {};
      if (typeof active === "boolean") patch.active = active;
      if (weight !== undefined) patch.weight = Number(weight);
      if (stock !== undefined) patch.stock = stock === null ? null : Number(stock);
      if (name !== undefined) patch.name = name;
      if (type !== undefined) patch.type = type; // 'percent' | 'amount'
      if (value !== undefined) patch.value = Number(value);

      const { data, error } = await supabase
        .from("prizes")
        .update(patch)
        .eq("id", id)
        .select("*")
        .maybeSingle();

      if (error) throw error;
      return res.status(200).json({ ok: true, data });
    }

    return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
}
