import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { fail, text, validEmail } from "../middleware/validation.mjs";

export const hashToken = (value) =>
  createHash("sha256").update(value).digest("hex");

export function passwordHash(password) {
  if (
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 128
  )
    fail(400, "A senha deve ter entre 12 e 128 caracteres.");
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

export function passwordMatches(password, encoded) {
  if (typeof password !== "string" || password.length > 128 || !encoded)
    return false;
  const [salt, expected] = encoded.split(":");
  const actual = scryptSync(password, salt, 64);
  const target = Buffer.from(expected, "hex");
  return target.length === actual.length && timingSafeEqual(target, actual);
}

export function createAuthService({ get, all, run, transaction }, { audit }) {
  const userView = async (row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    active: !!row.active,
    mustChangePassword: !!row.must_change_password,
    sectorIds: (
      await all("SELECT sector_id FROM user_sectors WHERE user_id=?", row.id)
    ).map((sector) => sector.sector_id),
  });
  const sectorAdmins = (sectorId) =>
    all(
      "SELECT u.* FROM users u JOIN user_sectors us ON us.user_id=u.id WHERE us.sector_id=? AND u.role='sector_admin'",
      sectorId,
    );
  async function fixedSectorAdmin(row) {
    if (row.role !== "sector_admin") return false;
    const { sectorIds } = await userView(row);
    return (
      sectorIds.length === 1 && (await sectorAdmins(sectorIds[0])).length === 1
    );
  }
  async function sectorAccount(row) {
    const user = await userView(row);
    if (user.role !== "sector_admin") return user;
    if (!(await fixedSectorAdmin(row)))
      fail(
        409,
        "O acesso deste setor precisa ser corrigido pelo Admin Supremo em Usuários: mantenha um administrador por setor.",
      );
    if (
      !(await get(
        "SELECT id FROM sectors WHERE id=? AND active=1",
        user.sectorIds[0],
      ))
    )
      fail(
        401,
        "O acesso deste setor está desativado. Contate o Admin Supremo.",
      );
    return user;
  }
  const revokeSectorSessions = (sectorId) =>
    run(
      "DELETE FROM sessions WHERE user_id IN (SELECT us.user_id FROM user_sectors us JOIN users u ON u.id=us.user_id WHERE us.sector_id=? AND u.role='sector_admin')",
      sectorId,
    );
  const needsSetup = async () => !(await get("SELECT id FROM users LIMIT 1"));

  async function setup(body) {
    const name = text(body.name, "Nome", 120);
    const email = validEmail(body.email);
    const encoded = passwordHash(body.password);
    const id = randomUUID();
    return transaction(async () => {
      await run(
        "SELECT pg_advisory_xact_lock(hashtext(current_schema()),hashtext('fhdod-admin-accounts'))",
      );
      if (!(await needsSetup()))
        fail(409, "O administrador inicial já foi configurado.");
      await run(
        "INSERT INTO users(id,name,email,password_hash,role,must_change_password,created_at) VALUES(?,?,?,?,?,0,?)",
        id,
        name,
        email,
        encoded,
        "superadmin",
        new Date().toISOString(),
      );
      await audit({ id }, "setup", "user", id);
      const user = await userView(
        await get("SELECT * FROM users WHERE id=?", id),
      );
      return { user, token: await createSession(id) };
    });
  }
  async function login(body) {
    const email = validEmail(body.email);
    return transaction(async () => {
      await run(
        "SELECT pg_advisory_xact_lock(hashtext(current_schema()),hashtext('fhdod-admin-accounts'))",
      );
      const row = await get(
        "SELECT * FROM users WHERE email=? AND active=1",
        email,
      );
      // Deriva também para e-mails inexistentes para não revelar contas pelo tempo da resposta.
      const valid = passwordMatches(
        body.password,
        row?.password_hash || `${"0".repeat(32)}:${"0".repeat(128)}`,
      );
      if (!valid || !row) fail(401, "E-mail ou senha incorretos.");
      const user = await sectorAccount(row);
      return { user, token: await createSession(user.id) };
    });
  }
  async function authenticate(token) {
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
      fail(401, "Entre na sua conta para continuar.");
    await run(
      "DELETE FROM sessions WHERE expires_at<=?",
      new Date().toISOString(),
    );
    const row = await get(
      "SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND u.active=1",
      hashToken(token),
    );
    if (!row) fail(401, "Sua sessão expirou. Entre novamente.");
    return sectorAccount(row);
  }
  async function createSession(userId) {
    const token = randomBytes(32).toString("hex");
    await run(
      "INSERT INTO sessions VALUES(?,?,?)",
      hashToken(token),
      userId,
      new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    );
    return token;
  }
  async function logout(token) {
    if (token)
      await run("DELETE FROM sessions WHERE token_hash=?", hashToken(token));
  }
  async function changePassword(user, body) {
    const encoded = passwordHash(body.newPassword);
    return transaction(async () => {
      await run(
        "SELECT pg_advisory_xact_lock(hashtext(current_schema()),hashtext('fhdod-admin-accounts'))",
      );
      const row = await get(
        "SELECT * FROM users WHERE id=? FOR UPDATE",
        user.id,
      );
      if (!row?.active) fail(401, "Sua sessão expirou. Entre novamente.");
      await sectorAccount(row);
      if (!passwordMatches(body.currentPassword, row.password_hash))
        fail(400, "A senha atual está incorreta.");
      if (body.currentPassword === body.newPassword)
        fail(400, "Escolha uma senha diferente da temporária ou atual.");
      await run(
        "UPDATE users SET password_hash=?,must_change_password=0 WHERE id=?",
        encoded,
        user.id,
      );
      await run("DELETE FROM sessions WHERE user_id=?", user.id);
      await audit(user, "password_changed", "user", user.id);
      return {
        user: await userView(
          await get("SELECT * FROM users WHERE id=?", user.id),
        ),
        token: await createSession(user.id),
      };
    });
  }

  return {
    userView,
    sectorAdmins,
    fixedSectorAdmin,
    sectorAccount,
    revokeSectorSessions,
    needsSetup,
    setup,
    login,
    authenticate,
    createSession,
    logout,
    changePassword,
  };
}
