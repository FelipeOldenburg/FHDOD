import { randomUUID } from "node:crypto";
import { roles } from "../../shared/contracts.ts";
import { authorized, demandPermission } from "../middleware/permissions.mjs";
import { fail, text, validEmail } from "../middleware/validation.mjs";
import { passwordHash } from "./auth-service.mjs";

export const sectorView = (row) => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  description: row.description,
  active: !!row.active,
});

export function createAdminService(
  { get, all, run, transaction },
  { auth, audit },
) {
  const { userView, sectorAdmins, fixedSectorAdmin, revokeSectorSessions } =
    auth;
  // Serializa a validação e a gravação dos vínculos, inclusive em processos diferentes.
  const lockAccounts = () =>
    run(
      "SELECT pg_advisory_xact_lock(hashtext(current_schema()),hashtext('fhdod-admin-accounts'))",
    );
  const now = () => new Date().toISOString();

  async function listSectors(user) {
    return (await all("SELECT * FROM sectors ORDER BY name"))
      .filter((sector) => authorized(user, sector.id))
      .map(sectorView);
  }

  async function saveSector(user, sectorId, body) {
    demandPermission(user, "canManageSectors");
    return transaction(async () => {
      await lockAccounts();
      const before =
        sectorId && (await get("SELECT * FROM sectors WHERE id=?", sectorId));
      if (sectorId && !before) fail(404, "Setor não encontrado.");
      const name = text(body.name ?? before?.name, "Nome do setor", 120);
      const slug = text(
        body.slug ?? before?.slug,
        "URL do setor",
        100,
      ).toLowerCase();
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
        fail(
          400,
          "A URL deve conter apenas letras minúsculas, números e hífens.",
        );
      if (
        await get(
          "SELECT id FROM sectors WHERE slug=? AND id<>?",
          slug,
          before?.id || "",
        )
      )
        fail(409, "Esta URL já está sendo usada por outro setor.");
      const description = text(
        body.description ?? before?.description,
        "Descrição",
        500,
        true,
      );
      const active =
        body.active === undefined
          ? (before?.active ?? 1)
          : Number(body.active === true);
      const id = before?.id || randomUUID();
      const admins = before ? await sectorAdmins(id) : [];
      const legacyAdmin =
        admins.length > 1 ||
        (admins[0] && !(await fixedSectorAdmin(admins[0])));
      if (legacyAdmin && body.admin !== undefined)
        fail(
          409,
          "Corrija o administrador deste setor em Usuários antes de editar seu acesso.",
        );
      const previousAdmin = legacyAdmin ? undefined : admins[0];
      if (
        body.admin !== undefined &&
        (!body.admin ||
          typeof body.admin !== "object" ||
          Array.isArray(body.admin))
      )
        fail(400, "Informe os dados do administrador do setor.");
      if (!before && !body.admin)
        fail(
          400,
          "Defina o e-mail e a senha temporária do administrador deste setor.",
        );
      const adminEmail = body.admin
        ? validEmail(body.admin.email ?? previousAdmin?.email)
        : previousAdmin?.email;
      if (
        adminEmail &&
        (await get(
          "SELECT id FROM users WHERE email=? AND id<>?",
          adminEmail,
          previousAdmin?.id || "",
        ))
      )
        fail(409, "Já existe um usuário com este e-mail.");
      const temporaryPassword = body.admin?.temporaryPassword;
      const encoded =
        temporaryPassword !== undefined
          ? passwordHash(temporaryPassword)
          : previousAdmin?.password_hash;
      if (body.admin && !encoded)
        fail(400, "Defina uma senha temporária com no mínimo 12 caracteres.");
      const adminId =
        previousAdmin?.id || (body.admin ? randomUUID() : undefined);

      if (before)
        await run(
          "UPDATE sectors SET name=?,slug=?,description=?,active=? WHERE id=?",
          name,
          slug,
          description,
          active,
          id,
        );
      else
        await run(
          "INSERT INTO sectors VALUES(?,?,?,?,?,?)",
          id,
          name,
          slug,
          description,
          active,
          now(),
        );
      if (previousAdmin)
        await run(
          "UPDATE users SET name=?,email=?,password_hash=?,must_change_password=? WHERE id=?",
          name,
          adminEmail,
          encoded,
          temporaryPassword !== undefined
            ? 1
            : previousAdmin.must_change_password,
          adminId,
        );
      else if (body.admin) {
        await run(
          "INSERT INTO users(id,name,email,password_hash,role,created_at) VALUES(?,?,?,?,?,?)",
          adminId,
          name,
          adminEmail,
          encoded,
          "sector_admin",
          now(),
        );
        await run("INSERT INTO user_sectors VALUES(?,?)", adminId, id);
      }
      if (adminId && temporaryPassword !== undefined)
        await run("DELETE FROM sessions WHERE user_id=?", adminId);
      if (!active) await revokeSectorSessions(id);
      if (body.admin)
        await audit(
          user,
          previousAdmin ? "updated" : "created",
          "user",
          adminId,
          {
            role: "sector_admin",
            sectorIds: [id],
            passwordReset: !!previousAdmin && temporaryPassword !== undefined,
          },
        );
      await audit(user, before ? "updated" : "created", "sector", id, {
        name,
        slug,
        active: !!active,
      });
      return {
        sector: sectorView(await get("SELECT * FROM sectors WHERE id=?", id)),
        ...(adminId
          ? {
              user: await userView(
                await get("SELECT * FROM users WHERE id=?", adminId),
              ),
            }
          : {}),
      };
    });
  }

  async function deactivateSector(user, id) {
    demandPermission(user, "canManageSectors");
    return transaction(async () => {
      await lockAccounts();
      if (!(await get("SELECT id FROM sectors WHERE id=?", id)))
        fail(404, "Setor não encontrado.");
      await run("UPDATE sectors SET active=0 WHERE id=?", id);
      await revokeSectorSessions(id);
      await audit(user, "deactivated", "sector", id);
      return { deactivated: true };
    });
  }

  async function listUsers(user) {
    demandPermission(user, "canManageUsers");
    return Promise.all(
      (await all("SELECT * FROM users ORDER BY name")).map(userView),
    );
  }

  async function saveUser(user, userId, body) {
    demandPermission(user, "canManageUsers");
    return transaction(async () => {
      await lockAccounts();
      const before =
        userId && (await get("SELECT * FROM users WHERE id=?", userId));
      if (userId && !before) fail(404, "Usuário não encontrado.");
      const name = text(body.name ?? before?.name, "Nome", 120);
      const email = validEmail(body.email ?? before?.email);
      if (
        await get(
          "SELECT id FROM users WHERE email=? AND id<>?",
          email,
          before?.id || "",
        )
      )
        fail(409, "Já existe um usuário com este e-mail.");
      const role = body.role ?? before?.role ?? "sector_admin";
      if (!roles.includes(role)) fail(400, "Perfil inválido.");
      const previousSectorIds = before
        ? (await userView(before)).sectorIds
        : [];
      const sectorIds = body.sectorIds ?? previousSectorIds;
      if (!Array.isArray(sectorIds)) fail(400, "Selecione setores válidos.");
      for (const id of sectorIds)
        if (
          typeof id !== "string" ||
          !(await get("SELECT id FROM sectors WHERE id=?", id))
        )
          fail(400, "Selecione setores válidos.");
      if (role !== "superadmin" && !sectorIds.length)
        fail(400, "Selecione ao menos um setor para este perfil.");
      if (
        before &&
        (await fixedSectorAdmin(before)) &&
        (role !== "sector_admin" ||
          sectorIds.length !== 1 ||
          sectorIds[0] !== previousSectorIds[0])
      )
        fail(
          400,
          "O perfil e o setor deste administrador são fixos. Edite seu e-mail, senha ou situação de acesso.",
        );
      if (role === "sector_admin") {
        if (sectorIds.length !== 1)
          fail(400, "O administrador deve ter acesso a exatamente um setor.");
        if (
          (await sectorAdmins(sectorIds[0])).some(
            (admin) => admin.id !== before?.id,
          )
        )
          fail(
            409,
            "Este setor já possui um administrador. Edite o acesso existente.",
          );
      }
      const active =
        body.active === undefined
          ? (before?.active ?? 1)
          : Number(body.active === true);
      if (before?.id === user.id && (!active || role !== "superadmin"))
        fail(400, "Você não pode remover seu próprio acesso de administrador.");
      const temporaryPassword = body.temporaryPassword ?? body.password;
      const encoded = temporaryPassword
        ? passwordHash(temporaryPassword)
        : before?.password_hash;
      if (!encoded)
        fail(400, "Defina uma senha temporária com no mínimo 12 caracteres.");
      const id = before?.id || randomUUID();
      if (before)
        await run(
          "UPDATE users SET name=?,email=?,role=?,active=?,password_hash=?,must_change_password=? WHERE id=?",
          name,
          email,
          role,
          active,
          encoded,
          temporaryPassword ? 1 : before.must_change_password,
          id,
        );
      else
        await run(
          "INSERT INTO users(id,name,email,password_hash,role,active,created_at) VALUES(?,?,?,?,?,?,?)",
          id,
          name,
          email,
          encoded,
          role,
          active,
          now(),
        );
      await run("DELETE FROM user_sectors WHERE user_id=?", id);
      for (const sectorId of new Set(role === "superadmin" ? [] : sectorIds))
        await run("INSERT INTO user_sectors VALUES(?,?)", id, sectorId);
      if (
        before &&
        (temporaryPassword ||
          !active ||
          role !== before.role ||
          JSON.stringify(sectorIds) !== JSON.stringify(previousSectorIds))
      )
        await run("DELETE FROM sessions WHERE user_id=?", id);
      await audit(user, before ? "updated" : "created", "user", id, {
        role,
        sectorIds,
        active: !!active,
      });
      return {
        user: await userView(await get("SELECT * FROM users WHERE id=?", id)),
      };
    });
  }

  return { listSectors, saveSector, deactivateSector, listUsers, saveUser };
}
