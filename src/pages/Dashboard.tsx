import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  format, differenceInBusinessDays, parseISO, subMonths, isAfter, startOfDay, endOfDay, isWithinInterval, isSameMonth, isSameYear, subDays, differenceInHours
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  FileText, Activity, Briefcase, PlayCircle, Filter, Calendar as CalendarIcon, BarChart3, Clock, ArrowRight, Code, List
} from 'lucide-react';
import { DateRange } from "react-day-picker";
import { supabase } from '@/integrations/supabase/client';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { Proposal } from '@/types/database';

// CORREÇÃO: Adicionados Pie, PieChart, Cell às importações
import {
  Bar, BarChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer, LabelList, Tooltip, Legend, LineChart, Line, Pie, PieChart, Cell
} from "recharts";
import {
  ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent
} from "@/components/ui/chart";

// Configuração de Cores e Labels
const chartConfig = {
  awaiting_code: { label: "Aguardando Código", color: "#ec4899" },
  new: { label: "Novo", color: "hsl(var(--status-new))" },
  understanding: { label: "Entendimento", color: "hsl(var(--status-understanding))" },
  construction: { label: "Construção", color: "hsl(var(--status-construction))" },
  in_review: { label: "Em Revisão", color: "#8b5cf6" },
  awaiting_contract: { label: "Aguardando Assinatura de Contrato", color: "#f59e0b" },
  operational_start: { label: "Start Operacional", color: "#10b981" },

  // Cores SLA
  one_day: { label: "Até 1 dia útil", color: "#22c55e" },
  five_days: { label: "Até 5 dias úteis", color: "#3b82f6" },
  late: { label: "Fora do Prazo", color: "#ef4444" },

  // Lead Time Colors
  time_code: { label: "Até Aguardando Código", color: "#ec4899" },
  time_sign: { label: "Envio da Proposta -> Aguardando Assinatura de Contrato", color: "#8b5cf6" },
  time_start: { label: "Aguardando Assinatura de Contrato -> Start Operacional", color: "#10b981" }
} satisfies ChartConfig;

type FilterType = 'preset' | 'month' | 'range';
type PresetPeriod = '30d' | '90d' | '6m' | '1y' | 'all';

