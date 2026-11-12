export function createAuthPublicRoutes({ auth, publicSurvey, management, tvWall }) {
  return [
    ["GET", /^\/api\/health$/, management.health],
    ["GET", /^\/api\/auth\/setup$/, auth.setupStatus],
    ["POST", /^\/api\/auth\/setup$/, auth.setup],
    ["POST", /^\/api\/auth\/login$/, auth.login],
    ["POST", /^\/api\/auth\/logout$/, auth.logout],
    ["POST", /^\/api\/public\/tv\/pair$/, tvWall.pair],
    ["GET", /^\/api\/public\/tv\/dashboard$/, tvWall.display],
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
