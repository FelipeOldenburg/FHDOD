import {
  randomBytes,
  randomInt,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { hashToken } from "./auth-service.mjs";
import { hospitalDay } from "./calendar.mjs";
import { demandPermission } from "../middleware/permissions.mjs";
import { fail, integer, parse, text } from "../middleware/validation.mjs";

export const tvMetrics = [
  "satisfaction",
  "responses",
  "nps",
  "pending",
  "trend",
  "sectors",
];
export const tvPeriods = ["current_month", "last_7_days", "last_30_days"];
const pairingLifetimeMs = 10 * 60 * 1000;

function pairingHash(code) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(code, salt, 32).toString("hex")}`;
}

function pairingMatches(code, encoded) {
  if (typeof encoded !== "string" || !encoded.includes(":")) return false;
  const [salt, expected] = encoded.split(":");
  const actual = scryptSync(code, salt, 32);
  const target = Buffer.from(expected, "hex");
  return target.length === actual.length && timingSafeEqual(target, actual);
}

function isoDateDaysAgo(day, days) {
  const value = new Date(`${day}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

function periodFilters(period) {
  const to = hospitalDay(new Date().toISOString());
  if (period === "last_7_days")
    return { from: isoDateDaysAgo(to, 6), to, label: "Últimos 7 dias" };
  if (period === "last_30_days")
    return { from: isoDateDaysAgo(to, 29), to, label: "Últimos 30 dias" };
  return { from: `${to.slice(0, 7)}-01`, to, label: "Este mês" };
}

