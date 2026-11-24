import ExcelJS from "exceljs";
import type { CellValue, Fill, Worksheet } from "exceljs";
import { defaultSettings } from "../../shared/contracts";
import type { DashboardData, Filters, Manifestation, ResponseRow } from "../models/types";

type Column = {
  label: string;
  width: number;
  format?: string;
  wrap?: boolean;
};

type ReportOptions = {
  dashboard: DashboardData;
  criteria: Filters;
  sectorName: string;
  hospitalName?: string;
  demo?: boolean;
  responses?: ResponseRow[];
  ombudsman?: {
    records: Manifestation[];
    includeContacts: boolean;
    statusNames: Record<string, string>;
    typeNames: Record<string, string>;
  };
};

const colors = {
  red: "FF9B001B",
  darkRed: "FF790015",
  ink: "FF26272B",
  muted: "FF61636C",
  light: "FFF6F4F6",
  white: "FFFFFFFF",
  line: "FFE7DCE2",
  amber: "FF8A5100",
  amberBackground: "FFFFF3DF",
  green: "FF155747",
  greenBackground: "FFE5F3ED",
};
const font = { name: "Arial", size: 10, color: { argb: colors.ink } };
const dateFormat = "dd/mm/yyyy";
const timestampFormat = "dd/mm/yyyy hh:mm:ss";
const countFormat = "#,##0";
const ratingFormat = "0.0";
const tableHeader = 6;

const fill = (argb: string): Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

function dateCell(value: string | null): Date | string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date;
}

function timeCell(value: string | null): number | string | null {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return value;
  return (Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] ?? 0)) / 86400;
}

function frame(sheet: Worksheet, heading: string, context: string, width: number) {
  sheet.getRow(1).height = 9;
  sheet.getRow(2).height = 27;
  sheet.getRow(3).height = 17;
  const title = sheet.getCell("A2");
  title.value = heading;
  title.font = { ...font, size: 16, bold: true, color: { argb: colors.darkRed } };
  title.alignment = { vertical: "middle" };
  const subtitle = sheet.getCell("A3");
  subtitle.value = context;
  subtitle.font = { ...font, italic: true, color: { argb: colors.muted } };
  const line = sheet.getRow(4);
  line.height = 7;
  for (let index = 1; index <= width; index++)
    line.getCell(index).border = { bottom: { style: "thin", color: { argb: colors.line } } };
  sheet.getRow(5).height = 9;
  sheet.headerFooter.oddFooter = "&LFHDOD&R&P / &N";
}

function header(row: ExcelJS.Row, columnIndex: number, value: string | null, centered = true) {
  const cell = row.getCell(columnIndex);
  cell.value = value;
  cell.fill = fill(colors.darkRed);
  cell.font = { ...font, bold: true, color: { argb: colors.white } };
  cell.alignment = { horizontal: centered ? "center" : "left", vertical: "middle", wrapText: true, indent: centered ? 0 : 1 };
}

