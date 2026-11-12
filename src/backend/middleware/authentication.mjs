export const getSessionToken = (req) =>
  (req.headers.cookie || "")
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith("fhdod_session="))
    ?.slice("fhdod_session=".length);

export const getTvToken = (req) =>
  (req.headers.cookie || "")
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith("fhdod_tv="))
    ?.slice("fhdod_tv=".length);

export const createAuthentication = (auth) => (req) =>
  auth.authenticate(getSessionToken(req));
