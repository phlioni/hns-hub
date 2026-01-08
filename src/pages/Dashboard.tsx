import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  FileText, Target, Inbox, Activity,
  ArrowRight, User, Clock, CheckCircle2, AlertCircle
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { MainLayout } from '@/components/layout/MainLayout';
import { MetricCard } from '@/components/ui/metric-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { AuditLog, Proposal, Request as RequestType, Objective, Initiative } from '@/types/database';

// Importações dos Gráficos Shadcn/Recharts
import {
  Bar, BarChart, CartesianGrid, XAxis, YAxis, LabelList
} from "recharts";
import {
  Pie, PieChart, Cell
} from "recharts";
import {
  ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent
} from "@/components/ui/chart";

// Configuração de Cores e Labels para os Gráficos
const chartConfig = {
  proposals: {
    label: "Propostas",
  },
  new: {
    label: "Novo",
    color: "hsl(var(--status-new))",
  },
  understanding: {
    label: "Entendimento",
    color: "hsl(var(--status-understanding))",
  },
  construction: {
    label: "Construção",
    color: "hsl(var(--status-construction))",
  },
  delivered: {
    label: "Entregue",
    color: "hsl(var(--status-delivered))",
  },
  cancelled: {
    label: "Cancelado",
    color: "hsl(var(--status-cancelled))",
  },
  requests: {
    label: "Solicitações",
  },
  low: {
    label: "Baixa",
    color: "hsl(var(--priority-low))",
  },
  medium: {
    label: "Média",
    color: "hsl(var(--priority-medium))",
  },
  high: {
    label: "Alta",
    color: "hsl(var(--priority-high))",
  },
} satisfies ChartConfig;

