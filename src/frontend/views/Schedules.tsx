import { useEffect, useRef, useState } from "react";
import {
  CalendarClock,
  Download,
  Eye,
  FileSpreadsheet,
  Trash2,
  Upload,
} from "lucide-react";
import { api } from "../services/api";
import { Card, EmptyState, Loading, PageTitle, formatDate, formatNumber } from "../components/components";
import { Pagination } from "../components/Pagination";
import type { Bootstrap, ScheduleImport, SchedulePreviewData } from "../models/types";

type ImportRow = {
  sectorId: string;
  shiftDate: string;
  startsAt: string;
  endsAt: string;
  professionalName: string;
  registration: string;
  specialty: string;
};

const normalize = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");

function excelDate(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    return date.toISOString().slice(0, 10);
  }
  const text = String(value ?? "").trim();
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br)
    return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return "";
}

function excelTime(value: unknown) {
  if (value instanceof Date)
    return `${String(value.getUTCHours()).padStart(2, "0")}:${String(value.getUTCMinutes()).padStart(2, "0")}`;
  if (typeof value === "number") {
    const minutes = Math.round((value % 1) * 24 * 60) % (24 * 60);
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  }
  const match = String(value ?? "").trim().match(/^(\d{1,2}):([0-5]\d)/);
  if (!match || Number(match[1]) > 23) return "";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });

