import { useMemo, useState } from 'react';
import {
  endOfMonth,
  endOfDay,
  format,
  parse,
  startOfDay,
  startOfMonth,
  isAfter,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { FileDown, CalendarRange, CalendarDays, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import type { AuditLog } from '@/types/database';
import {
  buildProposalsXlsx,
  downloadXlsx,
  type ProposalReportRow,
} from '@/lib/proposalReportExport';

const AUDIT_CHUNK = 120;

async function fetchAuditLogsForProposals(proposalIds: string[]): Promise<Record<string, AuditLog[]>> {
  const map: Record<string, AuditLog[]> = {};
  for (let i = 0; i < proposalIds.length; i += AUDIT_CHUNK) {
    const chunk = proposalIds.slice(i, i + AUDIT_CHUNK);
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('entity_type', 'proposal')
      .in('entity_id', chunk);
    if (error) throw error;
    for (const log of data ?? []) {
      const id = log.entity_id as string;
      if (!map[id]) map[id] = [];
      map[id].push(log as AuditLog);
    }
  }
  return map;
}

type PeriodMode = 'month' | 'range';

export default function ProposalReports() {
  const [mode, setMode] = useState<PeriodMode>('month');
  const [monthValue, setMonthValue] = useState(() => format(new Date(), 'yyyy-MM'));
  const [startDate, setStartDate] = useState(() =>
    format(startOfMonth(new Date()), 'yyyy-MM-dd')
  );
  const [endDate, setEndDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(false);
  const [lastCount, setLastCount] = useState<number | null>(null);

  const rangeLabel = useMemo(() => {
    if (mode === 'month') {
      try {
        const d = parse(`${monthValue}-01`, 'yyyy-MM-dd', new Date());
        return format(d, "MMMM 'de' yyyy", { locale: ptBR });
      } catch {
        return monthValue;
      }
    }
    return `${startDate} — ${endDate}`;
  }, [mode, monthValue, startDate, endDate]);

  const getFilterBounds = (): { from: string; to: string } | null => {
    if (mode === 'month') {
      if (!/^\d{4}-\d{2}$/.test(monthValue)) {
        toast.error('Selecione um mês válido.');
        return null;
      }
      const base = parse(`${monthValue}-01`, 'yyyy-MM-dd', new Date());
      const from = startOfMonth(base);
      const to = endOfMonth(base);
      return { from: from.toISOString(), to: to.toISOString() };
    }
    if (!startDate || !endDate) {
      toast.error('Informe data inicial e final.');
      return null;
    }
    const start = startOfDay(parse(startDate, 'yyyy-MM-dd', new Date()));
    const end = endOfDay(parse(endDate, 'yyyy-MM-dd', new Date()));
    if (isAfter(start, end)) {
      toast.error('A data inicial não pode ser posterior à data final.');
      return null;
    }
    return { from: start.toISOString(), to: end.toISOString() };
  };

  const handleDownload = async () => {
    const bounds = getFilterBounds();
    if (!bounds) return;

    setLoading(true);
    setLastCount(null);
    try {
      const { data, error } = await supabase
        .from('proposals')
        .select('*')
        .gte('entry_date', bounds.from)
        .lte('entry_date', bounds.to)
        .order('entry_date', { ascending: true });

      if (error) throw error;

      const rows = (data ?? []) as ProposalReportRow[];
      setLastCount(rows.length);

      if (rows.length === 0) {
        toast.message('Nenhuma proposta no período', {
          description: 'Ajuste o filtro ou escolha outro intervalo.',
        });
        return;
      }

      const ids = rows.map((r) => String(r.id));
      const logsByProposalId = await fetchAuditLogsForProposals(ids);

      const buffer = await buildProposalsXlsx(rows, {
        periodLabel: rangeLabel,
        logsByProposalId,
      });
      const safePeriod =
        mode === 'month'
          ? monthValue
          : `${startDate}_a_${endDate}`;
      const filename = `relatorio-propostas-${safePeriod}.xlsx`;
      downloadXlsx(filename, buffer);
      toast.success('Download iniciado', {
        description: `${rows.length} proposta(s) no arquivo Excel.`,
      });
    } catch (e) {
      console.error(e);
      toast.error('Não foi possível gerar o relatório.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout>
      <div className="mx-auto max-w-3xl space-y-8 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold text-[#612cb5]">Relatórios</h1>
          <p className="mt-1 text-muted-foreground">
            Exporte propostas em Excel (.xlsx) com colunas em português, cabeçalho formatado e filtros, filtrando
            por mês ou intervalo (com base na{' '}
            <span className="font-medium text-foreground">data de entrada</span>).
          </p>
        </div>

        <Card className="glass-card border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-foreground">
              <FileDown className="h-5 w-5 text-[#612cb5]" />
              Exportar propostas
            </CardTitle>
            <CardDescription>
              Planilha estruturada: título e período no topo (quando aplicável), colunas com largura adequada,
              primeira linha de dados fixa com autofiltro, bordas e texto com quebra automática. Inclui todos os
              campos da proposta exceto identificadores internos (ID e ID do criador). As colunas{' '}
              <strong>Seguiu fluxo normal</strong> e <strong>Etapas percorridas</strong> usam a auditoria: considera
              “Sim” quando todas as etapas anteriores ao status atual (ordem do banco) já apareceram no histórico,
              exceto <strong>Entendimento</strong>, <strong>Em revisão</strong> e <strong>Cancelado</strong>, que não
              entram na obrigatoriedade.
              Voltar de status ou repetir não invalida. “Não” só se alguma etapa obrigatória tiver sido pulada.
              Anexos e links vêm como texto na célula.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="space-y-4">
              <Label className="text-sm font-semibold text-foreground">Período</Label>
              <RadioGroup
                value={mode}
                onValueChange={(v) => setMode(v as PeriodMode)}
                className="grid gap-4 sm:grid-cols-2"
              >
                <label
                  htmlFor="mode-month"
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                    mode === 'month'
                      ? 'border-[#612cb5]/50 bg-[#612cb5]/5'
                      : 'border-border hover:bg-muted/40'
                  }`}
                >
                  <RadioGroupItem value="month" id="mode-month" className="mt-1" />
                  <div className="space-y-1">
                    <span className="flex items-center gap-2 font-medium text-foreground">
                      <CalendarDays className="h-4 w-4 text-[#612cb5]" />
                      Por mês
                    </span>
                    <p className="text-xs text-muted-foreground">
                      Considera do primeiro ao último dia do mês escolhido.
                    </p>
                  </div>
                </label>
                <label
                  htmlFor="mode-range"
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                    mode === 'range'
                      ? 'border-[#612cb5]/50 bg-[#612cb5]/5'
                      : 'border-border hover:bg-muted/40'
                  }`}
                >
                  <RadioGroupItem value="range" id="mode-range" className="mt-1" />
                  <div className="space-y-1">
                    <span className="flex items-center gap-2 font-medium text-foreground">
                      <CalendarRange className="h-4 w-4 text-[#612cb5]" />
                      Data início e fim
                    </span>
                    <p className="text-xs text-muted-foreground">
                      Escolha o intervalo exato (inclusive, por dia civil).
                    </p>
                  </div>
                </label>
              </RadioGroup>
            </div>

            {mode === 'month' ? (
              <div className="space-y-2">
                <Label htmlFor="report-month">Mês de referência</Label>
                <Input
                  id="report-month"
                  type="month"
                  value={monthValue}
                  onChange={(e) => setMonthValue(e.target.value)}
                  className="max-w-xs input-enhanced"
                />
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="report-start">Data inicial</Label>
                  <Input
                    id="report-start"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="input-enhanced"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="report-end">Data final</Label>
                  <Input
                    id="report-end"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="input-enhanced"
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-4 border-t border-border/60 pt-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Período selecionado:{' '}
                <span className="font-medium capitalize text-foreground">{rangeLabel}</span>
                {lastCount !== null && (
                  <span className="mt-1 block text-xs">
                    Última exportação: {lastCount} registro(s).
                  </span>
                )}
              </p>
              <Button
                className="bg-[#612cb5] text-white hover:bg-[#502495] sm:min-w-[200px]"
                onClick={handleDownload}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Gerando…
                  </>
                ) : (
                  <>
                    <FileDown className="mr-2 h-4 w-4" />
                    Baixar Excel
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
