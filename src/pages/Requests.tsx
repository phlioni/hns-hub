import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Plus, Search, MoreHorizontal, Inbox, Trash2, Edit, History, User, Paperclip, FileText, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuditLog } from '@/hooks/useAuditLog';
import { MainLayout } from '@/components/layout/MainLayout';
import { StatusBadge, PriorityBadge } from '@/components/ui/status-badge';
import { AuditHistoryDrawer } from '@/components/AuditHistoryDrawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { Request as RequestType, RequestStatus, RequestPriority, Profile } from '@/types/database';

const statusOptions: { value: RequestStatus; label: string }[] = [
  { value: 'pending', label: 'Pendente' },
  { value: 'in_progress', label: 'Em Andamento' },
  { value: 'done', label: 'Concluído' },
];

const priorityOptions: { value: RequestPriority; label: string }[] = [
  { value: 'low', label: 'Baixa' },
  { value: 'medium', label: 'Média' },
  { value: 'high', label: 'Alta' },
];

interface Attachment {
  name: string;
  url: string;
  type: string;
}

export default function Requests() {
  const { logAudit } = useAuditLog();
  const [requests, setRequests] = useState<RequestType[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState<RequestType | null>(null);

  // Attachment State
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    requester_name: '',
    description: '',
    assignee_id: 'unassigned',
    priority: 'medium' as RequestPriority,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [requestsRes, profilesRes] = await Promise.all([
        supabase.from('requests').select('*').order('created_at', { ascending: false }),
        supabase.from('profiles').select('*'),
      ]);

      if (requestsRes.data) setRequests(requestsRes.data as RequestType[]);
      if (profilesRes.data) setProfiles(profilesRes.data as Profile[]);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Falha ao carregar solicitações');
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
    const filePath = `requests/${fileName}`;

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
    if (!formData.requester_name.trim() || !formData.description.trim()) {
      toast.error('Nome do solicitante e descrição são obrigatórios');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('requests')
        .insert({
          requester_name: formData.requester_name,
          description: formData.description,
          assignee_id: formData.assignee_id === 'unassigned' ? null : formData.assignee_id,
          priority: formData.priority,
          attachments: attachments,
        })
        .select()
        .single();

      if (error) throw error;

      await logAudit({
        action: 'created',
        entityType: 'request',
        entityId: data.id,
        entityTitle: data.requester_name, // TITULO
        newStatus: 'pending',
      });

      setRequests([data as RequestType, ...requests]);
      setFormData({ requester_name: '', description: '', assignee_id: 'unassigned', priority: 'medium' });
      setAttachments([]);
      setIsCreateOpen(false);
      toast.success('Solicitação criada com sucesso');
    } catch (error) {
      console.error('Erro ao criar solicitação:', error);
      toast.error('Falha ao criar solicitação');
    }
  };

  const handleUpdate = async () => {
    if (!editingRequest || !formData.requester_name.trim() || !formData.description.trim()) return;

    try {
      const { data, error } = await supabase
        .from('requests')
        .update({
          requester_name: formData.requester_name,
          description: formData.description,
          assignee_id: formData.assignee_id === 'unassigned' ? null : formData.assignee_id,
          priority: formData.priority,
          attachments: attachments,
        })
        .eq('id', editingRequest.id)
        .select()
        .single();

      if (error) throw error;

      await logAudit({
        action: 'updated',
        entityType: 'request',
        entityId: data.id,
        entityTitle: data.requester_name, // TITULO
      });

      setRequests(requests.map(r => r.id === data.id ? data as RequestType : r));
      setEditingRequest(null);
      setFormData({ requester_name: '', description: '', assignee_id: 'unassigned', priority: 'medium' });
      setAttachments([]);
      toast.success('Solicitação atualizada com sucesso');
    } catch (error) {
      console.error('Erro ao atualizar solicitação:', error);
      toast.error('Falha ao atualizar solicitação');
    }
  };

  const handleStatusChange = async (request: RequestType, newStatus: RequestStatus) => {
    const previousStatus = request.status;

    try {
      const { data, error } = await supabase
        .from('requests')
        .update({ status: newStatus })
        .eq('id', request.id)
        .select()
        .single();

      if (error) throw error;

      await logAudit({
        action: 'status_changed',
        entityType: 'request',
        entityId: request.id,
        entityTitle: request.requester_name, // TITULO
        previousStatus,
        newStatus,
      });

      setRequests(requests.map(r => r.id === data.id ? data as RequestType : r));
      toast.success('Status atualizado com sucesso');
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      toast.error('Falha ao atualizar status');
    }
  };

  const handleDelete = async (id: string) => {
    const reqToDelete = requests.find(r => r.id === id);
    try {
      const { error } = await supabase.from('requests').delete().eq('id', id);
      if (error) throw error;

      await logAudit({
        action: 'deleted',
        entityType: 'request',
        entityId: id,
        entityTitle: reqToDelete?.requester_name || 'Desconhecido', // TITULO
      });

      setRequests(requests.filter(r => r.id !== id));
      toast.success('Solicitação excluída com sucesso');
    } catch (error) {
      console.error('Erro ao excluir solicitação:', error);
      toast.error('Falha ao excluir solicitação');
    }
  };

  const openEdit = (request: RequestType) => {
    setEditingRequest(request);
    setFormData({
      requester_name: request.requester_name,
      description: request.description,
      assignee_id: request.assignee_id || 'unassigned',
      priority: request.priority,
    });
    // @ts-ignore
    setAttachments(request.attachments || []);
  };

  const getAssigneeName = (assigneeId: string | null) => {
    if (!assigneeId) return 'Não atribuído';
    const profile = profiles.find(p => p.id === assigneeId);
    return profile?.full_name || profile?.email || 'Desconhecido';
  };

  // Filter requests
  const filteredRequests = requests.filter(request => {
    const matchesSearch =
      request.requester_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      request.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || request.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || request.priority === priorityFilter;
    return matchesSearch && matchesStatus && matchesPriority;
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
            <h1 className="text-3xl font-bold text-foreground">Solicitações</h1>
            <p className="text-muted-foreground mt-1">Gerencie solicitações e tickets recebidos</p>
          </div>

          <Dialog open={isCreateOpen} onOpenChange={(open) => {
            setIsCreateOpen(open);
            if (!open) {
              setFormData({ requester_name: '', description: '', assignee_id: 'unassigned', priority: 'medium' });
              setAttachments([]);
            }
          }}>
            <DialogTrigger asChild>
              <Button className="btn-glow bg-[#612cb5] text-white hover:bg-[#502495]">
                <Plus className="h-4 w-4 mr-2" />
                Nova Solicitação
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg bg-card border-border">
              <DialogHeader>
                <DialogTitle className="text-foreground">Criar Nova Solicitação</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="requester">Nome do Solicitante *</Label>
                  <Input
                    id="requester"
                    value={formData.requester_name}
                    onChange={e => setFormData({ ...formData, requester_name: e.target.value })}
                    placeholder="Quem está fazendo esta solicitação?"
                    className="input-enhanced"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Descrição *</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Descreva a solicitação em detalhes"
                    className="input-enhanced min-h-[100px]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="priority">Prioridade</Label>
                    <Select
                      value={formData.priority}
                      onValueChange={(value) => setFormData({ ...formData, priority: value as RequestPriority })}
                    >
                      <SelectTrigger className="input-enhanced">
                        <SelectValue placeholder="Selecione a prioridade" />
                      </SelectTrigger>
                      <SelectContent>
                        {priorityOptions.map(option => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="assignee">Responsável</Label>
                    <Select
                      value={formData.assignee_id}
                      onValueChange={(value) => setFormData({ ...formData, assignee_id: value })}
                    >
                      <SelectTrigger className="input-enhanced">
                        <SelectValue placeholder="Selecione o responsável" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Não atribuído</SelectItem>
                        {profiles.map(profile => (
                          <SelectItem key={profile.id} value={profile.id}>
                            {profile.full_name || profile.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Attachments */}
                <div className="space-y-2 bg-secondary/20 p-3 rounded-lg border border-border/50">
                  <Label className="flex items-center gap-2 text-[#612cb5]"><Paperclip className="h-4 w-4" /> Anexar Documento</Label>
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
                  <Button onClick={handleCreate} className="btn-glow bg-[#612cb5] text-white hover:bg-[#502495]">Criar Solicitação</Button>
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
                  placeholder="Buscar solicitações..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-10 input-enhanced"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-40 input-enhanced">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Status</SelectItem>
                  {statusOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-full sm:w-40 input-enhanced">
                  <SelectValue placeholder="Prioridade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as Prioridades</SelectItem>
                  {priorityOptions.map(option => (
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
                <TableHead className="text-muted-foreground">Solicitante</TableHead>
                <TableHead className="text-muted-foreground">Descrição</TableHead>
                <TableHead className="text-muted-foreground">Anexo</TableHead>
                <TableHead className="text-muted-foreground">Prioridade</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="text-muted-foreground">Responsável</TableHead>
                <TableHead className="text-muted-foreground">Criado em</TableHead>
                <TableHead className="text-muted-foreground text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRequests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                    <Inbox className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhuma solicitação encontrada</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredRequests.map((request, index) => (
                  <TableRow
                    key={request.id}
                    className="border-border data-table-row animate-slide-up"
                    style={{ animationDelay: `${index * 30}ms` }}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                          <User className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <span className="font-medium text-foreground">{request.requester_name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-foreground line-clamp-2 max-w-xs">{request.description}</p>
                    </TableCell>
                    <TableCell>
                      {/* @ts-ignore */}
                      {request.attachments && request.attachments.length > 0 ? (
                        <div className="flex items-center gap-1 text-muted-foreground text-xs bg-secondary/50 px-2 py-1 rounded w-fit">
                          <Paperclip className="h-3 w-3" />
                          <a
                            href={request.attachments[0].url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline"
                          >
                            Abrir
                          </a>
                        </div>
                      ) : <span className="text-muted-foreground text-xs pl-2">-</span>}
                    </TableCell>
                    <TableCell>
                      <PriorityBadge priority={request.priority} />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={request.status}
                        onValueChange={(value) => handleStatusChange(request, value as RequestStatus)}
                      >
                        <SelectTrigger className="w-36 border-0 bg-transparent p-0 h-auto focus:ring-0">
                          <StatusBadge status={request.status} />
                        </SelectTrigger>
                        <SelectContent>
                          {statusOptions.map(option => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {getAssigneeName(request.assignee_id)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(request.created_at), "d 'de' MMM, yyyy", { locale: ptBR })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <AuditHistoryDrawer
                          entityType="request"
                          entityId={request.id}
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
                            <DropdownMenuItem onClick={() => openEdit(request)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => handleDelete(request.id)}
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

        {/* Edit Dialog */}
        <Dialog open={!!editingRequest} onOpenChange={() => setEditingRequest(null)}>
          <DialogContent className="sm:max-w-lg bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground">Editar Solicitação</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nome do Solicitante *</Label>
                <Input
                  value={formData.requester_name}
                  onChange={e => setFormData({ ...formData, requester_name: e.target.value })}
                  className="input-enhanced"
                />
              </div>
              <div className="space-y-2">
                <Label>Descrição *</Label>
                <Textarea
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="input-enhanced min-h-[100px]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Prioridade</Label>
                  <Select
                    value={formData.priority}
                    onValueChange={(value) => setFormData({ ...formData, priority: value as RequestPriority })}
                  >
                    <SelectTrigger className="input-enhanced">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {priorityOptions.map(option => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Responsável</Label>
                  <Select
                    value={formData.assignee_id}
                    onValueChange={(value) => setFormData({ ...formData, assignee_id: value })}
                  >
                    <SelectTrigger className="input-enhanced">
                      <SelectValue placeholder="Selecione o responsável" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Não atribuído</SelectItem>
                      {profiles.map(profile => (
                        <SelectItem key={profile.id} value={profile.id}>
                          {profile.full_name || profile.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Attachments Edit */}
              <div className="space-y-2 bg-secondary/20 p-3 rounded-lg border border-border/50">
                <Label className="flex items-center gap-2 text-[#612cb5]"><Paperclip className="h-4 w-4" /> Anexar Documento</Label>
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
                <Button variant="outline" onClick={() => setEditingRequest(null)}>Cancelar</Button>
                <Button onClick={handleUpdate} className="btn-glow bg-[#612cb5] text-white hover:bg-[#502495]">Salvar Alterações</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}