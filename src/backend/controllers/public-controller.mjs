export function createPublicController({ survey, readBody, rateLimit, demo }) {
  return {
    sector: async ({ params, send }) =>
      send({
        ...(await survey.loadPublicSector(decodeURIComponent(params[0]))),
        demo,
      }),
    start: async ({ req, send }) => {
      rateLimit(req, "survey-create", 300, 10 * 60 * 1000);
      return send(await survey.startResponse(await readBody(req)), 201);
    },
    answer: async ({ req, params, send }) => {
      rateLimit(req, "survey-answer", 2000, 10 * 60 * 1000);
      return send(await survey.saveAnswer(params[0], await readBody(req)));
    },
    submit: async ({ req, params, send }) => {
      rateLimit(req, "survey-submit", 300, 10 * 60 * 1000);
      return send(await survey.submitResponse(params[0], await readBody(req)));
    },
  };
}