function addTable(
  workbook: ExcelJS.Workbook,
  name: string,
  context: string,
  columns: Column[],
  rows: Iterable<CellValue[]>,
  statusColumn?: number,
) {
  const wide = columns.length > 6;
  const sheet = workbook.addWorksheet(name, {
    properties: { tabColor: { argb: wide ? "FF9C818A" : "FFC7697D" } },
    views: [{ state: "frozen", ySplit: tableHeader, xSplit: wide ? 1 : 0, showGridLines: false }],
    pageSetup: {
      paperSize: 9,
      orientation: wide ? "landscape" : "portrait",
      fitToPage: true,
      fitToWidth: wide ? 2 : 1,
      fitToHeight: 0,
      printTitlesRow: `${tableHeader}:${tableHeader}`,
      ...(wide && { printTitlesColumn: "A:A" }),
    },
  });
  sheet.columns = columns.map(({ width }) => ({ width }));
  frame(sheet, name, context, columns.length);
  const headings = sheet.getRow(tableHeader);
  headings.height = wide ? 32 : 25;
  columns.forEach((column, index) => header(headings, index + 1, column.label));
  for (const values of rows) {
    const row = sheet.addRow(values.map((value) => value === "" ? null : value));
    const background = fill(row.number % 2 ? colors.white : colors.light);
    let lines = 1;
    columns.forEach(({ width, format, wrap }, index) => {
      const cell = row.getCell(index + 1);
      const value = cell.value;
      cell.font = font;
      cell.fill = background;
      if (format && (value instanceof Date || typeof value === "number")) cell.numFmt = format;
      cell.alignment = {
        horizontal: typeof value === "number" ? "right" : "left",
        vertical: wrap ? "top" : "middle",
        wrapText: Boolean(wrap),
        indent: 1,
      };
      if (wrap && typeof value === "string") {
        const lineWidth = Math.max(10, Math.floor((width - 3) * 1.04));
        const wrappedLines = value.split(/\r?\n/).reduce((total, line) => total + Math.max(1, Math.ceil(line.length / lineWidth)), 0);
        lines = Math.max(lines, wrappedLines);
      }
      if (index + 1 === statusColumn) {
        const positive = value === "Enviada" || value === "Resolvida";
        const alert = value === "Parcial" || value === "Pendente" || value === "Nova";
        if (positive || alert) {
          cell.fill = fill(positive ? colors.greenBackground : colors.amberBackground);
          cell.font = { ...font, bold: true, color: { argb: positive ? colors.green : colors.amber } };
        }
      }
    });
    row.height = Math.min(402, Math.max(22, 12 * lines + 8));
    if (lines > 1) row.eachCell((cell) => {
      cell.alignment = { ...cell.alignment, vertical: "top" };
    });
  }
  if (sheet.rowCount > tableHeader) {
    sheet.autoFilter = {
      from: { row: tableHeader, column: 1 },
      to: { row: sheet.rowCount, column: columns.length },
    };
  } else {
    const empty = sheet.getCell(tableHeader + 1, 1);
    empty.value = "Nenhum registro para os filtros selecionados.";
    empty.font = { ...font, italic: true, color: { argb: colors.muted } };
    sheet.getRow(tableHeader + 1).height = 25;
  }
  sheet.pageSetup.printArea = `A1:${sheet.getColumn(columns.length).letter}${sheet.rowCount}`;
}

function* answerRows(responses: ResponseRow[]) {
  for (const response of responses) {
    const base = [
      response.id,
      response.sectorName,
      response.surveyTitle,
      response.status === "submitted" ? "Enviada" : "Parcial",
      dateCell(response.attendedOn),
      timeCell(response.attendedTime),
      response.shift || "",
      dateCell(response.createdAt),
      dateCell(response.submittedAt),
      response.nps,
    ];
    if (!response.answers.length) yield base;
    for (const answer of response.answers)
      yield [
        ...base,
        answer.questionText,
        answer.category,
        answer.type,
        typeof answer.value === "boolean" ? (answer.value ? "Sim" : "Não") : answer.value,
        dateCell(answer.answeredAt),
      ];
  }
}

