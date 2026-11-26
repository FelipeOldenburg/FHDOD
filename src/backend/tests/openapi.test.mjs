import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createApiRoutes } from "../routes/api.mjs";
import { createAuthPublicRoutes } from "../routes/auth-public.mjs";

test("documenta todos os métodos e caminhos da API no Swagger", async () => {
  const spec = JSON.parse(await readFile(new URL("../../../docs/openapi.json", import.meta.url), "utf8"));
  const routes = [
    ...createAuthPublicRoutes({ auth: {}, publicSurvey: {}, management: {}, tvWall: {} }),
    ...createApiRoutes({ auth: {}, admin: {}, survey: {}, reports: {}, management: {}, tvWall: {}, schedules: {} }),
  ];
  const covered = new Set();
  for (const [path, operations] of Object.entries(spec.paths)) {
    const examplePath = path.replace(/\{[^}]+\}/g, "exemplo");
    for (const method of Object.keys(operations)) {
      const route = routes.find((item) =>
        item.method === method.toUpperCase() && item.pattern.test(examplePath),
      );
      assert.ok(route, `Operação sem rota no backend: ${method.toUpperCase()} ${path}`);
      covered.add(route);
    }
  }
  for (const route of routes) {
    assert.ok(covered.has(route), `Rota sem documentação: ${route.method} ${route.pattern}`);
  }
});
