export const getSessionToken = (req) =>
  (req.headers.cookie || "")
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith("fhdod_session="))
    ?.slice("fhdod_session=".length);

export const createAuthentication = (auth) => (req) =>
  auth.authenticate(getSessionToken(req));
