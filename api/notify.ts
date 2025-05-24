import type { VercelRequest, VercelResponse } from '@vercel/node';

const token = process.env.TELEGRAM_BOT_TOKEN!;
const chatIds = process.env.CHAT_IDS!.split(',');

const TELEGRAM_API = `https://api.telegram.org/bot${token}/sendMessage`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

  try {
    const { record, table } = req.body;

    let message = '';

    if (table === 'orders') {
      const { name, phone, email, city, address, notes, total_amount, id } = record;

      message += `🛒 <b>Нове замовлення</b>\n`;
      message += `👤 Ім'я: <b>${name}</b>\n`;
      message += `📞 Телефон: <b>${phone}</b>\n`;
      message += `📧 Email: <b>${email}</b>\n`;
      message += `🏙️ Місто: <b>${city}</b>\n`;
      message += `🏡 Адреса: <b>${address}</b>\n`;
      message += `📝 Коментар: ${notes || '-'}\n`;
      message += `💵 Сума: <b>${total_amount} грн</b>\n`;
      message += `📦 <b>Товари:</b>\n`;

      // Отримуємо товари замовлення
      const itemsRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/order_items?order_id=eq.${id}`, {
        headers: {
          apikey: process.env.SUPABASE_ANON_KEY!,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
        },
      });

      if (!itemsRes.ok) throw new Error('Не вдалося отримати товари замовлення');

      const items = await itemsRes.json();

      for (const item of items) {
        message += `• ${item.product_name} ${item.product_dosage} мг — <b>${item.quantity} шт.</b>\n`;
      }

    } else if (table === 'contact_messages') {
      const { name, phone, message: msg } = record;
      message += `📨 <b>Нове повідомлення з форми</b>\n👤 Ім'я: <b>${name}</b>\n📞 Телефон: <b>${phone}</b>\n💬 Повідомлення: ${msg}`;
    }

    for (const chatId of chatIds) {
      await fetch(TELEGRAM_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML',
        }),
      });
    }

    res.status(200).json({ status: 'ok' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to notify Telegram' });
  }
}
