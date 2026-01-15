import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format, differenceInDays, parseISO, differenceInHours, differenceInMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Plus, Search, History, MoreHorizontal, FileText, Trash2, Edit,
  Paperclip, X, Link as LinkIcon, ExternalLink, Eye, MessageSquare, Clock,
  CheckCircle2, Circle, CalendarClock, ArrowRight, Binary, PenTool, Hammer, Lock
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAuditLog } from '@/hooks/useAuditLog';
import { MainLayout } from '@/components/layout/MainLayout';
import { StatusBadge } from '@/components/ui/status-badge';
import { AuditHistoryDrawer } from '@/components/AuditHistoryDrawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Proposal, ProposalStatus, AuditLog } from '@/types/database';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const statusOptions: { value: ProposalStatus; label: string }[] = [
  { value: 'new', label: 'Novo' },
  { value: 'understanding', label: 'Entendimento' },
  { value: 'construction', label: 'Construção' },
  { value: 'in_review', label: 'Em Revisão' },
  { value: 'awaiting_code', label: 'Aguardando Código' },
  { value: 'awaiting_contract', label: 'Aguardando Assinatura' },
  { value: 'operational_start', label: 'Start Operacional' },
  { value: 'execution_forwarded', label: 'Encaminhado p/ Execução' },
  { value: 'cancelled', label: 'Cancelado' },
  { value: 'delivered', label: 'Entregue' },
];

const automationStatuses = [
  'awaiting_code',
  'awaiting_contract',
  'operational_start',
  'execution_forwarded'
];

interface Attachment {
  name: string;
  url: string;
  type: string;
}

interface ExternalLinkItem {
  name: string;
  url: string;
}

