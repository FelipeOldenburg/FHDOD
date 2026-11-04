import { demandPermission } from "../middleware/permissions.mjs";

export function createManagementController({
  bootstrap,
  manifestations,
  settings,
  audit,
  health,
  readBody,
}) {
  return {
    async health({ send }) {
      try {
        await health();
        return send({ ok: true });
      } catch {
        return send({ ok: false }, 503);
      }
    },
    bootstrap: async ({ user, send }) => send(await bootstrap(user)),
    async manifestations({ req, user, url, method, params, send }) {
      if (method === "GET")
        return send({ manifestations: await manifestations.list(user, url) });
      return send(
        await manifestations.update(user, params[0], await readBody(req)),
      );
    },
    async settings({ req, user, method, send }) {
      demandPermission(user, "canManageSettings");
      return send({
        settings:
          method === "GET"
            ? await settings.get()
            : await settings.update(user, await readBody(req)),
      });
    },
    audit: async ({ user, url, send }) =>
      send({
        events: await audit.list(
          user,
          Number(url.searchParams.get("limit") || 100),
        ),
      }),
  };
}
