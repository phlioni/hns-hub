import { useEffect, useState } from 'react';
import { format, subMonths, isSameMonth, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, subDays, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
    BarChart as BarChartIcon, Calendar, Filter, Download,
    TrendingUp, TrendingDown, Activity, PieChart as PieChartIcon
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Proposal, Request as RequestType, Objective, Initiative } from '@/types/database';

// Recharts
import {
    Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend, LineChart, Line
} from "recharts";

export default function Reports() {
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState('90'); // dias

    // Data States
    const [proposals, setProposals] = useState<Proposal[]>([]);
    const [requests, setRequests] = useState<RequestType[]>([]);
    const [objectives, setObjectives] = useState<Objective[]>([]);
    const [initiatives, setInitiatives] = useState<Initiative[]>([]);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [propRes, reqRes, objRes, initRes] = await Promise.all([
                supabase.from('proposals').select('*'),
                supabase.from('requests').select('*'),
                supabase.from('objectives').select('*'),
                supabase.from('initiatives').select('*'),
            ]);

            if (propRes.data) setProposals(propRes.data as Proposal[]);
            if (reqRes.data) setRequests(reqRes.data as RequestType[]);
            if (objRes.data) setObjectives(objRes.data as Objective[]);
            if (initRes.data) setInitiatives(initRes.data as Initiative[]);
        } catch (error) {
            console.error("Erro ao carregar dados para relatórios:", error);
        } finally {
            setLoading(false);
        }
    };

    // --- PROCESSAMENTO DE DADOS ---

    // Filtro de data genérico
    const filterByDate = (data: any[], dateField: string = 'created_at') => {
        const cutoff = subDays(new Date(), parseInt(period));
        return data.filter(item => new Date(item[dateField]) >= cutoff);
    };

    // 1. Dados para Gráfico de Evolução (Linha/Area) - Geral
    const getEvolutionData = () => {
        const days = parseInt(period);
        const data = [];
        const now = new Date();

        // Agrupar por mês se for período longo, ou dia se for curto
        const isLongPeriod = days > 60;

        // Simplificação: Agrupando por mês para visualização macro
        for (let i = 5; i >= 0; i--) {
            const date = subMonths(now, i);
            const monthKey = format(date, 'MMM/yy', { locale: ptBR });

            const propsCount = proposals.filter(p => isSameMonth(parseISO(p.created_at), date)).length;
            const reqsCount = requests.filter(r => isSameMonth(parseISO(r.created_at), date)).length;

            data.push({
                name: monthKey,
                Propostas: propsCount,
                Solicitações: reqsCount
            });
        }
        return data;
    };

    // 2. Status de Propostas (Pie)
    const getProposalStatusData = () => {
        const filtered = filterByDate(proposals);
        const statusCounts: Record<string, number> = {};
        filtered.forEach(p => {
            statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
        });

        const colors: Record<string, string> = {
            new: '#3b82f6', understanding: '#8b5cf6', construction: '#f59e0b',
            delivered: '#10b981', cancelled: '#ef4444'
        };

        const labels: Record<string, string> = {
            new: 'Novo', understanding: 'Entendimento', construction: 'Construção',
            delivered: 'Entregue', cancelled: 'Cancelado'
        };

        return Object.keys(statusCounts).map(key => ({
            name: labels[key] || key,
            value: statusCounts[key],
            color: colors[key] || '#cccccc'
        }));
    };

    // 3. Prioridade de Solicitações (Bar)
    const getRequestPriorityData = () => {
        const filtered = filterByDate(requests);
        const counts = { low: 0, medium: 0, high: 0 };
        filtered.forEach(r => {
            if (counts[r.priority as keyof typeof counts] !== undefined) {
                counts[r.priority as keyof typeof counts]++;
            }
        });
        return [
            { name: 'Baixa', value: counts.low, color: '#10b981' },
            { name: 'Média', value: counts.medium, color: '#f59e0b' },
            { name: 'Alta', value: counts.high, color: '#ef4444' },
        ];
    };

    // 4. Progresso de OKRs
    const getOKRProgressDistribution = () => {
        // Faixas de progresso: 0-25, 26-50, 51-75, 76-100
        const buckets = { '0-25%': 0, '26-50%': 0, '51-75%': 0, '76-100%': 0 };

        objectives.forEach(obj => {
            const progress = obj.progress || 0;
            if (progress <= 25) buckets['0-25%']++;
            else if (progress <= 50) buckets['26-50%']++;
            else if (progress <= 75) buckets['51-75%']++;
            else buckets['76-100%']++;
        });

        return Object.keys(buckets).map(key => ({
            name: key,
            value: buckets[key as keyof typeof buckets]
        }));
    };

    if (loading) {
        return (
            <MainLayout>
                <div className="flex items-center justify-center h-full">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
                </div>
            </MainLayout>
        );
    }

    const evolutionData = getEvolutionData();
    const proposalStatusData = getProposalStatusData();
    const requestPriorityData = getRequestPriorityData();
    const okrDistributionData = getOKRProgressDistribution();

    return (
        <MainLayout>
            <div className="space-y-6 animate-fade-in pb-10">

                {/* Header e Filtros */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-foreground">Relatórios Analíticos</h1>
                        <p className="text-muted-foreground mt-1">Análise profunda de movimentações e performance.</p>
                    </div>
                    <div className="flex gap-2">
                        <Select value={period} onValueChange={setPeriod}>
                            <SelectTrigger className="w-[180px] bg-background">
                                <Calendar className="w-4 h-4 mr-2 text-muted-foreground" />
                                <SelectValue placeholder="Período" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="30">Últimos 30 dias</SelectItem>
                                <SelectItem value="90">Últimos 3 meses</SelectItem>
                                <SelectItem value="180">Últimos 6 meses</SelectItem>
                                <SelectItem value="365">Último ano</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button variant="outline">
                            <Download className="w-4 h-4 mr-2" /> Exportar PDF
                        </Button>
                    </div>
                </div>

                {/* KPIs Gerais */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card className="bg-card border-l-4 border-l-primary shadow-sm">
                        <CardContent className="p-6">
                            <div className="text-xs font-medium text-muted-foreground uppercase">Total de Propostas</div>
                            <div className="text-2xl font-bold mt-2">{proposals.length}</div>
                            <div className="text-xs text-emerald-500 mt-1 flex items-center">
                                <TrendingUp className="w-3 h-3 mr-1" /> +{proposals.filter(p => isSameMonth(parseISO(p.created_at), new Date())).length} este mês
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-card border-l-4 border-l-orange-500 shadow-sm">
                        <CardContent className="p-6">
                            <div className="text-xs font-medium text-muted-foreground uppercase">Solicitações Pendentes</div>
                            <div className="text-2xl font-bold mt-2">{requests.filter(r => r.status === 'pending').length}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                                De um total de {requests.length}
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-card border-l-4 border-l-blue-500 shadow-sm">
                        <CardContent className="p-6">
                            <div className="text-xs font-medium text-muted-foreground uppercase">Iniciativas Concluídas</div>
                            <div className="text-2xl font-bold mt-2">{initiatives.filter(i => i.completed).length}</div>
                            <div className="text-xs text-blue-500 mt-1">
                                {initiatives.length > 0 ? Math.round((initiatives.filter(i => i.completed).length / initiatives.length) * 100) : 0}% de conclusão global
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-card border-l-4 border-l-purple-500 shadow-sm">
                        <CardContent className="p-6">
                            <div className="text-xs font-medium text-muted-foreground uppercase">Objetivos Ativos</div>
                            <div className="text-2xl font-bold mt-2">{objectives.length}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                                Em andamento
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Conteúdo Principal */}
                <Tabs defaultValue="overview" className="space-y-6">
                    <TabsList className="bg-background border border-border p-1 h-auto">
                        <TabsTrigger value="overview" className="px-4 py-2">Visão Geral</TabsTrigger>
                        <TabsTrigger value="proposals" className="px-4 py-2">Propostas</TabsTrigger>
                        <TabsTrigger value="requests" className="px-4 py-2">Solicitações</TabsTrigger>
                        <TabsTrigger value="okrs" className="px-4 py-2">OKRs</TabsTrigger>
                    </TabsList>

                    {/* ============ ABA: VISÃO GERAL ============ */}
                    <TabsContent value="overview" className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Volume de Entradas</CardTitle>
                                <CardDescription>Evolução de novas Propostas e Solicitações nos últimos 6 meses</CardDescription>
                            </CardHeader>
                            <CardContent className="h-[350px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={evolutionData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorPropostas" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="colorSolicitacoes" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8} />
                                                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                                        <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: 'var(--card)', borderRadius: '8px', border: '1px solid var(--border)' }}
                                            itemStyle={{ color: 'var(--foreground)' }}
                                        />
                                        <Legend />
                                        <Area type="monotone" dataKey="Propostas" stroke="#3b82f6" fillOpacity={1} fill="url(#colorPropostas)" />
                                        <Area type="monotone" dataKey="Solicitações" stroke="#f59e0b" fillOpacity={1} fill="url(#colorSolicitacoes)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* ============ ABA: PROPOSTAS ============ */}
                    <TabsContent value="proposals" className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Status das Propostas</CardTitle>
                                    <CardDescription>Distribuição atual do pipeline</CardDescription>
                                </CardHeader>
                                <CardContent className="h-[300px] flex justify-center">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={proposalStatusData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={60}
                                                outerRadius={80}
                                                paddingAngle={5}
                                                dataKey="value"
                                            >
                                                {proposalStatusData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                                ))}
                                            </Pie>
                                            <Tooltip contentStyle={{ borderRadius: '8px' }} />
                                            <Legend verticalAlign="bottom" height={36} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Métricas de Propostas</CardTitle>
                                    <CardDescription>Indicadores chave</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-6">
                                        <div className="flex items-center justify-between border-b border-border pb-4">
                                            <div>
                                                <p className="font-medium">Taxa de Entrega</p>
                                                <p className="text-sm text-muted-foreground">Propostas entregues / Total</p>
                                            </div>
                                            <div className="text-2xl font-bold">
                                                {proposals.length > 0
                                                    ? Math.round((proposals.filter(p => p.status === 'delivered').length / proposals.length) * 100)
                                                    : 0}%
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between border-b border-border pb-4">
                                            <div>
                                                <p className="font-medium">Em Construção</p>
                                                <p className="text-sm text-muted-foreground">Propostas sendo trabalhadas</p>
                                            </div>
                                            <div className="text-2xl font-bold text-orange-500">
                                                {proposals.filter(p => p.status === 'construction').length}
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="font-medium">Canceladas</p>
                                                <p className="text-sm text-muted-foreground">Perda de oportunidade</p>
                                            </div>
                                            <div className="text-2xl font-bold text-red-500">
                                                {proposals.filter(p => p.status === 'cancelled').length}
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>

                    {/* ============ ABA: SOLICITAÇÕES ============ */}
                    <TabsContent value="requests" className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Solicitações por Prioridade</CardTitle>
                                    <CardDescription>Volume baseado na urgência</CardDescription>
                                </CardHeader>
                                <CardContent className="h-[300px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={requestPriorityData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e5e5" />
                                            <XAxis type="number" hide />
                                            <YAxis dataKey="name" type="category" width={50} tickLine={false} axisLine={false} />
                                            <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '8px' }} />
                                            <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={40}>
                                                {requestPriorityData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Funil de Atendimento</CardTitle>
                                    <CardDescription>Status atual das solicitações</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-4">
                                            <div className="w-24 text-sm font-medium">Pendentes</div>
                                            <div className="flex-1 h-4 bg-secondary rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-red-400"
                                                    style={{ width: `${(requests.filter(r => r.status === 'pending').length / (requests.length || 1)) * 100}%` }}
                                                />
                                            </div>
                                            <div className="w-10 text-right font-bold">{requests.filter(r => r.status === 'pending').length}</div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="w-24 text-sm font-medium">Em Andamento</div>
                                            <div className="flex-1 h-4 bg-secondary rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-blue-400"
                                                    style={{ width: `${(requests.filter(r => r.status === 'in_progress').length / (requests.length || 1)) * 100}%` }}
                                                />
                                            </div>
                                            <div className="w-10 text-right font-bold">{requests.filter(r => r.status === 'in_progress').length}</div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="w-24 text-sm font-medium">Concluídas</div>
                                            <div className="flex-1 h-4 bg-secondary rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-green-400"
                                                    style={{ width: `${(requests.filter(r => r.status === 'done').length / (requests.length || 1)) * 100}%` }}
                                                />
                                            </div>
                                            <div className="w-10 text-right font-bold">{requests.filter(r => r.status === 'done').length}</div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>

                    {/* ============ ABA: OKRs ============ */}
                    <TabsContent value="okrs" className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Distribuição de Progresso</CardTitle>
                                <CardDescription>Como está o avanço dos objetivos cadastrados</CardDescription>
                            </CardHeader>
                            <CardContent className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={okrDistributionData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                                        <XAxis dataKey="name" tickLine={false} axisLine={false} />
                                        <YAxis tickLine={false} axisLine={false} />
                                        <Tooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} contentStyle={{ borderRadius: '8px' }} />
                                        <Bar dataKey="value" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={60} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    </TabsContent>

                </Tabs>
            </div>
        </MainLayout>
    );
}