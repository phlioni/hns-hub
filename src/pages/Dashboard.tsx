import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, differenceInBusinessDays, parseISO, subMonths, isAfter, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  FileText, Activity, Clock, Briefcase, PlayCircle, Filter
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { MainLayout } from '@/components/layout/MainLayout';
import { MetricCard } from '@/components/ui/metric-card';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AuditLog, Proposal } from '@/types/database';

// Importações dos Gráficos Shadcn/Recharts
import {
  Bar, BarChart, CartesianGrid, XAxis, PieChart, Pie, Cell, LineChart, Line, YAxis, Legend
} from "recharts";
import {
  ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent
} from "@/components/ui/chart";

// Configuração de Cores e Labels
const chartConfig = {
  // Pie Chart Colors (Operacional)
  new: { label: "Novo", color: "hsl(var(--status-new))" },
  understanding: { label: "Entendimento", color: "hsl(var(--status-understanding))" },
  construction: { label: "Construção", color: "hsl(var(--status-construction))" },
  cancelled: { label: "Cancelado", color: "hsl(var(--status-cancelled))" },
  in_review: { label: "Em Revisão", color: "#8b5cf6" }, // Roxo
  awaiting_code: { label: "Aguard. Código", color: "#ec4899" }, // Rosa

  // SLA Colors
  one_day: { label: "Até 1 dia útil", color: "#22c55e" },
  five_days: { label: "Até 5 dias úteis", color: "#3b82f6" },
  late: { label: "Fora do Prazo", color: "#ef4444" },

  // Integration Colors
  awaiting_contract: { label: "Aguard. Contrato", color: "#f59e0b" },
  operational_start: { label: "Start Operacional", color: "#8b5cf6" },
} satisfies ChartConfig;

type PeriodType = '30d' | '90d' | '6m' | '1y' | 'all';

