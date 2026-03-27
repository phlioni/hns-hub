import type { AuditLog } from '@/types/database';

/**
 * Ordem do enum `proposal_status` no banco (conforme portal / imagem de referência).
 * Usada só para saber quais etapas são “anteriores” a um status: o fluxo é “normal” se todas
 * elas já apareceram no histórico pelo menos uma vez — voltar status ou repetir não quebra.
 */
export const FLUXO_STATUS_ORDER = [
  'new',
  'understanding',
  'construction',
  'cancelled',
  'delivered',
  'in_review',
  'awaiting_code',
  'awaiting_contract',
  'operational_start',
  'execution_forwarded',
] as const;

export type FluxoStatus = (typeof FLUXO_STATUS_ORDER)[number];

const FLUXO_INDEX: Record<string, number> = Object.fromEntries(
  FLUXO_STATUS_ORDER.map((s, i) => [s, i])
);

/** Etapas que não entram na obrigatoriedade do “fluxo normal” (podem ser puladas). */
const FLUXO_OPCIONAIS = new Set<string>(['understanding', 'in_review', 'cancelled']);

/** Monta a sequência de status a partir dos logs de auditoria (cronológica). */
export function extractStatusPathFromAuditLogs(logs: AuditLog[]): string[] {
  const sorted = [...logs].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const path: string[] = [];

  for (const log of sorted) {
    if (log.entity_type !== 'proposal') continue;

    if (log.action === 'created' && log.new_status) {
      if (path[path.length - 1] !== log.new_status) {
        path.push(log.new_status);
      }
      continue;
    }

    if (log.action === 'status_changed' && log.new_status) {
      if (path.length === 0 && log.previous_status) {
        path.push(log.previous_status);
      }
      const last = path[path.length - 1];
      if (log.new_status !== last) {
        path.push(log.new_status);
      }
    }
  }

  return path;
}

/** Status conhecidos no fluxo (exclui valores fora do enum, ex.: ruido). */
function isFluxoStatus(s: string): s is FluxoStatus {
  return s in FLUXO_INDEX;
}

/** Etapas obrigatórias antes do status atual na ordem do enum, exceto as opcionais em {@link FLUXO_OPCIONAIS}. */
function requiredStatusesBefore(current: string): string[] {
  if (!isFluxoStatus(current)) return [];
  const idx = FLUXO_INDEX[current];
  return FLUXO_STATUS_ORDER.slice(0, idx).filter((s) => !FLUXO_OPCIONAIS.has(s));
}

/**
 * Fluxo “normal” = nenhuma etapa obrigatória foi pulada (na ordem do enum), considerando
 * todo o histórico de auditoria. Ex.: ir de Novo direto para Entregue sem passar por Construção → Não.
 * Oscilar (ex.: Novo → Entregue → Novo → Entregue) ou ficar parado em Entregue não invalida,
 * desde que todas as etapas anteriores ao status atual tenham aparecido ao menos uma vez.
 */
export function seguiuFluxoNormal(statusPath: string[], statusAtual: string): boolean {
  if (!isFluxoStatus(statusAtual)) return false;

  const merged = mergePathWithCurrentStatus(statusPath, statusAtual);
  const visited = new Set<string>();
  for (const s of merged) {
    if (s && isFluxoStatus(s)) visited.add(s);
  }
  visited.add(statusAtual);

  const required = requiredStatusesBefore(statusAtual);
  for (const r of required) {
    if (!visited.has(r)) return false;
  }

  return true;
}

/** Inclui o status atual da proposta no fim do caminho se não constar no histórico (último estado real). */
export function mergePathWithCurrentStatus(path: string[], statusAtual: string): string[] {
  if (!statusAtual) return [...path];
  if (path.length === 0) return [statusAtual];
  if (path[path.length - 1] !== statusAtual) {
    return [...path, statusAtual];
  }
  return [...path];
}

/** Texto para coluna de caminho: rótulos em PT, na ordem do histórico, separados por vírgula. */
export function formatarCaminhoStatusPortugues(
  statusPath: string[],
  labels: Record<string, string>
): string {
  if (statusPath.length === 0) return '';
  return statusPath.map((s) => labels[s] ?? s).join(', ');
}
