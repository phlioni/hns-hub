import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  format, differenceInBusinessDays, parseISO, subMonths, isAfter, startOfDay, endOfDay, isWithinInterval, isSameMonth, isSameYear, subDays, differenceInDays
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  FileText, Activity, Clock, Briefcase, PlayCircle, Filter, Calendar as CalendarIcon, TrendingUp, Timer
} from 'lucide-react';
import { DateRange } from "react-day-picker";
import { supabase } from '@/integrations/supabase/client';
import { MainLayout } from '@/components/layout/MainLayout';
import { MetricCard } from '@/components/ui/metric-card';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { AuditLog, Proposal } from '@/types/database';

import {
  Bar, BarChart, CartesianGrid, XAxis, PieChart, Pie, Cell, LineChart, Line, YAxis, Legend, ResponsiveContainer, LabelList
} from "recharts";
import {
  ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent
} from "@/components/ui/chart";

// Configuração de Cores e Labels
const chartConfig = {
  // Cores Pipeline (Sequência Solicitada)
  awaiting_code: { label: "Aguard. Código", color: "#ec4899" }, // Rosa
  new: { label: "Novo", color: "hsl(var(--status-new))" },
  understanding: { label: "Entendimento", color: "hsl(var(--status-understanding))" },
  construction: { label: "Construção", color: "hsl(var(--status-construction))" },
  in_review: { label: "Em Revisão", color: "#8b5cf6" }, // Roxo

  // SLA Colors
  one_day: { label: "Até 1 dia útil", color: "#22c55e" },
  five_days: { label: "Até 5 dias úteis", color: "#3b82f6" },
  late: { label: "Fora do Prazo", color: "#ef4444" },

  // Lead Time Color
  avg_days: { label: "Dias (Médio)", color: "#612cb5" },
} satisfies ChartConfig;

type FilterType = 'preset' | 'month' | 'range';
type PresetPeriod = '30d' | '90d' | '6m' | '1y' | 'all';

