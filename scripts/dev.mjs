import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const env = {
  ...process.env,
  ...(process.argv.includes("--demo") ? { FHDOD_DEMO: "1" } : {}),
};
const databaseVariable =
  env.FHDOD_DEMO === "1" ? "FHDOD_DEMO_DATABASE_URL" : "DATABASE_URL";
if (!env[databaseVariable]?.trim()) {
  console.error(
    `Configure ${databaseVariable} no arquivo .env da raiz do projeto e execute novamente npm run dev${env.FHDOD_DEMO === "1" ? ":demo" : ""}.`,
  );
  process.exit(1);
}
const children = [
  spawn(process.execPath, ["--watch", "src/backend/app.mjs"], {
    cwd: root,
    env,
    stdio: "inherit",
  }),
  spawn(process.execPath, ["node_modules/vite/bin/vite.js"], {
    cwd: root,
    env,
    stdio: "inherit",
  }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
for (const child of children) {
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", (code) => stop(code ?? 0));
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
