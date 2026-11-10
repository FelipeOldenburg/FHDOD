import { fail } from "../middleware/validation.mjs";
import { getSessionToken } from "../middleware/authentication.mjs";

function setSessionCookie(req, res, token) {
  const secure =
    process.env.FHDOD_COOKIE_SECURE === "1" ||
    req.socket.encrypted ||
    req.headers["x-forwarded-proto"] === "https";
  res.setHeader(
    "Set-Cookie",
    `fhdod_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${token ? 28800 : 0}${secure ? "; Secure" : ""}`,
  );
}

export function createAuthController({ auth, readBody, rateLimit, demo }) {
  function signedIn(req, res, send, { user, token }, status = 200) {
    setSessionCookie(req, res, token);
    return send({ user }, status);
  }
  return {
    setupStatus: async ({ send }) =>
      send({ needsSetup: await auth.needsSetup(), demo }),
    setup: async ({ req, res, send }) => {
      const hostname = new URL(`http://${req.headers.host}`).hostname;
      if (
        !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
          req.socket.remoteAddress,
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
