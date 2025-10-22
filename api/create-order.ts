import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withCors } from "../_cors"; // шлях відносно файлу
import { createClient } from "@supabase/supabase-js";

// ---- ENV ----
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY!;

// ---- DB ----
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

// ---- Types (спрощено) ----
type OrderItemInput = {
  product_id?: number | string;
  product_name: string;
  product_dosage?: string;
  price: number;    // ціна за 1 шт (грн)
  quantity: number; // кількість
};

type OrderInput = {
  name: string;
  phone: string;
  email?: string;
  city?: string;
  address?: string;  // відділення НП
  notes?: string;
  payment_method: "cod" | "fop" | string; // у тебе в notify.ts є перевірка на 'fop'
  items: OrderItemInput[];
  couponCode?: string | null;
};

function bad(res: VercelResponse, code: number, msg: string) {
  return res.status(code).json({ ok: false, error: msg });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (withCors(req, res)) return;

    const payload = (req.body || {}) as { order: OrderInput };

    if (!payload.order) return bad(res, 400, "ORDER_REQUIRED");
    const {
      name, phone, email, city, address, notes, payment_method, items, couponCode,
    } = payload.order;

    if (!name || !phone) return bad(res, 400, "NAME_PHONE_REQUIRED");
    if (!Array.isArray(items) || items.length === 0) return bad(res, 400, "ITEMS_REQUIRED");

    // 1) Рахуємо subtotal з товарів на сервері
    const normalizedItems: OrderItemInput[] = items.map(i => ({
      product_id: i.product_id ?? null,
      product_name: String(i.product_name || "").trim(),
      product_dosage: i.product_dosage ? String(i.product_dosage) : null,
      price: Number(i.price || 0),
      quantity: Number(i.quantity || 0),
    }));
    const subtotal = normalizedItems.reduce((s, i) => s + (i.price * i.quantity), 0);

    // 2) Якщо є купон — валідую, рахую знижку, помічаю redeemed=true
    let discount = 0;
    let prize_type: "percent" | "amount" | null = null;
    let prize_value: number | null = null;
    let applied_coupon: string | null = null;

    if (couponCode) {
      // шукаємо купон + приєднаний приз
      const { data: c, error: cErr } = await supabase
        .from("coupons")
        .select("id, code, redeemed, expires_at, prize:prize_id (type, value)")
        .eq("code", couponCode)
        .maybeSingle();

      if (cErr) throw cErr;
      if (!c) return bad(res, 400, "COUPON_NOT_FOUND");
      if (c.redeemed) return bad(res, 400, "COUPON_ALREADY_REDEEMED");
      if (c.expires_at && new Date(c.expires_at) < new Date())
        return bad(res, 400, "COUPON_EXPIRED");

      // рахуємо знижку
      prize_type = c.prize.type as "percent" | "amount";
      prize_value = Number(c.prize.value);
      if (prize_type === "percent") discount = Math.floor(subtotal * (prize_value / 100));
      if (prize_type === "amount")  discount = Math.min(subtotal, prize_value);
      applied_coupon = c.code;

      // помічаємо використаним атомарно (з умовою redeemed=false)
      const { data: upd, error: updErr } = await supabase
        .from("coupons")
        .update({ redeemed: true })
        .eq("id", c.id)
        .is("redeemed", false)
        .select("id")
        .maybeSingle();

      if (updErr) throw updErr;
      if (!upd) return bad(res, 409, "COUPON_RACE_CONDITION"); // між перевіркою і оновленням його вже використали
    }

    const total_amount = Math.max(0, subtotal - discount);

    // 3) Створюємо замовлення
    const orderInsert = {
      name,
      phone,
      email: email ?? null,
      city: city ?? null,
      address: address ?? null,
      notes: notes ?? null,
      payment_method,                  // 'fop' або 'cod'
      total_amount,                    // саме це читає твій notify.ts
      coupon_code: applied_coupon,     // для Telegram + історії
      discount_amount: discount,
      prize_type: prize_type,
      prize_value: prize_value
    };

    const { data: orderRow, error: ordErr } = await supabase
      .from("orders")
      .insert(orderInsert)
      .select("id")
      .single();

    if (ordErr) throw ordErr;

    const order_id = orderRow.id as number;

    // 4) Вставляємо товари
    const orderItemsRows = normalizedItems.map(i => ({
      order_id,
      product_id: i.product_id,
      product_name: i.product_name,
      product_dosage: i.product_dosage,
      quantity: i.quantity,
      price: i.price,
    }));

    const { error: itemsErr } = await supabase
      .from("order_items")
      .insert(orderItemsRows);

    if (itemsErr) throw itemsErr;

    // 5) Відповідь клієнту
    return res.status(200).json({
      ok: true,
      order_id,
      subtotal,
      discount,
      total_amount
    });

  } catch (e: any) {
    console.error("create-order error:", e);
    // Якщо десь після "redeemed=true" впало — можна (опціонально) відкочувати купон назад у false.
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
}
