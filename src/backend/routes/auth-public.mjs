export function createAuthPublicRoutes({ auth, publicSurvey, management }) {
  return [
    ["GET", /^\/api\/health$/, management.health],
    ["GET", /^\/api\/auth\/setup$/, auth.setupStatus],
    ["POST", /^\/api\/auth\/setup$/, auth.setup],
    ["POST", /^\/api\/auth\/login$/, auth.login],
    ["POST", /^\/api\/auth\/logout$/, auth.logout],
    ["GET", /^\/api\/public\/sectors\/([^/]+)$/, publicSurvey.sector],
    ["POST", /^\/api\/public\/responses$/, publicSurvey.start],
    ["PUT", /^\/api\/public\/responses\/([^/]+)$/, publicSurvey.answer],
    [
      "POST",
      /^\/api\/public\/responses\/([^/]+)\/submit$/,
      publicSurvey.submit,
    ],
  ].map(([method, pattern, handle]) => ({
    method,
    pattern,
    handle,
    public: true,
  }));
}
