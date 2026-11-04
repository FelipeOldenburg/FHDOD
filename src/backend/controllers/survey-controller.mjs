export function createSurveyController({ survey, readBody }) {
  return {
    list: async ({ user, send }) => send({ surveys: await survey.list(user) }),
    save: async ({ req, params, user, send }) => {
      const { survey: saved, created } = await survey.save(
        user,
        req.method === "POST" ? undefined : params[0],
        await readBody(req),
      );
      return send({ survey: saved }, created ? 201 : 200);
    },
    deactivate: async ({ params, user, send }) =>
      send(await survey.deactivate(user, params[0])),
  };
}
