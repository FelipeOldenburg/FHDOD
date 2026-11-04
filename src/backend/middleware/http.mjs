import { fail, parse } from "./validation.mjs";

export function csrf(req) {
  if (req.headers["sec-fetch-site"] === "cross-site")
    fail(403, "Origem da solicitação não autorizada.");
  const origin = req.headers.origin;
  if (
    origin &&
    origin !== `http://${req.headers.host}` &&
    origin !== `https://${req.headers.host}` &&
    origin !== process.env.FHDOD_ORIGIN
  )
    fail(403, "Origem da solicitação não autorizada.");
}

export async function readBody(req) {
  if (!(req.headers["content-type"] || "").startsWith("application/json"))
    fail(415, "Envie os dados como JSON.");
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 65536)
      fail(413, "O conteúdo enviado excede o limite permitido.");
    chunks.push(chunk);
  }
  const body = parse(Buffer.concat(chunks).toString("utf8"));
  if (!body || Array.isArray(body) || typeof body !== "object")
    fail(400, "JSON inválido.");
  return body;
}

export function createRateLimit() {
  // shortcut: limites por processo e IP da conexão; adaptar ao proxy confiável e compartilhar antes de usar várias instâncias.
  const buckets = new Map();
  return (req, scope, max = 30, interval = 15 * 60 * 1000) => {
    const current = Date.now();
    for (const [key, bucket] of buckets)
      if (bucket.until < current) buckets.delete(key);
    const key = `${scope}:${req.socket.remoteAddress}`;
    const bucket = buckets.get(key) || { count: 0, until: current + interval };
    buckets.set(key, bucket);
    if (++bucket.count > max)
      fail(429, "Muitas tentativas. Aguarde alguns minutos e tente novamente.");
  };
}
