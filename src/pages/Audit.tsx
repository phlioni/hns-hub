import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
    Search, Filter, Eye, FileText, Target, Inbox, User, Clock,
    ArrowRight, ShieldCheck
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import { AuditLog } from '@/types/database';
import { ScrollArea } from '@/components/ui/scroll-area';

// Mapeamento para ícones e cores
const entityConfig: Record<string, { label: string; icon: any; color: string }> = {
    proposal: { label: 'Proposta', icon: FileText, color: 'text-blue-500 bg-blue-500/10' },
    request: { label: 'Solicitação', icon: Inbox, color: 'text-orange-500 bg-orange-500/10' },
    objective: { label: 'Objetivo', icon: Target, color: 'text-purple-500 bg-purple-500/10' },
    key_result: { label: 'KR', icon: Target, color: 'text-purple-400 bg-purple-500/10' },
    initiative: { label: 'Iniciativa', icon: Target, color: 'text-pink-500 bg-pink-500/10' },
};

const actionConfig: Record<string, { label: string; color: string }> = {
    created: { label: 'Criação', color: 'bg-green-500/10 text-green-600 border-green-200' },
    updated: { label: 'Edição', color: 'bg-blue-500/10 text-blue-600 border-blue-200' },
    deleted: { label: 'Exclusão', color: 'bg-red-500/10 text-red-600 border-red-200' },
    status_changed: { label: 'Status', color: 'bg-yellow-500/10 text-yellow-600 border-yellow-200' },
};

