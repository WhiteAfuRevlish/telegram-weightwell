export function withCors(req: any, res: any) {
  // постав будь-який конкретний домен замість * для жорсткішої політики
  res.setHeader("Access-Control-Allow-Origin", "https://weightwell.com.ua/");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Admin-Secret");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true; // припиняємо виконання хендлера
  }
  return false;
}
