import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Plus, Search, History, MoreHorizontal, FileText, Trash2, Edit, Paperclip, X } from 'lucide-react';
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

const statusOptions: { value: ProposalStatus; label: string }[] = [
  { value: 'new', label: 'Novo' },
  { value: 'understanding', label: 'Entendimento' },
  { value: 'construction', label: 'Construção' },
  { value: 'cancelled', label: 'Cancelado' },
  { value: 'delivered', label: 'Entregue' },
];

interface Attachment {
  name: string;
  url: string;
  type: string;
}

export default function Proposals() {
  const { user } = useAuth();
  const { logAudit } = useAuditLog();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingProposal, setEditingProposal] = useState<Proposal | null>(null);

  // Status Justification State
  const [pendingStatusChange, setPendingStatusChange] = useState<{ proposal: Proposal, newStatus: ProposalStatus } | null>(null);
  const [justification, setJustification] = useState('');

  // Attachments State for Forms
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    pre_analysis: '',
    pre_proposal: '',
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
          attachments: attachments,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      await logAudit({
        action: 'created',
        entityType: 'proposal',
        entityId: data.id,
        newStatus: 'new',
      });

      setProposals([data as Proposal, ...proposals]);
      setFormData({ title: '', description: '', pre_analysis: '', pre_proposal: '' });
      setAttachments([]);
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
          attachments: attachments,
        })
        .eq('id', editingProposal.id)
        .select()
        .single();

      if (error) throw error;

      await logAudit({
        action: 'updated',
        entityType: 'proposal',
        entityId: data.id,
      });

      setProposals(proposals.map(p => p.id === data.id ? data as Proposal : p));
      setEditingProposal(null);
      setFormData({ title: '', description: '', pre_analysis: '', pre_proposal: '' });
      setAttachments([]);
      toast.success('Proposta atualizada com sucesso');
    } catch (error) {
      console.error('Erro ao atualizar proposta:', error);
      toast.error('Falha ao atualizar proposta');
    }
  };

  const handleStatusChangeRequest = (proposal: Proposal, newStatus: ProposalStatus) => {
    const previousStatus = proposal.status;

    // Regra: Se estava 'delivered' e vai sair de 'delivered', exige justificativa
    if (previousStatus === 'delivered' && newStatus !== 'delivered') {
      setPendingStatusChange({ proposal, newStatus });
      setJustification('');
      return;
    }

    // Caso normal
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
    try {
      const { error } = await supabase.from('proposals').delete().eq('id', id);
      if (error) throw error;

      await logAudit({
        action: 'deleted',
        entityType: 'proposal',
        entityId: id,
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
    });
    // @ts-ignore
    setAttachments(proposal.attachments || []);
  };

  // Filter proposals
  const filteredProposals = proposals.filter(proposal => {
    const matchesSearch = proposal.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      proposal.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || proposal.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

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
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">
          <div>
            <h1 className="text-3xl font-bold text-[#612cb5]">Propostas</h1>
            <p className="text-muted-foreground mt-1">Gerencie o pipeline de propostas</p>
          </div>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="btn-glow bg-[#612cb5] hover:bg-[#502495] text-white">
                <Plus className="h-4 w-4 mr-2" />
                Nova Proposta
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl bg-card border-border">
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

                <div className="space-y-2">
                  <Label>Anexos</Label>
                  <div className="flex items-center gap-2">
                    <Input type="file" onChange={handleFileUpload} disabled={isUploading} className="text-sm input-enhanced" />
                    {isUploading && <span className="text-xs text-muted-foreground animate-pulse">Enviando...</span>}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {attachments.map((att, idx) => (
                      <div key={idx} className="flex items-center gap-1 bg-secondary px-3 py-1.5 rounded-md text-xs border border-border">
                        <Paperclip className="h-3 w-3 text-primary" />
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
                <TableHead className="text-muted-foreground">Anexos</TableHead>
                <TableHead className="text-muted-foreground">Data de Entrada</TableHead>
                <TableHead className="text-muted-foreground">Data de Entrega</TableHead>
                <TableHead className="text-muted-foreground text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProposals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhuma proposta encontrada</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredProposals.map((proposal, index) => (
                  <TableRow
                    key={proposal.id}
                    className="border-border data-table-row animate-slide-up"
                    style={{ animationDelay: `${index * 30}ms` }}
                  >
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">{proposal.title}</p>
                        {proposal.description && (
                          <p className="text-sm text-muted-foreground line-clamp-1">{proposal.description}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
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
                    </TableCell>
                    <TableCell>
                      {/* @ts-ignore */}
                      {(proposal.attachments && proposal.attachments.length > 0) ? (
                        <div className="flex items-center gap-1 text-muted-foreground text-xs bg-secondary/50 px-2 py-1 rounded w-fit">
                          <Paperclip className="h-3 w-3" /> <span className="font-medium">{(proposal.attachments as any[]).length}</span>
                        </div>
                      ) : <span className="text-muted-foreground text-xs pl-2">-</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(proposal.entry_date), "d 'de' MMM, yyyy", { locale: ptBR })}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {proposal.delivery_date
                        ? format(new Date(proposal.delivery_date), "d 'de' MMM, yyyy", { locale: ptBR })
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
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
                ))
              )}
            </TableBody>
          </Table>
        </Card>

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
          <DialogContent className="sm:max-w-2xl bg-card border-border">
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

              <div className="space-y-2">
                <Label>Anexos</Label>
                <div className="flex items-center gap-2">
                  <Input type="file" onChange={handleFileUpload} disabled={isUploading} className="text-sm input-enhanced" />
                  {isUploading && <span className="text-xs text-muted-foreground animate-pulse">Enviando...</span>}
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {attachments.map((att, idx) => (
                    <div key={idx} className="flex items-center gap-1 bg-secondary px-3 py-1.5 rounded-md text-xs border border-border">
                      <a href={att.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:underline text-primary">
                        <Paperclip className="h-3 w-3" />
                        <span className="max-w-[150px] truncate">{att.name}</span>
                      </a>
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