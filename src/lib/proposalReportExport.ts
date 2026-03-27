import type { Borders } from 'exceljs';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { AuditLog } from '@/types/database';
import {
  extractStatusPathFromAuditLogs,
  formatarCaminhoStatusPortugues,
  mergePathWithCurrentStatus,
  seguiuFluxoNormal,
} from '@/lib/proposalReportFlow';

/** Rótulos em português para status de proposta (valores internos em inglês). */
export const PROPOSAL_STATUS_PT: Record<string, string> = {
  new: 'Novo',
  understanding: 'Entendimento',
  construction: 'Construção',
  cancelled: 'Cancelado',
  delivered: 'Entregue',
  in_review: 'Em revisão',
  awaiting_code: 'Aguardando código',
  awaiting_contract: 'Aguardando assinatura',
  operational_start: 'Start operacional',
  edited: 'Editado',
  execution_forwarded: 'Encaminhado para execução',
};

const HEADER_FILL = 'FF612CB5';
const HEADER_FONT = 'FFFFFFFF';
const BORDER_COLOR = 'FFE2E8F0';
const ZEBRA_FILL = 'FFF8F7FC';

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return format(parseISO(iso), "dd/MM/yyyy HH:mm", { locale: ptBR });
  } catch {
    return String(iso);
  }
}

function formatDateOnly(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return format(parseISO(iso), 'dd/MM/yyyy', { locale: ptBR });
  } catch {
    return String(iso);
  }
}

function formatLinks(links: unknown): string {
  if (!Array.isArray(links)) return '';
  return links
    .map((item: { name?: string; url?: string }) => {
      const n = item?.name ?? '';
      const u = item?.url ?? '';
      if (n && u) return `${n} (${u})`;
      return u || n;
    })
    .filter(Boolean)
    .join(' | ');
}

function formatAttachments(attachments: unknown): string {
  if (!Array.isArray(attachments)) return '';
  return attachments
    .map((item: { name?: string; url?: string }) => {
      const n = item?.name ?? '';
      const u = item?.url ?? '';
      if (n && u) return `${n} (${u})`;
      return u || n;
    })
    .filter(Boolean)
    .join(' | ');
}

function formatTags(tags: unknown): string {
  if (!Array.isArray(tags)) return '';
  return tags.map(String).filter(Boolean).join(', ');
}

export type ProposalReportRow = Record<string, unknown>;

type ColumnDef = {
  header: string;
  width: number;
  value: (p: ProposalReportRow) => string;
};

const BASE_REPORT_COLUMNS: ColumnDef[] = [
  { header: 'Título', width: 38, value: (p) => String(p.title ?? '') },
  { header: 'Código do projeto', width: 16, value: (p) => String(p.project_code ?? '') },
  {
    header: 'Status',
    width: 26,
    value: (p) => PROPOSAL_STATUS_PT[String(p.status)] ?? String(p.status ?? ''),
  },
  { header: 'Data de entrada', width: 18, value: (p) => formatDateTime(p.entry_date as string) },
  { header: 'Prazo de entrega', width: 16, value: (p) => formatDateOnly(p.deadline as string) },
  { header: 'Data de entrega (efetiva)', width: 22, value: (p) => formatDateTime(p.delivery_date as string) },
  { header: 'Responsável pela solicitação', width: 28, value: (p) => String(p.owner ?? '') },
  { header: 'Segmento', width: 22, value: (p) => String(p.segment ?? '') },
  { header: 'Necessidades', width: 42, value: (p) => String(p.needs ?? '') },
  { header: 'Análise de necessidades', width: 42, value: (p) => String(p.analysis ?? '') },
  { header: 'Descrição', width: 48, value: (p) => String(p.description ?? '') },
  { header: 'Pré-análise', width: 36, value: (p) => String(p.pre_analysis ?? '') },
  { header: 'Pré-proposta', width: 36, value: (p) => String(p.pre_proposal ?? '') },
  { header: 'Tags', width: 28, value: (p) => formatTags(p.tags) },
  { header: 'Links externos', width: 46, value: (p) => formatLinks(p.links) },
  { header: 'Anexos', width: 46, value: (p) => formatAttachments(p.attachments) },
  { header: 'E-mail de referência', width: 30, value: (p) => String(p.idemail ?? '') },
  { header: 'Última justificativa', width: 40, value: (p) => String(p.last_justification ?? '') },
  { header: 'Criado em', width: 18, value: (p) => formatDateTime(p.created_at as string) },
  { header: 'Atualizado em', width: 18, value: (p) => formatDateTime(p.updated_at as string) },
];

