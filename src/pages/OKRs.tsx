import { useEffect, useState } from 'react';
import { Plus, Search, ChevronDown, ChevronRight, MoreHorizontal, Trash2, CheckCircle2, Circle, Edit, Pencil } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuditLog } from '@/hooks/useAuditLog';
import { MainLayout } from '@/components/layout/MainLayout';
import { AuditHistoryDrawer } from '@/components/AuditHistoryDrawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Objective, KeyResult, Initiative } from '@/types/database';
import { cn } from '@/lib/utils';

interface Profile {
  id: string;
  full_name: string;
  email: string;
}

export default function OKRs() {
  const { logAudit } = useAuditLog();
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [keyResults, setKeyResults] = useState<Record<string, KeyResult[]>>({});
  const [initiatives, setInitiatives] = useState<Record<string, Initiative[]>>({});
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedObjectives, setExpandedObjectives] = useState<Set<string>>(new Set());
  const [expandedKRs, setExpandedKRs] = useState<Set<string>>(new Set());

  // Create States
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreateKROpen, setIsCreateKROpen] = useState<string | null>(null);
  const [isCreateInitiativeOpen, setIsCreateInitiativeOpen] = useState<string | null>(null);

  // Edit States
  const [editingObjective, setEditingObjective] = useState<Objective | null>(null);
  const [editingKR, setEditingKR] = useState<KeyResult | null>(null);
  const [editingInitiative, setEditingInitiative] = useState<Initiative | null>(null);

  // Forms
  const [objectiveForm, setObjectiveForm] = useState({ title: '', description: '', owner_id: '', partner_id: '' });
  const [krForm, setKRForm] = useState({ title: '', description: '' });
  const [initiativeForm, setInitiativeForm] = useState({ title: '', description: '' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [objectivesRes, keyResultsRes, initiativesRes, profilesRes] = await Promise.all([
        supabase.from('objectives').select('*').order('created_at', { ascending: false }),
        supabase.from('key_results').select('*').order('created_at', { ascending: true }),
        supabase.from('initiatives').select('*').order('created_at', { ascending: true }),
        supabase.from('profiles').select('id, full_name, email'),
      ]);

      if (objectivesRes.data) setObjectives(objectivesRes.data as Objective[]);
      if (profilesRes.data) setProfiles(profilesRes.data as Profile[]);

      if (keyResultsRes.data) {
        const krMap: Record<string, KeyResult[]> = {};
        (keyResultsRes.data as KeyResult[]).forEach(kr => {
          if (!krMap[kr.objective_id]) krMap[kr.objective_id] = [];
          krMap[kr.objective_id].push(kr);
        });
        setKeyResults(krMap);
      }

      if (initiativesRes.data) {
        const initMap: Record<string, Initiative[]> = {};
        (initiativesRes.data as Initiative[]).forEach(init => {
          if (!initMap[init.key_result_id]) initMap[init.key_result_id] = [];
          initMap[init.key_result_id].push(init);
        });
        setInitiatives(initMap);
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Falha ao carregar OKRs');
    } finally {
      setLoading(false);
    }
  };

  const calculateKRProgress = (krId: string): number => {
    const krInitiatives = initiatives[krId] || [];
    if (krInitiatives.length === 0) return 0;
    const completed = krInitiatives.filter(i => i.completed).length;
    return Math.round((completed / krInitiatives.length) * 100);
  };

  const calculateObjectiveProgress = (objectiveId: string): number => {
    const objKRs = keyResults[objectiveId] || [];
    if (objKRs.length === 0) return 0;
    const totalProgress = objKRs.reduce((sum, kr) => sum + calculateKRProgress(kr.id), 0);
    return Math.round(totalProgress / objKRs.length);
  };

  // --- CRUD OPERATIONS: CREATE ---

  const createObjective = async () => {
    if (!objectiveForm.title.trim()) {
      toast.error('Título é obrigatório');
      return;
    }

    try {
      const payload: any = {
        title: objectiveForm.title,
        description: objectiveForm.description
      };
      if (objectiveForm.owner_id) payload.owner_id = objectiveForm.owner_id;
      if (objectiveForm.partner_id) payload.partner_id = objectiveForm.partner_id;

      const { data, error } = await supabase.from('objectives').insert(payload).select().single();
      if (error) throw error;

      await logAudit({
        action: 'created', entityType: 'objective', entityId: data.id, entityTitle: data.title // TITULO 
      });

      setObjectives([data as Objective, ...objectives]);
      setObjectiveForm({ title: '', description: '', owner_id: '', partner_id: '' });
      setIsCreateOpen(false);
      toast.success('Objetivo criado com sucesso');
    } catch (error) {
      console.error('Erro ao criar objetivo:', error);
      toast.error('Falha ao criar objetivo');
    }
  };

  const createKeyResult = async (objectiveId: string) => {
    if (!krForm.title.trim()) {
      toast.error('Título é obrigatório');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('key_results')
        .insert({ objective_id: objectiveId, title: krForm.title, description: krForm.description })
        .select().single();
      if (error) throw error;

      await logAudit({
        action: 'created', entityType: 'key_result', entityId: data.id, entityTitle: data.title // TITULO 
      });

      setKeyResults({ ...keyResults, [objectiveId]: [...(keyResults[objectiveId] || []), data as KeyResult] });
      setKRForm({ title: '', description: '' });
      setIsCreateKROpen(null);
      toast.success('KR criado com sucesso');
    } catch (error) {
      console.error('Erro ao criar KR:', error);
      toast.error('Falha ao criar KR');
    }
  };

  const createInitiative = async (keyResultId: string) => {
    if (!initiativeForm.title.trim()) {
      toast.error('Título é obrigatório');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('initiatives')
        .insert({ key_result_id: keyResultId, title: initiativeForm.title, description: initiativeForm.description })
        .select().single();
      if (error) throw error;

      await logAudit({
        action: 'created', entityType: 'initiative', entityId: data.id, entityTitle: data.title // TITULO 
      });

      setInitiatives({ ...initiatives, [keyResultId]: [...(initiatives[keyResultId] || []), data as Initiative] });
      setInitiativeForm({ title: '', description: '' });
      setIsCreateInitiativeOpen(null);
      toast.success('Iniciativa criada com sucesso');
    } catch (error) {
      console.error('Erro ao criar iniciativa:', error);
      toast.error('Falha ao criar iniciativa');
    }
  };

  // --- CRUD OPERATIONS: UPDATE ---

  const handleUpdateObjective = async () => {
    if (!editingObjective || !objectiveForm.title.trim()) return;

    try {
      const payload: any = {
        title: objectiveForm.title,
        description: objectiveForm.description,
        owner_id: objectiveForm.owner_id || null,
        partner_id: objectiveForm.partner_id || null
      };

      const { data, error } = await supabase
        .from('objectives')
        .update(payload)
        .eq('id', editingObjective.id)
        .select()
        .single();
      if (error) throw error;

      await logAudit({
        action: 'updated', entityType: 'objective', entityId: data.id, entityTitle: data.title // TITULO 
      });

      setObjectives(objectives.map(o => o.id === data.id ? data as Objective : o));
      setEditingObjective(null);
      setObjectiveForm({ title: '', description: '', owner_id: '', partner_id: '' });
      toast.success('Objetivo atualizado com sucesso');
    } catch (error) {
      console.error('Erro ao atualizar objetivo:', error);
      toast.error('Falha ao atualizar objetivo');
    }
  };

  const handleUpdateKR = async () => {
    if (!editingKR || !krForm.title.trim()) return;

    try {
      const { data, error } = await supabase
        .from('key_results')
        .update({ title: krForm.title, description: krForm.description })
        .eq('id', editingKR.id)
        .select()
        .single();
      if (error) throw error;

      await logAudit({
        action: 'updated', entityType: 'key_result', entityId: data.id, entityTitle: data.title // TITULO 
      });

      const updatedKRs = { ...keyResults };
      Object.keys(updatedKRs).forEach(objId => {
        updatedKRs[objId] = updatedKRs[objId].map(kr => kr.id === data.id ? data as KeyResult : kr);
      });
      setKeyResults(updatedKRs);

      setEditingKR(null);
      setKRForm({ title: '', description: '' });
      toast.success('KR atualizado com sucesso');
    } catch (error) {
      console.error('Erro ao atualizar KR:', error);
      toast.error('Falha ao atualizar KR');
    }
  };

  const handleUpdateInitiative = async () => {
    if (!editingInitiative || !initiativeForm.title.trim()) return;

    try {
      const { data, error } = await supabase
        .from('initiatives')
        .update({ title: initiativeForm.title, description: initiativeForm.description })
        .eq('id', editingInitiative.id)
        .select()
        .single();
      if (error) throw error;

      await logAudit({
        action: 'updated', entityType: 'initiative', entityId: data.id, entityTitle: data.title // TITULO 
      });

      const updatedInits = { ...initiatives };
      Object.keys(updatedInits).forEach(krId => {
        updatedInits[krId] = updatedInits[krId].map(i => i.id === data.id ? data as Initiative : i);
      });
      setInitiatives(updatedInits);

      setEditingInitiative(null);
      setInitiativeForm({ title: '', description: '' });
      toast.success('Iniciativa atualizada com sucesso');
    } catch (error) {
      console.error('Erro ao atualizar iniciativa:', error);
      toast.error('Falha ao atualizar iniciativa');
    }
  };

  const toggleInitiativeComplete = async (initiative: Initiative) => {
    try {
      const { error } = await supabase
        .from('initiatives')
        .update({ completed: !initiative.completed })
        .eq('id', initiative.id);

      if (error) throw error;

      await logAudit({
        action: 'updated',
        entityType: 'initiative',
        entityId: initiative.id,
        entityTitle: initiative.title, // TITULO
        metadata: { completed: !initiative.completed },
      });

      const updatedInits = { ...initiatives };
      Object.keys(updatedInits).forEach(krId => {
        updatedInits[krId] = updatedInits[krId].map(i =>
          i.id === initiative.id ? { ...i, completed: !i.completed } : i
        );
      });
      setInitiatives(updatedInits);

      toast.success(initiative.completed ? 'Iniciativa reaberta' : 'Iniciativa concluída!');
    } catch (error) {
      console.error('Erro ao atualizar iniciativa:', error);
      toast.error('Falha ao atualizar iniciativa');
    }
  };

  // --- DELETE OPERATIONS ---

  const deleteObjective = async (id: string) => {
    const objToDelete = objectives.find(o => o.id === id);
    try {
      const { error } = await supabase.from('objectives').delete().eq('id', id);
      if (error) throw error;
      await logAudit({
        action: 'deleted', entityType: 'objective', entityId: id, entityTitle: objToDelete?.title // TITULO 
      });
      setObjectives(objectives.filter(o => o.id !== id));
      toast.success('Objetivo excluído');
    } catch (error) {
      toast.error('Falha ao excluir objetivo');
    }
  };

  const deleteKeyResult = async (krId: string, objectiveId: string) => {
    const krToDelete = keyResults[objectiveId]?.find(k => k.id === krId);
    try {
      const { error } = await supabase.from('key_results').delete().eq('id', krId);
      if (error) throw error;
      await logAudit({
        action: 'deleted', entityType: 'key_result', entityId: krId, entityTitle: krToDelete?.title // TITULO 
      });
      setKeyResults({ ...keyResults, [objectiveId]: (keyResults[objectiveId] || []).filter(kr => kr.id !== krId) });
      toast.success('KR excluído');
    } catch (error) {
      toast.error('Falha ao excluir KR');
    }
  };

  const deleteInitiative = async (initId: string, krId: string) => {
    const initToDelete = initiatives[krId]?.find(i => i.id === initId);
    try {
      const { error } = await supabase.from('initiatives').delete().eq('id', initId);
      if (error) throw error;
      await logAudit({
        action: 'deleted', entityType: 'initiative', entityId: initId, entityTitle: initToDelete?.title // TITULO 
      });
      setInitiatives({ ...initiatives, [krId]: (initiatives[krId] || []).filter(i => i.id !== initId) });
      toast.success('Iniciativa excluída');
    } catch (error) {
      toast.error('Falha ao excluir iniciativa');
    }
  };

  // --- HELPERS ---

  const openEditObjective = (obj: Objective) => {
    setEditingObjective(obj);
    setObjectiveForm({
      title: obj.title,
      description: obj.description || '',
      owner_id: obj.owner_id || '',
      partner_id: obj.partner_id || ''
    });
  };

  const openEditKR = (kr: KeyResult) => {
    setEditingKR(kr);
    setKRForm({
      title: kr.title,
      description: kr.description || ''
    });
  };

  const openEditInitiative = (init: Initiative) => {
    setEditingInitiative(init);
    setInitiativeForm({
      title: init.title,
      description: init.description || ''
    });
  };

  const toggleObjective = (id: string) => {
    const newExpanded = new Set(expandedObjectives);
    if (newExpanded.has(id)) newExpanded.delete(id);
    else newExpanded.add(id);
    setExpandedObjectives(newExpanded);
  };

  const toggleKR = (id: string) => {
    const newExpanded = new Set(expandedKRs);
    if (newExpanded.has(id)) newExpanded.delete(id);
    else newExpanded.add(id);
    setExpandedKRs(newExpanded);
  };

  const filteredObjectives = objectives.filter(obj =>
    obj.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    obj.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getProfileName = (id?: string) => {
    if (!id) return 'Não atribuído';
    const profile = profiles.find(p => p.id === id);
    return profile ? profile.full_name || profile.email : 'Desconhecido';
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
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">
          <div>
            <h1 className="text-3xl font-bold text-foreground">OKRs</h1>
            <p className="text-muted-foreground mt-1">Acompanhe objetivos e resultados-chave</p>
          </div>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="btn-glow bg-[#612cb5] hover:bg-[#502495] text-white">
                <Plus className="h-4 w-4 mr-2" />
                Novo Objetivo
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle className="text-foreground">Criar Novo Objetivo</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="obj-title">Título *</Label>
                  <Input
                    id="obj-title"
                    value={objectiveForm.title}
                    onChange={e => setObjectiveForm({ ...objectiveForm, title: e.target.value })}
                    placeholder="Digite o título do objetivo"
                    className="input-enhanced"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="obj-description">Descrição</Label>
                  <Textarea
                    id="obj-description"
                    value={objectiveForm.description}
                    onChange={e => setObjectiveForm({ ...objectiveForm, description: e.target.value })}
                    placeholder="Breve descrição"
                    className="input-enhanced"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Responsável (Owner)</Label>
                    <Select
                      value={objectiveForm.owner_id}
                      onValueChange={v => setObjectiveForm({ ...objectiveForm, owner_id: v })}
                    >
                      <SelectTrigger className="input-enhanced">
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        {profiles.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Parceiro (Partner)</Label>
                    <Select
                      value={objectiveForm.partner_id}
                      onValueChange={v => setObjectiveForm({ ...objectiveForm, partner_id: v })}
                    >
                      <SelectTrigger className="input-enhanced">
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        {profiles.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
                  <Button onClick={createObjective} className="btn-glow bg-[#612cb5] text-white hover:bg-[#502495]">Criar Objetivo</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search */}
        <Card className="glass-card">
          <CardContent className="py-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar objetivos..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-10 input-enhanced"
              />
            </div>
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card className="glass-card border-info/30 bg-info/5">
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">
              💡 <strong>Como funciona:</strong> O progresso é calculado automaticamente. Complete as iniciativas e o progresso dos Resultados-Chave e Objetivos será atualizado automaticamente.
            </p>
          </CardContent>
        </Card>

        {/* Objectives List */}
        <div className="space-y-4">
          {filteredObjectives.length === 0 ? (
            <Card className="glass-card">
              <CardContent className="py-12 text-center">
                <div className="h-12 w-12 mx-auto mb-4 bg-secondary rounded-full flex items-center justify-center">
                  <Search className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground">Nenhum objetivo encontrado</p>
              </CardContent>
            </Card>
          ) : (
            filteredObjectives.map((objective, index) => {
              const objectiveProgress = calculateObjectiveProgress(objective.id);

              return (
                <Card
                  key={objective.id}
                  className="glass-card hover-card-animated animate-slide-up"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <Collapsible open={expandedObjectives.has(objective.id)} onOpenChange={() => toggleObjective(objective.id)}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-4">
                        <CollapsibleTrigger className="flex items-center gap-3 text-left flex-1 group">
                          {expandedObjectives.has(objective.id) ? (
                            <ChevronDown className="h-5 w-5 text-muted-foreground flex-shrink-0 group-hover:text-[#612cb5] transition-colors" />
                          ) : (
                            <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0 group-hover:text-[#612cb5] transition-colors" />
                          )}
                          <div className="flex-1">
                            <CardTitle className="text-lg text-foreground group-hover:text-[#612cb5] transition-colors">{objective.title}</CardTitle>
                            {objective.description && (
                              <p className="text-sm text-muted-foreground mt-1">{objective.description}</p>
                            )}
                            <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                              <span>Owner: <strong className="text-[#612cb5]">{getProfileName(objective.owner_id)}</strong></span>
                              <span>Partner: <strong>{getProfileName(objective.partner_id)}</strong></span>
                            </div>
                          </div>
                        </CollapsibleTrigger>
                        <div className="flex items-center gap-3">
                          <div className="w-32 hidden sm:block">
                            <div className="flex items-center justify-between text-sm mb-1">
                              <span className="text-muted-foreground">Progresso</span>
                              <span className="font-bold text-[#612cb5]">{objectiveProgress}%</span>
                            </div>
                            <Progress value={objectiveProgress} className="h-2" />
                          </div>
                          <AuditHistoryDrawer entityType="objective" entityId={objective.id} />
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEditObjective(objective)}>
                                <Edit className="h-4 w-4 mr-2" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => deleteObjective(objective.id)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </CardHeader>

                    <CollapsibleContent>
                      <CardContent className="pt-4 border-t border-border ml-8">
                        {/* Key Results */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-medium text-muted-foreground">Resultados-Chave</h4>
                            <Dialog open={isCreateKROpen === objective.id} onOpenChange={(open) => setIsCreateKROpen(open ? objective.id : null)}>
                              <DialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8">
                                  <Plus className="h-4 w-4 mr-1" />
                                  Adicionar KR
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="bg-card border-border">
                                <DialogHeader>
                                  <DialogTitle className="text-foreground">Adicionar Resultado-Chave</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                  <div className="space-y-2">
                                    <Label>Título *</Label>
                                    <Input
                                      value={krForm.title}
                                      onChange={e => setKRForm({ ...krForm, title: e.target.value })}
                                      placeholder="Digite o título do resultado-chave"
                                      className="input-enhanced"
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Descrição</Label>
                                    <Textarea
                                      value={krForm.description}
                                      onChange={e => setKRForm({ ...krForm, description: e.target.value })}
                                      placeholder="Breve descrição"
                                      className="input-enhanced"
                                    />
                                  </div>
                                  <div className="flex justify-end gap-3 pt-4">
                                    <Button variant="outline" onClick={() => setIsCreateKROpen(null)}>Cancelar</Button>
                                    <Button onClick={() => createKeyResult(objective.id)} className="btn-glow bg-[#612cb5] text-white">Adicionar KR</Button>
                                  </div>
                                </div>
                              </DialogContent>
                            </Dialog>
                          </div>

                          {(keyResults[objective.id] || []).map(kr => {
                            const krProgress = calculateKRProgress(kr.id);
                            const krInitiatives = initiatives[kr.id] || [];

                            return (
                              <Collapsible key={kr.id} open={expandedKRs.has(kr.id)} onOpenChange={() => toggleKR(kr.id)}>
                                <div className="p-4 rounded-lg bg-secondary/50 border border-border/50">
                                  <div className="flex items-center justify-between">
                                    <CollapsibleTrigger className="flex items-center gap-2 flex-1">
                                      {expandedKRs.has(kr.id) ? (
                                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                      ) : (
                                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                      )}
                                      <span className="font-medium text-foreground">{kr.title}</span>
                                    </CollapsibleTrigger>
                                    <div className="flex items-center gap-3">
                                      <div className="w-24">
                                        <Progress value={krProgress} className="h-1.5" />
                                      </div>
                                      <span className="text-sm w-10 text-right font-bold text-[#612cb5]">{krProgress}%</span>
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button variant="ghost" size="icon" className="h-7 w-7">
                                            <MoreHorizontal className="h-3.5 w-3.5" />
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                          <DropdownMenuItem onClick={() => openEditKR(kr)}>
                                            <Edit className="h-4 w-4 mr-2" />
                                            Editar
                                          </DropdownMenuItem>
                                          <DropdownMenuItem
                                            className="text-destructive focus:text-destructive"
                                            onClick={() => deleteKeyResult(kr.id, objective.id)}
                                          >
                                            <Trash2 className="h-4 w-4 mr-2" />
                                            Excluir
                                          </DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </div>
                                  </div>

                                  <CollapsibleContent>
                                    <div className="mt-4 pt-4 border-t border-border/50 space-y-3">
                                      {/* Initiatives */}
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold uppercase text-muted-foreground">
                                          Iniciativas ({krInitiatives.filter(i => i.completed).length}/{krInitiatives.length})
                                        </span>
                                        <Dialog open={isCreateInitiativeOpen === kr.id} onOpenChange={(open) => setIsCreateInitiativeOpen(open ? kr.id : null)}>
                                          <DialogTrigger asChild>
                                            <Button variant="ghost" size="sm" className="h-6 text-xs">
                                              <Plus className="h-3 w-3 mr-1" />
                                              Adicionar
                                            </Button>
                                          </DialogTrigger>
                                          <DialogContent className="bg-card border-border">
                                            <DialogHeader>
                                              <DialogTitle className="text-foreground">Adicionar Iniciativa</DialogTitle>
                                            </DialogHeader>
                                            <div className="space-y-4 py-4">
                                              <div className="space-y-2">
                                                <Label>Título *</Label>
                                                <Input
                                                  value={initiativeForm.title}
                                                  onChange={e => setInitiativeForm({ ...initiativeForm, title: e.target.value })}
                                                  placeholder="Digite o título da iniciativa"
                                                  className="input-enhanced"
                                                />
                                              </div>
                                              <div className="flex justify-end gap-3 pt-4">
                                                <Button variant="outline" onClick={() => setIsCreateInitiativeOpen(null)}>Cancelar</Button>
                                                <Button onClick={() => createInitiative(kr.id)} className="btn-glow bg-[#612cb5] text-white">Adicionar Iniciativa</Button>
                                              </div>
                                            </div>
                                          </DialogContent>
                                        </Dialog>
                                      </div>

                                      <div className="space-y-2">
                                        {krInitiatives.map(initiative => (
                                          <div
                                            key={initiative.id}
                                            className={cn(
                                              'flex items-center gap-3 p-3 rounded-md text-sm transition-all duration-200 group bg-white border border-transparent hover:border-border shadow-sm',
                                            )}
                                          >
                                            <button
                                              onClick={() => toggleInitiativeComplete(initiative)}
                                              className="flex-shrink-0 focus:outline-none transition-transform active:scale-95"
                                            >
                                              {initiative.completed ? (
                                                <CheckCircle2 className="h-5 w-5 text-success" />
                                              ) : (
                                                <Circle className="h-5 w-5 text-muted-foreground hover:text-[#612cb5] transition-colors" />
                                              )}
                                            </button>
                                            <span className={cn(
                                              'flex-1',
                                              initiative.completed ? 'text-muted-foreground line-through' : 'text-foreground'
                                            )}>
                                              {initiative.title}
                                            </span>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                              onClick={() => openEditInitiative(initiative)}
                                            >
                                              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                              onClick={() => deleteInitiative(initiative.id, kr.id)}
                                            >
                                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                            </Button>
                                          </div>
                                        ))}

                                        {krInitiatives.length === 0 && (
                                          <p className="text-sm text-muted-foreground italic py-2 text-center bg-secondary/30 rounded">
                                            Nenhuma iniciativa cadastrada
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  </CollapsibleContent>
                                </div>
                              </Collapsible>
                            );
                          })}

                          {(!keyResults[objective.id] || keyResults[objective.id].length === 0) && (
                            <p className="text-sm text-muted-foreground italic py-2">Nenhum resultado-chave cadastrado</p>
                          )}
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              );
            })
          )}
        </div>

        {/* --- EDIT DIALOGS --- */}

        {/* Edit Objective Dialog */}
        <Dialog open={!!editingObjective} onOpenChange={() => setEditingObjective(null)}>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground">Editar Objetivo</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-obj-title">Título *</Label>
                <Input
                  id="edit-obj-title"
                  value={objectiveForm.title}
                  onChange={e => setObjectiveForm({ ...objectiveForm, title: e.target.value })}
                  className="input-enhanced"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-obj-description">Descrição</Label>
                <Textarea
                  id="edit-obj-description"
                  value={objectiveForm.description}
                  onChange={e => setObjectiveForm({ ...objectiveForm, description: e.target.value })}
                  className="input-enhanced"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Responsável (Owner)</Label>
                  <Select
                    value={objectiveForm.owner_id}
                    onValueChange={v => setObjectiveForm({ ...objectiveForm, owner_id: v })}
                  >
                    <SelectTrigger className="input-enhanced">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {profiles.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Parceiro (Partner)</Label>
                  <Select
                    value={objectiveForm.partner_id}
                    onValueChange={v => setObjectiveForm({ ...objectiveForm, partner_id: v })}
                  >
                    <SelectTrigger className="input-enhanced">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {profiles.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditingObjective(null)}>Cancelar</Button>
                <Button onClick={handleUpdateObjective} className="bg-[#612cb5] text-white">Salvar</Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit KR Dialog */}
        <Dialog open={!!editingKR} onOpenChange={() => setEditingKR(null)}>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground">Editar Resultado-Chave</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Título *</Label>
                <Input
                  value={krForm.title}
                  onChange={e => setKRForm({ ...krForm, title: e.target.value })}
                  className="input-enhanced"
                />
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea
                  value={krForm.description}
                  onChange={e => setKRForm({ ...krForm, description: e.target.value })}
                  className="input-enhanced"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditingKR(null)}>Cancelar</Button>
                <Button onClick={handleUpdateKR} className="bg-[#612cb5] text-white">Salvar</Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Initiative Dialog */}
        <Dialog open={!!editingInitiative} onOpenChange={() => setEditingInitiative(null)}>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground">Editar Iniciativa</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Título *</Label>
                <Input
                  value={initiativeForm.title}
                  onChange={e => setInitiativeForm({ ...initiativeForm, title: e.target.value })}
                  className="input-enhanced"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditingInitiative(null)}>Cancelar</Button>
                <Button onClick={handleUpdateInitiative} className="bg-[#612cb5] text-white">Salvar</Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>

      </div>
    </MainLayout>
  );
}