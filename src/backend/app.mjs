import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase } from "./models/database.mjs";
import { createStore } from "./models/store.mjs";
import { createAuthentication } from "./middleware/authentication.mjs";
import { createRateLimit, readBody } from "./middleware/http.mjs";
import { createAuthService } from "./services/auth-service.mjs";
import { createAdminService, sectorView } from "./services/admin-service.mjs";
import { createAuditService } from "./services/audit-service.mjs";
import { createBootstrapService } from "./services/bootstrap-service.mjs";
import { seedDemo } from "./services/demo-service.mjs";
import { createManifestationService } from "./services/manifestation-service.mjs";
import { createReportService } from "./services/report-service.mjs";
import { createSettingsService } from "./services/settings-service.mjs";
import { createSurveyService } from "./services/survey-service.mjs";
import { createApiController } from "./controllers/api-controller.mjs";
import { createAuthController } from "./controllers/auth-controller.mjs";
import { createAdminController } from "./controllers/admin-controller.mjs";
import { createManagementController } from "./controllers/management-controller.mjs";
import { createPublicController } from "./controllers/public-controller.mjs";
import { createReportController } from "./controllers/report-controller.mjs";
import { createSurveyController } from "./controllers/survey-controller.mjs";
import { createAuthPublicRoutes } from "./routes/auth-public.mjs";
import { createApiRoutes } from "./routes/api.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export async function createApplication({
  databaseUrl = process.env.FHDOD_DEMO === "1"
    ? process.env.FHDOD_DEMO_DATABASE_URL
    : process.env.DATABASE_URL,
  schemaName,
  demo = process.env.FHDOD_DEMO === "1",
} = {}) {
  const db = await createDatabase({
    connectionString: databaseUrl,
    schemaName,
  });
  const store = createStore(db);
  const audit = createAuditService(store);
  const auth = createAuthService(store, { audit: audit.record });
  const settings = createSettingsService(store, { audit: audit.record });
  const admin = createAdminService(store, { auth, audit: audit.record });
  const survey = createSurveyService(store, {
    settings: settings.get,
    audit: audit.record,
    sectorView,
  });
  const reports = createReportService(store, {
    settings: settings.get,
    audit: audit.record,
  });
  const manifestations = createManifestationService(store, {
    scopedWhere: reports.scopedWhere,
    audit: audit.record,
  });
  const bootstrap = createBootstrapService(store, {
    auth,
    survey,
    settings,
    sectorView,
    demo,
  });
  const rateLimit = createRateLimit();
  const controllers = {
    auth: createAuthController({ auth, readBody, rateLimit, demo }),
    admin: createAdminController({ admin, readBody }),
    survey: createSurveyController({ survey, readBody }),
    publicSurvey: createPublicController({ survey, readBody, rateLimit, demo }),
    reports: createReportController({ reports, readBody }),
    management: createManagementController({
      bootstrap,
      manifestations,
      settings,
      audit,
      health: () => db.query("SELECT 1"),
      readBody,
    }),
  };
  const routes = [
    ...createAuthPublicRoutes(controllers),
    ...createApiRoutes(controllers),
  ];
  const server = createServer(
    createApiController({
      root,
      routes,
      authenticate: createAuthentication(auth),
    }),
  );
  return {
    server,
    db,
    close: async () => {
      if (server.listening)
        await new Promise((resolveClose, rejectClose) =>
          server.close((error) =>
            error ? rejectClose(error) : resolveClose(),
          ),
        );
      await db.dispose();
    },
    seedDemo: () =>
      seedDemo({ ...store, normalizeQuestions: survey.normalizeQuestions }),
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const app = await createApplication();
  if (process.env.FHDOD_DEMO === "1") await app.seedDemo();
  const port = Number(process.env.PORT || 3001);
  app.server.listen(port, "127.0.0.1", () =>
    console.log(
      `FHDOD API: http://127.0.0.1:${port}${process.env.FHDOD_DEMO === "1" ? " (demonstração: dados fictícios)" : ""}`,
    ),
  );
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    app.close().catch((error) => {
      console.error("Erro ao encerrar a API:", error.message);
      process.exitCode = 1;
    });
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
