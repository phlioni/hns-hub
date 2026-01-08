import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Plus, Search, History, MoreHorizontal, FileText, Paperclip, Trash2, Edit } from 'lucide-react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Proposal, ProposalStatus } from '@/types/database';

const statusOptions: { value: ProposalStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'understanding', label: 'Understanding' },
  { value: 'construction', label: 'Construction' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'delivered', label: 'Delivered' },
];

export default function Proposals() {
  const { user } = useAuth();
  const { logAudit } = useAuditLog();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingProposal, setEditingProposal] = useState<Proposal | null>(null);

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
      console.error('Error fetching proposals:', error);
      toast.error('Failed to load proposals');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.title.trim()) {
      toast.error('Title is required');
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
      setIsCreateOpen(false);
      toast.success('Proposal created successfully');
    } catch (error) {
      console.error('Error creating proposal:', error);
      toast.error('Failed to create proposal');
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
      toast.success('Proposal updated successfully');
    } catch (error) {
      console.error('Error updating proposal:', error);
      toast.error('Failed to update proposal');
    }
  };

  const handleStatusChange = async (proposal: Proposal, newStatus: ProposalStatus) => {
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
      });

      setProposals(proposals.map(p => p.id === data.id ? data as Proposal : p));
      
      if (newStatus === 'delivered') {
        toast.info('Triggering Delivery Email...', {
          description: 'The delivery notification will be sent via webhook.',
        });
      } else {
        toast.success('Status updated successfully');
      }
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
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
      toast.success('Proposal deleted successfully');
    } catch (error) {
      console.error('Error deleting proposal:', error);
      toast.error('Failed to delete proposal');
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
            <h1 className="text-3xl font-bold text-foreground">Proposals</h1>
            <p className="text-muted-foreground mt-1">Manage your proposal pipeline</p>
          </div>
          
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="btn-glow">
                <Plus className="h-4 w-4 mr-2" />
                New Proposal
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl bg-card border-border">
              <DialogHeader>
                <DialogTitle className="text-foreground">Create New Proposal</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Enter proposal title"
                    className="input-enhanced"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Brief description of the proposal"
                    className="input-enhanced min-h-[100px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pre_analysis">Pre-Analysis</Label>
                  <Textarea
                    id="pre_analysis"
                    value={formData.pre_analysis}
                    onChange={e => setFormData({ ...formData, pre_analysis: e.target.value })}
                    placeholder="Initial analysis and findings"
                    className="input-enhanced min-h-[120px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pre_proposal">Pre-Proposal</Label>
                  <Textarea
                    id="pre_proposal"
                    value={formData.pre_proposal}
                    onChange={e => setFormData({ ...formData, pre_proposal: e.target.value })}
                    placeholder="Preliminary proposal content"
                    className="input-enhanced min-h-[120px]"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreate} className="btn-glow">Create Proposal</Button>
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
                  placeholder="Search proposals..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-10 input-enhanced"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-48 input-enhanced">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
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
                <TableHead className="text-muted-foreground">Title</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="text-muted-foreground">Entry Date</TableHead>
                <TableHead className="text-muted-foreground">Delivery Date</TableHead>
                <TableHead className="text-muted-foreground text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProposals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No proposals found</p>
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
                        onValueChange={(value) => handleStatusChange(proposal, value as ProposalStatus)}
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
                    <TableCell className="text-muted-foreground">
                      {format(new Date(proposal.entry_date), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {proposal.delivery_date
                        ? format(new Date(proposal.delivery_date), 'MMM d, yyyy')
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
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => handleDelete(proposal.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
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
        <Dialog open={!!editingProposal} onOpenChange={() => setEditingProposal(null)}>
          <DialogContent className="sm:max-w-2xl bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground">Edit Proposal</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-title">Title *</Label>
                <Input
                  id="edit-title"
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  className="input-enhanced"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="input-enhanced min-h-[100px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-pre_analysis">Pre-Analysis</Label>
                <Textarea
                  id="edit-pre_analysis"
                  value={formData.pre_analysis}
                  onChange={e => setFormData({ ...formData, pre_analysis: e.target.value })}
                  className="input-enhanced min-h-[120px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-pre_proposal">Pre-Proposal</Label>
                <Textarea
                  id="edit-pre_proposal"
                  value={formData.pre_proposal}
                  onChange={e => setFormData({ ...formData, pre_proposal: e.target.value })}
                  className="input-enhanced min-h-[120px]"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => setEditingProposal(null)}>Cancel</Button>
                <Button onClick={handleUpdate} className="btn-glow">Save Changes</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
