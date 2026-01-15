import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

interface PriorityBadgeProps {
  priority: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const getStatusConfig = (status: string) => {
    switch (status) {
      // PROPOSAL STATUSES
      case "new":
        return { label: "Novo", color: "bg-blue-100 text-blue-800 border-blue-200" };
      case "understanding":
        return { label: "Entendimento", color: "bg-indigo-100 text-indigo-800 border-indigo-200" };
      case "construction":
        return { label: "Construção", color: "bg-amber-100 text-amber-800 border-amber-200" };
      case "in_review":
        return { label: "Em Revisão", color: "bg-purple-100 text-purple-800 border-purple-200" };
      case "awaiting_code":
        return { label: "Aguard. Código", color: "bg-pink-100 text-pink-800 border-pink-200" };
      case "awaiting_contract":
        return { label: "Aguard. Assinatura", color: "bg-orange-100 text-orange-800 border-orange-200" };
      case "operational_start":
        return { label: "Start Operacional", color: "bg-emerald-100 text-emerald-800 border-emerald-200" };

      // Novo Status Adicionado com label corrigida
      case "execution_forwarded":
        return { label: "Execução", color: "bg-cyan-100 text-cyan-800 border-cyan-200" };

      case "delivered":
        return { label: "Entregue", color: "bg-green-100 text-green-800 border-green-200" };
      case "cancelled":
        return { label: "Cancelado", color: "bg-slate-100 text-slate-800 border-slate-200" };
      case "edited":
        return { label: "Editado", color: "bg-gray-100 text-gray-800 border-gray-200" };

      // REQUEST STATUSES
      case "pending":
        return { label: "Pendente", color: "bg-yellow-100 text-yellow-800 border-yellow-200" };
      case "in_progress":
        return { label: "Em Progresso", color: "bg-blue-100 text-blue-800 border-blue-200" };
      case "done":
        return { label: "Concluído", color: "bg-green-100 text-green-800 border-green-200" };

      default:
        return { label: status, color: "bg-gray-100 text-gray-800 border-gray-200" };
    }
  };

  const config = getStatusConfig(status);

  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap",
        config.color,
        className
      )}
    >
      {config.label}
    </span>
  );
}

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  const getPriorityConfig = (priority: string) => {
    switch (priority) {
      case "high":
        return { label: "Alta", color: "bg-red-100 text-red-800 border-red-200" };
      case "medium":
        return { label: "Média", color: "bg-yellow-100 text-yellow-800 border-yellow-200" };
      case "low":
        return { label: "Baixa", color: "bg-green-100 text-green-800 border-green-200" };
      default:
        return { label: priority, color: "bg-gray-100 text-gray-800 border-gray-200" };
    }
  };

  const config = getPriorityConfig(priority);

  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap",
        config.color,
        className
      )}
    >
      {config.label}
    </span>
  );
}