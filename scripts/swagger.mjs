import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createApplication } from "../src/backend/app.mjs";

const host = "127.0.0.1";
const port = 4177;
const address = `http://${host}:${port}`;
const databaseUrl = process.env.FHDOD_TEST_DATABASE_URL;

function databaseAddress(value) {
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  return `${local ? "loopback" : url.hostname}:${url.port || 5432}${url.pathname}`;
}

if (
  !databaseUrl ||
  (process.env.DATABASE_URL &&
    databaseAddress(databaseUrl) === databaseAddress(process.env.DATABASE_URL))
) {
  throw new Error("Configure FHDOD_TEST_DATABASE_URL para um PostgreSQL separado do banco principal.");
}

const documents = [
  ["/swagger", "text/html; charset=utf-8", new URL("../docs/swagger/index.html", import.meta.url)],
  ["/swagger/initialize.js", "text/javascript; charset=utf-8", new URL("../docs/swagger/initialize.js", import.meta.url)],
  ["/openapi.json", "application/json; charset=utf-8", new URL("../docs/openapi.json", import.meta.url)],
  ["/swagger/swagger-ui.css", "text/css; charset=utf-8", new URL(import.meta.resolve("swagger-ui-dist/swagger-ui.css"))],
  ["/swagger/swagger-ui-bundle.js", "text/javascript; charset=utf-8", new URL(import.meta.resolve("swagger-ui-dist/swagger-ui-bundle.js"))],
];
const assets = new Map(await Promise.all(documents.map(async ([path, type, file]) => [
  path, { type, content: await readFile(file) },
])));
const app = await createApplication({
  databaseUrl,
  demo: true,
  schemaName: `swagger_${randomUUID().replaceAll("-", "")}`,
});
const server = createServer((req, res) => {
  if (req.headers.host !== `${host}:${port}`) {
    res.writeHead(400).end();
    return;
  }
  const path = new URL(req.url, address).pathname;
  if (path.startsWith("/api/")) {
    void app.handler(req, res);
    return;
  }
  if (path === "/" || path === "/swagger/") {
    res.writeHead(302, { Location: "/swagger" }).end();
    return;
  }
  const asset = assets.get(path);
  if (!asset) {
    res.writeHead(404).end();
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  res.writeHead(200, {
    "Content-Type": asset.type,
    "Content-Length": asset.content.length,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  }).end(req.method === "HEAD" ? undefined : asset.content);
});

try {
  await app.seedDemo();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
} catch (error) {
  await app.close();
  throw error;
}

let shutdown;
function stop() {
  shutdown ??= (async () => {
    await new Promise((resolve) => server.close(resolve));
    await app.close();
  })().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
console.log(`Swagger UI em ${address}/swagger (banco de teste, dados fictícios)`);
