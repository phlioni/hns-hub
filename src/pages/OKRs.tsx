import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Plus, Search, ChevronDown, ChevronRight, Target, MoreHorizontal, Trash2, Edit, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuditLog } from '@/hooks/useAuditLog';
import { MainLayout } from '@/components/layout/MainLayout';
import { AuditHistoryDrawer } from '@/components/AuditHistoryDrawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import { Objective, KeyResult, Initiative } from '@/types/database';
import { cn } from '@/lib/utils';

export default function OKRs() {
  const { logAudit } = useAuditLog();
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [keyResults, setKeyResults] = useState<Record<string, KeyResult[]>>({});
  const [initiatives, setInitiatives] = useState<Record<string, Initiative[]>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedObjectives, setExpandedObjectives] = useState<Set<string>>(new Set());
  const [expandedKRs, setExpandedKRs] = useState<Set<string>>(new Set());
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreateKROpen, setIsCreateKROpen] = useState<string | null>(null);
  const [isCreateInitiativeOpen, setIsCreateInitiativeOpen] = useState<string | null>(null);

  // Form state
  const [objectiveForm, setObjectiveForm] = useState({ title: '', description: '' });
  const [krForm, setKRForm] = useState({ title: '', description: '' });
  const [initiativeForm, setInitiativeForm] = useState({ title: '', description: '' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [objectivesRes, keyResultsRes, initiativesRes] = await Promise.all([
        supabase.from('objectives').select('*').order('created_at', { ascending: false }),
        supabase.from('key_results').select('*').order('created_at', { ascending: true }),
        supabase.from('initiatives').select('*').order('created_at', { ascending: true }),
      ]);

      if (objectivesRes.data) setObjectives(objectivesRes.data as Objective[]);
      
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
      console.error('Error fetching data:', error);
      toast.error('Failed to load OKRs');
    } finally {
      setLoading(false);
    }
  };

  const createObjective = async () => {
    if (!objectiveForm.title.trim()) {
      toast.error('Title is required');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('objectives')
        .insert({ title: objectiveForm.title, description: objectiveForm.description })
        .select()
        .single();

      if (error) throw error;

      await logAudit({
        action: 'created',
        entityType: 'objective',
        entityId: data.id,
      });

      setObjectives([data as Objective, ...objectives]);
      setObjectiveForm({ title: '', description: '' });
      setIsCreateOpen(false);
      toast.success('Objective created successfully');
    } catch (error) {
      console.error('Error creating objective:', error);
      toast.error('Failed to create objective');
    }
  };

  const createKeyResult = async (objectiveId: string) => {
    if (!krForm.title.trim()) {
      toast.error('Title is required');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('key_results')
        .insert({ objective_id: objectiveId, title: krForm.title, description: krForm.description })
        .select()
        .single();

      if (error) throw error;

      await logAudit({
        action: 'created',
        entityType: 'key_result',
        entityId: data.id,
      });

      setKeyResults({
        ...keyResults,
        [objectiveId]: [...(keyResults[objectiveId] || []), data as KeyResult],
      });
      setKRForm({ title: '', description: '' });
      setIsCreateKROpen(null);
      toast.success('Key Result created successfully');
    } catch (error) {
      console.error('Error creating key result:', error);
      toast.error('Failed to create key result');
    }
  };

  const createInitiative = async (keyResultId: string) => {
    if (!initiativeForm.title.trim()) {
      toast.error('Title is required');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('initiatives')
        .insert({ key_result_id: keyResultId, title: initiativeForm.title, description: initiativeForm.description })
        .select()
        .single();

      if (error) throw error;

      await logAudit({
        action: 'created',
        entityType: 'initiative',
        entityId: data.id,
      });

      setInitiatives({
        ...initiatives,
        [keyResultId]: [...(initiatives[keyResultId] || []), data as Initiative],
      });
      setInitiativeForm({ title: '', description: '' });
      setIsCreateInitiativeOpen(null);
      toast.success('Initiative created successfully');
    } catch (error) {
      console.error('Error creating initiative:', error);
      toast.error('Failed to create initiative');
    }
  };

  const updateProgress = async (type: 'objective' | 'key_result', id: string, progress: number) => {
    try {
      const table = type === 'objective' ? 'objectives' : 'key_results';
      const { error } = await supabase.from(table).update({ progress }).eq('id', id);

      if (error) throw error;

      if (type === 'objective') {
        setObjectives(objectives.map(o => o.id === id ? { ...o, progress } : o));
      } else {
        const updatedKRs = { ...keyResults };
        Object.keys(updatedKRs).forEach(objId => {
          updatedKRs[objId] = updatedKRs[objId].map(kr => kr.id === id ? { ...kr, progress } : kr);
        });
        setKeyResults(updatedKRs);
      }
    } catch (error) {
      console.error('Error updating progress:', error);
      toast.error('Failed to update progress');
    }
  };

  const toggleInitiativeComplete = async (initiative: Initiative) => {
    try {
      const { error } = await supabase
        .from('initiatives')
        .update({ completed: !initiative.completed })
        .eq('id', initiative.id);

      if (error) throw error;

      const updatedInits = { ...initiatives };
      Object.keys(updatedInits).forEach(krId => {
        updatedInits[krId] = updatedInits[krId].map(i => 
          i.id === initiative.id ? { ...i, completed: !i.completed } : i
        );
      });
      setInitiatives(updatedInits);
    } catch (error) {
      console.error('Error toggling initiative:', error);
      toast.error('Failed to update initiative');
    }
  };

  const deleteObjective = async (id: string) => {
    try {
      const { error } = await supabase.from('objectives').delete().eq('id', id);
      if (error) throw error;

      setObjectives(objectives.filter(o => o.id !== id));
      toast.success('Objective deleted successfully');
    } catch (error) {
      console.error('Error deleting objective:', error);
      toast.error('Failed to delete objective');
    }
  };

  const toggleObjective = (id: string) => {
    const newExpanded = new Set(expandedObjectives);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedObjectives(newExpanded);
  };

  const toggleKR = (id: string) => {
    const newExpanded = new Set(expandedKRs);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedKRs(newExpanded);
  };

  const filteredObjectives = objectives.filter(obj =>
    obj.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    obj.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getProgressColor = (progress: number) => {
    if (progress >= 70) return 'bg-success';
    if (progress >= 40) return 'bg-warning';
    return 'bg-info';
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
            <p className="text-muted-foreground mt-1">Track objectives and key results</p>
          </div>
          
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="btn-glow">
                <Plus className="h-4 w-4 mr-2" />
                New Objective
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle className="text-foreground">Create New Objective</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="obj-title">Title *</Label>
                  <Input
                    id="obj-title"
                    value={objectiveForm.title}
                    onChange={e => setObjectiveForm({ ...objectiveForm, title: e.target.value })}
                    placeholder="Enter objective title"
                    className="input-enhanced"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="obj-description">Description</Label>
                  <Textarea
                    id="obj-description"
                    value={objectiveForm.description}
                    onChange={e => setObjectiveForm({ ...objectiveForm, description: e.target.value })}
                    placeholder="Brief description"
                    className="input-enhanced"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                  <Button onClick={createObjective} className="btn-glow">Create Objective</Button>
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
                placeholder="Search objectives..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-10 input-enhanced"
              />
            </div>
          </CardContent>
        </Card>

        {/* Objectives List */}
        <div className="space-y-4">
          {filteredObjectives.length === 0 ? (
            <Card className="glass-card">
              <CardContent className="py-12 text-center">
                <Target className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-muted-foreground">No objectives found</p>
              </CardContent>
            </Card>
          ) : (
            filteredObjectives.map((objective, index) => (
              <Card
                key={objective.id}
                className="glass-card hover-card-animated animate-slide-up"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <Collapsible open={expandedObjectives.has(objective.id)} onOpenChange={() => toggleObjective(objective.id)}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-4">
                      <CollapsibleTrigger className="flex items-center gap-3 text-left flex-1">
                        {expandedObjectives.has(objective.id) ? (
                          <ChevronDown className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                        )}
                        <div className="flex-1">
                          <CardTitle className="text-lg text-foreground">{objective.title}</CardTitle>
                          {objective.description && (
                            <p className="text-sm text-muted-foreground mt-1">{objective.description}</p>
                          )}
                        </div>
                      </CollapsibleTrigger>
                      <div className="flex items-center gap-3">
                        <div className="w-32">
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="text-muted-foreground">Progress</span>
                            <span className="font-medium text-foreground">{objective.progress}%</span>
                          </div>
                          <Progress value={objective.progress} className="h-2" />
                        </div>
                        <AuditHistoryDrawer entityType="objective" entityId={objective.id} />
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => deleteObjective(objective.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardHeader>

                  <CollapsibleContent>
                    <CardContent className="pt-4 border-t border-border ml-8">
                      {/* Progress Slider */}
                      <div className="mb-6 p-4 rounded-lg bg-secondary/30">
                        <Label className="text-sm text-muted-foreground mb-3 block">Adjust Progress</Label>
                        <div className="flex items-center gap-4">
                          <Slider
                            value={[objective.progress]}
                            onValueChange={([value]) => updateProgress('objective', objective.id, value)}
                            max={100}
                            step={1}
                            className="flex-1"
                          />
                          <span className="w-12 text-right font-medium text-foreground">{objective.progress}%</span>
                        </div>
                      </div>

                      {/* Key Results */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-medium text-muted-foreground">Key Results</h4>
                          <Dialog open={isCreateKROpen === objective.id} onOpenChange={(open) => setIsCreateKROpen(open ? objective.id : null)}>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8">
                                <Plus className="h-4 w-4 mr-1" />
                                Add KR
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="bg-card border-border">
                              <DialogHeader>
                                <DialogTitle className="text-foreground">Add Key Result</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                  <Label>Title *</Label>
                                  <Input
                                    value={krForm.title}
                                    onChange={e => setKRForm({ ...krForm, title: e.target.value })}
                                    placeholder="Enter key result title"
                                    className="input-enhanced"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label>Description</Label>
                                  <Textarea
                                    value={krForm.description}
                                    onChange={e => setKRForm({ ...krForm, description: e.target.value })}
                                    placeholder="Brief description"
                                    className="input-enhanced"
                                  />
                                </div>
                                <div className="flex justify-end gap-3 pt-4">
                                  <Button variant="outline" onClick={() => setIsCreateKROpen(null)}>Cancel</Button>
                                  <Button onClick={() => createKeyResult(objective.id)} className="btn-glow">Add Key Result</Button>
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>
                        </div>

                        {(keyResults[objective.id] || []).map(kr => (
                          <Collapsible key={kr.id} open={expandedKRs.has(kr.id)} onOpenChange={() => toggleKR(kr.id)}>
                            <div className="p-4 rounded-lg bg-secondary/20 border border-border/50">
                              <CollapsibleTrigger className="w-full">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    {expandedKRs.has(kr.id) ? (
                                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                    )}
                                    <span className="font-medium text-foreground">{kr.title}</span>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <div className="w-24">
                                      <Progress value={kr.progress} className="h-1.5" />
                                    </div>
                                    <span className="text-sm text-muted-foreground w-10 text-right">{kr.progress}%</span>
                                  </div>
                                </div>
                              </CollapsibleTrigger>

                              <CollapsibleContent>
                                <div className="mt-4 pt-4 border-t border-border/50 space-y-4">
                                  {/* KR Progress Slider */}
                                  <div className="flex items-center gap-4">
                                    <Slider
                                      value={[kr.progress]}
                                      onValueChange={([value]) => updateProgress('key_result', kr.id, value)}
                                      max={100}
                                      step={1}
                                      className="flex-1"
                                    />
                                    <span className="w-12 text-right text-sm font-medium text-foreground">{kr.progress}%</span>
                                  </div>

                                  {/* Initiatives */}
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs font-medium text-muted-foreground">Initiatives</span>
                                      <Dialog open={isCreateInitiativeOpen === kr.id} onOpenChange={(open) => setIsCreateInitiativeOpen(open ? kr.id : null)}>
                                        <DialogTrigger asChild>
                                          <Button variant="ghost" size="sm" className="h-6 text-xs">
                                            <Plus className="h-3 w-3 mr-1" />
                                            Add
                                          </Button>
                                        </DialogTrigger>
                                        <DialogContent className="bg-card border-border">
                                          <DialogHeader>
                                            <DialogTitle className="text-foreground">Add Initiative</DialogTitle>
                                          </DialogHeader>
                                          <div className="space-y-4 py-4">
                                            <div className="space-y-2">
                                              <Label>Title *</Label>
                                              <Input
                                                value={initiativeForm.title}
                                                onChange={e => setInitiativeForm({ ...initiativeForm, title: e.target.value })}
                                                placeholder="Enter initiative title"
                                                className="input-enhanced"
                                              />
                                            </div>
                                            <div className="flex justify-end gap-3 pt-4">
                                              <Button variant="outline" onClick={() => setIsCreateInitiativeOpen(null)}>Cancel</Button>
                                              <Button onClick={() => createInitiative(kr.id)} className="btn-glow">Add Initiative</Button>
                                            </div>
                                          </div>
                                        </DialogContent>
                                      </Dialog>
                                    </div>
                                    
                                    {(initiatives[kr.id] || []).map(initiative => (
                                      <div
                                        key={initiative.id}
                                        className={cn(
                                          'flex items-center gap-2 p-2 rounded-md text-sm cursor-pointer transition-colors',
                                          initiative.completed ? 'bg-success/10 text-muted-foreground line-through' : 'bg-secondary/30 text-foreground'
                                        )}
                                        onClick={() => toggleInitiativeComplete(initiative)}
                                      >
                                        <CheckCircle2 className={cn(
                                          'h-4 w-4 flex-shrink-0',
                                          initiative.completed ? 'text-success' : 'text-muted-foreground'
                                        )} />
                                        <span>{initiative.title}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </CollapsibleContent>
                            </div>
                          </Collapsible>
                        ))}

                        {(!keyResults[objective.id] || keyResults[objective.id].length === 0) && (
                          <p className="text-sm text-muted-foreground italic py-2">No key results yet</p>
                        )}
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            ))
          )}
        </div>
      </div>
    </MainLayout>
  );
}