export default function Dashboard() {
  const navigate = useNavigate();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodType>('6m');

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [proposalsRes, logsRes] = await Promise.all([
        supabase.from('proposals').select('*').order('created_at', { ascending: false }),
        supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(5),
      ]);

      if (proposalsRes.data) setProposals(proposalsRes.data as Proposal[]);
      if (logsRes.data) setAuditLogs(logsRes.data as AuditLog[]);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  // --- FILTERING LOGIC ---
  const filterDate = (dateStr: string) => {
    if (period === 'all') return true;
    const date = parseISO(dateStr);
    const now = new Date();
    let thresholdDate = new Date();

    switch (period) {
      case '30d': thresholdDate = subMonths(now, 1); break;
      case '90d': thresholdDate = subMonths(now, 3); break;
      case '6m': thresholdDate = subMonths(now, 6); break;
      case '1y': thresholdDate = subMonths(now, 12); break;
    }
    return isAfter(date, startOfDay(thresholdDate));
  };

  // --- DADOS DO FLUXO OPERACIONAL (PIE & SLA) ---

  // 1. Pie Chart: Status Operacionais (Inclui os novos: Em Revisão e Aguardando Código)
  // Exclui: Entregue (vai pro SLA) e Integrações (vão pro gráfico de linha)
  const operationalProposals = proposals.filter(p =>
    filterDate(p.created_at) &&
    ['new', 'understanding', 'construction', 'cancelled', 'in_review', 'awaiting_code'].includes(p.status)
  );

  const pieChartData = [
    { name: 'new', value: operationalProposals.filter(p => p.status === 'new').length, fill: "var(--color-new)" },
    { name: 'understanding', value: operationalProposals.filter(p => p.status === 'understanding').length, fill: "var(--color-understanding)" },
    { name: 'construction', value: operationalProposals.filter(p => p.status === 'construction').length, fill: "var(--color-construction)" },
    { name: 'in_review', value: operationalProposals.filter(p => p.status === 'in_review').length, fill: "var(--color-in_review)" },
    { name: 'awaiting_code', value: operationalProposals.filter(p => p.status === 'awaiting_code').length, fill: "var(--color-awaiting_code)" },
    { name: 'cancelled', value: operationalProposals.filter(p => p.status === 'cancelled').length, fill: "var(--color-cancelled)" },
  ].filter(d => d.value > 0);

  // 2. SLA Bar Chart: Apenas Entregues (Últimos 6 meses)
  const processDeliveryMetrics = () => {
    const deliveredProposals = proposals.filter(p =>
      p.status === 'delivered' &&
      p.delivery_date &&
      p.entry_date &&
      isAfter(parseISO(p.delivery_date), startOfDay(subMonths(new Date(), 6)))
    );

    const groupedByMonth: Record<string, { name: string, one_day: number, five_days: number, late: number }> = {};

    // Inicializar últimos 6 meses
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const key = format(d, 'MMM/yy', { locale: ptBR });
      groupedByMonth[key] = { name: key, one_day: 0, five_days: 0, late: 0 };
    }

    deliveredProposals.forEach(p => {
      const deliveryDate = parseISO(p.delivery_date!);
      const entryDate = parseISO(p.entry_date);
      const monthKey = format(deliveryDate, 'MMM/yy', { locale: ptBR });

      if (groupedByMonth[monthKey]) {
        let isLate = false;
        if (p.deadline) {
          if (deliveryDate > parseISO(p.deadline)) isLate = true;
        }

        const businessDays = differenceInBusinessDays(deliveryDate, entryDate);

        if (isLate) {
          groupedByMonth[monthKey].late += 1;
        } else if (businessDays <= 1) {
          groupedByMonth[monthKey].one_day += 1;
        } else {
          groupedByMonth[monthKey].five_days += 1;
        }
      }
    });

    return Object.values(groupedByMonth);
  };
  const deliveryChartData = processDeliveryMetrics();

  // --- DADOS DO FLUXO DE INTEGRAÇÃO ---

  // Totalizadores (Afetados pelo Filtro Global)
  const integrationProposals = proposals.filter(p => filterDate(p.created_at));
  const awaitingContractCount = integrationProposals.filter(p => p.status === 'awaiting_contract').length;
  const operationalStartCount = integrationProposals.filter(p => p.status === 'operational_start').length;

  // Gráfico Combinado Mensal (Últimos 6 meses fixo para tendência)
  const processCombinedIntegrationTrend = () => {
    const grouped: Record<string, { name: string, awaiting_contract: number, operational_start: number }> = {};

    // Inicializa últimos 6 meses
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const key = format(d, 'MMM/yy', { locale: ptBR });
      grouped[key] = { name: key, awaiting_contract: 0, operational_start: 0 };
    }

    const relevantProposals = proposals.filter(p =>
      ['awaiting_contract', 'operational_start'].includes(p.status) &&
      isAfter(parseISO(p.created_at), startOfDay(subMonths(new Date(), 6)))
    );

    relevantProposals.forEach(p => {
      const key = format(parseISO(p.created_at), 'MMM/yy', { locale: ptBR });
      if (grouped[key]) {
        if (p.status === 'awaiting_contract') grouped[key].awaiting_contract += 1;
        if (p.status === 'operational_start') grouped[key].operational_start += 1;
      }
    });

    return Object.values(grouped);
  };

  const integrationTrendData = processCombinedIntegrationTrend();

  // Helper Log
  const formatAction = (action: string) => {
    const map: Record<string, string> = {
      'created': 'Criou',
      'updated': 'Atualizou',
      'edited': 'Editado',
      'deleted': 'Removeu',
      'status_changed': 'Alterou status'
    };
    return map[action] || action;
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-8 pb-10">

        {/* HEADER & FILTRO */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 animate-fade-in">
          <div>
            <h2 className="text-2xl font-bold text-[#612cb5]">Dashboard Gerencial</h2>
            <p className="text-muted-foreground">Visão consolidada dos fluxos operacionais e de integração.</p>
          </div>
          <div className="flex items-center gap-2 bg-white p-1 rounded-lg border shadow-sm">
            <Filter className="w-4 h-4 text-muted-foreground ml-2" />
            <Select value={period} onValueChange={(v: PeriodType) => setPeriod(v)}>
              <SelectTrigger className="w-[180px] border-0 focus:ring-0 h-8">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="90d">Últimos 3 meses</SelectItem>
                <SelectItem value="6m">Últimos 6 meses</SelectItem>
                <SelectItem value="1y">Este Ano</SelectItem>
                <SelectItem value="all">Todo o período</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* =====================================================================================
            SEÇÃO 1: FLUXO OPERACIONAL (PIE & SLA)
        ===================================================================================== */}
        <section className="space-y-4 animate-slide-up" style={{ animationDelay: '100ms' }}>
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Activity className="h-5 w-5 text-[#612cb5]" /> Fluxo Operacional
          </h3>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* GRÁFICO 1: PIE CHART (Pipeline Ativo) */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-base">Pipeline Ativo</CardTitle>
                <CardDescription>Status operacionais (novos, entendimento, construção, revisão...)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full relative">
                  {pieChartData.length > 0 ? (
                    <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[300px]">
                      <PieChart>
                        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                        <Pie
                          data={pieChartData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={2}
                          strokeWidth={2}
                        >
                          {pieChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Pie>
                        <ChartLegend content={<ChartLegendContent nameKey="name" />} className="flex-wrap gap-2 justify-center mt-4" />
                      </PieChart>
                    </ChartContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Sem dados no período</div>
                  )}
                  {pieChartData.length > 0 && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none pb-12">
                      <div className="text-center">
                        <span className="text-3xl font-bold text-foreground">
                          {pieChartData.reduce((acc, curr) => acc + curr.value, 0)}
                        </span>
                        <p className="text-xs text-muted-foreground uppercase">Propostas</p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* GRÁFICO 2: BAR CHART (SLA Entregas - 6 Meses) */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-base">SLA de Entregas (6 Meses)</CardTitle>
                <CardDescription>Performance de tempo em dias úteis</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[300px] w-full">
                  <BarChart accessibilityLayer data={deliveryChartData}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.2} />
                    <XAxis dataKey="name" tickLine={false} tickMargin={10} axisLine={false} />
                    <ChartTooltip content={<ChartTooltipContent indicator="dashed" />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="one_day" stackId="a" fill="var(--color-one_day)" radius={[0, 0, 4, 4]} />
                    <Bar dataKey="five_days" stackId="a" fill="var(--color-five_days)" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="late" stackId="a" fill="var(--color-late)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

          </div>
        </section>

        {/* =====================================================================================
            SEÇÃO 2: FLUXO DE INTEGRAÇÃO (AGUARDANDO CONTRATO & START)
        ===================================================================================== */}
        <section className="space-y-4 animate-slide-up" style={{ animationDelay: '200ms' }}>
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2 border-t pt-6">
            <Briefcase className="h-5 w-5 text-[#f59e0b]" /> Status de Integração
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* CARDS LATERALMENTE (1 Coluna) */}
            <div className="space-y-6 md:col-span-1">
              <MetricCard
                title="Aguardando Contrato"
                value={awaitingContractCount}
                subtitle="Total no período"
                icon={FileText}
                trend="neutral"
              />
              <MetricCard
                title="Start Operacional"
                value={operationalStartCount}
                subtitle="Total no período"
                icon={PlayCircle}
                trend="up"
              />
            </div>

            {/* GRÁFICO COMBINADO (2 Colunas) */}
            <Card className="glass-card md:col-span-2">
              <CardHeader className="py-4">
                <CardTitle className="text-sm">Evolução Mensal (6 Meses)</CardTitle>
                <CardDescription>Comparativo de entradas nos status de integração</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[300px] w-full">
                  <LineChart data={integrationTrendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.2} />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
                    <YAxis tickLine={false} axisLine={false} fontSize={12} width={30} />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />

                    <Line
                      type="monotone"
                      dataKey="awaiting_contract"
                      stroke="var(--color-awaiting_contract)"
                      strokeWidth={2}
                      dot={{ r: 4, fill: "var(--color-awaiting_contract)" }}
                      name="Aguard. Contrato"
                    />
                    <Line
                      type="monotone"
                      dataKey="operational_start"
                      stroke="var(--color-operational_start)"
                      strokeWidth={2}
                      dot={{ r: 4, fill: "var(--color-operational_start)" }}
                      name="Start Operacional"
                    />
                  </LineChart>
                </ChartContainer>
              </CardContent>
            </Card>

          </div>
        </section>

        {/* LOGS DE ATIVIDADE */}
        <section className="animate-slide-up" style={{ animationDelay: '300ms' }}>
          <Card className="glass-card bg-[#612cb5]/5 border-[#612cb5]/20 mt-4">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Activity className="h-4 w-4 text-[#612cb5]" /> Log de Auditoria Recente
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {auditLogs.slice(0, 5).map((log) => (
                  <div key={log.id} className="text-xs flex gap-2 items-start">
                    <div className="min-w-[4px] h-[4px] mt-1.5 rounded-full bg-[#612cb5]" />
                    <div>
                      <span className="font-medium text-foreground">{formatAction(log.action)}</span>
                      <span className="text-muted-foreground mx-1">em</span>
                      <span className="font-medium text-[#612cb5] line-clamp-1">
                        {/* @ts-ignore */}
                        {log.metadata?.entity_title || 'Item'}
                      </span>
                      <div className="text-[10px] text-muted-foreground opacity-70">
                        {format(new Date(log.created_at), "HH:mm")} • {log.user_email?.split('@')[0]}
                      </div>
                    </div>
                  </div>
                ))}
                {auditLogs.length === 0 && (
                  <div className="text-xs text-muted-foreground">Nenhuma atividade recente.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </section>

      </div>
    </MainLayout>
  );
}