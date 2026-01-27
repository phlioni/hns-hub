import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  format, parseISO, subMonths, isAfter, startOfDay, endOfDay, isWithinInterval, isSameMonth, isSameYear, subDays, differenceInHours, differenceInMinutes
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  FileText, Activity, Filter, Calendar as CalendarIcon, BarChart3, Clock, ArrowRight, Code, List, Send
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
import { Proposal, AuditLog } from '@/types/database';

import {
  Bar, BarChart, CartesianGrid, XAxis, YAxis, LabelList, Tooltip, Legend, Pie, PieChart, Cell, Label
} from "recharts";
import {
  ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent
} from "@/components/ui/chart";

// Configuração de Cores e Labels - REMOVIDO: awaiting_code
const chartConfig = {
  new: { label: "Novo", color: "hsl(var(--status-new))" },
  understanding: { label: "Entendimento", color: "hsl(var(--status-understanding))" },
  construction: { label: "Construção", color: "hsl(var(--status-construction))" },
  in_review: { label: "Em Revisão", color: "#8b5cf6" },
  awaiting_contract: { label: "Aguardando Assinatura de Contrato", color: "#f59e0b" },
  operational_start: { label: "Start Operacional", color: "#10b981" },
  execution_forwarded: { label: "Execução", color: "#6366f1" },

  // Cores SLA
  one_day: { label: "Até 1 dia útil", color: "#22c55e" },
  five_days: { label: "Até 5 dias úteis", color: "#3b82f6" },
  late: { label: "Fora do Prazo", color: "#ef4444" },

  // Lead Time Colors - REMOVIDO: time_code
  time_sign: { label: "Envio da proposta até Aguardando Assinatura de Contrato", color: "#8b5cf6" },
  time_start: { label: "Aguardando Assinatura de Contrato até Start Operacional", color: "#10b981" },
  time_execution: { label: "Start Operacional até Envio para Execução", color: "#6366f1" }
} satisfies ChartConfig;

type FilterType = 'preset' | 'month' | 'range';
type PresetPeriod = '30d' | '90d' | '6m' | '1y' | 'all';

// Mapeamento de Subtítulos para o Gráfico - REMOVIDO: Aguardando Código
const leadTimeSubtitles: Record<string, string> = {
  "Envio da Proposta até Aguardando Assinatura de Contrato": "HNS -> Comercial",
  "Aguardando Assinatura de Contrato até Start Operacional": "Comercial -> Gestão de Contas",
  "Start Operacional até Envio para Execução": "Gestão de Contas -> HNS"
};