export default function Proposals() {
  const { user, role } = useAuth();
  const { logAudit } = useAuditLog();
  const [searchParams] = useSearchParams();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const viewMode = searchParams.get('view');

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingProposal, setEditingProposal] = useState<Proposal | null>(null);
  const [viewingProposal, setViewingProposal] = useState<Proposal | null>(null);

  const [viewingProposalLogs, setViewingProposalLogs] = useState<AuditLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  const [pendingStatusChange, setPendingStatusChange] = useState<{ proposal: Proposal, newStatus: ProposalStatus } | null>(null);
  const [justification, setJustification] = useState('');

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [links, setLinks] = useState<ExternalLinkItem[]>([]);
  const [newLink, setNewLink] = useState({ name: '', url: '' });
  const [isUploading, setIsUploading] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    project_code: '',
    pre_analysis: '',
    pre_proposal: '',
    deadline: '',
  });

  const isAccountManager = role === 'account_manager';

  useEffect(() => {
    fetchProposals();
  }, []);

  useEffect(() => {
    if (viewingProposal) {
      fetchLogsForProposal(viewingProposal.id);
    } else {
      setViewingProposalLogs([]);
    }
  }, [viewingProposal]);

  const fetchProposals = async () => {
    try {
      const { data, error } = await supabase
        .from('proposals')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProposals(data as Proposal[]);
    } catch (error) {
      console.error('Erro ao carregar propostas:', error);
      toast.error('Falha ao carregar propostas');
    } finally {
      setLoading(false);
    }
  };

  const fetchLogsForProposal = async (proposalId: string) => {
    setIsLoadingLogs(true);
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('entity_id', proposalId)
        .eq('entity_type', 'proposal')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setViewingProposalLogs(data as AuditLog[]);
    } catch (error) {
      console.error('Erro ao buscar histórico:', error);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const getTimestampFromLogs = (targetStatus: string, logs: AuditLog[], entryDate?: string): string | null => {
    if (targetStatus === 'entry' || targetStatus === 'awaiting_code') {
      const createLog = logs.find(l => l.action === 'created');
      return createLog ? createLog.created_at : (entryDate || null);
    }
    const log = logs.find(l => l.new_status === targetStatus);
    return log ? log.created_at : null;
  };

  const calculateMetric = (startDate: string | null, endDate: string | null) => {
    if (!startDate || !endDate) return { minutes: 0, valid: false };
    const s = parseISO(startDate);
    const e = parseISO(endDate);
    const minutes = differenceInMinutes(e, s);
    return { minutes, valid: true };
  };

  const renderMetricValue = (minutes: number) => {
    if (minutes < 60) {
      return (
        <span className="text-2xl font-bold">{Math.max(0, minutes)}m</span>
      );
    }
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    return (
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold">{hours}h</span>
        <span className="text-xs font-medium opacity-80">({days}d)</span>
      </div>
    );
  };

  const getProposalMetricsFromLogs = (p: Proposal, logs: AuditLog[]) => {
    const dateEntry = p.entry_date;
    const dateCode = getTimestampFromLogs('new', logs);
    const dateDelivered = getTimestampFromLogs('delivered', logs);
    const dateContract = getTimestampFromLogs('awaiting_contract', logs);
    const dateStart = getTimestampFromLogs('operational_start', logs);
    const dateExecution = getTimestampFromLogs('execution_forwarded', logs);

    return [
      {
        label: "Solicitação -> Código",
        subtitle: "Controladoria",
        ...calculateMetric(dateEntry, dateCode),
        color: "bg-pink-50 text-pink-700 border-pink-200"
      },
      {
        label: "Envio -> Assinatura",
        subtitle: "Comercial",
        ...calculateMetric(dateDelivered, dateContract),
        color: "bg-purple-50 text-purple-700 border-purple-200"
      },
      {
        label: "Assinatura -> Start",
        subtitle: "Gestão de Contas",
        ...calculateMetric(dateContract, dateStart),
        color: "bg-emerald-50 text-emerald-700 border-emerald-200"
      },
      {
        label: "Start -> Execução",
        subtitle: "HNS",
        ...calculateMetric(dateStart, dateExecution),
        color: "bg-indigo-50 text-indigo-700 border-indigo-200"
      }
    ];
  };

  // ... (Upload handlers, CRUD actions e outros métodos mantidos) ...
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setIsUploading(true);
    const file = e.target.files[0];
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
    const filePath = `${fileName}`;
    try {
      const { error: uploadError } = await supabase.storage.from('attachments').upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('attachments').getPublicUrl(filePath);
      setAttachments([...attachments, { name: file.name, url: publicUrl, type: file.type }]);
      toast.success('Arquivo anexado com sucesso');
    } catch (error) {
      toast.error('Erro no upload do arquivo');
      console.error(error);
    } finally {
      setIsUploading(false);
    }
  };

  const addLink = () => {
    if (!newLink.name || !newLink.url) {
      toast.error('Preencha nome e URL do link');
      return;
    }
    setLinks([...links, newLink]);
    setNewLink({ name: '', url: '' });
  };

  const handleCreate = async () => {
    if (isAccountManager) return;
    if (!formData.title.trim()) {
      toast.error('Título é obrigatório');
      return;
    }
    try {
      const { data, error } = await supabase
        .from('proposals')
        .insert({
          title: formData.title,
          description: formData.description,
          project_code: formData.project_code || null,
          pre_analysis: formData.pre_analysis,
          pre_proposal: formData.pre_proposal,
          deadline: formData.deadline || null,
          attachments: attachments,
          links: links,
          created_by: user?.id,
          last_justification: 'Criação inicial via Painel',
          status: 'awaiting_code',
          entry_date: new Date().toISOString()
        })
        .select()
        .single();
      if (error) throw error;
      await logAudit({
        action: 'created',
        entityType: 'proposal',
        entityId: data.id,
        entityTitle: data.title,
        newStatus: 'awaiting_code',
      });
      setProposals([data as Proposal, ...proposals]);
      resetForm();
      setIsCreateOpen(false);
      toast.success('Proposta criada com sucesso');
    } catch (error) {
      console.error('Erro ao criar proposta:', error);
      toast.error('Falha ao criar proposta');
    }
  };

  const handleUpdate = async () => {
    if (isAccountManager) return;
    if (!editingProposal || !formData.title.trim()) return;
    try {
      const { data, error } = await supabase
        .from('proposals')
        .update({
          title: formData.title,
          description: formData.description,
          project_code: formData.project_code || null,
          pre_analysis: formData.pre_analysis,
          pre_proposal: formData.pre_proposal,
          deadline: formData.deadline || null,
          attachments: attachments,
          links: links,
        })
        .eq('id', editingProposal.id)
        .select()
        .single();
      if (error) throw error;
      await logAudit({
        action: 'edited',
        entityType: 'proposal',
        entityId: data.id,
        entityTitle: data.title,
      });
      setProposals(proposals.map(p => p.id === data.id ? data as Proposal : p));
      setEditingProposal(null);
      resetForm();
      toast.success('Proposta atualizada com sucesso');
    } catch (error) {
      console.error('Erro ao atualizar proposta:', error);
      toast.error('Falha ao atualizar proposta');
    }
  };

  const resetForm = () => {
    setFormData({ title: '', description: '', project_code: '', pre_analysis: '', pre_proposal: '', deadline: '' });
    setAttachments([]);
    setLinks([]);
    setNewLink({ name: '', url: '' });
  };

  const handleStatusChangeRequest = (proposal: Proposal, newStatus: ProposalStatus) => {
    if (isAccountManager) return;
    if (proposal.status !== newStatus) {
      setPendingStatusChange({ proposal, newStatus });
      setJustification('');
      return;
    }
  };

  const executeStatusChange = async (proposal: Proposal, newStatus: ProposalStatus, justify?: string) => {
    const previousStatus = proposal.status;
    try {
      const { data, error } = await supabase
        .from('proposals')
        .update({
          status: newStatus,
          last_justification: justify
        })
        .eq('id', proposal.id)
        .select()
        .single();
      if (error) throw error;
      await logAudit({
        action: 'status_changed',
        entityType: 'proposal',
        entityId: proposal.id,
        entityTitle: proposal.title,
        previousStatus,
        newStatus,
        metadata: justify ? { justification: justify } : undefined
      });
      setProposals(proposals.map(p => p.id === data.id ? data as Proposal : p));
      if (newStatus === 'delivered') {
        toast.info('Proposta marcada como Entregue');
      } else {
        toast.success('Status atualizado com sucesso');
      }
      setPendingStatusChange(null);
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      toast.error('Falha ao atualizar status');
    }
  };

  const handleDelete = async (id: string) => {
    if (isAccountManager) return;
    const proposalToDelete = proposals.find(p => p.id === id);
    try {
      const { error } = await supabase.from('proposals').delete().eq('id', id);
      if (error) throw error;
      await logAudit({
        action: 'deleted',
        entityType: 'proposal',
        entityId: id,
        entityTitle: proposalToDelete?.title || 'Desconhecido',
      });
      setProposals(proposals.filter(p => p.id !== id));
      toast.success('Proposta excluída com sucesso');
    } catch (error) {
      console.error('Erro ao excluir proposta:', error);
      toast.error('Falha ao excluir proposta');
    }
  };

  const openEdit = (proposal: Proposal) => {
    if (isAccountManager) return;
    setEditingProposal(proposal);
    setFormData({
      title: proposal.title,
      description: proposal.description || '',
      project_code: proposal.project_code || '',
      pre_analysis: proposal.pre_analysis || '',
      pre_proposal: proposal.pre_proposal || '',
      deadline: proposal.deadline ? new Date(proposal.deadline).toISOString().split('T')[0] : '',
    });
    // @ts-ignore
    setAttachments(proposal.attachments || []);
    // @ts-ignore
    setLinks(proposal.links || []);
  };

  const filteredProposals = proposals.filter(proposal => {
    const matchesSearch = proposal.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      proposal.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      proposal.project_code?.toLowerCase().includes(searchTerm.toLowerCase());

    if (viewMode === 'lead_time') {
      const hasDelivery = ['delivered', 'awaiting_contract', 'operational_start', 'execution_forwarded'].includes(proposal.status);
      return matchesSearch && hasDelivery;
    }

    const matchesStatus = statusFilter === 'all' || proposal.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const TimelineStep = ({
    date,
    label,
    icon: Icon,
    isLast = false,
  }: { date?: string | null, label: string, icon: any, isLast?: boolean }) => {
    const hasDate = !!date;

    return (
      <div className="relative flex gap-4 pb-8 last:pb-0">
        {!isLast && (
          <div className={`absolute top-8 left-[19px] w-0.5 h-[calc(100%-8px)] ${hasDate ? 'bg-green-500' : 'bg-gray-200'}`} />
        )}
        <div className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors ${hasDate ? 'bg-green-100 border-green-500 text-green-600' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex flex-col pt-1">
          <span className={`text-sm font-semibold ${hasDate ? 'text-gray-900' : 'text-gray-500'}`}>{label}</span>
          {hasDate ? (
            <span className="text-xs text-green-600 font-medium mt-0.5">
              {format(parseISO(date!), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground mt-0.5">Pendente</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">
          <div>
            <h1 className="text-3xl font-bold text-[#612cb5]">Propostas</h1>
            <p className="text-muted-foreground mt-1">
              {viewingProposal ? 'Detalhes da Proposta' : 'Gerencie o pipeline de propostas'}
            </p>
          </div>

          {!isAccountManager && (
            <Dialog open={isCreateOpen} onOpenChange={(open) => { setIsCreateOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button className="btn-glow bg-[#612cb5] hover:bg-[#502495] text-white">
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Proposta
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl bg-card border-border max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="text-foreground">Criar Nova Proposta</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Título *</Label>
                    <Input id="title" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} className="input-enhanced" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="project_code">Código do Projeto</Label>
                    <Input id="project_code" value={formData.project_code} onChange={e => setFormData({ ...formData, project_code: e.target.value })} className="input-enhanced font-mono" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="deadline">Prazo</Label>
                    <Input id="deadline" type="date" value={formData.deadline} onChange={e => setFormData({ ...formData, deadline: e.target.value })} className="input-enhanced" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Descrição</Label>
                    <Textarea id="description" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="input-enhanced min-h-[80px]" />
                  </div>

                  <div className="space-y-2 bg-secondary/20 p-3 rounded-lg border border-border/50">
                    <Label className="flex items-center gap-2 text-[#612cb5]"><LinkIcon className="h-4 w-4" /> Links Externos</Label>
                    <div className="flex gap-2">
                      <Input placeholder="Nome" value={newLink.name} onChange={e => setNewLink({ ...newLink, name: e.target.value })} className="flex-1 input-enhanced h-9 text-sm" />
                      <Input placeholder="URL" value={newLink.url} onChange={e => setNewLink({ ...newLink, url: e.target.value })} className="flex-[2] input-enhanced h-9 text-sm" />
                      <Button onClick={addLink} size="sm" variant="secondary" className="h-9">Adicionar</Button>
                    </div>
                    {links.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">{links.map((l, i) => <span key={i} className="text-xs bg-muted px-2 py-1 rounded border">{l.name}</span>)}</div>
                    )}
                  </div>
                  <div className="space-y-2 bg-secondary/20 p-3 rounded-lg border border-border/50">
                    <Label className="flex items-center gap-2 text-[#612cb5]"><Paperclip className="h-4 w-4" /> Arquivos Anexos</Label>
                    <Input type="file" onChange={handleFileUpload} disabled={isUploading} className="text-sm input-enhanced h-9" />
                    {attachments.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">{attachments.map((a, i) => <span key={i} className="text-xs bg-muted px-2 py-1 rounded border">{a.name}</span>)}</div>
                    )}
                  </div>

                  <div className="flex justify-end gap-3 pt-4">
                    <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
                    <Button onClick={handleCreate} className="btn-glow bg-[#612cb5] text-white">Criar Proposta</Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Filters */}
        <Card className="glass-card">
          <CardContent className="py-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar propostas (título ou código)..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-10 input-enhanced"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-48 input-enhanced">
                  <SelectValue placeholder="Filtrar por status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Status</SelectItem>
                  {statusOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Main Table */}
        <Card className="glass-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">Título / Código</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="text-muted-foreground">Última Justificativa</TableHead>
                <TableHead className="text-muted-foreground text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProposals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhuma proposta encontrada</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredProposals.map((proposal, index) => {
                  const isAutomationStatus = automationStatuses.includes(proposal.status);
                  const isLockedAwaitingCode = proposal.status === 'awaiting_code' && !proposal.project_code;

                  return (
                    <TableRow
                      key={proposal.id}
                      className="border-border data-table-row animate-slide-up cursor-pointer hover:bg-muted/30 transition-colors"
                      style={{ animationDelay: `${index * 30}ms` }}
                      onClick={() => setViewingProposal(proposal)}
                    >
                      <TableCell>
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            {proposal.project_code && (
                              <span className="text-[10px] font-mono font-bold text-[#612cb5] bg-[#612cb5]/10 px-1.5 py-0.5 rounded border border-[#612cb5]/20" title="Código do Projeto">
                                {proposal.project_code}
                              </span>
                            )}
                            <p className="font-medium text-foreground">{proposal.title}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {isAccountManager || isAutomationStatus || isLockedAwaitingCode ? (
                          <div title={
                            isAccountManager ? "Sem permissão" :
                              isLockedAwaitingCode ? "Aguarde a geração do código" :
                                "Status controlado via automação"
                          }>
                            {isLockedAwaitingCode ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex items-center gap-2 cursor-not-allowed opacity-80">
                                      <StatusBadge status={proposal.status} />
                                      <Lock className="w-3 h-3 text-muted-foreground" />
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Aguardando geração automática do código</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <StatusBadge status={proposal.status} />
                            )}
                          </div>
                        ) : (
                          <Select
                            value={proposal.status}
                            onValueChange={(value) => handleStatusChangeRequest(proposal, value as ProposalStatus)}
                          >
                            <SelectTrigger className="w-36 border-0 bg-transparent p-0 h-auto focus:ring-0">
                              <StatusBadge status={proposal.status} />
                            </SelectTrigger>
                            <SelectContent>
                              {statusOptions
                                .filter(opt => !automationStatuses.includes(opt.value))
                                .map(option => (
                                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))
                              }
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-muted-foreground text-sm max-w-[200px]" title={proposal.last_justification || 'Sem justificativa'}>
                          <MessageSquare className="h-3 w-3 shrink-0" />
                          <span className="truncate">
                            {proposal.last_justification || '-'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={() => setViewingProposal(proposal)} title="Visualizar">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <AuditHistoryDrawer
                            entityType="proposal"
                            entityId={proposal.id}
                            trigger={
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <History className="h-4 w-4" />
                              </Button>
                            }
                          />
                          {!isAccountManager && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openEdit(proposal)}>
                                  <Edit className="h-4 w-4 mr-2" /> Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => handleDelete(proposal.id)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" /> Excluir
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>

        {/* --- DETAILED VIEW MODAL --- */}
        <Dialog open={!!viewingProposal} onOpenChange={() => setViewingProposal(null)}>
          <DialogContent className="sm:max-w-5xl bg-card border-border h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
            {viewingProposal && (
              <>
                {/* Header Reformulado */}
                <div className="px-6 py-5 border-b bg-gray-50/50 shrink-0">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        {viewingProposal.project_code && (
                          <span className="text-xs font-mono font-bold text-[#612cb5] bg-[#612cb5]/10 px-2 py-0.5 rounded border border-[#612cb5]/20">
                            {viewingProposal.project_code}
                          </span>
                        )}
                        <DialogTitle className="text-2xl font-bold text-[#612cb5] leading-none">{viewingProposal.title}</DialogTitle>
                      </div>
                      <StatusBadge status={viewingProposal.status} />
                    </div>
                  </div>

                  <div className="flex gap-8 text-sm border-t pt-3 mt-1 border-gray-200">
                    <div className="flex flex-col">
                      <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Entrada</span>
                      <span className="font-medium text-gray-700">{format(new Date(viewingProposal.entry_date), "dd/MM/yyyy 'às' HH:mm")}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Prazo</span>
                      <span className={`font-medium ${viewingProposal.deadline && new Date(viewingProposal.deadline) < new Date() && viewingProposal.status !== 'delivered' ? 'text-red-600' : 'text-gray-700'}`}>
                        {viewingProposal.deadline ? format(new Date(viewingProposal.deadline), "dd/MM/yyyy") : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                  {/* Lead Time Metrics Grid (Carregado via Logs) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    {isLoadingLogs ? (
                      <div className="col-span-4 text-center py-4 text-muted-foreground text-sm animate-pulse">Carregando histórico...</div>
                    ) : (
                      getProposalMetricsFromLogs(viewingProposal, viewingProposalLogs).map((metric, idx) => (
                        <div key={idx} className={`border rounded-xl p-3 flex flex-col items-center text-center shadow-sm ${metric.valid ? metric.color : 'bg-gray-50 text-gray-400 border-gray-100'}`}>
                          <span className="text-[10px] uppercase tracking-wider font-bold mb-1 opacity-80">{metric.label}</span>
                          {metric.valid ? (
                            renderMetricValue(metric.minutes)
                          ) : (
                            <span className="text-lg font-mono text-gray-300">--</span>
                          )}
                          {/* Adicionado Subtítulo da Métrica no Modal */}
                          <span className="text-[10px] text-gray-500 font-medium mt-1 uppercase tracking-tight">{metric.subtitle}</span>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Column: Proposal Details */}
                    <div className="lg:col-span-2 space-y-6">
                      <div className="space-y-4">
                        <div>
                          <h4 className="flex items-center gap-2 font-semibold text-gray-900 mb-2">
                            <FileText className="w-4 h-4 text-[#612cb5]" /> Descrição
                          </h4>
                          <div className="bg-gray-50 p-4 rounded-lg border text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                            {viewingProposal.description || "Sem descrição."}
                          </div>
                        </div>

                        {(viewingProposal.pre_analysis || viewingProposal.pre_proposal) && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {viewingProposal.pre_analysis && (
                              <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100">
                                <h5 className="font-semibold text-xs text-blue-700 uppercase mb-1">Pré-Análise</h5>
                                <p className="text-sm text-gray-700">{viewingProposal.pre_analysis}</p>
                              </div>
                            )}
                            {viewingProposal.pre_proposal && (
                              <div className="bg-purple-50/50 p-3 rounded-lg border border-purple-100">
                                <h5 className="font-semibold text-xs text-purple-700 uppercase mb-1">Pré-Proposta</h5>
                                <p className="text-sm text-gray-700">{viewingProposal.pre_proposal}</p>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {/* Links */}
                          <div className="border rounded-lg p-3">
                            <h4 className="font-semibold text-xs text-gray-500 uppercase mb-3 flex items-center gap-2">
                              <LinkIcon className="h-3 w-3" /> Links Externos
                            </h4>
                            {viewingProposal.links && viewingProposal.links.length > 0 ? (
                              <ul className="space-y-2">
                                {viewingProposal.links.map((link, idx) => (
                                  <li key={idx} className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                                    <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline truncate">
                                      {link.name}
                                    </a>
                                  </li>
                                ))}
                              </ul>
                            ) : <span className="text-xs text-gray-400 italic">Nenhum link.</span>}
                          </div>

                          {/* Attachments */}
                          <div className="border rounded-lg p-3">
                            <h4 className="font-semibold text-xs text-gray-500 uppercase mb-3 flex items-center gap-2">
                              <Paperclip className="h-3 w-3" /> Anexos
                            </h4>
                            {/* @ts-ignore */}
                            {viewingProposal.attachments && viewingProposal.attachments.length > 0 ? (
                              <ul className="space-y-2">
                                {/* @ts-ignore */}
                                {viewingProposal.attachments.map((att, idx) => (
                                  <li key={idx} className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                                    <a href={att.url} target="_blank" rel="noopener noreferrer" className="text-sm text-gray-700 hover:underline truncate">
                                      {att.name}
                                    </a>
                                  </li>
                                ))}
                              </ul>
                            ) : <span className="text-xs text-gray-400 italic">Nenhum anexo.</span>}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right Column: Timeline */}
                    <div className="lg:border-l lg:pl-8">
                      <h4 className="font-semibold text-gray-900 mb-6 flex items-center gap-2">
                        <History className="w-4 h-4 text-[#612cb5]" /> Linha do Tempo
                      </h4>
                      <div className="space-y-0">
                        <TimelineStep
                          label="Solicitação Recebida"
                          date={viewingProposal.entry_date}
                          icon={Clock}
                        />

                        <TimelineStep
                          label="Código Gerado (Novo)"
                          date={getTimestampFromLogs('new', viewingProposalLogs)}
                          icon={Binary}
                        />

                        {/* Etapa Construção (Regra 4) */}
                        <TimelineStep
                          label="Em Construção"
                          date={getTimestampFromLogs('construction', viewingProposalLogs)}
                          icon={Hammer}
                        />

                        <TimelineStep
                          label="Proposta Enviada"
                          date={getTimestampFromLogs('delivered', viewingProposalLogs)}
                          icon={ArrowRight}
                        />

                        <TimelineStep
                          label="Aguard. Assinatura"
                          date={getTimestampFromLogs('awaiting_contract', viewingProposalLogs)}
                          icon={PenTool}
                        />

                        <TimelineStep
                          label="Start Operacional"
                          date={getTimestampFromLogs('operational_start', viewingProposalLogs)}
                          icon={CheckCircle2}
                        />

                        <TimelineStep
                          label="Encaminhado p/ Execução"
                          date={getTimestampFromLogs('execution_forwarded', viewingProposalLogs)}
                          icon={CalendarClock}
                          isLast={true}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 border-t bg-gray-50 flex justify-end gap-3 shrink-0">
                  <Button variant="outline" onClick={() => setViewingProposal(null)}>Fechar</Button>
                  {!isAccountManager && (
                    <Button onClick={() => { setViewingProposal(null); if (viewingProposal) openEdit(viewingProposal); }} className="bg-[#612cb5] text-white">
                      Editar Proposta
                    </Button>
                  )}
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Status Change Dialog */}
        <Dialog open={!!pendingStatusChange} onOpenChange={(open) => !open && setPendingStatusChange(null)}>
          <DialogContent className="bg-card">
            <DialogHeader>
              <DialogTitle className="text-[#612cb5]">Justificativa de Alteração</DialogTitle>
              <DialogDescription>
                Mudando de <strong>{pendingStatusChange?.proposal.status === 'edited' ? 'Editado' : pendingStatusChange?.proposal.status}</strong> para <strong>{pendingStatusChange?.newStatus}</strong>.
              </DialogDescription>
            </DialogHeader>
            <div className="py-2">
              <Textarea
                placeholder="Descreva o motivo da alteração de status..."
                value={justification}
                onChange={e => setJustification(e.target.value)}
                className="input-enhanced min-h-[100px]"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPendingStatusChange(null)}>Cancelar</Button>
              <Button
                className="bg-[#612cb5] text-white hover:bg-[#502495]"
                onClick={() => pendingStatusChange && executeStatusChange(pendingStatusChange.proposal, pendingStatusChange.newStatus, justification)}
                disabled={!justification.trim()}
              >
                Confirmar Alteração
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        {!isAccountManager && (
          <Dialog open={!!editingProposal} onOpenChange={() => setEditingProposal(null)}>
            <DialogContent className="sm:max-w-2xl bg-card border-border max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-foreground">Editar Proposta</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-title">Título *</Label>
                  <Input id="edit-title" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} className="input-enhanced" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-project_code">Código do Projeto</Label>
                  <Input id="edit-project_code" value={formData.project_code} onChange={e => setFormData({ ...formData, project_code: e.target.value })} className="input-enhanced font-mono" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-deadline">Prazo</Label>
                  <Input id="edit-deadline" type="date" value={formData.deadline} onChange={e => setFormData({ ...formData, deadline: e.target.value })} className="input-enhanced" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-description">Descrição</Label>
                  <Textarea id="edit-description" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="input-enhanced min-h-[80px]" />
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button variant="outline" onClick={() => setEditingProposal(null)}>Cancelar</Button>
                  <Button onClick={handleUpdate} className="btn-glow bg-[#612cb5] text-white">Salvar Alterações</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </MainLayout>
  );
}