export default function Audit() {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [entityFilter, setEntityFilter] = useState('all');
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

    useEffect(() => {
        fetchLogs();
    }, []);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('audit_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(100);

            if (error) throw error;
            setLogs(data as AuditLog[]);
        } catch (error) {
            console.error('Erro ao buscar logs:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredLogs = logs.filter(log => {
        const matchesSearch =
            log.user_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            log.entity_id.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesEntity = entityFilter === 'all' || log.entity_type === entityFilter;
        return matchesSearch && matchesEntity;
    });

    const getEntityInfo = (type: string) => {
        return entityConfig[type] || { label: type, icon: FileText, color: 'text-gray-500 bg-gray-100' };
    };

    const getActionInfo = (action: string) => {
        return actionConfig[action] || { label: action, color: 'bg-gray-100 text-gray-600 border-gray-200' };
    };

    const formatMetadata = (log: AuditLog) => {
        if (!log.metadata || Object.keys(log.metadata).length === 0) {
            if (log.previous_status || log.new_status) {
                return (
                    <div className="flex items-center gap-2 text-sm">
                        <Badge variant="outline">{log.previous_status || 'Início'}</Badge>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <Badge variant="default" className="bg-[#612cb5]">{log.new_status}</Badge>
                    </div>
                );
            }
            return <span className="text-muted-foreground italic text-sm">Sem detalhes adicionais</span>;
        }

        return (
            <div className="bg-secondary/50 p-3 rounded-md font-mono text-xs overflow-x-auto">
                <pre>{JSON.stringify(log.metadata, null, 2)}</pre>
            </div>
        );
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

    return (
        <MainLayout>
            <div className="space-y-6 animate-fade-in pb-10">

                {/* Header */}
                <div>
                    <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
                        <ShieldCheck className="h-8 w-8 text-[#612cb5]" />
                        Trilha de Auditoria
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Registro histórico de todas as ações realizadas na plataforma.
                    </p>
                </div>

                {/* Filters */}
                <Card className="glass-card">
                    <CardContent className="py-4">
                        <div className="flex flex-col sm:flex-row gap-4">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Buscar por e-mail ou ID..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="pl-10 input-enhanced"
                                />
                            </div>
                            <Select value={entityFilter} onValueChange={setEntityFilter}>
                                <SelectTrigger className="w-full sm:w-48 input-enhanced">
                                    <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                                    <SelectValue placeholder="Tipo de Registro" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todos os Tipos</SelectItem>
                                    <SelectItem value="proposal">Propostas</SelectItem>
                                    <SelectItem value="request">Solicitações</SelectItem>
                                    <SelectItem value="objective">OKRs</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                </Card>

                {/* Table */}
                <Card className="glass-card overflow-hidden">
                    <CardHeader className="border-b border-border/50 bg-secondary/10 pb-3">
                        <div className="flex justify-between items-center">
                            <CardTitle className="text-base">Últimos Registros</CardTitle>
                            <Badge variant="outline" className="font-normal">
                                Mostrando {filteredLogs.length} eventos
                            </Badge>
                        </div>
                    </CardHeader>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                    <TableHead>Data/Hora</TableHead>
                                    <TableHead>Usuário</TableHead>
                                    <TableHead>Ação</TableHead>
                                    <TableHead>Entidade</TableHead>
                                    <TableHead>Detalhes</TableHead>
                                    <TableHead className="text-right">Inspeção</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredLogs.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                                            <ShieldCheck className="h-10 w-10 mx-auto mb-3 opacity-20" />
                                            <p>Nenhum registro encontrado com os filtros atuais.</p>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredLogs.map((log) => {
                                        const EntityIcon = getEntityInfo(log.entity_type).icon;
                                        const actionStyle = getActionInfo(log.action);
                                        const entityStyle = getEntityInfo(log.entity_type);
                                        // @ts-ignore
                                        const entityTitle = log.metadata?.entity_title;

                                        return (
                                            <TableRow key={log.id} className="hover:bg-muted/30 transition-colors">
                                                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                                    <div className="flex items-center gap-2">
                                                        <Clock className="h-3 w-3" />
                                                        {format(new Date(log.created_at), "dd/MM/yyyy HH:mm")}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center border border-border">
                                                            <User className="h-3 w-3 text-muted-foreground" />
                                                        </div>
                                                        <span className="text-sm font-medium text-foreground truncate max-w-[150px]" title={log.user_email || ''}>
                                                            {log.user_email?.split('@')[0] || 'Sistema'}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${actionStyle.color}`}>
                                                        {actionStyle.label}
                                                    </span>
                                                </TableCell>
                                                <TableCell>
                                                    <div className={`flex items-center gap-1.5 px-2 py-1 rounded w-fit text-xs font-medium ${entityStyle.color}`}>
                                                        <EntityIcon className="h-3 w-3" />
                                                        {entityStyle.label}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="max-w-[250px]">
                                                    {entityTitle ? (
                                                        <div className="truncate text-sm font-medium text-foreground" title={entityTitle}>
                                                            {entityTitle}
                                                        </div>
                                                    ) : (
                                                        <div className="truncate text-xs text-muted-foreground">
                                                            ID: <span className="font-mono">{log.entity_id.substring(0, 8)}...</span>
                                                        </div>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 w-8 p-0"
                                                        onClick={() => setSelectedLog(log)}
                                                    >
                                                        <Eye className="h-4 w-4 text-primary" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </Card>

                {/* Detail Modal */}
                <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
                    <DialogContent className="sm:max-w-xl bg-card border-border">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                Detalhes do Registro
                                {selectedLog && (
                                    <Badge variant="outline" className="font-mono text-xs font-normal">
                                        {selectedLog.id.substring(0, 8)}
                                    </Badge>
                                )}
                            </DialogTitle>
                            <DialogDescription>
                                Informações completas sobre o evento auditado.
                            </DialogDescription>
                        </DialogHeader>

                        {selectedLog && (
                            <div className="space-y-4 py-2">
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div className="space-y-1">
                                        <span className="text-muted-foreground text-xs">Data e Hora</span>
                                        <p className="font-medium">{format(new Date(selectedLog.created_at), "dd 'de' MMMM 'às' HH:mm:ss", { locale: ptBR })}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-muted-foreground text-xs">Usuário Responsável</span>
                                        <p className="font-medium">{selectedLog.user_email || 'Sistema'}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-muted-foreground text-xs">Tipo de Ação</span>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-xs font-bold px-2 py-0.5 rounded border ${getActionInfo(selectedLog.action).color}`}>
                                                {getActionInfo(selectedLog.action).label.toUpperCase()}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-muted-foreground text-xs">Entidade Afetada</span>
                                        <p className="font-medium capitalize">{selectedLog.entity_type.replace('_', ' ')}</p>
                                    </div>
                                </div>

                                <div className="border-t border-border pt-4">
                                    <span className="text-muted-foreground text-xs mb-2 block">Dados Técnicos (Metadata)</span>
                                    <ScrollArea className="h-[200px] w-full rounded-md border border-border bg-secondary/30 p-4">
                                        {formatMetadata(selectedLog)}
                                    </ScrollArea>
                                </div>
                            </div>
                        )}

                        <DialogFooter>
                            <Button onClick={() => setSelectedLog(null)}>Fechar</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

            </div>
        </MainLayout>
    );
}