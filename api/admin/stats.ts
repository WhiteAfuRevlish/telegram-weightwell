// /api/admin/stats.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { assertAdmin, supabase } from "./_utils";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!assertAdmin(req, res)) return;
  try {
    // 1) загальні
    const [codesTotal, codesUsed, spinsTotal, couponsTotal, ordersTotal] = await Promise.all([
      supabase.from("promo_codes").select("id", { count: "exact", head: true }),
      supabase.from("promo_codes").select("id", { count: "exact", head: true }).not("used_at", "is", null),
      supabase.from("spins").select("id", { count: "exact", head: true }),
      supabase.from("coupons").select("id", { count: "exact", head: true }),
      supabase.from("orders").select("id", { count: "exact", head: true }),
    ]);

    // 2) динаміка по дням останні 30 днів
    const { data: spinsByDay } = await supabase
      .from("spins")
      .select("created_at")
      .gte("created_at", new Date(Date.now() - 30*24*60*60*1000).toISOString());

    const byDay: Record<string, number> = {};
    (spinsByDay || []).forEach((r) => {
      const d = new Date(r.created_at).toISOString().slice(0,10);
      byDay[d] = (byDay[d] || 0) + 1;
    });
    const timeline = Object.entries(byDay)
      .sort((a,b)=> a[0] < b[0] ? -1 : 1)
      .map(([date, count]) => ({ date, count }));

    return res.status(200).json({
      ok: true,
      totals: {
        promo_codes_total: codesTotal.count || 0,
        promo_codes_used: codesUsed.count || 0,
        spins_total: spinsTotal.count || 0,
        coupons_total: couponsTotal.count || 0,
        orders_total: ordersTotal.count || 0,
        usage_rate: (codesUsed.count || 0) / Math.max(1,(codesTotal.count || 0)),
      },
      timeline
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
}
