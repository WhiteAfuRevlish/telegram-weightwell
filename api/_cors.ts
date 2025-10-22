// api/_cors.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'

const ALLOWED_ORIGINS = [
  'https://weightwell.com.ua',
  'https://www.weightwell.com.ua',
]

export function setCors(req: VercelRequest, res: VercelResponse) {
  const origin = String(req.headers.origin || '')
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Secret')
  // Кукі не використовуєш → Allow-Credentials НЕ ставимо
  // res.setHeader('Access-Control-Allow-Credentials', 'true')
}

export function handlePreflight(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    setCors(req, res)
    // без тіла — інакше браузер може знову валити
    res.status(204).end()
    return true
  }
  return false
}

// зручно: ставимо JSON заголовки для валідних відповідей
export function setJson(res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
}
