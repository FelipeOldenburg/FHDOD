import { fail } from "../middleware/validation.mjs";
import { getSessionToken } from "../middleware/authentication.mjs";
import { requestAddress, secureRequest } from "../middleware/http.mjs";

const rememberedSessionMaxAge = 365 * 24 * 60 * 60;

function setSessionCookie(req, res, token, persistent = false) {
  const secure = secureRequest(req);
  const lifetime = token
    ? persistent
      ? `; Max-Age=${rememberedSessionMaxAge}`
      : ""
    : "; Max-Age=0";
  res.setHeader(
    "Set-Cookie",
    `fhdod_session=${token}; HttpOnly; SameSite=Strict; Path=/${lifetime}${secure ? "; Secure" : ""}`,
  );
}

export function createAuthController({ auth, readBody, rateLimit, demo }) {
  function signedIn(
    req,
    res,
    send,
    { user, token, persistent = false },
    status = 200,
  ) {
    setSessionCookie(req, res, token, persistent);
    return send({ user }, status);
  }
  return {
    setupStatus: async ({ send }) =>
      send({ needsSetup: await auth.needsSetup(), demo }),
    setup: async ({ req, res, send }) => {
      const hostname = new URL(`http://${req.headers.host}`).hostname;
      if (
        !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
          requestAddress(req),
        ) ||
        !["127.0.0.1", "localhost", "[::1]"].includes(hostname)
      )
        fail(403, "A configuração inicial deve ser feita no servidor local.");
      rateLimit(req, "setup", 10);
      return signedIn(
        req,
        res,
        send,
        await auth.setup(await readBody(req)),
        201,
      );
    },
    login: async ({ req, res, send }) => {
      rateLimit(req, "login");
      return signedIn(req, res, send, await auth.login(await readBody(req)));
    },
    logout: async ({ req, res, send }) => {
      await auth.logout(getSessionToken(req));
      setSessionCookie(req, res, "");
      return send({ loggedOut: true });
    },
    me: ({ user, send }) => send({ user }),
    password: async ({ req, res, user, send }) => {
      rateLimit(req, `password:${user.id}`, 10);
      return signedIn(
        req,
        res,
        send,
        await auth.changePassword(user, await readBody(req)),
      );
    },
  };
}