function SchedulePreview({ id, onClose }: { id: string; onClose: () => void }) {
  const [data, setData] = useState<SchedulePreviewData | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const start = useRef<HTMLDivElement>(null);
  useEffect(() => start.current?.scrollIntoView({ block: "start" }), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<SchedulePreviewData>(`/api/schedules/${encodeURIComponent(id)}?page=${page}`, {
      signal: controller.signal,
    }).then((next) => {
      if (controller.signal.aborted) return;
      setData(next);
      setLoading(false);
    }).catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : "Não foi possível abrir a escala.");
      setLoading(false);
    });
    return () => controller.abort();
  }, [id, page, retry]);
  return (
    <div ref={start} className="schedule-preview-start">
      <Card className="schedule-preview">
        <header className="schedule-preview-heading">
          <div>
            <h2>Plantões importados</h2>
            {data && <p>{data.imported.filename} · {formatNumber(data.imported.rowCount)} {data.imported.rowCount === 1 ? "plantão" : "plantões"}</p>}
          </div>
          <button type="button" className="text-button" onClick={onClose}>Fechar prévia</button>
        </header>
        {error ? (
          <>
            <p className="error-banner" role="alert">{error}</p>
            <button type="button" className="text-button" onClick={() => setRetry((n) => n + 1)}>Tentar novamente</button>
          </>
        ) : loading ? <Loading label="Carregando plantões…" /> : data && (
          <>
            <div className="table-wrap" aria-label="Linhas da escala importada">
              <table className="data-table schedule-preview-table" role="table">
                <thead role="rowgroup">
                  <tr role="row">
                    <th scope="col">Data</th><th scope="col">Início</th><th scope="col">Fim</th>
                    <th scope="col">Setor</th><th scope="col">Profissional</th><th scope="col">CRM</th><th scope="col">Especialidade</th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {data.rows.map((row) => (
                    <tr key={row.id} role="row">
                      <td data-label="Data">{formatDate(row.startsAt.slice(0, 10))}</td>
                      <td data-label="Início">{row.startsAt.slice(11, 16)}</td>
                      <td data-label="Fim">{row.endsAt.slice(11, 16)}{row.startsAt.slice(0, 10) !== row.endsAt.slice(0, 10) && <small> (dia seguinte)</small>}</td>
                      <td data-label="Setor">{row.sectorName}</td>
                      <td data-label="Profissional">{row.name}</td>
                      <td data-label="CRM">{row.registration || "—"}</td>
                      <td data-label="Especialidade">{row.specialty || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination data={data.pagination} label="Páginas da escala" onPage={(next) => {
              setPage(next);
              start.current?.scrollIntoView({ block: "start" });
            }} />
          </>
        )}
      </Card>
    </div>
  );
}

export function Schedules({
  data,
  notify,
}: {
  data: Bootstrap;
  notify: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [imports, setImports] = useState<ScheduleImport[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [previewId, setPreviewId] = useState(() => new URLSearchParams(window.location.search).get("import") ?? "");

  async function load() {
    try {
      const result = await api<{ imports: ScheduleImport[] }>("/api/schedules");
      setImports(result.imports);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar as escalas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function parseFile(file: File) {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error("A planilha não possui nenhuma aba.");
    const headers = new Map<string, number>();
    sheet.getRow(1).eachCell((cell, column) => {
      headers.set(normalize(cell.text || cell.value), column);
    });
    const required = ["data", "inicio", "fim", "setor", "profissional"];
    const missing = required.filter((header) => !headers.has(header));
    if (missing.length)
      throw new Error(`Colunas obrigatórias ausentes: ${missing.join(", ")}.`);

    const sectorMap = new Map(
      data.sectors.flatMap((sector) => [
        [normalize(sector.name), sector.id],
        [normalize(sector.slug), sector.id],
      ]),
    );
    const value = (row: import("exceljs").Row, header: string) => {
      const column = headers.get(header);
      return column ? row.getCell(column).value : "";
    };
    const rows: ImportRow[] = [];
    const issues: string[] = [];
    for (let index = 2; index <= sheet.rowCount; index += 1) {
      const row = sheet.getRow(index);
      if (!row.hasValues) continue;
      const sectorId = sectorMap.get(normalize(value(row, "setor"))) || "";
      const shiftDate = excelDate(value(row, "data"));
      const startsAt = excelTime(value(row, "inicio"));
      const endsAt = excelTime(value(row, "fim"));
      const professionalName = String(value(row, "profissional") ?? "").trim();
      if (!sectorId || !shiftDate || !startsAt || !endsAt || !professionalName) {
        issues.push(`linha ${index}`);
        continue;
      }
      rows.push({
        sectorId,
        shiftDate,
        startsAt,
        endsAt,
        professionalName,
        registration: String(value(row, "crm") ?? "").trim(),
        specialty: String(value(row, "especialidade") ?? "").trim(),
      });
    }
    if (issues.length)
      throw new Error(
        `Revise ${issues.slice(0, 6).join(", ")}${issues.length > 6 ? " e outras" : ""}. Data, horários, setor e profissional são obrigatórios.`,
      );
    if (!rows.length) throw new Error("Nenhuma escala válida foi encontrada.");
    return rows;
  }

  async function importFile(file?: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setError("Use uma planilha Excel no formato .xlsx.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const rows = await parseFile(file);
      await api("/api/schedules", {
        method: "POST",
        body: { filename: file.name, rows },
      });
      notify(`${rows.length} escalas importadas.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível importar a planilha.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function downloadTemplate() {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Escalas");
    sheet.addRow(["Data", "Início", "Fim", "Setor", "Profissional", "CRM", "Especialidade"]);
    sheet.addRow([
      new Date(),
      "08:00",
      "14:00",
      data.sectors[0]?.name || "Nome exato do setor",
      "Nome do profissional",
      "CRM 000000",
      "Clínica médica",
    ]);
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF9B001B" } };
    sheet.getColumn(1).numFmt = "dd/mm/yyyy";
    sheet.columns.forEach((column) => (column.width = 24));
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    const bytes = await workbook.xlsx.writeBuffer();
    const url = URL.createObjectURL(
      new Blob([new Uint8Array(bytes)], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "modelo-escalas-fhdod.xlsx";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function remove(item: ScheduleImport) {
    if (!window.confirm(`Excluir a importação “${item.filename}” e suas ${item.rowCount} escalas?`)) return;
    setBusy(true);
    try {
      await api(`/api/schedules/${item.id}`, { method: "DELETE" });
      if (previewId === item.id) closePreview();
      notify("Importação de escala excluída.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível excluir.");
    } finally {
      setBusy(false);
    }
  }

  function closePreview() {
    setPreviewId("");
    const url = new URL(window.location.href);
    if (url.searchParams.has("import")) {
      url.searchParams.delete("import");
      window.history.replaceState(window.history.state, "", url);
    }
  }

  return (
    <>
      <PageTitle
        title="Escalas médicas"
        description="Importe os plantões para localizar quem estava trabalhando no setor e horário informados pelo paciente."
        mobileContext="Gestão de equipes"
        action={
          <button className="button secondary" onClick={() => void downloadTemplate()}>
            <Download size={16} /> Baixar modelo
          </button>
        }
      />
      {error && <p className="error-banner" role="alert">{error}</p>}
      <section className="schedule-upload-card">
        <div className="schedule-upload-icon"><FileSpreadsheet size={28} /></div>
        <div>
          <h2>Importar planilha de escalas</h2>
          <p>Use as colunas Data, Início, Fim, Setor e Profissional. CRM e Especialidade são opcionais.</p>
        </div>
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(event) => void importFile(event.target.files?.[0])}
        />
        <button className="button" disabled={busy || !data.sectors.length} onClick={() => inputRef.current?.click()}>
          <Upload size={16} /> {busy ? "Importando…" : "Selecionar Excel"}
        </button>
        {!data.sectors.length && (
          <small className="tv-field-error schedule-sector-warning" role="alert">
            Cadastre pelo menos um setor antes de importar as escalas.
          </small>
        )}
      </section>
      <p className="schedule-privacy-note">
        <CalendarClock size={16} /> O sistema indica profissionais em escala; a avaliação não atribui responsabilidade individual automaticamente.
      </p>
      {previewId && <SchedulePreview key={previewId} id={previewId} onClose={closePreview} />}
      <Card title="Histórico de importações" subtitle="Cada arquivo fica registrado para auditoria e pode ser removido integralmente.">
        {loading ? <Loading /> : imports.length ? (
          <div className="schedule-import-list">
            {imports.map((item) => (
              <article key={item.id}>
                <FileSpreadsheet size={20} />
                <div><strong>{item.filename}</strong><span>{item.rowCount} escalas · {formatDateTime(item.importedAt)} · {item.importedByName}</span></div>
                <div className="schedule-import-actions">
                  <button type="button" className="button secondary" onClick={() => setPreviewId(item.id)}>
                    <Eye size={16} aria-hidden="true" /> Ver plantões
                  </button>
                  <button type="button" className="icon-button danger-icon-button" disabled={busy} onClick={() => void remove(item)} aria-label={`Excluir ${item.filename}`}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : <EmptyState title="Nenhuma escala importada" description="Baixe o modelo, preencha os plantões e importe o arquivo Excel." />}
      </Card>
    </>
  );
}