export default function Dashboard() {
  const navigate = useNavigate();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);

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

  const filteredProposals = proposals.filter(p => isDateInFilter(p.created_at));
  const totalFiltered = filteredProposals.length;

  const calculatePercentage = (count: number) => {
    if (totalFiltered === 0) return 0;
    return Math.round((count / totalFiltered) * 100);
  };

  // --- CARDS COUNTS ---
  const awaitingCodeCount = filteredProposals.filter(p => p.status === 'awaiting_code').length;
  const awaitingContractCount = filteredProposals.filter(p => p.status === 'awaiting_contract').length;

  // --- LEAD TIME CALCULATION (HORAS) ---
  const formatTime = (hours: number) => {
    const days = Math.floor(hours / 24);
    return `${hours}h (${days}d)`;
  };

  const processLeadTimeData = () => {
    // 1. Entry -> Awaiting Code
    const codeTimes = filteredProposals
      .filter(p => p.entry_date && p.awaiting_code_date)
      .map(p => differenceInHours(parseISO(p.awaiting_code_date!), parseISO(p.entry_date)));

    const avgCodeTime = codeTimes.length > 0
      ? Math.round(codeTimes.reduce((a, b) => a + b, 0) / codeTimes.length)
      : 0;

    // 2. Envio (delivered) -> Aguardando Assinatura
    const signTimes = filteredProposals
      .filter(p => p.delivery_date && p.awaiting_contract_date)
      .map(p => differenceInHours(parseISO(p.awaiting_contract_date!), parseISO(p.delivery_date!)));

    const avgSignTime = signTimes.length > 0
      ? Math.round(signTimes.reduce((a, b) => a + b, 0) / signTimes.length)
      : 0;

    // 3. Aguardando Assinatura -> Start Operacional
    const startTimes = filteredProposals
      .filter(p => p.awaiting_contract_date && p.operational_start_date)
      .map(p => differenceInHours(parseISO(p.operational_start_date!), parseISO(p.awaiting_contract_date!)));

    const avgStartTime = startTimes.length > 0
      ? Math.round(startTimes.reduce((a, b) => a + b, 0) / startTimes.length)
      : 0;

    return [
      { name: "Aguardando Código", value: avgCodeTime, formatted: formatTime(avgCodeTime), fill: "#ec4899" },
      { name: "Envio da Proposta -> Aguardando Assinatura de Contrato", value: avgSignTime, formatted: formatTime(avgSignTime), fill: "#8b5cf6" },
      { name: "Aguardando Assinatura de Contrato -> Start Operacional", value: avgStartTime, formatted: formatTime(avgStartTime), fill: "#10b981" }
    ];
  };

  const leadTimeData = processLeadTimeData();

  // --- PIPELINE LINE CHART ---
  const processPipelineLine = () => {
    const sequence = ['new', 'understanding', 'construction', 'in_review', 'awaiting_code'];
    return sequence.map(status => ({
      status: chartConfig[status as keyof typeof chartConfig]?.label || status,
      count: filteredProposals.filter(p => p.status === status).length
    }));
  };
  const pipelineLineData = processPipelineLine();

  // --- SLA BAR CHART ---
  const processDeliveryMetrics = () => {
    const deliveredInPeriod = proposals.filter(p =>
      p.status === 'delivered' &&
      p.delivery_date &&
      isDateInFilter(p.delivery_date)
    );

    const grouped: Record<string, { name: string, one_day: number, five_days: number, late: number, total: number }> = {};

    deliveredInPeriod.forEach(p => {
      const deliveryDate = parseISO(p.delivery_date!);
      const entryDate = parseISO(p.entry_date);
      const key = format(deliveryDate, 'MMM/yy', { locale: ptBR });

      if (!grouped[key]) {
        grouped[key] = { name: key, one_day: 0, five_days: 0, late: 0, total: 0 };
      }

      let isLate = false;
      if (p.deadline && deliveryDate > parseISO(p.deadline)) isLate = true;
      const businessDays = differenceInBusinessDays(deliveryDate, entryDate);

      if (isLate) grouped[key].late += 1;
      else if (businessDays <= 1) grouped[key].one_day += 1;
      else grouped[key].five_days += 1;

      grouped[key].total += 1;
    });

    return Object.values(grouped);
  };
  const deliveryChartData = processDeliveryMetrics();

  // --- OPERATIONAL START TABLE LIST ---
  const operationalStartList = filteredProposals
    .filter(p => p.status === 'operational_start')
    .map(p => ({
      id: p.id,
      title: p.title,
      status: p.status,
      // Lead Time from updated_at assuming it was the time of change
      leadTime: differenceInHours(new Date(), parseISO(p.updated_at))
    }))
    .slice(0, 5); // Limit to 5

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
              <Select value={filterType} onValueChange={(v: FilterType) => setFilterType(v)}>
                <SelectTrigger className="w-[140px] h-9 bg-white"><SelectValue /></SelectTrigger>
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
                  <SelectTrigger className="w-[180px] h-9 bg-white"><SelectValue /></SelectTrigger>
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
                <Input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="w-[180px] h-9 block bg-white" />
              )}
              {filterType === 'range' && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button id="date" variant={"outline"} className={cn("w-[240px] justify-start text-left font-normal h-9 bg-white", !dateRange && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateRange?.from ? (dateRange.to ? `${format(dateRange.from, "dd/MM/y", { locale: ptBR })} - ${format(dateRange.to, "dd/MM/y", { locale: ptBR })}` : format(dateRange.from, "dd/MM/y", { locale: ptBR })) : <span>Selecione o período</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2} locale={ptBR} />
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>
        </div>

        {/* =====================================================================================
            SEÇÃO SUPERIOR: PIPELINE (LINHA) + CARDS/TABELA DE STATUS
        ===================================================================================== */}
        <section className="grid grid-cols-1 lg:grid-cols-7 gap-6 animate-slide-up" style={{ animationDelay: '100ms' }}>

          {/* GRÁFICO 1: PIPELINE ATIVO (LINE CHART) */}
          <Card className="lg:col-span-4 bg-white border-none shadow-sm rounded-xl h-full flex flex-col">
            <CardHeader>
              <CardTitle className="text-base text-gray-700 flex items-center gap-2">
                <Activity className="h-5 w-5 text-[#612cb5]" /> Pipeline Ativo (Volume)
              </CardTitle>
              <CardDescription>Evolução sequencial das etapas</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 min-h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={pipelineLineData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="status" tickLine={false} axisLine={false} tickMargin={10} fontSize={12} tick={{ fill: '#6b7280' }} />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} allowDecimals={false} tick={{ fill: '#6b7280' }} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                  <Line type="monotone" dataKey="count" stroke="#612cb5" strokeWidth={3} dot={{ r: 4, fill: "#612cb5", strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* COLUNA LATERAL: CARDS E TABELA */}
          <div className="lg:col-span-3 flex flex-col gap-4 h-full">

            {/* CARD: AGUARDANDO CÓDIGO (NOVO) */}
            <Card className="bg-white border-none shadow-sm rounded-xl">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Aguardando Código</p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <h4 className="text-2xl font-bold text-gray-900">{awaitingCodeCount}</h4>
                    <span className="text-xs font-medium text-pink-600 bg-pink-50 px-2 py-0.5 rounded-full">
                      {calculatePercentage(awaitingCodeCount)}%
                    </span>
                  </div>
                </div>
                <div className="h-10 w-10 bg-pink-50 rounded-lg flex items-center justify-center">
                  <Code className="h-5 w-5 text-pink-500" />
                </div>
              </CardContent>
            </Card>

            {/* CARD: AGUARDANDO ASSINATURA */}
            <Card className="bg-white border-none shadow-sm rounded-xl">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Aguardando Assinatura de Contrato</p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <h4 className="text-2xl font-bold text-gray-900">{awaitingContractCount}</h4>
                    <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                      {calculatePercentage(awaitingContractCount)}%
                    </span>
                  </div>
                </div>
                <div className="h-10 w-10 bg-amber-50 rounded-lg flex items-center justify-center">
                  <FileText className="h-5 w-5 text-amber-500" />
                </div>
              </CardContent>
            </Card>

            {/* TABELA: START OPERACIONAL */}
            <Card className="bg-white border-none shadow-sm rounded-xl flex-1 flex flex-col">
              <CardHeader className="py-3 px-4 pb-2 border-b border-gray-100">
                <CardTitle className="text-sm flex items-center gap-2">
                  <List className="h-4 w-4 text-[#10b981]" /> Start Operacional (Lista)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-auto flex-1 max-h-[250px]">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="h-8 text-xs">Proposta</TableHead>
                      <TableHead className="h-8 text-xs text-right">Lead Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {operationalStartList.length > 0 ? (
                      operationalStartList.map(op => (
                        <TableRow key={op.id} className="hover:bg-muted/30">
                          <TableCell className="py-2 text-xs font-medium">{op.title}</TableCell>
                          <TableCell className="py-2 text-xs text-right text-gray-500">{op.leadTime}h</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-xs text-muted-foreground py-4">Sem itens</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

          </div>
        </section>

        {/* =====================================================================================
            SEÇÃO MEIO: TEMPOS DE RESPOSTA (LEAD TIME)
        ===================================================================================== */}
        <section className="animate-slide-up" style={{ animationDelay: '200ms' }}>
          <Card className="bg-white border-none shadow-sm rounded-xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-[#f59e0b]" />
                <div>
                  <CardTitle className="text-base text-gray-700">Tempos de Resposta (Lead Time)</CardTitle>
                  <CardDescription>Média em horas (dias) entre as etapas</CardDescription>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1 hover:bg-[#612cb5] hover:text-white transition-colors"
                onClick={() => navigate('/proposals?view=lead_time')}
              >
                Ver Detalhes <ArrowRight className="h-3 w-3" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full mt-2">
                <ChartContainer config={chartConfig} className="h-full w-full">
                  <BarChart layout="vertical" data={leadTimeData} margin={{ top: 0, right: 80, left: 20, bottom: 0 }}>
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" strokeOpacity={0.2} stroke="#e5e7eb" />
                    <XAxis type="number" hide />
                    <YAxis
                      dataKey="name"
                      type="category"
                      tickLine={false}
                      tickMargin={10}
                      axisLine={false}
                      width={150}
                      tick={{ fill: '#4b5563', fontSize: 12, fontWeight: 500 }}
                    />
                    <ChartTooltip cursor={{ fill: 'transparent' }} content={<ChartTooltipContent />} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={40} animationDuration={1000}>
                      <LabelList dataKey="formatted" position="right" fill="#6b7280" fontSize={12} />
                      {
                        leadTimeData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))
                      }
                    </Bar>
                  </BarChart>
                </ChartContainer>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* =====================================================================================
            SEÇÃO INFERIOR: SLA DE ENTREGAS (FULL WIDTH)
        ===================================================================================== */}
        <section className="animate-slide-up" style={{ animationDelay: '300ms' }}>
          <Card className="bg-white border-none shadow-sm w-full rounded-xl">
            <CardHeader className="py-6 border-b border-gray-100">
              <CardTitle className="text-lg flex items-center gap-2 text-gray-800">
                <BarChart3 className="w-5 h-5 text-[#612cb5]" />
                SLA de Entregas (Consolidado)
              </CardTitle>
              <CardDescription>Volume de entregas no prazo vs fora do prazo</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {deliveryChartData.length > 0 ? (
                <ChartContainer config={chartConfig} className="h-[400px] w-full">
                  <BarChart accessibilityLayer data={deliveryChartData} margin={{ top: 20, right: 30, left: 20, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.2} stroke="#e5e7eb" />
                    <XAxis dataKey="name" tickLine={false} tickMargin={10} axisLine={false} tick={{ fill: '#6b7280' }} />
                    <YAxis tickLine={false} axisLine={false} fontSize={12} allowDecimals={false} tick={{ fill: '#6b7280' }} />
                    <ChartTooltip content={<ChartTooltipContent indicator="dashed" />} />
                    <ChartLegend content={<ChartLegendContent />} />

                    {/* Barras Empilhadas com Labels de Valor */}
                    <Bar dataKey="one_day" stackId="a" fill="var(--color-one_day)" radius={[0, 0, 0, 0]}>
                      <LabelList dataKey="one_day" position="center" fill="white" fontSize={14} formatter={(v: number) => v > 0 ? v : ''} />
                    </Bar>
                    <Bar dataKey="five_days" stackId="a" fill="var(--color-five_days)" radius={[0, 0, 0, 0]}>
                      <LabelList dataKey="five_days" position="center" fill="white" fontSize={14} formatter={(v: number) => v > 0 ? v : ''} />
                    </Bar>
                    <Bar dataKey="late" stackId="a" fill="var(--color-late)" radius={[4, 4, 0, 0]}>
                      <LabelList dataKey="late" position="center" fill="white" fontSize={14} formatter={(v: number) => v > 0 ? v : ''} />
                      {/* Total no Topo */}
                      <LabelList dataKey="total" position="top" fill="#6b7280" fontSize={16} formatter={(v: number) => `Total: ${v}`} />
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