import { getTvToken } from "../middleware/authentication.mjs";
import { secureRequest } from "../middleware/http.mjs";

function setTvCookie(req, res, token) {
  const secure = secureRequest(req);
  res.setHeader(
    "Set-Cookie",
    `fhdod_tv=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${token ? 7776000 : 0}${secure ? "; Secure" : ""}`,
  );
}

export function createTvWallController({ tvWall, readBody, rateLimit }) {
  return {
    async devices({ req, user, method, params, send }) {
      if (method === "GET") return send({ devices: await tvWall.list(user) });
      if (method === "POST")
        return send(await tvWall.create(user, await readBody(req)), 201);
      if (["PUT", "PATCH"].includes(method))
        return send({
          device: await tvWall.update(user, params[0], await readBody(req)),
        });
      return send({ device: await tvWall.revoke(user, params[0]) });
    },
    async pairingCode({ user, params, send }) {
      return send(await tvWall.issuePairingCode(user, params[0]));
    },
    async pair({ req, res, send }) {
      rateLimit(req, "tv-pair", 12);
      const result = await tvWall.pair((await readBody(req)).code);
      setTvCookie(req, res, result.token);
      return send({ device: result.device });
    },
    async display({ req, send }) {
      return send(await tvWall.display(getTvToken(req)));
    },
  };
}