function buildFlowColumns(logsByProposalId: Record<string, AuditLog[]>): ColumnDef[] {
  return [
    {
      header: 'Seguiu fluxo normal',
      width: 22,
      value: (p) => {
        const id = String(p.id ?? '');
        const logs = logsByProposalId[id] ?? [];
        const raw = extractStatusPathFromAuditLogs(logs);
        const current = String(p.status ?? '');
        if (!current) return 'Não';
        return seguiuFluxoNormal(raw, current) ? 'Sim' : 'Não';
      },
    },
    {
      header: 'Etapas percorridas',
      width: 56,
      value: (p) => {
        const id = String(p.id ?? '');
        const logs = logsByProposalId[id] ?? [];
        const raw = extractStatusPathFromAuditLogs(logs);
        const current = String(p.status ?? '');
        const display = mergePathWithCurrentStatus(raw, current);
        return formatarCaminhoStatusPortugues(display, PROPOSAL_STATUS_PT);
      },
    },
  ];
}

function getReportColumns(logsByProposalId: Record<string, AuditLog[]>): ColumnDef[] {
  return [...BASE_REPORT_COLUMNS, ...buildFlowColumns(logsByProposalId)];
}

const thinBorder: Borders = {
  top: { style: 'thin', color: { argb: BORDER_COLOR } },
  left: { style: 'thin', color: { argb: BORDER_COLOR } },
  bottom: { style: 'thin', color: { argb: BORDER_COLOR } },
  right: { style: 'thin', color: { argb: BORDER_COLOR } },
};

/**
 * Gera workbook XLSX com aba "Propostas": cabeçalho fixo, autofiltro, bordas e quebra de linha.
 * Exclui id e created_by (não entram nas colunas).
 */
export async function buildProposalsXlsx(
  proposals: ProposalReportRow[],
  options?: { periodLabel?: string; logsByProposalId?: Record<string, AuditLog[]> }
): Promise<ArrayBuffer> {
  const logsByProposalId = options?.logsByProposalId ?? {};
  const columns = getReportColumns(logsByProposalId);

  const ExcelJSMod = await import('exceljs');
  const Excel = ExcelJSMod.default;
  const workbook = new Excel.Workbook();
  workbook.creator = 'HNS Hub';
  workbook.created = new Date();
  workbook.modified = new Date();

  const sheet = workbook.addWorksheet('Propostas', {
    properties: { defaultRowHeight: 18 },
  });

  let currentRow = 1;

  if (options?.periodLabel?.trim()) {
    sheet.mergeCells(currentRow, 1, currentRow, columns.length);
    const titleRow = sheet.getRow(currentRow);
    titleRow.getCell(1).value = 'Relatório de propostas';
    titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: 'FF1E1B4B' } };
    titleRow.getCell(1).alignment = { vertical: 'middle' };
    titleRow.height = 28;
    currentRow += 1;

    sheet.mergeCells(currentRow, 1, currentRow, columns.length);
    const subRow = sheet.getRow(currentRow);
    subRow.getCell(1).value = `Período: ${options.periodLabel}`;
    subRow.getCell(1).font = { size: 11, color: { argb: 'FF64748B' } };
    subRow.getCell(1).alignment = { vertical: 'middle' };
    subRow.height = 20;
    currentRow += 1;

    sheet.addRow([]);
    currentRow += 1;
  }

  const headerRowIndex = currentRow;
  sheet.addRow(columns.map((c) => c.header));
  const headerRow = sheet.getRow(headerRowIndex);
  headerRow.height = 26;
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    if (colNumber <= columns.length) {
      cell.font = { bold: true, color: { argb: HEADER_FONT }, size: 11 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = thinBorder;
    }
  });

  columns.forEach((col, i) => {
    sheet.getColumn(i + 1).width = col.width;
  });

  proposals.forEach((p) => {
    const row = sheet.addRow(columns.map((c) => c.value(p)));
    const isZebra = (row.number - headerRowIndex) % 2 === 0;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      if (colNumber > columns.length) return;
      cell.font = { size: 11, color: { argb: 'FF0F172A' } };
      cell.alignment = { vertical: 'top', wrapText: true };
      cell.border = thinBorder;
      if (isZebra) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA_FILL } };
      }
    });
  });

  const filterTop = headerRowIndex;
  sheet.autoFilter = {
    from: { row: filterTop, column: 1 },
    to: { row: filterTop, column: columns.length },
  };

  const newFreezeRow = headerRowIndex;
  sheet.views = [{ state: 'frozen', ySplit: newFreezeRow }];

  const buf = await workbook.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}

export function downloadXlsx(filename: string, buffer: ArrayBuffer): void {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
