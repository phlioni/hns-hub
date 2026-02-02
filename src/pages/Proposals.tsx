import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format, differenceInDays, parseISO, differenceInHours, differenceInMinutes, isSameMonth, startOfMonth, differenceInBusinessDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Plus, Search, History, MoreHorizontal, FileText, Trash2, Edit,
  Paperclip, X, Link as LinkIcon, ExternalLink, Eye, MessageSquare, Clock,
  CheckCircle2, Circle, CalendarClock, ArrowRight, Binary, PenTool, Hammer, Lock, FilterX,
  ChevronLeft, ChevronRight, Tag, Loader2, Check, ChevronsUpDown
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
import { Proposal as DbProposal, ProposalStatus, AuditLog } from '@/types/database';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// --- INTERFACES ---

interface Proposal extends DbProposal {
  tags?: string[] | null;
}

interface ClientCode {
  id: string;
  project_code: string;
  client_name: string;
}

// REMOVIDO: { value: 'awaiting_code', label: 'Aguardando Código' }
const statusOptions: { value: ProposalStatus; label: string }[] = [
  { value: 'new', label: 'Novo' },
  { value: 'understanding', label: 'Entendimento' },
  { value: 'construction', label: 'Construção' },
  { value: 'in_review', label: 'Em Revisão' },
  { value: 'awaiting_contract', label: 'Aguardando Assinatura' },
  { value: 'operational_start', label: 'Start Operacional' },
  { value: 'execution_forwarded', label: 'Encaminhado p/ Execução' },
  { value: 'cancelled', label: 'Cancelado' },
  { value: 'delivered', label: 'Entregue' },
];

// REGRA 1: Status que não devem aparecer na seleção manual
const automationStatuses = [
  'awaiting_contract',
  'operational_start',
  'execution_forwarded'
];

// REGRA 5: Status que BLOQUEIAM Edição e Exclusão
const LOCKED_STATUSES = [
  'awaiting_contract',
  'operational_start',
  'execution_forwarded',
  'delivered'
];

