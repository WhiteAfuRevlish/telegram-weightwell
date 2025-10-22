import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { assertAdmin } from "./_utils";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function hmac(code: string) {
  const hmac = crypto.createHmac("sha256", process.env.HMAC_SECRET!);
  hmac.update(code);
  return hmac.digest("hex");
}
function randCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const pick = (n: number) => Array.from({length:n}, ()=>alphabet[Math.floor(Math.random()*alphabet.length)]).join("");
  return `${pick(4)}-${pick(4)}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!assertAdmin(req, res)) return;

  try {
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
    const { count = 50, campaign = "Flyer" } = (req.body || {}) as { count?: number; campaign?: string };

    const n = Math.min(5000, Math.max(1, Number(count || 0))); // запобіжник
    const rows: { code: string; code_hmac: string; campaign: string }[] = [];
    const codes = new Set<string>();

    while (rows.length < n) {
      const code = randCode();
      if (codes.has(code)) continue;
      codes.add(code);
      rows.push({ code, code_hmac: hmac(code), campaign });
    }

    const { error } = await supabase.from("promo_codes").insert(rows);
    if (error) throw error;

    // CSV + QR URL
    const base = process.env.PUBLIC_SITE_BASE_URL || "https://example.com";
    const data = rows.map((r) => ({
      code: r.code,
      campaign: r.campaign,
      qr_url: `${base}/spin?c=${encodeURIComponent(r.code)}`
    }));

    const headers = ["code","campaign","qr_url"];
    const escape = (v:string) => `"${v.replace(/"/g,'""')}"`;
    const csv = [headers.join(","), ...data.map(d => headers.map(h => escape(String((d as any)[h] ?? ""))).join(","))].join("\n");

    res.setHeader("Content-Type","text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="codes_${campaign}_${Date.now()}.csv"`);
    return res.status(200).send(csv);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
}
