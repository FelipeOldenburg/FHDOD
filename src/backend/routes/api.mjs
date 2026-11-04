export function createApiRoutes({ auth, admin, survey, reports, management }) {
  return [
    ["GET", /^\/api\/auth\/me$/, auth.me, true],
    ["POST", /^\/api\/auth\/password$/, auth.password, true],
    ["GET", /^\/api\/bootstrap$/, management.bootstrap],
    ...["GET", "POST"].map((method) => [
      method,
      /^\/api\/sectors$/,
      admin.sectors,
    ]),
    ...["PUT", "PATCH", "DELETE"].map((method) => [
      method,
      /^\/api\/sectors\/([^/]+)$/,
      admin.sectors,
    ]),
    ...["GET", "POST"].map((method) => [method, /^\/api\/users$/, admin.users]),
    ...["PUT", "PATCH"].map((method) => [
      method,
      /^\/api\/users\/([^/]+)$/,
      admin.users,
    ]),
    ["GET", /^\/api\/surveys$/, survey.list],
    ["POST", /^\/api\/surveys$/, survey.save],
    ...["PUT", "PATCH"].map((method) => [
      method,
      /^\/api\/surveys\/([^/]+)$/,
      survey.save,
    ]),
    ["DELETE", /^\/api\/surveys\/([^/]+)$/, survey.deactivate],
    ["GET", /^\/api\/responses$/, reports.responses],
    ["GET", /^\/api\/dashboard$/, reports.dashboard],
    ["POST", /^\/api\/exports$/, reports.export],
    ["GET", /^\/api\/manifestations(?:\/([^/]+))?$/, management.manifestations],
    ...["PUT", "PATCH"].map((method) => [
      method,
      /^\/api\/manifestations\/([^/]+)$/,
      management.manifestations,
    ]),
    ...["GET", "PUT"].map((method) => [
      method,
      /^\/api\/settings$/,
      management.settings,
    ]),
    ["GET", /^\/api\/audit$/, management.audit],
  ].map(([method, pattern, handle, allowTemporaryPassword = false]) => ({
    method,
    pattern,
    handle,
    allowTemporaryPassword,
  }));
}