const CustomYAxisTick = ({ x, y, payload }: any) => {
  const subtitle = leadTimeSubtitles[payload.value] || "";

  return (
    <g transform={`translate(${x},${y})`}>
      <text x={-10} y={-5} textAnchor="end" fill="#4b5563" fontSize={11} fontWeight={500}>
        {payload.value}
      </text>
      <text x={-10} y={10} textAnchor="end" fill="#6b7280" fontSize={10} fontWeight={400}>
        {subtitle}
      </text>
    </g>
  );
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
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
      const { data: proposalsData, error: proposalsError } = await supabase
        .from('proposals')
        .select('*')
        .order('created_at', { ascending: false });

      if (proposalsError) throw proposalsError;
      setProposals(proposalsData as Proposal[]);

      const { data: logsData, error: logsError } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('entity_type', 'proposal');

      if (logsError) throw logsError;
      setAuditLogs(logsData as AuditLog[]);

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

  // REMOVIDO: awaitingCodeCount
  const awaitingContractCount = filteredProposals.filter(p => p.status === 'awaiting_contract').length;
  const executionForwardedCount = filteredProposals.filter(p => p.status === 'execution_forwarded').length;

  const getLogDate = (proposalId: string, status: string, logs: AuditLog[]) => {
    const log = logs
      .filter(l => l.entity_id === proposalId && l.new_status === status)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];
    return log ? log.created_at : null;
  };

  const formatDuration = (totalMinutes: number) => {
    if (totalMinutes < 60) {
      return `${Math.max(0, totalMinutes)}m`;
    }
    const hours = Math.floor(totalMinutes / 60);
    const days = Math.floor(hours / 24);
    return `${hours}h (${days}d)`;
  };

  const processLeadTimeData = () => {
    // REMOVIDO: sumCode, countCode
    let sumSign = 0, countSign = 0;
    let sumStart = 0, countStart = 0;
    let sumExec = 0, countExec = 0;

    filteredProposals.forEach(p => {
      const pLogs = auditLogs.filter(l => l.entity_id === p.id);

      // Lógica de "Code" removida
      const dateDelivered = getLogDate(p.id, 'delivered', pLogs);
      const dateContract = getLogDate(p.id, 'awaiting_contract', pLogs);
      const dateStart = getLogDate(p.id, 'operational_start', pLogs);
      const dateExec = getLogDate(p.id, 'execution_forwarded', pLogs);

      if (dateDelivered && dateContract) {
        const diff = differenceInMinutes(parseISO(dateContract), parseISO(dateDelivered));
        if (diff >= 0) { sumSign += diff; countSign++; }
      }

      if (dateContract && dateStart) {
        const diff = differenceInMinutes(parseISO(dateStart), parseISO(dateContract));
        if (diff >= 0) { sumStart += diff; countStart++; }
      }

      if (dateStart && dateExec) {
        const diff = differenceInMinutes(parseISO(dateExec), parseISO(dateStart));
        if (diff >= 0) { sumExec += diff; countExec++; }
      }
    });

    // REMOVIDO: avgCode
    const avgSign = countSign > 0 ? Math.round(sumSign / countSign) : 0;
    const avgStart = countStart > 0 ? Math.round(sumStart / countStart) : 0;
    const avgExec = countExec > 0 ? Math.round(sumExec / countExec) : 0;

    return [
      // REMOVIDO objeto referente a Aguardando Código
      { name: "Envio da Proposta até Aguardando Assinatura de Contrato", value: avgSign, formatted: formatDuration(avgSign), fill: "#8b5cf6" },
      { name: "Aguardando Assinatura de Contrato até Start Operacional", value: avgStart, formatted: formatDuration(avgStart), fill: "#10b981" },
      { name: "Start Operacional até Envio para Execução", value: avgExec, formatted: formatDuration(avgExec), fill: "#6366f1" }
    ];
  };

  const leadTimeData = processLeadTimeData();

  const processPipelineData = () => {
    // REMOVIDO: 'awaiting_code' da sequência
    const sequence = ['new', 'understanding', 'construction', 'in_review'];
    return sequence.map(key => ({
      name: chartConfig[key as keyof typeof chartConfig]?.label || key,
      value: filteredProposals.filter(p => p.status === key).length,
      fill: chartConfig[key as keyof typeof chartConfig]?.color,
      statusKey: key
    })).filter(item => item.value >= 0);
  };
  const pipelineData = processPipelineData();
  const totalPipelineVolume = pipelineData.reduce((acc, curr) => acc + curr.value, 0);

  const processDeliveryMetrics = () => {
    const grouped: Record<string, { name: string, one_day: number, five_days: number, late: number, total: number, rawDate: string }> = {};

    filteredProposals.forEach(p => {
      const deliveryLog = auditLogs
        .filter(l => l.entity_id === p.id && l.new_status === 'delivered')
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];

      const deliveryDateStr = deliveryLog ? deliveryLog.created_at : p.delivery_date;

      if (!deliveryDateStr) return;

      const deliveryDate = parseISO(deliveryDateStr);
      const entryDate = parseISO(p.entry_date);
      const key = format(deliveryDate, 'MMM/yy', { locale: ptBR });

      if (!grouped[key]) {
        grouped[key] = { name: key, one_day: 0, five_days: 0, late: 0, total: 0, rawDate: format(deliveryDate, 'yyyy-MM') };
      }

      let isLate = false;
      if (p.deadline && deliveryDate > parseISO(p.deadline)) isLate = true;

      const diffDays = Math.floor(differenceInHours(deliveryDate, entryDate) / 24);

      if (isLate) grouped[key].late += 1;
      else if (diffDays <= 1) grouped[key].one_day += 1;
      else grouped[key].five_days += 1;

      grouped[key].total += 1;
    });

    return Object.values(grouped);
  };
  const deliveryChartData = processDeliveryMetrics();

  const operationalStartList = filteredProposals
    .filter(p => p.status === 'operational_start')
    .map(p => {
      const startLog = auditLogs.find(l => l.entity_id === p.id && l.new_status === 'operational_start');
      const dateStr = startLog ? startLog.created_at : p.updated_at;

      return {
        id: p.id,
        title: p.title,
        status: p.status,
        leadTime: formatDuration(differenceInMinutes(new Date(), parseISO(dateStr)))
      };
    })
    .slice(0, 5);

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

        {/* SUPERIOR */}
        <section className="grid grid-cols-1 lg:grid-cols-7 gap-6 animate-slide-up" style={{ animationDelay: '100ms' }}>
          {/* GRÁFICO 1 */}
          <Card className="lg:col-span-4 bg-white border-none shadow-sm rounded-xl h-full flex flex-col">
            <CardHeader>
              <CardTitle className="text-base text-gray-700 flex items-center gap-2">
                <Activity className="h-5 w-5 text-[#612cb5]" /> Pipeline Ativo (Volume)
              </CardTitle>
              <CardDescription>Distribuição atual das propostas no pipeline</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 min-h-[350px] flex items-center justify-center">
              <ChartContainer config={chartConfig} className="mx-auto aspect-square h-full w-full max-h-[350px]">
                <PieChart>
                  <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                  <Pie
                    data={pipelineData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={90}
                    outerRadius={120}
                    paddingAngle={2}
                    startAngle={90}
                    endAngle={-270}
                    strokeWidth={5}
                    onClick={(data) => {
                      if (data && data.payload && data.payload.statusKey) {
                        navigate(`/proposals?status=${data.payload.statusKey}`);
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {pipelineData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} stroke="white" strokeWidth={2} />
                    ))}
                    <LabelList
                      dataKey="value"
                      position="inside"
                      className="fill-white font-bold drop-shadow-md"
                      stroke="none"
                      fontSize={14}
                      formatter={(value: number) => value > 0 ? value : ''}
                    />
                    <Label
                      content={({ viewBox }) => {
                        if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                          return (
                            <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                              <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-4xl font-bold">{totalPipelineVolume.toLocaleString()}</tspan>
                              <tspan x={viewBox.cx} y={(viewBox.cy || 0) + 28} className="fill-muted-foreground text-sm">Total</tspan>
                            </text>
                          )
                        }
                      }}
                    />
                  </Pie>
                  <Legend layout="horizontal" verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                </PieChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* COLUNA LATERAL - REMOVIDO CARD AGUARDANDO CODIGO */}
          <div className="lg:col-span-3 flex flex-col gap-4 h-full">
            

            {/* CARD AGUARDANDO ASSINATURA */}
            <Card
              className="bg-white border-none shadow-sm rounded-xl flex-shrink-0 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate('/proposals?status=awaiting_contract')}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Aguardando Assinatura de Contrato</p>
                  <p className="text-xs text-gray-500 font-medium mb-1">Comercial</p>
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


            {/* TABELA START OPERACIONAL */}
            <Card className="bg-white border-none shadow-sm rounded-xl flex flex-col flex-1 min-h-[250px]">
              <CardHeader className="py-3 px-4 pb-2 border-b border-gray-100 flex-shrink-0">
                <CardTitle className="text-sm flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <List className="h-4 w-4 text-[#10b981]" /> Start Operacional (Lista)
                  </div>
                  <span className="text-xs text-gray-500 font-medium pl-6">Gestão de Contas</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-auto flex-1">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="h-8 text-xs">Proposta</TableHead>
                      <TableHead className="h-8 text-xs text-right">Tempo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {operationalStartList.length > 0 ? (
                      operationalStartList.map(op => (
                        <TableRow
                          key={op.id}
                          className="hover:bg-muted/30 cursor-pointer"
                          onClick={() => navigate('/proposals?status=operational_start')}
                        >
                          <TableCell className="py-2 text-xs font-medium">{op.title}</TableCell>
                          <TableCell className="py-2 text-xs text-right text-gray-500">{op.leadTime}</TableCell>
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

            {/* CARD EXECUÇÃO */}
            <Card
              className="bg-white border-none shadow-sm rounded-xl flex-shrink-0 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate('/proposals?status=execution_forwarded')}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Encaminhado para Execução</p>
                  <p className="text-xs text-gray-500 font-medium mb-1">HNS</p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <h4 className="text-2xl font-bold text-gray-900">{executionForwardedCount}</h4>
                    <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                      {calculatePercentage(executionForwardedCount)}%
                    </span>
                  </div>
                </div>
                <div className="h-10 w-10 bg-indigo-50 rounded-lg flex items-center justify-center">
                  <Send className="h-5 w-5 text-indigo-500" />
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* MEIO: LEAD TIME */}
        <section className="animate-slide-up" style={{ animationDelay: '200ms' }}>
          <Card className="bg-white border-none shadow-sm rounded-xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-[#f59e0b]" />
                <div>
                  <CardTitle className="text-base text-gray-700">Tempos de Resposta (Lead Time)</CardTitle>
                  <CardDescription>Média entre as etapas do processo</CardDescription>
                </div>
              </div>
              <Button variant="outline" size="sm" className="text-xs gap-1 hover:bg-[#612cb5] hover:text-white transition-colors" onClick={() => navigate('/proposals?view=lead_time')}>
                Ver Detalhes <ArrowRight className="h-3 w-3" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="h-[350px] w-full mt-2">
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
                      width={300}
                      tick={<CustomYAxisTick />}
                    />
                    <ChartTooltip cursor={{ fill: 'transparent' }} content={<ChartTooltipContent />} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={32} animationDuration={1000}>
                      <LabelList dataKey="formatted" position="right" fill="#6b7280" fontSize={12} />
                      {leadTimeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* INFERIOR: SLA */}
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

                    {/* Barras Clicáveis - Navegam com SLA + Mês */}
                    <Bar
                      dataKey="one_day"
                      stackId="a"
                      fill="var(--color-one_day)"
                      radius={[0, 0, 0, 0]}
                      style={{ cursor: 'pointer' }}
                      onClick={(data: any) => { if (data?.payload?.rawDate) navigate(`/proposals?sla=one_day&month=${data.payload.rawDate}`) }}
                    >
                      <LabelList dataKey="one_day" position="center" fill="white" fontSize={14} formatter={(v: number) => v > 0 ? v : ''} />
                    </Bar>
                    <Bar
                      dataKey="five_days"
                      stackId="a"
                      fill="var(--color-five_days)"
                      radius={[0, 0, 0, 0]}
                      style={{ cursor: 'pointer' }}
                      onClick={(data: any) => { if (data?.payload?.rawDate) navigate(`/proposals?sla=five_days&month=${data.payload.rawDate}`) }}
                    >
                      <LabelList dataKey="five_days" position="center" fill="white" fontSize={14} formatter={(v: number) => v > 0 ? v : ''} />
                    </Bar>
                    <Bar
                      dataKey="late"
                      stackId="a"
                      fill="var(--color-late)"
                      radius={[4, 4, 0, 0]}
                      style={{ cursor: 'pointer' }}
                      onClick={(data: any) => { if (data?.payload?.rawDate) navigate(`/proposals?sla=late&month=${data.payload.rawDate}`) }}
                    >
                      <LabelList dataKey="late" position="center" fill="white" fontSize={14} formatter={(v: number) => v > 0 ? v : ''} />
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