// Status que "baixam" a prioridade do ESTRATÉGICO
const LOW_PRIORITY_STRATEGIC_STATUSES = [
  'delivered',
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

// Configuração de cores das tags
const getTagColor = (tag: string) => {
  const normalizedTag = tag.toUpperCase();
  if (normalizedTag.includes('ESTRATÉGICO')) return 'bg-red-100 text-red-800 border-red-200 hover:bg-red-200';
  if (normalizedTag.includes('INBOUND')) return 'bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-200';
  if (normalizedTag.includes('OUTBOUND')) return 'bg-orange-100 text-orange-800 border-orange-200 hover:bg-orange-200';
  if (normalizedTag.includes('BASE')) return 'bg-slate-100 text-slate-800 border-slate-200 hover:bg-slate-200';
  if (normalizedTag.includes('OPERAÇÕES')) return 'bg-green-100 text-green-800 border-green-200 hover:bg-green-200';
  return 'bg-gray-100 text-gray-800 border-gray-200 hover:bg-gray-200';
};

// --- COMPONENTE COMBOBOX (SEARCHABLE SELECT) ---
interface ProjectCodeComboboxProps {
  value: string;
  onChange: (value: string) => void;
  clientCodes: ClientCode[];
  onOpenNewCode: () => void;
}

const ProjectCodeCombobox = ({ value, onChange, clientCodes, onOpenNewCode }: ProjectCodeComboboxProps) => {
  const [open, setOpen] = useState(false);

  // Garante que o valor atual aparece mesmo que não esteja na lista inicial
  const options = [...clientCodes];
  if (value && !options.find(c => c.project_code === value)) {
    options.push({ id: 'temp', project_code: value, client_name: '(Código Manual/Antigo)' });
  }

  const selectedCode = options.find((code) => code.project_code === value);

  return (
    <div className="flex gap-2 w-full">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between input-enhanced font-mono"
          >
            {value ? (
              <span className="truncate">
                <span className="font-bold text-[#612cb5]">{selectedCode?.project_code || value}</span>
                {selectedCode?.client_name && (
                  <span className="text-muted-foreground ml-2 text-xs">- {selectedCode.client_name}</span>
                )}
              </span>
            ) : (
              <span className="text-muted-foreground">Selecione ou pesquise o código...</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Filtrar por código ou cliente..." />
            <CommandList>
              <CommandEmpty>Nenhum código encontrado.</CommandEmpty>
              <CommandGroup>
                {options.map((code) => (
                  <CommandItem
                    key={code.id}
                    value={`${code.project_code} ${code.client_name}`} // Permite busca por ambos
                    onSelect={() => {
                      onChange(code.project_code);
                      setOpen(false);
                    }}
                    className="font-mono cursor-pointer"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === code.project_code ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="font-bold text-[#612cb5] mr-2">{code.project_code}</span>
                    <span className="text-muted-foreground text-xs truncate">- {code.client_name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="shrink-0 border-[#612cb5]/30 text-[#612cb5] hover:bg-[#612cb5]/10"
              onClick={onOpenNewCode}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Criar novo código rápido</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};


export default function Proposals() {
  const { user, role } = useAuth();
  const { logAudit } = useAuditLog();
  const [searchParams, setSearchParams] = useSearchParams();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Estados de Client Codes
  const [clientCodes, setClientCodes] = useState<ClientCode[]>([]);
  const [isNewCodeDialogOpen, setIsNewCodeDialogOpen] = useState(false);
  const [newCodeData, setNewCodeData] = useState({ project_code: '', client_name: '' });
  const [isSavingCode, setIsSavingCode] = useState(false);

  // Estados de Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  // Filtros da URL
  const statusParam = searchParams.get('status');
  const slaParam = searchParams.get('sla');
  const monthParam = searchParams.get('month'); // yyyy-MM
  const viewMode = searchParams.get('view');

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [deliveryLogs, setDeliveryLogs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (statusParam) {
      setStatusFilter(statusParam);
    }
  }, [statusParam]);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingProposal, setEditingProposal] = useState<Proposal | null>(null);
  const [viewingProposal, setViewingProposal] = useState<Proposal | null>(null);

  const [viewingProposalLogs, setViewingProposalLogs] = useState<AuditLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  const [pendingStatusChange, setPendingStatusChange] = useState<{ proposal: Proposal, newStatus: ProposalStatus } | null>(null);
  const [justification, setJustification] = useState('');

  // --- NOVOS ESTADOS PARA CONTROLE DE ALTERAÇÃO DE PRAZO ---
  const [pendingDeadlineChange, setPendingDeadlineChange] = useState(false);
  const [editJustification, setEditJustification] = useState('');

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
    fetchClientCodes();
  }, []);

  // Se houver filtro de SLA ou Mês, precisamos buscar os logs de entrega para filtrar corretamente
  useEffect(() => {
    if (slaParam || monthParam) {
      fetchDeliveryLogs();
    }
  }, [slaParam, monthParam]);

  // Busca logs da proposta individual quando aberta
  useEffect(() => {
    if (viewingProposal) {
      fetchLogsForProposal(viewingProposal.id);
    } else {
      setViewingProposalLogs([]);
    }
  }, [viewingProposal]);

  // Resetar a página para 1 quando qualquer filtro mudar
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, slaParam, monthParam, viewMode]);

  const fetchClientCodes = async () => {
    try {
      const { data, error } = await supabase
        .from('client_codes')
        .select('id, project_code, client_name')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setClientCodes(data as ClientCode[]);
    } catch (error) {
      console.error('Erro ao buscar códigos:', error);
    }
  };

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

  const fetchDeliveryLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('entity_id, created_at')
        .eq('entity_type', 'proposal')
        .eq('new_status', 'delivered');

      if (error) throw error;

      const logMap: Record<string, string> = {};
      data.forEach((log: any) => {
        if (!logMap[log.entity_id] || new Date(log.created_at) < new Date(logMap[log.entity_id])) {
          logMap[log.entity_id] = log.created_at;
        }
      });
      setDeliveryLogs(logMap);
    } catch (error) {
      console.error('Erro ao buscar logs de entrega:', error);
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

  // --- LÓGICA DE SALVAMENTO DE NOVO CÓDIGO (RÁPIDO) ---
  const handleSaveNewCode = async () => {
    if (!newCodeData.project_code || !newCodeData.client_name) {
      toast.error("Preencha o código e o nome do cliente");
      return;
    }

    setIsSavingCode(true);
    try {
      // Mesma lógica de extração usada no ProjectCodes.tsx para consistência
      const rawCode = newCodeData.project_code.toUpperCase().trim();
      const regex = /^([A-Z]+)(\d+)-(\d{2,4})$/;
      const match = rawCode.match(regex);

      let inferredPrefix = "MANUAL";
      let inferredSequence = 0;
      let inferredYear = new Date().getFullYear().toString().slice(-2);

      if (match) {
        inferredPrefix = match[1];
        inferredSequence = parseInt(match[2], 10);
        inferredYear = match[3].slice(-2);
      } else {
        const parts = rawCode.split('-');
        if (parts.length > 0) {
          const prefixMatch = parts[0].match(/^([A-Z]+)/);
          if (prefixMatch) inferredPrefix = prefixMatch[1];
          const seqMatch = parts[0].match(/(\d+)$/);
          if (seqMatch) inferredSequence = parseInt(seqMatch[1], 10);
        }
        if (parts.length > 1) {
          const y = parts[1];
          if (y.length >= 2) inferredYear = y.slice(-2);
        }
      }

      const { data, error } = await supabase.from("client_codes").insert({
        project_code: rawCode,
        client_name: newCodeData.client_name,
        code_prefix: inferredPrefix,
        code_year: inferredYear,
        sequence_number: inferredSequence,
        reason: "Criação Rápida via Propostas"
      }).select().single();

      if (error) throw error;

      toast.success("Código criado com sucesso!");

      // Atualiza lista e seleciona o novo código
      const newCode: ClientCode = { id: data.id, project_code: data.project_code, client_name: data.client_name };
      setClientCodes([newCode, ...clientCodes]);
      setFormData(prev => ({ ...prev, project_code: newCode.project_code }));

      // Limpa e fecha
      setNewCodeData({ project_code: '', client_name: '' });
      setIsNewCodeDialogOpen(false);

    } catch (error: any) {
      console.error(error);
      if (error.message?.includes("duplicate")) {
        toast.error("Este código já existe!");
      } else {
        toast.error("Erro ao criar código.");
      }
    } finally {
      setIsSavingCode(false);
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setSearchParams({});
  };

  // --- Lógica de Filtro Principal ---
  const filteredProposals = proposals.filter(proposal => {
    // 1. Texto
    const matchesSearch = proposal.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      proposal.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      proposal.project_code?.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    // 2. Status
    if (statusFilter !== 'all' && proposal.status !== statusFilter) {
      return false;
    }

    // 3. View Mode (Lead Time)
    if (viewMode === 'lead_time') {
      const hasDelivery = ['delivered', 'awaiting_contract', 'operational_start', 'execution_forwarded'].includes(proposal.status);
      if (!hasDelivery) return false;
    }

    // 4. Filtros de SLA e Mês
    if (slaParam || monthParam) {
      const deliveryDateStr = deliveryLogs[proposal.id] || proposal.delivery_date;
      if (!deliveryDateStr) return false;

      const deliveryDate = parseISO(deliveryDateStr);

      if (monthParam) {
        const targetMonth = parseISO(monthParam + '-01');
        if (!isSameMonth(deliveryDate, targetMonth)) return false;
      }

      if (slaParam) {
        const entryDate = parseISO(proposal.entry_date);
        let isLate = false;
        if (proposal.deadline && deliveryDate > parseISO(proposal.deadline)) isLate = true;
        const businessDays = differenceInBusinessDays(deliveryDate, entryDate);

        if (slaParam === 'late' && !isLate) return false;
        if (slaParam === 'one_day' && (isLate || businessDays > 1)) return false;
        if (slaParam === 'five_days' && (isLate || businessDays <= 1)) return false;
      }
    }

    return true;
  });

  // --- Lógica de Ordenação ---
  const sortedProposals = [...filteredProposals].sort((a, b) => {
    const isStrategicA = a.tags?.some(t => t.toUpperCase().includes('ESTRATÉGICO'));
    const isStrategicB = b.tags?.some(t => t.toUpperCase().includes('ESTRATÉGICO'));

    const hasPriorityA = isStrategicA && !LOW_PRIORITY_STRATEGIC_STATUSES.includes(a.status);
    const hasPriorityB = isStrategicB && !LOW_PRIORITY_STRATEGIC_STATUSES.includes(b.status);

    if (hasPriorityA && !hasPriorityB) return -1;
    if (!hasPriorityA && hasPriorityB) return 1;

    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  // --- Lógica de Paginação ---
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentProposals = sortedProposals.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(sortedProposals.length / itemsPerPage);

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const getTimestampFromLogs = (targetStatus: string, logs: AuditLog[], entryDate?: string): string | null => {
    if (targetStatus === 'entry') {
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
    const dateDelivered = getTimestampFromLogs('delivered', logs);
    const dateContract = getTimestampFromLogs('awaiting_contract', logs);
    const dateStart = getTimestampFromLogs('operational_start', logs);
    const dateExecution = getTimestampFromLogs('execution_forwarded', logs);

    return [
      {
        label: "Envio até Assinatura",
        subtitle: "HNS -> Comercial",
        ...calculateMetric(dateDelivered, dateContract),
        color: "bg-purple-50 text-purple-700 border-purple-200"
      },
      {
        label: "Assinatura até Start",
        subtitle: "Comercial -> Gestão de Contas",
        ...calculateMetric(dateContract, dateStart),
        color: "bg-emerald-50 text-emerald-700 border-emerald-200"
      },
      {
        label: "Start até Execução",
        subtitle: "Gestão de Contas -> HNS",
        ...calculateMetric(dateStart, dateExecution),
        color: "bg-indigo-50 text-indigo-700 border-indigo-200"
      }
    ];
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
          status: 'new',
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

  const handleUpdate = () => {
    if (isAccountManager) return;
    if (!editingProposal || !formData.title.trim()) return;

    const originalDeadline = editingProposal.deadline ? format(parseISO(editingProposal.deadline), 'yyyy-MM-dd') : '';
    const newDeadline = formData.deadline;

    if (originalDeadline !== newDeadline) {
      setEditJustification('');
      setPendingDeadlineChange(true);
      return;
    }

    executeProposalUpdate();
  };

  const executeProposalUpdate = async (justificationForDeadline?: string) => {
    if (!editingProposal) return;

    try {
      const updatePayload: any = {
        title: formData.title,
        description: formData.description,
        project_code: formData.project_code || null,
        pre_analysis: formData.pre_analysis,
        pre_proposal: formData.pre_proposal,
        deadline: formData.deadline || null,
        attachments: attachments,
        links: links,
      };

      if (justificationForDeadline) {
        updatePayload.last_justification = `Alteração de Prazo: ${justificationForDeadline}`;
      }

      const { data, error } = await supabase
        .from('proposals')
        .update(updatePayload)
        .eq('id', editingProposal.id)
        .select()
        .single();

      if (error) throw error;

      await logAudit({
        action: 'edited',
        entityType: 'proposal',
        entityId: data.id,
        entityTitle: data.title,
        metadata: justificationForDeadline ? { justification: justificationForDeadline, change: 'deadline_update' } : undefined
      });

      setProposals(proposals.map(p => p.id === data.id ? data as Proposal : p));
      setEditingProposal(null);
      setPendingDeadlineChange(false);
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
        previousStatus: proposal.status,
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

  const isDirectContractFlow = (p: Proposal) => {
    return !p.project_code && ['awaiting_contract', 'operational_start', 'execution_forwarded'].includes(p.status);
  }

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
                    {/* SELETOR REFORMULADO (COMBOBOX) */}
                    <ProjectCodeCombobox
                      value={formData.project_code}
                      onChange={(val) => setFormData({ ...formData, project_code: val })}
                      clientCodes={clientCodes}
                      onOpenNewCode={() => setIsNewCodeDialogOpen(true)}
                    />
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
                      <div className="flex flex-wrap gap-2 mt-2">{links.map((l, i) => (
                        <div key={i} className="flex items-center gap-2 bg-muted px-2 py-1 rounded border">
                          <span className="text-xs">{l.name}</span>
                          <button onClick={() => removeLink(i)} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                        </div>
                      ))}</div>
                    )}
                  </div>
                  <div className="space-y-2 bg-secondary/20 p-3 rounded-lg border border-border/50">
                    <Label className="flex items-center gap-2 text-[#612cb5]"><Paperclip className="h-4 w-4" /> Arquivos Anexos</Label>
                    <Input type="file" onChange={handleFileUpload} disabled={isUploading} className="text-sm input-enhanced h-9" />
                    {attachments.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">{attachments.map((a, i) => (
                        <div key={i} className="flex items-center gap-2 bg-muted px-2 py-1 rounded border">
                          <span className="text-xs">{a.name}</span>
                          <button onClick={() => removeAttachment(i)} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                        </div>
                      ))}</div>
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

        {/* --- DIALOGO DE CRIAÇÃO RÁPIDA DE CÓDIGO (COMPARTILHADO) --- */}
        <Dialog open={isNewCodeDialogOpen} onOpenChange={setIsNewCodeDialogOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-[#612cb5]">Novo Código Rápido</DialogTitle>
              <DialogDescription>Crie um código para usar nesta proposta imediatamente.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label>Nome do Cliente</Label>
                <Input
                  placeholder="Ex: Movecta"
                  value={newCodeData.client_name}
                  onChange={(e) => setNewCodeData({ ...newCodeData, client_name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Código do Projeto</Label>
                <Input
                  placeholder="Ex: MVT032-26"
                  className="font-mono uppercase"
                  value={newCodeData.project_code}
                  onChange={(e) => setNewCodeData({ ...newCodeData, project_code: e.target.value.toUpperCase() })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsNewCodeDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSaveNewCode} disabled={isSavingCode} className="bg-[#612cb5] text-white">
                {isSavingCode && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Salvar e Usar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Filter Feedback */}
        {(statusFilter !== 'all' || slaParam || monthParam) && (
          <div className="flex items-center gap-2 mb-2 p-2 bg-blue-50 border border-blue-100 rounded text-blue-800 text-sm animate-fade-in">
            <span className="font-medium">Filtros ativos:</span>
            {statusFilter !== 'all' && <span className="bg-white px-2 py-0.5 rounded border">Status: {statusFilter}</span>}
            {slaParam && <span className="bg-white px-2 py-0.5 rounded border">SLA: {slaParam === 'late' ? 'Atrasado' : slaParam === 'one_day' ? '1 dia' : '5 dias'}</span>}
            {monthParam && <span className="bg-white px-2 py-0.5 rounded border">Mês: {monthParam}</span>}
            <Button variant="ghost" size="sm" onClick={clearFilters} className="ml-auto h-6 text-blue-800 hover:bg-blue-100">
              <FilterX className="w-3 h-3 mr-1" /> Limpar
            </Button>
          </div>
        )}

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
              <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setSearchParams(prev => { prev.set('status', val); return prev; }) }}>
                <SelectTrigger className="w-full sm:w-48 input-enhanced">
                  <SelectValue placeholder="Filtrar por status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Status</SelectItem>
                  {statusOptions
                    // REGRA 1: Filtra status de automação
                    .filter(opt => !automationStatuses.includes(opt.value))
                    .map(option => (
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
                <TableHead className="text-muted-foreground">Tags</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="text-muted-foreground">Última Justificativa</TableHead>
                <TableHead className="text-muted-foreground text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentProposals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhuma proposta encontrada</p>
                  </TableCell>
                </TableRow>
              ) : (
                currentProposals.map((proposal, index) => {
                  const isAutomationStatus = automationStatuses.includes(proposal.status);
                  const isLocked = LOCKED_STATUSES.includes(proposal.status);

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
                      {/* NOVA COLUNA DE TAGS */}
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {proposal.tags && proposal.tags.length > 0 ? (
                            proposal.tags.map((tag, idx) => (
                              <Badge key={idx} className={`text-[10px] px-1.5 py-0 rounded-sm font-bold shadow-none ${getTagColor(tag)}`}>
                                {tag}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground italic">-</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {isAccountManager || isAutomationStatus ? (
                          <div title={
                            isAccountManager ? "Sem permissão" :
                              "Status controlado via automação"
                          }>
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
                          {!isAccountManager && !isLocked && (
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

          {/* Pagination Controls */}
          <div className="flex items-center justify-between p-4 border-t">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Itens por página:</span>
              <Select
                value={itemsPerPage.toString()}
                onValueChange={(value) => {
                  setItemsPerPage(Number(value));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-[70px]">
                  <SelectValue placeholder={itemsPerPage.toString()} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">
                Mostrando {currentProposals.length > 0 ? indexOfFirstItem + 1 : 0}-{Math.min(indexOfLastItem, sortedProposals.length)} de {sortedProposals.length}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handlePrevPage}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleNextPage}
                  disabled={currentPage >= totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* --- DETAILED VIEW MODAL --- */}
        <Dialog open={!!viewingProposal} onOpenChange={() => setViewingProposal(null)}>
          <DialogContent className="sm:max-w-5xl bg-card border-border h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
            {viewingProposal && (
              <>
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
                      <div className="flex items-center gap-2">
                        <StatusBadge status={viewingProposal.status} />
                        {viewingProposal.tags && viewingProposal.tags.map((tag, idx) => (
                          <Badge key={idx} className={`text-[10px] ${getTagColor(tag)}`}>{tag}</Badge>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-12 text-sm border-t pt-4 mt-2 border-gray-200">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">Data de Entrada</span>
                      <span className="font-semibold text-gray-800 text-base">{format(new Date(viewingProposal.entry_date), "dd/MM/yyyy 'às' HH:mm")}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">Prazo de Entrega</span>
                      <span className={`font-semibold text-base ${viewingProposal.deadline && new Date(viewingProposal.deadline) < new Date() && viewingProposal.status !== 'delivered' ? 'text-red-600' : 'text-gray-800'}`}>
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
                          <div className="bg-gray-50 p-4 rounded-lg border text-sm text-gray-700 whitespace-pre-wrap break-words leading-relaxed">
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
                        {(() => {
                          const isDirect = isDirectContractFlow(viewingProposal);

                          return (
                            <>
                              <TimelineStep
                                label="Solicitação Recebida"
                                date={isDirect ? null : viewingProposal.entry_date}
                                icon={Clock}
                              />

                              {/* REMOVIDO: Código Gerado (Novo) step */}

                              <TimelineStep
                                label="Em Construção"
                                date={isDirect ? null : getTimestampFromLogs('construction', viewingProposalLogs)}
                                icon={Hammer}
                              />

                              <TimelineStep
                                label="Proposta Enviada"
                                date={isDirect ? null : getTimestampFromLogs('delivered', viewingProposalLogs)}
                                icon={ArrowRight}
                              />
                            </>
                          )
                        })()}

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
                  {!isAccountManager && !LOCKED_STATUSES.includes(viewingProposal.status) && (
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

        {/* --- NOVO DIALOG: Justificativa de Alteração de Prazo --- */}
        <Dialog open={pendingDeadlineChange} onOpenChange={setPendingDeadlineChange}>
          <DialogContent className="bg-card">
            <DialogHeader>
              <DialogTitle className="text-[#612cb5] flex items-center gap-2">
                <CalendarClock className="w-5 h-5" />
                Alteração de Prazo Detectada
              </DialogTitle>
              <DialogDescription>
                Você alterou a data de entrega. Para prosseguir, é <strong>obrigatório</strong> fornecer uma justificativa para o registro de auditoria.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Label htmlFor="deadline-justification" className="mb-2 block">Motivo da alteração:</Label>
              <Textarea
                id="deadline-justification"
                placeholder="Ex: Cliente solicitou adiamento, Atraso no fornecedor, etc..."
                value={editJustification}
                onChange={e => setEditJustification(e.target.value)}
                className="input-enhanced min-h-[100px]"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPendingDeadlineChange(false)}>Cancelar</Button>
              <Button
                className="bg-[#612cb5] text-white hover:bg-[#502495]"
                onClick={() => executeProposalUpdate(editJustification)}
                disabled={!editJustification.trim()}
              >
                Confirmar e Salvar
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
                  {/* SELETOR REFORMULADO (COMBOBOX) */}
                  <ProjectCodeCombobox
                    value={formData.project_code}
                    onChange={(val) => setFormData({ ...formData, project_code: val })}
                    clientCodes={clientCodes}
                    onOpenNewCode={() => setIsNewCodeDialogOpen(true)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-deadline">Prazo</Label>
                  <Input id="edit-deadline" type="date" value={formData.deadline} onChange={e => setFormData({ ...formData, deadline: e.target.value })} className="input-enhanced" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-description">Descrição</Label>
                  <Textarea id="edit-description" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="input-enhanced min-h-[80px]" />
                </div>

                <div className="space-y-2 bg-secondary/20 p-3 rounded-lg border border-border/50">
                  <Label className="flex items-center gap-2 text-[#612cb5]"><LinkIcon className="h-4 w-4" /> Links Externos</Label>
                  <div className="flex gap-2">
                    <Input placeholder="Nome" value={newLink.name} onChange={e => setNewLink({ ...newLink, name: e.target.value })} className="flex-1 input-enhanced h-9 text-sm" />
                    <Input placeholder="URL" value={newLink.url} onChange={e => setNewLink({ ...newLink, url: e.target.value })} className="flex-[2] input-enhanced h-9 text-sm" />
                    <Button onClick={addLink} size="sm" variant="secondary" className="h-9">Adicionar</Button>
                  </div>
                  {links.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">{links.map((l, i) => (
                      <div key={i} className="flex items-center gap-2 bg-muted px-2 py-1 rounded border">
                        <span className="text-xs">{l.name}</span>
                        <button onClick={() => removeLink(i)} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                      </div>
                    ))}</div>
                  )}
                </div>
                <div className="space-y-2 bg-secondary/20 p-3 rounded-lg border border-border/50">
                  <Label className="flex items-center gap-2 text-[#612cb5]"><Paperclip className="h-4 w-4" /> Arquivos Anexos</Label>
                  <Input type="file" onChange={handleFileUpload} disabled={isUploading} className="text-sm input-enhanced h-9" />
                  {attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">{attachments.map((a, i) => (
                      <div key={i} className="flex items-center gap-2 bg-muted px-2 py-1 rounded border">
                        <span className="text-xs">{a.name}</span>
                        <button onClick={() => removeAttachment(i)} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                      </div>
                    ))}</div>
                  )}
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