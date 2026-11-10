import { createApplication } from "../src/backend/app.mjs";

let applicationPromise;

function getApplication() {
  applicationPromise ||= createApplication();
  return applicationPromise;
}

function restoreApiPath(req) {
  const url = new URL(req.url, "http://localhost");
  const path = url.searchParams.get("__fhdod_path");
  if (path === null) return;
  url.searchParams.delete("__fhdod_path");
  const query = url.searchParams.toString();
  req.url = `/api/${path}${query ? `?${query}` : ""}`;
}

export default async function handler(req, res) {
  restoreApiPath(req);
  const application = await getApplication();
  return application.handler(req, res);
}
