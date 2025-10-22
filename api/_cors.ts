import type { VercelRequest, VercelResponse } from '@vercel/node'

const ALLOWED_ORIGINS = new Set<string>([
  'https://weightwell.com.ua',
  'https://www.weightwell.com.ua',
  // під час локальної розробки:
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:51740',
])

export function setCors(req: VercelRequest, res: VercelResponse) {
  const origin = String(req.headers.origin || '')
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
  res.setHeader('Vary', 'Origin')
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET,POST,PUT,PATCH,DELETE,OPTIONS'
  )
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Admin-Secret'
  )
  // якщо потрібні кукі – додайте:
  // res.setHeader('Access-Control-Allow-Credentials', 'true')
}

export function handlePreflight(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    setCors(req, res)
    res.status(204).end()
    return true
  }
  return false
}

export function setJson(res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
}
