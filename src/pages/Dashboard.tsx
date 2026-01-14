import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  format, differenceInBusinessDays, parseISO, subMonths, isAfter, startOfDay, endOfDay, isWithinInterval, isSameMonth, isSameYear, subDays
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  FileText, Activity, Briefcase, PlayCircle, Filter, Calendar as CalendarIcon, BarChart3
} from 'lucide-react';
import { DateRange } from "react-day-picker";
import { supabase } from '@/integrations/supabase/client';
import { MainLayout } from '@/components/layout/MainLayout';
import { MetricCard } from '@/components/ui/metric-card'; // Mantendo caso queira usar, mas refiz os cards principais abaixo
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Proposal } from '@/types/database';

import {
  Bar, BarChart, CartesianGrid, XAxis, PieChart, Pie, Cell, YAxis, ResponsiveContainer, LabelList, Tooltip, Legend
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

  // Novos Status para o Gráfico de Ciclo de Vida
  awaiting_contract: { label: "Aguard. Assinatura", color: "#f59e0b" }, // Laranja
  operational_start: { label: "Start Operacional", color: "#10b981" }, // Verde Esmeralda

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
      const { data, error } = await supabase
        .from('proposals')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) setProposals(data as Proposal[]);

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

  // Aplicar filtro e calcular totais
  const filteredProposals = proposals.filter(p => isDateInFilter(p.created_at));
  const totalFiltered = filteredProposals.length;

  // Função para calcular porcentagem
  const calculatePercentage = (count: number) => {
    if (totalFiltered === 0) return 0;
    return Math.round((count / totalFiltered) * 100);
  };

  // --- KPI CARDS ---
  const awaitingContractCount = filteredProposals.filter(p => p.status === 'awaiting_contract').length;
  const operationalStartCount = filteredProposals.filter(p => p.status === 'operational_start').length;

  // --- GRÁFICO 1: PIPELINE ATIVO (PIE CHART - COM SEQUÊNCIA HORÁRIA) ---
  const processPipelinePie = () => {
    // Sequência exata solicitada (Sentido Horário)
    const sequence = ['awaiting_code', 'new', 'understanding', 'construction', 'in_review'];

    const relevantProposals = filteredProposals.filter(p => sequence.includes(p.status));

    return sequence.map(status => {
      const count = relevantProposals.filter(p => p.status === status).length;
      return {
        name: status,
        value: count,
        // @ts-ignore
        fill: chartConfig[status]?.color || "#ccc",
        label: chartConfig[status as keyof typeof chartConfig]?.label // Para tooltip
      };
    }).filter(d => d.value > 0);
  };

  const pipelinePieData = processPipelinePie();

  // --- NOVO GRÁFICO: CICLO DE VIDA GERAL (BARRA FULL WIDTH) ---
  const processLifecycleBar = () => {
    // Lista completa de status solicitada
    const sequence = [
      'awaiting_code',
      'new',
      'understanding',
      'construction',
      'in_review',
      'awaiting_contract',
      'operational_start'
    ];

    return sequence.map(status => {
      const count = filteredProposals.filter(p => p.status === status).length;
      return {
        statusKey: status,
        // @ts-ignore
        name: chartConfig[status]?.label || status,
        count: count,
        // @ts-ignore
        fill: chartConfig[status]?.color || "#8884d8"
      };
    });
  };

  const lifecycleBarData = processLifecycleBar();

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
      <div className="space-y-8 pb-10 bg-gray-50/30 p-6 rounded-xl min-h-screen">

        {/* HEADER & FILTER BAR */}
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-4 animate-fade-in bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <div>
            <h2 className="text-3xl font-bold text-[#612cb5] tracking-tight">Dashboard Gerencial</h2>
            <p className="text-muted-foreground mt-1">Visão consolidada por período.</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 items-end sm:items-center w-full xl:w-auto">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-[#612cb5]" />
              <span className="text-sm font-medium hidden sm:inline text-gray-600">Filtrar por:</span>
              <Select value={filterType} onValueChange={(v: FilterType) => setFilterType(v)}>
                <SelectTrigger className="w-[140px] h-9 bg-white">
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
                  <SelectTrigger className="w-[180px] h-9 bg-white">
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
                  className="w-[180px] h-9 block bg-white"
                />
              )}

              {filterType === 'range' && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="date"
                      variant={"outline"}
                      className={cn(
                        "w-[240px] justify-start text-left font-normal h-9 bg-white",
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
            SEÇÃO 1: FLUXO OPERACIONAL (ROSCA E SLA)
        ===================================================================================== */}
        <section className="space-y-4 animate-slide-up" style={{ animationDelay: '100ms' }}>
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <Activity className="h-5 w-5 text-[#612cb5]" /> Fluxo Operacional
          </h3>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* GRÁFICO 1: EVOLUÇÃO PIPELINE (PIE CHART - ROSCA) */}
            <Card className="bg-white border-none shadow-sm hover:shadow-md transition-all duration-300">
              <CardHeader>
                <CardTitle className="text-base text-gray-700">Pipeline Ativo</CardTitle>
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
                          startAngle={90} // INÍCIO EM 90 GRAUS (12h)
                          endAngle={-270} // FIM EM -270 PARA COMPLETAR O SENTIDO HORÁRIO
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
                        <span className="text-3xl font-bold text-gray-800">
                          {pipelinePieData.reduce((acc, curr) => acc + curr.value, 0)}
                        </span>
                        <p className="text-xs text-muted-foreground uppercase font-medium">Propostas</p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* BAR CHART SLA */}
            <Card className="bg-white border-none shadow-sm hover:shadow-md transition-all duration-300">
              <CardHeader>
                <CardTitle className="text-base text-gray-700">SLA de Entregas</CardTitle>
                <CardDescription>Volume de entregas no período</CardDescription>
              </CardHeader>
              <CardContent>
                {deliveryChartData.length > 0 ? (
                  <ChartContainer config={chartConfig} className="h-[300px] w-full">
                    <BarChart accessibilityLayer data={deliveryChartData}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.2} stroke="#e5e7eb" />
                      <XAxis dataKey="name" tickLine={false} tickMargin={10} axisLine={false} tick={{ fill: '#6b7280' }} />
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
            SEÇÃO 2: GESTÃO & INTEGRAÇÃO (CARDS + CICLO DE VIDA COMPLETO)
        ===================================================================================== */}
        <section className="space-y-4 animate-slide-up" style={{ animationDelay: '200ms' }}>
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2 border-t border-gray-200/60 pt-6">
            <Briefcase className="h-5 w-5 text-[#f59e0b]" /> Indicadores de Status
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* CARD 1 - Aguardando Assinatura */}
            <Card className="bg-white border-none shadow-sm p-2">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Aguard. Assinatura</p>
                  <div className="flex items-baseline gap-2 mt-2">
                    <h4 className="text-3xl font-bold text-gray-900">{awaitingContractCount}</h4>
                    <span className="text-sm font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                      {calculatePercentage(awaitingContractCount)}%
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">do total selecionado</p>
                </div>
                <div className="h-12 w-12 bg-amber-50 rounded-lg flex items-center justify-center">
                  <FileText className="h-6 w-6 text-amber-500" />
                </div>
              </CardContent>
            </Card>

            {/* CARD 2 - Start Operacional */}
            <Card className="bg-white border-none shadow-sm p-2">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Start Operacional</p>
                  <div className="flex items-baseline gap-2 mt-2">
                    <h4 className="text-3xl font-bold text-gray-900">{operationalStartCount}</h4>
                    <span className="text-sm font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                      {calculatePercentage(operationalStartCount)}%
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">do total selecionado</p>
                </div>
                <div className="h-12 w-12 bg-emerald-50 rounded-lg flex items-center justify-center">
                  <PlayCircle className="h-6 w-6 text-emerald-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* GRÁFICO 3: CICLO DE VIDA DAS PROPOSTAS (MODERNO - COR ÚNICA) */}
          <Card className="bg-white border-none shadow-sm w-full mt-6">
            <CardHeader className="py-6 border-b border-gray-100">
              <CardTitle className="text-lg flex items-center gap-2 text-gray-800">
                <BarChart3 className="w-5 h-5 text-[#612cb5]" />
                Ciclo de Vida das Propostas (Visão Geral)
              </CardTitle>
              <CardDescription>Quantidade de propostas em cada etapa do fluxo</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {lifecycleBarData.length > 0 ? (
                <ChartContainer config={chartConfig} className="h-[400px] w-full">
                  <BarChart data={lifecycleBarData} margin={{ top: 20, right: 30, left: 20, bottom: 50 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.2} stroke="#e5e7eb" />
                    <XAxis
                      dataKey="name"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={10}
                      fontSize={12}
                      interval={0}
                      angle={-15}
                      textAnchor="end"
                      tick={{ fill: '#6b7280' }}
                    />
                    <YAxis tickLine={false} axisLine={false} fontSize={12} allowDecimals={false} tick={{ fill: '#6b7280' }} />
                    <ChartTooltip cursor={{ fill: 'transparent' }} content={<ChartTooltipContent />} />
                    <Bar
                      dataKey="count"
                      fill="#612cb5" // COR SOLICITADA
                      radius={[4, 4, 0, 0]} // BORDAS ARREDONDADAS
                      barSize={60}
                      animationDuration={1500}
                    >
                      <LabelList dataKey="count" position="top" fill="#6b7280" fontSize={12} />
                    </Bar>
                  </BarChart>
                </ChartContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
                  Sem dados para exibir
                </div>
              )}
            </CardContent>
          </Card>
        </section>

      </div>
    </MainLayout>
  );
}