export function createReportWorkbook({ dashboard, criteria, sectorName, hospitalName, demo, responses, ombudsman }: ReportOptions) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "FHDOD";
  workbook.created = new Date();
  const institution = `FHDOD · ${hospitalName || defaultSettings.hospitalName}`;
  const summary = workbook.addWorksheet("Resumo geral", {
    properties: { tabColor: { argb: colors.red } },
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 1, printArea: "A1:E12" },
  });
  summary.columns = [19, 45, 4, 30, 17].map((width) => ({ width }));
  frame(summary, "Relatório de experiência do paciente", institution, 5);

  const scope: [string, CellValue, string?][] = [
    ["Período inicial", dateCell(criteria.from) ?? "Todos", dateFormat],
    ["Período final", dateCell(criteria.to) ?? "Todos", dateFormat],
    ["Setor", sectorName],
    ["Base de data", "Envio da pesquisa"],
    ["Exportado em (UTC)", workbook.created, timestampFormat],
    ["Ambiente", demo ? "Demonstração — dados fictícios" : "Instalação do hospital"],
  ];
  const indicators = [
    ["Respostas enviadas", dashboard.responseCount, countFormat],
    ["Respostas parciais", dashboard.partialCount, countFormat],
    ["NPS", dashboard.nps, countFormat],
    ["Satisfação (1 a 5)", dashboard.satisfaction, ratingFormat],
    ["Manifestações pendentes", dashboard.pendingCount, countFormat],
  ] as const;
  const summaryHeader = summary.getRow(tableHeader);
  summaryHeader.height = 26;
  header(summaryHeader, 1, "Escopo do relatório", false);
  header(summaryHeader, 2, null);
  header(summaryHeader, 4, "Indicador", false);
  header(summaryHeader, 5, "Valor");
  scope.forEach(([label, value, format], index) => {
    const row = summary.getRow(tableHeader + index + 1);
    const background = fill(index % 2 ? colors.light : colors.white);
    row.height = typeof value === "string" && value.length > 40 ? 34 : 23;
    function styleCell(column: number, content: CellValue, strong = false, right = false) {
      const cell = row.getCell(column);
      cell.value = content;
      cell.fill = background;
      cell.font = { ...font, bold: strong };
      cell.alignment = { horizontal: right ? "right" : "left", vertical: "middle", wrapText: true, indent: 1 };
      return cell;
    }
    styleCell(1, label, true);
    const context = styleCell(2, value);
    if (value instanceof Date && format) context.numFmt = format;
    const indicator = indicators[index];
    if (indicator) {
      const [label, value, format] = indicator;
      styleCell(4, label);
      const cell = styleCell(5, value ?? "Sem dados", true, true);
      cell.numFmt = format;
      cell.font = { ...font, size: 12, bold: true, color: { argb: value == null ? colors.muted : colors.darkRed } };
    }
  });

  addTable(workbook, "Resultados por setor", institution, [
    { label: "Setor", width: 48, wrap: true },
    { label: "Respostas", width: 17, format: countFormat },
    { label: "NPS", width: 14, format: countFormat },
    { label: "Satisfação (1 a 5)", width: 23, format: ratingFormat },
  ], dashboard.bySector.map((sector) => [sector.name, sector.count, sector.nps, sector.satisfaction]));

  addTable(workbook, "Distribuição NPS", institution, [
    { label: "Nota", width: 27, format: countFormat },
    { label: "Quantidade", width: 35, format: countFormat },
  ], dashboard.distribution.map(({ score, count }) => [score, count]));

  if (responses) {
    addTable(workbook, "Avaliações e respostas", institution, [
      { label: "Registro", width: 39 },
      { label: "Setor", width: 27, wrap: true },
      { label: "Pesquisa", width: 30, wrap: true },
      { label: "Situação", width: 14 },
      { label: "Data do atendimento", width: 18, format: dateFormat },
      { label: "Horário do atendimento", width: 18, format: "hh:mm:ss" },
      { label: "Turno", width: 16 },
      { label: "Início (UTC)", width: 24, format: timestampFormat },
      { label: "Envio (UTC)", width: 24, format: timestampFormat },
      { label: "NPS", width: 10, format: countFormat },
      { label: "Pergunta", width: 49, wrap: true },
      { label: "Categoria", width: 20, wrap: true },
      { label: "Tipo", width: 15 },
      { label: "Resposta", width: 52, wrap: true },
      { label: "Respondido em (UTC)", width: 24, format: timestampFormat },
    ], answerRows(responses), 4);
  }
  if (ombudsman) {
    const { records, includeContacts, typeNames, statusNames } = ombudsman;
    addTable(workbook, "Ouvidoria", institution, [
      { label: "Registro", width: 39 },
      { label: "Setor", width: 27, wrap: true },
      { label: "Tipo", width: 17 },
      { label: "Relato original", width: 58, wrap: true },
      { label: "Situação", width: 22 },
      { label: "Retorno solicitado", width: 21 },
      ...(includeContacts ? [{ label: "Telefone", width: 22 }] : []),
      { label: "Observação interna", width: 54, wrap: true },
      { label: "Recebido em (UTC)", width: 24, format: timestampFormat },
      { label: "Atualizado em (UTC)", width: 24, format: timestampFormat },
    ], records.map((record) => [
      record.id,
      record.sectorName,
      typeNames[record.type] ?? record.type,
      record.comment,
      statusNames[record.status] ?? record.status,
      record.wantsContact ? "Sim" : "Não",
      ...(includeContacts ? [record.phone || ""] : []),
      record.internalNote,
      dateCell(record.createdAt),
      dateCell(record.updatedAt),
    ]), 5);
  }
  return workbook;
}
