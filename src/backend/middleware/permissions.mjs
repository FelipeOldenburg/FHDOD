import { roles } from "../../shared/contracts.ts";
import { fail } from "./validation.mjs";

export function permissions(user) {
  const privileged = ["superadmin", "sector_admin", "ombudsman"].includes(
    user.role,
  );
  return {
    canManageUsers: user.role === "superadmin",
    canManageSectors: user.role === "superadmin",
    canEditSurveys: ["superadmin", "sector_admin"].includes(user.role),
    canViewResponses: privileged,
    canViewManifestations: privileged,
    canViewContacts: ["superadmin", "ombudsman"].includes(user.role),
    canExportDetails: privileged,
    canViewDashboard: roles.includes(user.role),
    canManageSettings: user.role === "superadmin",
  };
}

export const authorized = (user, sectorId) =>
  user.role === "superadmin" || user.sectorIds.includes(sectorId);

export function demandSector(user, sectorId) {
  if (!authorized(user, sectorId))
    fail(403, "Você não tem acesso a este setor.");
}

export function demandPermission(user, permission) {
  if (!permissions(user)[permission])
    fail(403, "Seu perfil não permite esta ação.");
}
