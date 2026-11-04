import { fail } from "../middleware/validation.mjs";

export function createAdminController({ admin, readBody }) {
  return {
    async sectors({ req, method, params, user, send }) {
      if (method === "GET")
        return send({ sectors: await admin.listSectors(user) });
      if (method === "POST")
        return send(
          await admin.saveSector(user, undefined, await readBody(req)),
          201,
        );
      if (["PUT", "PATCH"].includes(method) && params[0])
        return send(
          await admin.saveSector(user, params[0], await readBody(req)),
        );
      if (method === "DELETE" && params[0])
        return send(await admin.deactivateSector(user, params[0]));
      fail(405, "Método não permitido.");
    },
    async users({ req, method, params, user, send }) {
      if (method === "GET") return send({ users: await admin.listUsers(user) });
      if (method === "POST")
        return send(
          await admin.saveUser(user, undefined, await readBody(req)),
          201,
        );
      if (["PUT", "PATCH"].includes(method) && params[0])
        return send(await admin.saveUser(user, params[0], await readBody(req)));
      fail(405, "Método não permitido.");
    },
  };
}
