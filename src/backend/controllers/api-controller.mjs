import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { csrf } from "../middleware/http.mjs";
import { fail } from "../middleware/validation.mjs";

export function createApiController({ root, routes, authenticate }) {
  return async (req, res) => {
    const requestId = randomUUID();
    const startedAt = performance.now();
    let path;
    res.setHeader("X-Request-Id", requestId);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Permissions-Policy",
      "camera=(),microphone=(),geolocation=()",
    );
    res.setHeader("Cache-Control", "no-store");
    const send = (value, status = 200) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
      });
      res.end(req.method === "HEAD" ? undefined : JSON.stringify(value));
      return true;
    };
    try {
      const url = new URL(req.url, "http://localhost");
      path = url.pathname.replace(/\/$/, "") || "/";
      const method = req.method;
      if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) csrf(req);
      if (path.startsWith("/api/")) {
        const matching = routes.filter((route) => route.pattern.test(path));
        const route = matching.find((route) => route.method === method);
        if (!route) {
          if (!matching.length) fail(404, "Recurso não encontrado.");
          res.setHeader(
            "Allow",
            [...new Set(matching.map((item) => item.method))].join(", "),
          );
          fail(405, "Método não permitido.");
        }
        const user = route.public ? undefined : await authenticate(req);
        if (user?.mustChangePassword && !route.allowTemporaryPassword)
          fail(403, "Troque sua senha temporária antes de continuar.");
        return await route.handle({
          req,
          res,
          url,
          path,
          method,
          user,
          params: path.match(route.pattern).slice(1),
          send,
        });
      }
      if (!["GET", "HEAD"].includes(method)) fail(405, "Método não permitido.");
      const dist = resolve(root, "dist");
      let decoded;
      try {
        decoded = decodeURIComponent(path);
      } catch {
        fail(400, "URL inválida.");
      }
      const target = resolve(dist, `.${decoded}`);
      if (target !== dist && !target.startsWith(`${dist}${sep}`))
        fail(404, "Arquivo não encontrado.");
      const file =
        existsSync(target) && statSync(target).isFile()
          ? target
          : resolve(dist, "index.html");
      if (!existsSync(file)) {
        res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end(
          "Interface ainda não compilada. Execute npm run dev para desenvolver ou npm run build para compilar.",
        );
      }
      const mime = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".woff2": "font/woff2",
        ".ico": "image/x-icon",
      };
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      );
      if (extname(file) !== ".html")
        res.setHeader("Cache-Control", "public,max-age=3600");
      res.writeHead(200, {
        "Content-Type": mime[extname(file)] || "application/octet-stream",
      });
      res.end(method === "HEAD" ? undefined : readFileSync(file));
    } catch (error) {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (!error.status)
        console.error("Erro interno da API:", {
          requestId,
          method: req.method,
          path,
          durationMs: Math.round(performance.now() - startedAt),
          code: error.code,
          message: error.message,
        });
      send(
        {
          error: error.status
            ? error.message
            : "Não foi possível concluir a operação. Tente novamente.",
        },
        error.status || 500,
      );
    }
  };
}