export default function Dashboard() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [requests, setRequests] = useState<RequestType[]>([]);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [proposalsRes, requestsRes, objectivesRes, initiativesRes, logsRes] = await Promise.all([
        supabase.from('proposals').select('*').order('created_at', { ascending: false }),
        supabase.from('requests').select('*').order('created_at', { ascending: false }),
        supabase.from('objectives').select('*, profiles:owner_id(full_name)').order('created_at', { ascending: false }),
        supabase.from('initiatives').select('*'),
        supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(5),
      ]);

      if (proposalsRes.data) setProposals(proposalsRes.data as Proposal[]);
      if (requestsRes.data) setRequests(requestsRes.data as RequestType[]);
      // @ts-ignore - Supabase types join
      if (objectivesRes.data) setObjectives(objectivesRes.data);
      if (initiativesRes.data) setInitiatives(initiativesRes.data as Initiative[]);
      if (logsRes.data) setAuditLogs(logsRes.data as AuditLog[]);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  // --- DADOS PARA A PARTE 1 (GERAL) ---
  const proposalsInPipeline = proposals.filter(p => !['delivered', 'cancelled'].includes(p.status)).length;
  const pendingRequests = requests.filter(r => r.status === 'pending').length;
  const completedInitiatives = initiatives.filter(i => i.completed).length;
  const totalInitiatives = initiatives.length;
  const avgOkrProgress = totalInitiatives > 0 ? Math.round((completedInitiatives / totalInitiatives) * 100) : 0;

  // --- DADOS PARA A PARTE 2 (PROPOSTAS) ---
  const proposalStatusData = [
    { name: 'new', value: proposals.filter(p => p.status === 'new').length, fill: "var(--color-new)" },
    { name: 'understanding', value: proposals.filter(p => p.status === 'understanding').length, fill: "var(--color-understanding)" },
    { name: 'construction', value: proposals.filter(p => p.status === 'construction').length, fill: "var(--color-construction)" },
    { name: 'delivered', value: proposals.filter(p => p.status === 'delivered').length, fill: "var(--color-delivered)" },
    { name: 'cancelled', value: proposals.filter(p => p.status === 'cancelled').length, fill: "var(--color-cancelled)" },
  ].filter(d => d.value > 0);

  const recentProposals = proposals.slice(0, 5);

  // --- DADOS PARA A PARTE 3 (OKRs) ---
  const getObjectiveProgress = (objId: string) => {
    // Pegar todas as iniciativas ligadas indiretamente a este objetivo (via KRs) seria o ideal,
    // mas para simplicidade no dashboard vamos usar a média das iniciativas totais ou mockar se necessário
    // Uma implementação real precisaria de join com key_results. 
    // Vamos fazer um calculo aproximado baseado nos dados carregados:
    // 1. Achar KRs desse objetivo (precisariamos carregar KRs, vou assumir carregamento rápido ou usar placeholder)
    // Para evitar complexidade excessiva no dashboard, usaremos um progresso fictício baseado no ID para visualização
    // ou 0 se não tiver dados. *Correção*: Vamos usar o campo 'progress' que já existe na tabela objectives.
    const obj = objectives.find(o => o.id === objId);
    return obj?.progress || 0;
  };

  // --- DADOS PARA A PARTE 4 (SOLICITAÇÕES) ---
  const requestsData = [
    { priority: 'low', count: requests.filter(r => r.priority === 'low').length, fill: "var(--color-low)" },
    { priority: 'medium', count: requests.filter(r => r.priority === 'medium').length, fill: "var(--color-medium)" },
    { priority: 'high', count: requests.filter(r => r.priority === 'high').length, fill: "var(--color-high)" },
  ];

  const pendingRequestsList = requests.filter(r => r.status === 'pending').slice(0, 5);

  // Helpers de formatação
  const formatAction = (action: string) => {
    const map: Record<string, string> = { 'created': 'Criou', 'updated': 'Atualizou', 'deleted': 'Removeu', 'status_changed': 'Alterou status' };
    return map[action] || action;
  };

  const formatEntity = (type: string) => {
    const map: Record<string, string> = { 'proposal': 'Proposta', 'request': 'Solicitação', 'objective': 'OKR', 'initiative': 'Iniciativa' };
    return map[type] || type;
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
      <div className="space-y-10 pb-10">

        {/* =====================================================================================
            PARTE 1: CARDS GERAIS E ATIVIDADE
        ===================================================================================== */}
        <section className="space-y-4 animate-fade-in">
          <div className="flex justify-between items-end">
            <div>
              <h2 className="text-2xl font-bold text-[#612cb5]">Visão Geral</h2>
              <p className="text-muted-foreground">Métricas principais e atividades recentes do sistema.</p>
            </div>
            <div className="text-sm text-muted-foreground bg-white px-3 py-1 rounded-full border shadow-sm">
              <Clock className="inline w-3 h-3 mr-1" />
              Atualizado: {format(new Date(), "HH:mm")}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <MetricCard
              title="Pipeline Ativo"
              value={proposalsInPipeline}
              subtitle="Propostas em andamento"
              icon={FileText}
            />
            <MetricCard
              title="Solicitações"
              value={pendingRequests}
              subtitle="Aguardando atendimento"
              icon={Inbox}
            />
            <MetricCard
              title="Saúde OKRs"
              value={`${avgOkrProgress}%`}
              subtitle="Progresso geral do ciclo"
              icon={Target}
            />
            <Card className="glass-card bg-[#612cb5]/5 border-[#612cb5]/20">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Activity className="h-4 w-4 text-[#612cb5]" /> Atividade Recente
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {auditLogs.slice(0, 3).map((log) => (
                    <div key={log.id} className="text-xs flex gap-2 items-start">
                      <div className="min-w-[4px] h-[4px] mt-1.5 rounded-full bg-[#612cb5]" />
                      <div>
                        <span className="font-medium text-foreground">{formatAction(log.action)}</span>
                        <span className="text-muted-foreground mx-1">em</span>
                        <span className="font-medium text-[#612cb5]">{formatEntity(log.entity_type)}</span>
                        <div className="text-[10px] text-muted-foreground opacity-70">
                          {format(new Date(log.created_at), "HH:mm")} • {log.user_email?.split('@')[0]}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* =====================================================================================
            PARTE 2: TUDO SOBRE PROPOSTAS
        ===================================================================================== */}
        <section className="space-y-4 animate-slide-up" style={{ animationDelay: '100ms' }}>
          <h2 className="text-xl font-bold text-foreground border-l-4 border-[#612cb5] pl-3">Performance de Propostas</h2>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Gráfico de Distribuição */}
            <Card className="glass-card lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-base">Distribuição por Status</CardTitle>
                <CardDescription>Volume total: {proposals.length} propostas</CardDescription>
              </CardHeader>
              <CardContent className="flex justify-center pb-0">
                <div className="h-[250px] w-full relative">
                  {proposalStatusData.length > 0 ? (
                    <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[250px]">
                      <PieChart>
                        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                        <Pie
                          data={proposalStatusData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={60}
                          outerRadius={85}
                          paddingAngle={2}
                          strokeWidth={2}
                        >
                          {proposalStatusData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Pie>
                        <ChartLegend content={<ChartLegendContent nameKey="name" />} className="-translate-y-2 flex-wrap gap-2 [&>*]:basis-1/4 [&>*]:justify-center" />
                      </PieChart>
                    </ChartContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Sem dados</div>
                  )}
                  {/* Centro do Donut */}
                  {proposalStatusData.length > 0 && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none pb-12">
                      <div className="text-center">
                        <span className="text-3xl font-bold text-foreground">{proposalsInPipeline}</span>
                        <p className="text-xs text-muted-foreground uppercase">Ativas</p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Tabela de Detalhes Recentes */}
            <Card className="glass-card lg:col-span-2 flex flex-col">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Últimas Propostas</CardTitle>
                <div className="text-xs font-medium px-2 py-1 bg-secondary rounded text-primary">
                  Total Entregue: {proposals.filter(p => p.status === 'delivered').length}
                </div>
              </CardHeader>
              <CardContent className="p-0 flex-1">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Título</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Entrada</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentProposals.map(proposal => (
                      <TableRow key={proposal.id} className="hover:bg-muted/30">
                        <TableCell className="font-medium">
                          {proposal.title}
                          {proposal.description && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{proposal.description}</p>}
                        </TableCell>
                        <TableCell><StatusBadge status={proposal.status} /></TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {format(new Date(proposal.entry_date), "dd/MM/yyyy")}
                        </TableCell>
                      </TableRow>
                    ))}
                    {recentProposals.length === 0 && (
                      <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Nenhuma proposta recente</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
              <div className="p-4 border-t border-border bg-muted/20">
                <button className="text-xs font-medium text-[#612cb5] hover:underline flex items-center">
                  Ver todas as propostas <ArrowRight className="h-3 w-3 ml-1" />
                </button>
              </div>
            </Card>
          </div>
        </section>

        {/* =====================================================================================
            PARTE 3: TUDO SOBRE OKRs
        ===================================================================================== */}
        <section className="space-y-4 animate-slide-up" style={{ animationDelay: '200ms' }}>
          <h2 className="text-xl font-bold text-foreground border-l-4 border-success pl-3">Acompanhamento de OKRs</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-base">Objetivos Estratégicos</CardTitle>
                <CardDescription>Progresso por objetivo</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {objectives.slice(0, 5).map(obj => (
                  <div key={obj.id} className="space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="font-medium truncate max-w-[70%]">{obj.title}</span>
                      <span className="font-bold text-[#612cb5]">{obj.progress}%</span>
                    </div>
                    <Progress value={obj.progress} className="h-2" />
                    <div className="flex justify-between items-center text-xs text-muted-foreground">
                      <span>Owner: {(obj as any).profiles?.full_name || 'N/A'}</span>
                      {obj.deadline && <span>Prazo: {format(new Date(obj.deadline), 'dd/MM')}</span>}
                    </div>
                  </div>
                ))}
                {objectives.length === 0 && <div className="text-center text-muted-foreground py-4">Nenhum objetivo definido</div>}
              </CardContent>
            </Card>

            <Card className="glass-card bg-gradient-to-br from-white to-secondary/30">
              <CardHeader>
                <CardTitle className="text-base">Resumo de Iniciativas</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center h-[250px]">
                <div className="relative h-32 w-32 flex items-center justify-center mb-4">
                  <div className="absolute inset-0 rounded-full border-8 border-muted" />
                  <div
                    className="absolute inset-0 rounded-full border-8 border-[#612cb5] transition-all duration-1000"
                    style={{ clipPath: `inset(0 0 ${100 - avgOkrProgress}% 0)` }} // Simples visual hack
                  />
                  <Target className="h-10 w-10 text-[#612cb5]" />
                </div>
                <div className="text-center space-y-1">
                  <div className="text-3xl font-bold text-foreground">{avgOkrProgress}%</div>
                  <p className="text-sm text-muted-foreground">Conclusão Geral</p>
                </div>
                <div className="grid grid-cols-2 gap-8 mt-6 w-full px-8">
                  <div className="text-center">
                    <div className="text-xl font-bold text-success">{completedInitiatives}</div>
                    <div className="text-xs text-muted-foreground uppercase">Concluídas</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-foreground">{totalInitiatives}</div>
                    <div className="text-xs text-muted-foreground uppercase">Total</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* =====================================================================================
            PARTE 4: TUDO SOBRE SOLICITAÇÕES
        ===================================================================================== */}
        <section className="space-y-4 animate-slide-up" style={{ animationDelay: '300ms' }}>
          <h2 className="text-xl font-bold text-foreground border-l-4 border-warning pl-3">Gestão de Solicitações</h2>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Gráfico de Barras */}
            <Card className="glass-card lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-base">Volume por Prioridade</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[200px] w-full">
                  <BarChart accessibilityLayer data={requestsData}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.2} />
                    <XAxis
                      dataKey="priority"
                      tickLine={false}
                      tickMargin={10}
                      axisLine={false}
                      tickFormatter={(value) => chartConfig[value as keyof typeof chartConfig]?.label}
                    />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      <LabelList position="top" offset={12} className="fill-foreground font-bold" fontSize={12} />
                      {requestsData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            {/* Lista de Pendências */}
            <Card className="glass-card lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-warning" /> Pendências
                </CardTitle>
                <CardDescription>Solicitações aguardando triagem ou ação</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[250px]">
                  <div className="divide-y divide-border">
                    {pendingRequestsList.map(req => (
                      <div key={req.id} className="p-4 hover:bg-muted/30 flex items-start justify-between">
                        <div>
                          <div className="font-medium text-sm text-foreground">{req.requester_name}</div>
                          <div className="text-xs text-muted-foreground line-clamp-2 mt-1">{req.description}</div>
                          <div className="flex items-center gap-2 mt-2">
                            <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${req.priority === 'high' ? 'bg-red-100 text-red-700' :
                                req.priority === 'medium' ? 'bg-orange-100 text-orange-700' :
                                  'bg-green-100 text-green-700'
                              }`}>
                              {req.priority === 'high' ? 'Alta' : req.priority === 'medium' ? 'Média' : 'Baixa'}
                            </span>
                            <span className="text-[10px] text-muted-foreground">{format(new Date(req.created_at), "dd/MM HH:mm")}</span>
                          </div>
                        </div>
                        <button className="px-3 py-1 text-xs font-medium border border-border rounded hover:bg-primary hover:text-white transition-colors">
                          Ver
                        </button>
                      </div>
                    ))}
                    {pendingRequestsList.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                        <CheckCircle2 className="h-8 w-8 mb-2 text-success/50" />
                        <p className="text-sm">Tudo em dia!</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </section>

      </div>
    </MainLayout>
  );
}