export default function Dashboard() {
  const navigate = useNavigate();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  // --- ESTADOS DO FILTRO ---
  const [filterType, setFilterType] = useState<FilterType>('preset');
  const [presetPeriod, setPresetPeriod] = useState<PresetPeriod>('6m');
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [proposalsRes, logsRes] = await Promise.all([
        supabase.from('proposals').select('*').order('created_at', { ascending: false }),
        supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(20),
      ]);

      if (proposalsRes.data) setProposals(proposalsRes.data as Proposal[]);
      if (logsRes.data) setAuditLogs(logsRes.data as AuditLog[]);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  // --- LÓGICA CENTRAL DE FILTRAGEM ---
  const isDateInFilter = (dateStr: string) => {
    if (!dateStr) return false;
    const date = parseISO(dateStr);
    const now = new Date();

    if (filterType === 'preset') {
      if (presetPeriod === 'all') return true;
      let thresholdDate = now;
      switch (presetPeriod) {
        case '30d': thresholdDate = subDays(now, 30); break;
        case '90d': thresholdDate = subMonths(now, 3); break;
        case '6m': thresholdDate = subMonths(now, 6); break;
        case '1y': thresholdDate = subMonths(now, 12); break;
      }
      return isAfter(date, startOfDay(thresholdDate));
    }

    if (filterType === 'month') {
      if (!selectedMonth) return true;
      const [year, month] = selectedMonth.split('-').map(Number);
      const filterDate = new Date(year, month - 1);
      return isSameMonth(date, filterDate) && isSameYear(date, filterDate);
    }

    if (filterType === 'range') {
      if (!dateRange?.from) return true;
      const start = startOfDay(dateRange.from);
      const end = endOfDay(dateRange.to || dateRange.from);
      return isWithinInterval(date, { start, end });
    }

    return true;
  };

  // Aplicar filtro
  const filteredProposals = proposals.filter(p => isDateInFilter(p.created_at));
  const filteredLogs = auditLogs.filter(l => isDateInFilter(l.created_at));

  // --- KPI CARDS ---
  const awaitingContractCount = filteredProposals.filter(p => p.status === 'awaiting_contract').length;
  const operationalStartCount = filteredProposals.filter(p => p.status === 'operational_start').length;


  // --- GRÁFICO 1: PIPELINE ATIVO (PIE CHART - COM SEQUÊNCIA) ---
  const processPipelinePie = () => {
    // Sequência exata solicitada
    const sequence = ['awaiting_code', 'new', 'understanding', 'construction', 'in_review'];

    // Filtra propostas que têm um desses status
    const relevantProposals = filteredProposals.filter(p => sequence.includes(p.status));

    // Monta o array de dados respeitando a ordem do array 'sequence'
    return sequence.map(status => {
      const count = relevantProposals.filter(p => p.status === status).length;
      return {
        name: status,
        value: count,
        // @ts-ignore - Pega a cor do config
        fill: chartConfig[status]?.color || "#ccc"
      };
    }).filter(d => d.value > 0); // Opcional: remover fatias vazias para não poluir
  };

  const pipelinePieData = processPipelinePie();


  // --- SLA BAR CHART (ENTREGUES) ---
  const processDeliveryMetrics = () => {
    const deliveredInPeriod = proposals.filter(p =>
      p.status === 'delivered' &&
      p.delivery_date &&
      isDateInFilter(p.delivery_date)
    );

    const grouped: Record<string, { name: string, one_day: number, five_days: number, late: number }> = {};

    deliveredInPeriod.forEach(p => {
      const deliveryDate = parseISO(p.delivery_date!);
      const entryDate = parseISO(p.entry_date);
      const key = format(deliveryDate, 'MMM/yy', { locale: ptBR });

      if (!grouped[key]) {
        grouped[key] = { name: key, one_day: 0, five_days: 0, late: 0 };
      }

      let isLate = false;
      if (p.deadline && deliveryDate > parseISO(p.deadline)) isLate = true;
      const businessDays = differenceInBusinessDays(deliveryDate, entryDate);

      if (isLate) grouped[key].late += 1;
      else if (businessDays <= 1) grouped[key].one_day += 1;
      else grouped[key].five_days += 1;
    });

    return Object.values(grouped);
  };
  const deliveryChartData = processDeliveryMetrics();


  // --- GRÁFICO 2: GESTÃO - TEMPO MÉDIO DE CICLO (Cycle Time) ---
  const processCycleTime = () => {
    const delivered = proposals.filter(p =>
      p.status === 'delivered' &&
      p.delivery_date &&
      p.entry_date &&
      isDateInFilter(p.delivery_date)
    );

    const grouped: Record<string, { name: string, totalDays: number, count: number }> = {};

    delivered.forEach(p => {
      const deliveryDate = parseISO(p.delivery_date!);
      const entryDate = parseISO(p.entry_date);
      const key = format(deliveryDate, 'MMM/yy', { locale: ptBR });

      if (!grouped[key]) grouped[key] = { name: key, totalDays: 0, count: 0 };

      const days = differenceInBusinessDays(deliveryDate, entryDate);
      grouped[key].totalDays += (days > 0 ? days : 0);
      grouped[key].count += 1;
    });

    return Object.values(grouped).map(item => ({
      name: item.name,
      avg_days: item.count > 0 ? Number((item.totalDays / item.count).toFixed(1)) : 0
    }));
  };
  const cycleTimeData = processCycleTime();


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

        {/* HEADER & FILTER BAR */}
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-4 animate-fade-in bg-card/50 p-4 rounded-lg border shadow-sm">
          <div>
            <h2 className="text-2xl font-bold text-[#612cb5]">Dashboard Gerencial</h2>
            <p className="text-muted-foreground">Visão consolidada por período.</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 items-end sm:items-center w-full xl:w-auto">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-[#612cb5]" />
              <span className="text-sm font-medium hidden sm:inline">Filtrar por:</span>
              <Select value={filterType} onValueChange={(v: FilterType) => setFilterType(v)}>
                <SelectTrigger className="w-[140px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="preset">Período Rápido</SelectItem>
                  <SelectItem value="month">Mês Específico</SelectItem>
                  <SelectItem value="range">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 sm:flex-none">
              {filterType === 'preset' && (
                <Select value={presetPeriod} onValueChange={(v: PresetPeriod) => setPresetPeriod(v)}>
                  <SelectTrigger className="w-[180px] h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30d">Últimos 30 dias</SelectItem>
                    <SelectItem value="90d">Últimos 3 meses</SelectItem>
                    <SelectItem value="6m">Últimos 6 meses</SelectItem>
                    <SelectItem value="1y">Este Ano</SelectItem>
                    <SelectItem value="all">Todo o período</SelectItem>
                  </SelectContent>
                </Select>
              )}

              {filterType === 'month' && (
                <Input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-[180px] h-9 block"
                />
              )}

              {filterType === 'range' && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="date"
                      variant={"outline"}
                      className={cn(
                        "w-[240px] justify-start text-left font-normal h-9",
                        !dateRange && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateRange?.from ? (
                        dateRange.to ? (
                          <>
                            {format(dateRange.from, "dd/MM/y", { locale: ptBR })} -{" "}
                            {format(dateRange.to, "dd/MM/y", { locale: ptBR })}
                          </>
                        ) : (
                          format(dateRange.from, "dd/MM/y", { locale: ptBR })
                        )
                      ) : (
                        <span>Selecione o período</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={dateRange?.from}
                      selected={dateRange}
                      onSelect={setDateRange}
                      numberOfMonths={2}
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>
        </div>

        {/* =====================================================================================
            SEÇÃO 1: FLUXO OPERACIONAL
        ===================================================================================== */}
        <section className="space-y-4 animate-slide-up" style={{ animationDelay: '100ms' }}>
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Activity className="h-5 w-5 text-[#612cb5]" /> Fluxo Operacional
          </h3>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* GRÁFICO 1: EVOLUÇÃO PIPELINE (PIE CHART - ROSCA) */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-base">Pipeline Ativo</CardTitle>
                <CardDescription>Volume de propostas por etapa (Sequencial)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full relative">
                  {pipelinePieData.length > 0 ? (
                    <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[300px]">
                      <PieChart>
                        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                        <Pie
                          data={pipelinePieData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={2}
                          strokeWidth={2}
                        >
                          {pipelinePieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Pie>
                        <ChartLegend content={<ChartLegendContent nameKey="name" />} className="flex-wrap gap-2 justify-center mt-4" />
                      </PieChart>
                    </ChartContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Sem dados no período</div>
                  )}
                  {pipelinePieData.length > 0 && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none pb-12">
                      <div className="text-center">
                        <span className="text-3xl font-bold text-foreground">
                          {pipelinePieData.reduce((acc, curr) => acc + curr.value, 0)}
                        </span>
                        <p className="text-xs text-muted-foreground uppercase">Propostas</p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* BAR CHART SLA */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-base">SLA de Entregas</CardTitle>
                <CardDescription>Volume de entregas no período</CardDescription>
              </CardHeader>
              <CardContent>
                {deliveryChartData.length > 0 ? (
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
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">Nenhuma entrega no período</div>
                )}
              </CardContent>
            </Card>

          </div>
        </section>

        {/* =====================================================================================
            SEÇÃO 2: GESTÃO & INTEGRAÇÃO
        ===================================================================================== */}
        <section className="space-y-4 animate-slide-up" style={{ animationDelay: '200ms' }}>
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2 border-t pt-6">
            <Briefcase className="h-5 w-5 text-[#f59e0b]" /> Gestão de Contas
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* CARDS */}
            <div className="space-y-6 md:col-span-1">
              <MetricCard
                title="Aguard. Assinatura"
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

            {/* GRÁFICO 2: CICLO DE VIDA */}
            <Card className="glass-card md:col-span-2">
              <CardHeader className="py-4">
                <CardTitle className="text-sm">Performance de Ciclo de Vida</CardTitle>
                <CardDescription>Tempo médio de entrega (em dias úteis) por mês</CardDescription>
              </CardHeader>
              <CardContent>
                {cycleTimeData.length > 0 ? (
                  <ChartContainer config={chartConfig} className="h-[300px] w-full">
                    <BarChart data={cycleTimeData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.2} />
                      <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
                      <YAxis tickLine={false} axisLine={false} fontSize={12} width={30} />
                      <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                      <Bar dataKey="avg_days" fill="var(--color-avg_days)" radius={[4, 4, 0, 0]} barSize={40}>
                        {/* @ts-ignore */}
                        <LabelList position="top" offset={10} className="fill-foreground" fontSize={12} formatter={(value) => `${value}d`} />
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">Sem dados de entrega no período</div>
                )}
              </CardContent>
            </Card>

          </div>
        </section>

        {/* LOGS */}
        <section className="animate-slide-up" style={{ animationDelay: '300ms' }}>
          <Card className="glass-card bg-[#612cb5]/5 border-[#612cb5]/20 mt-4">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Activity className="h-4 w-4 text-[#612cb5]" /> Log de Auditoria (Filtrado)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {filteredLogs.slice(0, 5).map((log) => (
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
                        {format(new Date(log.created_at), "dd/MM HH:mm")} • {log.user_email?.split('@')[0]}
                      </div>
                    </div>
                  </div>
                ))}
                {filteredLogs.length === 0 && (
                  <div className="text-xs text-muted-foreground">Nenhuma atividade no período.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </section>

      </div>
    </MainLayout>
  );
}