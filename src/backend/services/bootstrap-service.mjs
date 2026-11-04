import { categories } from "../../shared/contracts.ts";
import { authorized, permissions } from "../middleware/permissions.mjs";

export function createBootstrapService(
  { all },
  { auth, survey, settings, sectorView, demo },
) {
  return async (user) => ({
    user,
    permissions: permissions(user),
    sectors: (await all("SELECT * FROM sectors ORDER BY name"))
      .filter((row) => authorized(user, row.id))
      .map(sectorView),
    surveys: await survey.list(user),
    categories,
    users:
      user.role === "superadmin"
        ? await Promise.all(
            (await all("SELECT * FROM users ORDER BY name")).map(auth.userView),
          )
        : [],
    settings: await settings.get(),
    demo,
  });
}
