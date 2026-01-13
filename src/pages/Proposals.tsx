import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Plus, Search, History, MoreHorizontal, FileText, Trash2, Edit,
  Paperclip, X, Link as LinkIcon, ExternalLink, Eye
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
import { toast } from 'sonner';
import { Proposal, ProposalStatus } from '@/types/database';

// Status disponíveis para seleção manual na plataforma.
// "awaiting_contract" e "operational_start" não estão aqui pois só podem ser alterados via API.
// Novos status adicionados: in_review, awaiting_code
const statusOptions: { value: ProposalStatus; label: string }[] = [
  { value: 'new', label: 'Novo' },
  { value: 'understanding', label: 'Entendimento' },
  { value: 'construction', label: 'Construção' },
  { value: 'in_review', label: 'Em Revisão' },
  { value: 'awaiting_code', label: 'Aguardando Código' },
  { value: 'cancelled', label: 'Cancelado' },
  { value: 'delivered', label: 'Entregue' },
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
  const { user } = useAuth();
  const { logAudit } = useAuditLog();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modais
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingProposal, setEditingProposal] = useState<Proposal | null>(null);
  const [viewingProposal, setViewingProposal] = useState<Proposal | null>(null);

  // Status Justification State
  const [pendingStatusChange, setPendingStatusChange] = useState<{ proposal: Proposal, newStatus: ProposalStatus } | null>(null);
  const [justification, setJustification] = useState('');

  // Attachments & Links State for Forms
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [links, setLinks] = useState<ExternalLinkItem[]>([]);
  const [newLink, setNewLink] = useState({ name: '', url: '' });
  const [isUploading, setIsUploading] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    pre_analysis: '',
    pre_proposal: '',
    deadline: '',
  });

  useEffect(() => {
    fetchProposals();
  }, []);

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

  const removeAttachment = (index: number) => {
    const newAtt = [...attachments];
    newAtt.splice(index, 1);
    setAttachments(newAtt);
  };

  const addLink = () => {
    if (!newLink.name || !newLink.url) {
      toast.error('Preencha nome e URL do link');
      return;
    }
    setLinks([...links, newLink]);
    setNewLink({ name: '', url: '' });
  };

  const removeLink = (index: number) => {
    const newLnks = [...links];
    newLnks.splice(index, 1);
    setLinks(newLnks);
  };

  const handleCreate = async () => {
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
          pre_analysis: formData.pre_analysis,
          pre_proposal: formData.pre_proposal,
          deadline: formData.deadline || null,
          attachments: attachments,
          links: links,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      await logAudit({
        action: 'created',
        entityType: 'proposal',
        entityId: data.id,
        entityTitle: data.title,
        newStatus: 'new',
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
    if (!editingProposal || !formData.title.trim()) return;

    try {
      const { data, error } = await supabase
        .from('proposals')
        .update({
          title: formData.title,
          description: formData.description,
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
    setFormData({ title: '', description: '', pre_analysis: '', pre_proposal: '', deadline: '' });
    setAttachments([]);
    setLinks([]);
    setNewLink({ name: '', url: '' });
  };

  const handleStatusChangeRequest = (proposal: Proposal, newStatus: ProposalStatus) => {
    const previousStatus = proposal.status;

    if (previousStatus === 'delivered' && newStatus !== 'delivered') {
      setPendingStatusChange({ proposal, newStatus });
      setJustification('');
      return;
    }

    executeStatusChange(proposal, newStatus);
  };

  const executeStatusChange = async (proposal: Proposal, newStatus: ProposalStatus, justify?: string) => {
    const previousStatus = proposal.status;

    try {
      const { data, error } = await supabase
        .from('proposals')
        .update({ status: newStatus })
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
    setEditingProposal(proposal);
    setFormData({
      title: proposal.title,
      description: proposal.description || '',
      pre_analysis: proposal.pre_analysis || '',
      pre_proposal: proposal.pre_proposal || '',
      deadline: proposal.deadline ? new Date(proposal.deadline).toISOString().split('T')[0] : '',
    });
    // @ts-ignore
    setAttachments(proposal.attachments || []);
    setLinks(proposal.links || []);
  };

  // Filter proposals
  const filteredProposals = proposals.filter(proposal => {
    const matchesSearch = proposal.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      proposal.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || proposal.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">
          <div>
            <h1 className="text-3xl font-bold text-[#612cb5]">Propostas</h1>
            <p className="text-muted-foreground mt-1">Gerencie o pipeline de propostas</p>
          </div>

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
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Digite o título da proposta"
                    className="input-enhanced"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="deadline">Prazo de Entrega</Label>
                    <Input
                      id="deadline"
                      type="date"
                      value={formData.deadline}
                      onChange={e => setFormData({ ...formData, deadline: e.target.value })}
                      className="input-enhanced"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Descrição</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Breve descrição da proposta"
                    className="input-enhanced min-h-[80px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pre_analysis">Pré-Análise</Label>
                  <Textarea
                    id="pre_analysis"
                    value={formData.pre_analysis}
                    onChange={e => setFormData({ ...formData, pre_analysis: e.target.value })}
                    placeholder="Análise inicial e descobertas"
                    className="input-enhanced min-h-[80px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pre_proposal">Pré-Proposta</Label>
                  <Textarea
                    id="pre_proposal"
                    value={formData.pre_proposal}
                    onChange={e => setFormData({ ...formData, pre_proposal: e.target.value })}
                    placeholder="Conteúdo preliminar da proposta"
                    className="input-enhanced min-h-[80px]"
                  />
                </div>

                {/* Links Section */}
                <div className="space-y-2 bg-secondary/20 p-3 rounded-lg border border-border/50">
                  <Label className="flex items-center gap-2 text-[#612cb5]"><LinkIcon className="h-4 w-4" /> Links Externos</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Nome do link (ex: Figma)"
                      value={newLink.name}
                      onChange={e => setNewLink({ ...newLink, name: e.target.value })}
                      className="flex-1 input-enhanced h-9 text-sm"
                    />
                    <Input
                      placeholder="URL (https://...)"
                      value={newLink.url}
                      onChange={e => setNewLink({ ...newLink, url: e.target.value })}
                      className="flex-[2] input-enhanced h-9 text-sm"
                    />
                    <Button onClick={addLink} size="sm" variant="secondary" className="h-9">Adicionar</Button>
                  </div>
                  {links.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {links.map((link, idx) => (
                        <div key={idx} className="flex items-center gap-1 bg-background px-3 py-1.5 rounded-md text-xs border border-border shadow-sm">
                          <ExternalLink className="h-3 w-3 text-primary" />
                          <a href={link.url} target="_blank" rel="noopener noreferrer" className="hover:underline text-primary truncate max-w-[150px]">
                            {link.name}
                          </a>
                          <button onClick={() => removeLink(idx)} className="hover:text-destructive transition-colors ml-1"><X className="h-3 w-3" /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Attachments Section */}
                <div className="space-y-2 bg-secondary/20 p-3 rounded-lg border border-border/50">
                  <Label className="flex items-center gap-2 text-[#612cb5]"><Paperclip className="h-4 w-4" /> Arquivos Anexos</Label>
                  <div className="flex items-center gap-2">
                    <Input type="file" onChange={handleFileUpload} disabled={isUploading} className="text-sm input-enhanced h-9" />
                    {isUploading && <span className="text-xs text-muted-foreground animate-pulse">Enviando...</span>}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {attachments.map((att, idx) => (
                      <div key={idx} className="flex items-center gap-1 bg-background px-3 py-1.5 rounded-md text-xs border border-border shadow-sm">
                        <FileText className="h-3 w-3 text-muted-foreground" />
                        <span className="max-w-[150px] truncate">{att.name}</span>
                        <button onClick={() => removeAttachment(idx)} className="hover:text-destructive transition-colors ml-1"><X className="h-3 w-3" /></button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
                  <Button onClick={handleCreate} className="btn-glow bg-[#612cb5] text-white">Criar Proposta</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
        <Card className="glass-card">
          <CardContent className="py-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar propostas..."
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
                  {/* Incluir opções de API apenas para filtro caso existam */}
                  <SelectItem value="awaiting_contract">Aguard. Contrato</SelectItem>
                  <SelectItem value="operational_start">Start Operacional</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="glass-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">Título</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="text-muted-foreground">Docs</TableHead>
                <TableHead className="text-muted-foreground">Prazo</TableHead>
                <TableHead className="text-muted-foreground">Data de Entrada</TableHead>
                <TableHead className="text-muted-foreground">Data de Entrega</TableHead>
                <TableHead className="text-muted-foreground text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProposals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhuma proposta encontrada</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredProposals.map((proposal, index) => {
                  // Verificar se o status atual é um dos restritos (API)
                  const isRestrictedStatus = ['awaiting_contract', 'operational_start'].includes(proposal.status);

                  return (
                    <TableRow
                      key={proposal.id}
                      className="border-border data-table-row animate-slide-up cursor-pointer hover:bg-muted/30 transition-colors"
                      style={{ animationDelay: `${index * 30}ms` }}
                      onClick={() => setViewingProposal(proposal)}
                    >
                      <TableCell>
                        <div>
                          <p className="font-medium text-foreground">{proposal.title}</p>
                          {proposal.description && (
                            <p className="text-sm text-muted-foreground line-clamp-1">{proposal.description}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {isRestrictedStatus ? (
                          <div title="Alteração permitida apenas via API">
                            <StatusBadge status={proposal.status} />
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
                              {statusOptions.map(option => (
                                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {/* @ts-ignore */}
                          {(proposal.attachments && proposal.attachments.length > 0) && (
                            <div className="flex items-center gap-1 text-muted-foreground text-xs bg-secondary/50 px-2 py-1 rounded w-fit" title={`${proposal.attachments.length} anexos`}>
                              <Paperclip className="h-3 w-3" /> <span className="font-medium">{proposal.attachments.length}</span>
                            </div>
                          )}
                          {(proposal.links && proposal.links.length > 0) && (
                            <div className="flex items-center gap-1 text-[#612cb5] text-xs bg-[#612cb5]/10 px-2 py-1 rounded w-fit" title={`${proposal.links.length} links`}>
                              <LinkIcon className="h-3 w-3" /> <span className="font-medium">{proposal.links.length}</span>
                            </div>
                          )}
                          {!proposal.attachments?.length && !proposal.links?.length && <span className="text-muted-foreground text-xs pl-2">-</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-foreground font-medium">
                        {proposal.deadline ? (
                          <span className={new Date(proposal.deadline) < new Date() && proposal.status !== 'delivered' ? 'text-destructive' : ''}>
                            {format(new Date(proposal.deadline), "dd/MM/yyyy")}
                          </span>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(proposal.entry_date), "dd/MM/yyyy", { locale: ptBR })}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {proposal.delivery_date
                          ? format(new Date(proposal.delivery_date), "dd/MM/yyyy", { locale: ptBR })
                          : '—'}
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
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEdit(proposal)}>
                                <Edit className="h-4 w-4 mr-2" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => handleDelete(proposal.id)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>

        {/* View Details Dialog */}
        <Dialog open={!!viewingProposal} onOpenChange={() => setViewingProposal(null)}>
          <DialogContent className="sm:max-w-2xl bg-card border-border max-h-[85vh] overflow-y-auto">
            <DialogHeader className="border-b border-border pb-4">
              <div className="flex justify-between items-start">
                <div>
                  <DialogTitle className="text-xl text-[#612cb5] mb-1">{viewingProposal?.title}</DialogTitle>
                  {viewingProposal && <StatusBadge status={viewingProposal.status} />}
                </div>
                <div className="text-right text-xs text-muted-foreground space-y-1">
                  <div>Entrada: {viewingProposal && format(new Date(viewingProposal.entry_date), "dd/MM/yyyy")}</div>
                  <div>Prazo: {viewingProposal?.deadline ? format(new Date(viewingProposal.deadline), "dd/MM/yyyy") : 'Não definido'}</div>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {viewingProposal?.description && (
                <div>
                  <h4 className="font-semibold text-sm text-foreground mb-1">Descrição</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{viewingProposal.description}</p>
                </div>
              )}

              {viewingProposal?.pre_analysis && (
                <div className="bg-secondary/20 p-3 rounded-lg">
                  <h4 className="font-semibold text-sm text-foreground mb-1">Pré-Análise</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{viewingProposal.pre_analysis}</p>
                </div>
              )}

              {viewingProposal?.pre_proposal && (
                <div className="bg-secondary/20 p-3 rounded-lg">
                  <h4 className="font-semibold text-sm text-foreground mb-1">Pré-Proposta</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{viewingProposal.pre_proposal}</p>
                </div>
              )}

              {/* Docs & Links Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                {viewingProposal?.links && viewingProposal.links.length > 0 && (
                  <div className="border border-border rounded-lg p-3">
                    <h4 className="font-semibold text-xs text-[#612cb5] uppercase mb-2 flex items-center gap-1"><LinkIcon className="h-3 w-3" /> Links</h4>
                    <ul className="space-y-1">
                      {viewingProposal.links.map((link, idx) => (
                        <li key={idx} className="text-sm truncate">
                          <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                            <ExternalLink className="h-3 w-3" /> {link.name}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* @ts-ignore */}
                {viewingProposal?.attachments && viewingProposal.attachments.length > 0 && (
                  <div className="border border-border rounded-lg p-3">
                    <h4 className="font-semibold text-xs text-[#612cb5] uppercase mb-2 flex items-center gap-1"><Paperclip className="h-3 w-3" /> Anexos</h4>
                    <ul className="space-y-1">
                      {/* @ts-ignore */}
                      {viewingProposal.attachments.map((att, idx) => (
                        <li key={idx} className="text-sm truncate">
                          <a href={att.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                            <FileText className="h-3 w-3" /> {att.name}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="border-t border-border pt-4">
              <Button variant="outline" onClick={() => setViewingProposal(null)}>Fechar</Button>
              <Button onClick={() => { setViewingProposal(null); if (viewingProposal) openEdit(viewingProposal); }} className="bg-[#612cb5] text-white">Editar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Justification Dialog for Regression from Delivered */}
        <Dialog open={!!pendingStatusChange} onOpenChange={(open) => !open && setPendingStatusChange(null)}>
          <DialogContent className="bg-card">
            <DialogHeader>
              <DialogTitle className="text-[#612cb5]">Justificativa Necessária</DialogTitle>
              <DialogDescription>
                Esta proposta já foi marcada como <strong>Entregue</strong>. Para retornar a um estágio anterior, é obrigatório fornecer uma justificativa que ficará registrada nos logs de auditoria.
              </DialogDescription>
            </DialogHeader>
            <div className="py-2">
              <Textarea
                placeholder="Descreva o motivo do retorno (ex: Cliente solicitou alteração de escopo, Erro na homologação...)"
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
                Confirmar Retorno
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={!!editingProposal} onOpenChange={() => setEditingProposal(null)}>
          <DialogContent className="sm:max-w-2xl bg-card border-border max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-foreground">Editar Proposta</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-title">Título *</Label>
                <Input
                  id="edit-title"
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  className="input-enhanced"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-deadline">Prazo de Entrega</Label>
                  <Input
                    id="edit-deadline"
                    type="date"
                    value={formData.deadline}
                    onChange={e => setFormData({ ...formData, deadline: e.target.value })}
                    className="input-enhanced"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-description">Descrição</Label>
                <Textarea
                  id="edit-description"
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="input-enhanced min-h-[80px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-pre_analysis">Pré-Análise</Label>
                <Textarea
                  id="edit-pre_analysis"
                  value={formData.pre_analysis}
                  onChange={e => setFormData({ ...formData, pre_analysis: e.target.value })}
                  className="input-enhanced min-h-[80px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-pre_proposal">Pré-Proposta</Label>
                <Textarea
                  id="edit-pre_proposal"
                  value={formData.pre_proposal}
                  onChange={e => setFormData({ ...formData, pre_proposal: e.target.value })}
                  className="input-enhanced min-h-[80px]"
                />
              </div>

              {/* Edit Links Section */}
              <div className="space-y-2 bg-secondary/20 p-3 rounded-lg border border-border/50">
                <Label className="flex items-center gap-2 text-[#612cb5]"><LinkIcon className="h-4 w-4" /> Links Externos</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Nome do link"
                    value={newLink.name}
                    onChange={e => setNewLink({ ...newLink, name: e.target.value })}
                    className="flex-1 input-enhanced h-9 text-sm"
                  />
                  <Input
                    placeholder="URL"
                    value={newLink.url}
                    onChange={e => setNewLink({ ...newLink, url: e.target.value })}
                    className="flex-[2] input-enhanced h-9 text-sm"
                  />
                  <Button onClick={addLink} size="sm" variant="secondary" className="h-9">Adicionar</Button>
                </div>
                {links.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {links.map((link, idx) => (
                      <div key={idx} className="flex items-center gap-1 bg-background px-3 py-1.5 rounded-md text-xs border border-border shadow-sm">
                        <ExternalLink className="h-3 w-3 text-primary" />
                        <a href={link.url} target="_blank" rel="noopener noreferrer" className="hover:underline text-primary truncate max-w-[150px]">
                          {link.name}
                        </a>
                        <button onClick={() => removeLink(idx)} className="hover:text-destructive transition-colors ml-1"><X className="h-3 w-3" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2 bg-secondary/20 p-3 rounded-lg border border-border/50">
                <Label className="flex items-center gap-2 text-[#612cb5]"><Paperclip className="h-4 w-4" /> Arquivos Anexos</Label>
                <div className="flex items-center gap-2">
                  <Input type="file" onChange={handleFileUpload} disabled={isUploading} className="text-sm input-enhanced h-9" />
                  {isUploading && <span className="text-xs text-muted-foreground animate-pulse">Enviando...</span>}
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {attachments.map((att, idx) => (
                    <div key={idx} className="flex items-center gap-1 bg-background px-3 py-1.5 rounded-md text-xs border border-border shadow-sm">
                      <FileText className="h-3 w-3 text-muted-foreground" />
                      <span className="max-w-[150px] truncate">{att.name}</span>
                      <button onClick={() => removeAttachment(idx)} className="hover:text-destructive transition-colors ml-1"><X className="h-3 w-3" /></button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => setEditingProposal(null)}>Cancelar</Button>
                <Button onClick={handleUpdate} className="btn-glow bg-[#612cb5] text-white">Salvar Alterações</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}