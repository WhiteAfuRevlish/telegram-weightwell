import type { VercelRequest, VercelResponse } from "@vercel/node";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const CHAT_IDS = (process.env.CHAT_IDS || "").split(",").filter(Boolean);
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE!;

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

function esc(s: any) {
  const str = (s ?? "").toString();
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function money(n: any) {
  const v = Number(n || 0);
  return `${v.toFixed(2)} грн`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Webhook від Supabase досилає тіло формату { type, table, record, schema, ... }
    const { record, table } = (req.body || {}) as {
      table?: string;
      record?: any;
    };

    if (!record || !table) {
      return res.status(400).json({ error: "Bad payload" });
    }

    let message = "";

    if (table === "orders") {
      const {
        id,
        name,
        phone,
        email,
        city,
        address,
        notes,
        total_amount,
        payment_method,
        coupon_code,
        prize_type,
        prize_value,
        discount_amount,
      } = record;

      // 1) Заголовок + покупець
      message += `🛒 <b>Нове замовлення</b>\n`;
      message += `👤 Ім'я: <b>${esc(name)}</b>\n`;
      message += `📞 Телефон: <b>${esc(phone)}</b>\n`;
      if (email) message += `📧 Email: <b>${esc(email)}</b>\n`;
      if (city) message += `🏙️ Місто: <b>${esc(city)}</b>\n`;
      if (address) message += `🏡 Адреса НП: <b>${esc(address)}</b>\n`;
      message += `📝 Коментар: ${esc(notes) || "-"}\n`;

      // 2) Купон (опціонально)
      if (coupon_code) {
        const prize =
          prize_type === "percent"
            ? `${prize_value}%`
            : prize_type === "amount"
            ? `${prize_value} грн`
            : "—";
        const disc =
          typeof discount_amount === "number"
            ? money(discount_amount)
            : "—";
        message += `🏷️ Купон: <b>${esc(coupon_code)}</b> (${esc(prize)})\n`;
        message += `🔻 Знижка: <b>${esc(disc)}</b>\n`;
      }

      // 3) Товари
      message += `\n📦 Товари:\n`;

      // підтягнемо позиції
      const resItems = await fetch(
        `${SUPABASE_URL}/rest/v1/order_items?order_id=eq.${encodeURIComponent(
          id
        )}`,
        {
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY!,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            Prefer: "return=representation",
          },
        }
      );

      const items = (await resItems.json()) as Array<{
        product_name: string;
        product_dosage?: string | null;
        quantity: number;
        price?: number | null; // ціна за 1 шт, якщо є
      }>;

      let itemsSubtotal = 0;
      for (const it of items || []) {
        const line =
          typeof it.price === "number"
            ? it.price * Number(it.quantity || 0)
            : null;
        if (typeof it.price === "number") itemsSubtotal += line!;
        message += `• ${esc(it.product_name)}${
          it.product_dosage ? ` ${esc(it.product_dosage)} мг` : ""
        } — <b>${Number(it.quantity || 0)} шт.</b>${
          typeof it.price === "number"
            ? ` × ${money(it.price)} = <b>${money(line)}</b>`
            : ""
        }\n`;
      }

      // 4) Підсумок
      message += `\n💳 Оплата: <b>${
        payment_method === "fop" ? "ФОП" : "Накладений платіж"
      }</b>\n`;
      if (items.length && itemsSubtotal) {
        message += `🧮 Сума товарів: <b>${money(itemsSubtotal)}</b>\n`;
      }
      if (coupon_code && typeof discount_amount === "number") {
        message += `🔻 Знижка за купоном: <b>${money(discount_amount)}</b>\n`;
      }
      message += `💵 Разом до сплати: <b>${money(total_amount)}</b>\n`;
      message += `\n#order_${esc(id)}`;

    } else if (table === "contact_messages") {
      const { name, phone, message: msg } = record;
      message += `📨 <b>Нове повідомлення з форми</b>\n`;
      if (name) message += `👤 Ім'я: <b>${esc(name)}</b>\n`;
      if (phone) message += `📞 Телефон: <b>${esc(phone)}</b>\n`;
      message += `💬 Повідомлення: ${esc(msg) || "-"}\n`;
    } else {
      // інші таблиці ігноруємо тихо
      return res.status(200).json({ skipped: true });
    }

    // Відправляємо в усі чати
    await Promise.all(
      CHAT_IDS.map((chatId) =>
        fetch(TELEGRAM_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: "HTML",
            disable_web_page_preview: true,
          }),
        })
      )
    );

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Telegram Error:", err);
    return res.status(500).json({ error: "Failed to send Telegram message" });
  }
}
