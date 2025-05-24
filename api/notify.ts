import type { VercelRequest, VercelResponse } from '@vercel/node';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const CHAT_IDS = process.env.CHAT_IDS!.split(',');
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { record, table } = req.body;

    let message = '';

    if (table === 'orders') {
      const { id, name, phone, email, city, address, notes, total_amount } = record;

      message += `🛒 <b>Нове замовлення</b>\n`;
      message += `👤 Ім'я: <b>${name}</b>\n📞 Телефон: <b>${phone}</b>\n📧 Email: <b>${email}</b>\n🏙️ Місто: <b>${city}</b>\n🏡 Адреса: <b>${address}</b>\n📝 Коментар: ${notes || '-'}\n`;
      message += `💵 Сума: <b>${total_amount} грн</b>\n📦 Товари:\n`;

      const resItems = await fetch(`${SUPABASE_URL}/rest/v1/order_items?order_id=eq.${id}`, {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      });

      const items = await resItems.json();
      for (const item of items) {
        message += `• ${item.product_name} ${item.product_dosage} мг — <b>${item.quantity} шт.</b>\n`;
      }

    } else if (table === 'contact_messages') {
      const { name, phone, message: msg } = record;
      message += `📨 <b>Нове повідомлення з форми</b>\n👤 Ім'я: <b>${name}</b>\n📞 Телефон: <b>${phone}</b>\n💬 Повідомлення: ${msg}`;
    }

    for (const chatId of CHAT_IDS) {
      await fetch(TELEGRAM_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML'
        })
      });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Telegram Error:', err);
    return res.status(500).json({ error: 'Failed to send Telegram message' });
  }
}
