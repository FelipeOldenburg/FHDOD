export function createScheduleController({ schedules, readBody }) {
  return {
    async collection({ req, user, method, send }) {
      if (method === "GET")
        return send({ imports: await schedules.list(user) });
      return send(
        {
          imported: await schedules.importRows(
            user,
            await readBody(req, 2 * 1024 * 1024),
          ),
        },
        201,
      );
    },
    remove: async ({ user, params, send }) =>
      send(await schedules.remove(user, params[0])),
    professionals: async ({ user, params, send }) =>
      send(await schedules.professionalsForResponse(user, params[0])),
  };
}
