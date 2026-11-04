export function createReportController({ reports, readBody }) {
  return {
    dashboard: async ({ user, url, send }) =>
      send(await reports.dashboard(user, url)),
    responses: async ({ user, url, send }) =>
      send({ responses: await reports.responses(user, url) }),
    export: async ({ req, user, send }) =>
      send(await reports.recordExport(user, await readBody(req))),
  };
}