export function createTvWallService(
  { get, all, run, transaction },
  { audit, reports, settings },
) {
  async function newPairingCode() {
    const existing = await all(
      "SELECT pairing_code_hash FROM tv_devices WHERE pairing_code_hash IS NOT NULL AND pairing_expires_at>? AND revoked_at IS NULL",
      new Date().toISOString(),
    );
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const code = String(randomInt(100000, 1_000_000));
      if (!existing.some((row) => pairingMatches(code, row.pairing_code_hash)))
        return code;
    }
    fail(503, "Não foi possível gerar o código agora. Tente novamente.");
  }

  async function validateConfig(body, current = {}) {
    const name = text(body.name ?? current.name, "Nome da TV", 80);
    const allSectors = body.allSectors ?? !!current.all_sectors;
    if (typeof allSectors !== "boolean")
      fail(400, "Selecione corretamente o alcance dos setores.");
    const sourceSectorIds = body.sectorIds ?? parse(current.sector_ids_json, []);
    if (!Array.isArray(sourceSectorIds))
      fail(400, "Selecione setores válidos para esta TV.");
    const sectorIds = [...new Set(sourceSectorIds)].filter(
      (value) => typeof value === "string" && value,
    );
    if (!allSectors && !sectorIds.length)
      fail(400, "Selecione ao menos um setor para esta TV.");
    if (!allSectors) {
      const available = await all(
        "SELECT id FROM sectors WHERE id=ANY(?::text[]) AND active=1",
        sectorIds,
      );
      if (available.length !== sectorIds.length)
        fail(400, "Um dos setores selecionados não está disponível.");
    }
    const qrSectorId =
      (Object.prototype.hasOwnProperty.call(body, "qrSectorId")
        ? body.qrSectorId
        : current.qr_sector_id) || null;
    if (qrSectorId) {
      const qrSector = await get(
        "SELECT id FROM sectors WHERE id=? AND active=1",
        qrSectorId,
      );
      if (!qrSector)
        fail(400, "O setor escolhido para o QR Code não está disponível.");
      if (!allSectors && !sectorIds.includes(qrSectorId))
        fail(400, "O setor do QR Code precisa estar entre os setores exibidos.");
    }
    const sourceMetrics = body.metrics ?? parse(current.metrics_json, tvMetrics);
    if (!Array.isArray(sourceMetrics))
      fail(400, "Selecione indicadores válidos para esta TV.");
    const metrics = [...new Set(sourceMetrics)].filter((value) =>
      tvMetrics.includes(value),
    );
    if (!metrics.length)
      fail(400, "Selecione ao menos um indicador para esta TV.");
    if (metrics.length !== sourceMetrics.length)
      fail(400, "Um dos indicadores selecionados é inválido.");
    const period = body.period ?? current.period ?? "current_month";
    if (!tvPeriods.includes(period)) fail(400, "Selecione um período válido.");
    const refreshSeconds = body.refreshSeconds ?? current.refresh_seconds ?? 30;
    integer(refreshSeconds, 15, 300, "Intervalo de atualização");
    return {
      name,
      allSectors,
      sectorIds: allSectors ? [] : sectorIds,
      qrSectorId,
      metrics,
      period,
      refreshSeconds,
    };
  }

  async function sectorMap() {
    return new Map(
      (await all("SELECT id,name FROM sectors ORDER BY name")).map((row) => [
        row.id,
        row.name,
      ]),
    );
  }

  function view(row, sectors) {
    const sectorIds = parse(row.sector_ids_json, []);
    const lastSeenAt = row.last_seen_at || null;
    const onlineWindow = Math.max(Number(row.refresh_seconds) * 3, 120) * 1000;
    const online =
      !row.revoked_at &&
      !!lastSeenAt &&
      Date.now() - Date.parse(lastSeenAt) <= onlineWindow;
    const pairingPending =
      !row.revoked_at &&
      !!row.pairing_code_hash &&
      Date.parse(row.pairing_expires_at) > Date.now();
    const status = row.revoked_at
      ? "revoked"
      : online
        ? "online"
        : pairingPending
          ? "awaiting_pairing"
          : row.paired_at
            ? "offline"
            : "pairing_expired";
    return {
      id: row.id,
      name: row.name,
      allSectors: !!row.all_sectors,
      sectorIds,
      sectorNames: row.all_sectors
        ? ["Todos os setores"]
        : sectorIds.map((id) => sectors.get(id)).filter(Boolean),
      qrSectorId: row.qr_sector_id || null,
      qrSectorName: row.qr_sector_id ? sectors.get(row.qr_sector_id) || null : null,
      metrics: parse(row.metrics_json, tvMetrics),
      period: row.period,
      refreshSeconds: Number(row.refresh_seconds),
      status,
      pairedAt: row.paired_at || null,
      lastSeenAt,
      revokedAt: row.revoked_at || null,
      createdAt: row.created_at,
      pairingExpiresAt: pairingPending ? row.pairing_expires_at : null,
    };
  }

  async function find(id) {
    const row = await get("SELECT * FROM tv_devices WHERE id=?", id);
    if (!row) fail(404, "Dispositivo de TV não encontrado.");
    return row;
  }

  async function list(user) {
    demandPermission(user, "canManageSettings");
    const sectors = await sectorMap();
    return Promise.all(
      (await all("SELECT * FROM tv_devices ORDER BY created_at DESC")).map(
        (row) => view(row, sectors),
      ),
    );
  }

  async function create(user, body) {
    demandPermission(user, "canManageSettings");
    const config = await validateConfig(body);
    const id = randomUUID();
    const code = await newPairingCode();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + pairingLifetimeMs).toISOString();
    await run(
      "INSERT INTO tv_devices(id,name,pairing_code_hash,pairing_expires_at,all_sectors,sector_ids_json,qr_sector_id,metrics_json,period,refresh_seconds,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
      id,
      config.name,
      pairingHash(code),
      expiresAt,
      config.allSectors ? 1 : 0,
      JSON.stringify(config.sectorIds),
      config.qrSectorId,
      JSON.stringify(config.metrics),
      config.period,
      config.refreshSeconds,
      user.id,
      now,
      now,
    );
    await audit(user, "created", "tv_device", id, {
      name: config.name,
      allSectors: config.allSectors,
      sectorIds: config.sectorIds,
      qrSectorId: config.qrSectorId,
    });
    return {
      device: view(await find(id), await sectorMap()),
      pairingCode: code,
      pairingExpiresAt: expiresAt,
    };
  }

  async function update(user, id, body) {
    demandPermission(user, "canManageSettings");
    const current = await find(id);
    const config = await validateConfig(body, current);
    const now = new Date().toISOString();
    await run(
      "UPDATE tv_devices SET name=?,all_sectors=?,sector_ids_json=?,qr_sector_id=?,metrics_json=?,period=?,refresh_seconds=?,updated_at=? WHERE id=?",
      config.name,
      config.allSectors ? 1 : 0,
      JSON.stringify(config.sectorIds),
      config.qrSectorId,
      JSON.stringify(config.metrics),
      config.period,
      config.refreshSeconds,
      now,
      id,
    );
    await audit(user, "updated", "tv_device", id, {
      name: config.name,
      allSectors: config.allSectors,
      sectorIds: config.sectorIds,
      qrSectorId: config.qrSectorId,
      metrics: config.metrics,
      period: config.period,
      refreshSeconds: config.refreshSeconds,
    });
    return view(await find(id), await sectorMap());
  }

  async function issuePairingCode(user, id) {
    demandPermission(user, "canManageSettings");
    await find(id);
    const code = await newPairingCode();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + pairingLifetimeMs).toISOString();
    await run(
      "UPDATE tv_devices SET token_hash=NULL,pairing_code_hash=?,pairing_expires_at=?,paired_at=NULL,last_seen_at=NULL,revoked_at=NULL,updated_at=? WHERE id=?",
      pairingHash(code),
      expiresAt,
      now,
      id,
    );
    await audit(user, "pairing_code_created", "tv_device", id);
    return {
      device: view(await find(id), await sectorMap()),
      pairingCode: code,
      pairingExpiresAt: expiresAt,
    };
  }

  async function revoke(user, id) {
    demandPermission(user, "canManageSettings");
    const current = await find(id);
    const now = new Date().toISOString();
    await run(
      "UPDATE tv_devices SET token_hash=NULL,pairing_code_hash=NULL,pairing_expires_at=NULL,revoked_at=?,updated_at=? WHERE id=?",
      now,
      now,
      id,
    );
    await audit(user, "revoked", "tv_device", id, { name: current.name });
    return view(await find(id), await sectorMap());
  }

  async function pair(codeInput) {
    const code = typeof codeInput === "string" ? codeInput.replace(/\D/g, "") : "";
    if (!/^\d{6}$/.test(code)) fail(400, "Digite o código de 6 dígitos.");
    const candidates = await all(
      "SELECT * FROM tv_devices WHERE pairing_code_hash IS NOT NULL AND pairing_expires_at>? AND revoked_at IS NULL",
      new Date().toISOString(),
    );
    const candidate = candidates.find((row) =>
      pairingMatches(code, row.pairing_code_hash),
    );
    if (!candidate) fail(400, "Código inválido ou expirado. Gere outro no painel.");
    return transaction(async () => {
      const row = await get("SELECT * FROM tv_devices WHERE id=? FOR UPDATE", candidate.id);
      if (
        !row ||
        row.revoked_at ||
        !row.pairing_code_hash ||
        Date.parse(row.pairing_expires_at) <= Date.now() ||
        !pairingMatches(code, row.pairing_code_hash)
      )
        fail(400, "Código inválido ou expirado. Gere outro no painel.");
      const token = randomBytes(32).toString("hex");
      const now = new Date().toISOString();
      await run(
        "UPDATE tv_devices SET token_hash=?,pairing_code_hash=NULL,pairing_expires_at=NULL,paired_at=?,last_seen_at=?,updated_at=? WHERE id=?",
        hashToken(token),
        now,
        now,
        now,
        row.id,
      );
      await audit(null, "paired", "tv_device", row.id, { name: row.name });
      return { token, device: view(await find(row.id), await sectorMap()) };
    });
  }

  async function authenticate(token) {
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
      fail(401, "Esta TV ainda não está vinculada.");
    const row = await get(
      "SELECT * FROM tv_devices WHERE token_hash=? AND revoked_at IS NULL",
      hashToken(token),
    );
    if (!row) fail(401, "A vinculação desta TV expirou ou foi revogada.");
    return row;
  }

  async function display(token) {
    const row = await authenticate(token);
    const now = new Date().toISOString();
    await run("UPDATE tv_devices SET last_seen_at=? WHERE id=?", now, row.id);
    const selectedIds = row.all_sectors
      ? (await all("SELECT id FROM sectors WHERE active=1")).map((item) => item.id)
      : parse(row.sector_ids_json, []);
    const activeIds = (
      await all(
        "SELECT id FROM sectors WHERE active=1 AND id=ANY(?::text[])",
        selectedIds,
      )
    ).map((item) => item.id);
    const filters = periodFilters(row.period);
    const url = new URL("http://localhost/api/dashboard");
    url.searchParams.set("from", filters.from);
    url.searchParams.set("to", filters.to);
    const dashboard = await reports.dashboard(
      { id: `tv:${row.id}`, role: "viewer", sectorIds: activeIds },
      url,
    );
    const fallbackQrSectorId = activeIds.length === 1 ? activeIds[0] : null;
    const qrSectorId = row.qr_sector_id || fallbackQrSectorId;
    const surveyTarget = qrSectorId
      ? await get(
          "SELECT s.id,s.name,s.slug FROM sectors s JOIN surveys v ON v.sector_id=s.id AND v.active=1 WHERE s.id=? AND s.active=1",
          qrSectorId,
        )
      : null;
    const updated = { ...row, last_seen_at: now };
    return {
      device: {
        ...view(updated, await sectorMap()),
        periodLabel: filters.label,
      },
      dashboard,
      surveyTarget: surveyTarget
        ? {
            id: surveyTarget.id,
            name: surveyTarget.name,
            slug: surveyTarget.slug,
          }
        : null,
      settings: { hospitalName: (await settings()).hospitalName },
    };
  }

  return {
    list,
    create,
    update,
    issuePairingCode,
    revoke,
    pair,
    display,
  };
}
