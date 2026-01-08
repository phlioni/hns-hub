import { cn } from '@/lib/utils';
import { ProposalStatus, RequestStatus, RequestPriority } from '@/types/database';

interface StatusBadgeProps {
  status: ProposalStatus | RequestStatus;
  className?: string;
}

const proposalStatusConfig: Record<ProposalStatus, { label: string; className: string }> = {
  new: { label: 'Novo', className: 'bg-status-new/20 text-status-new border-status-new/30' },
  understanding: { label: 'Entendimento', className: 'bg-status-understanding/20 text-status-understanding border-status-understanding/30' },
  construction: { label: 'Construção', className: 'bg-status-construction/20 text-status-construction border-status-construction/30' },
  cancelled: { label: 'Cancelado', className: 'bg-status-cancelled/20 text-status-cancelled border-status-cancelled/30' },
  delivered: { label: 'Entregue', className: 'bg-status-delivered/20 text-status-delivered border-status-delivered/30' },
};

const requestStatusConfig: Record<RequestStatus, { label: string; className: string }> = {
  pending: { label: 'Pendente', className: 'bg-status-pending/20 text-status-pending border-status-pending/30' },
  in_progress: { label: 'Em Andamento', className: 'bg-status-in-progress/20 text-status-in-progress border-status-in-progress/30' },
  done: { label: 'Concluído', className: 'bg-status-done/20 text-status-done border-status-done/30' },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = proposalStatusConfig[status as ProposalStatus] || requestStatusConfig[status as RequestStatus];
  
  if (!config) return null;

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border',
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}

interface PriorityBadgeProps {
  priority: RequestPriority;
  className?: string;
}

const priorityConfig: Record<RequestPriority, { label: string; className: string }> = {
  low: { label: 'Baixa', className: 'bg-priority-low/20 text-priority-low border-priority-low/30' },
  medium: { label: 'Média', className: 'bg-priority-medium/20 text-priority-medium border-priority-medium/30' },
  high: { label: 'Alta', className: 'bg-priority-high/20 text-priority-high border-priority-high/30' },
};

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  const config = priorityConfig[priority];
  
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border',
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}
