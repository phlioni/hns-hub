import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { History, User, FileText, ArrowRight, ShieldAlert } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { StatusBadge } from '@/components/ui/status-badge';
import { Skeleton } from '@/components/ui/skeleton';

interface AuditLog {
  id: string;
  created_at: string;
  user_email: string;
  action: string;
  previous_status: string | null;
  new_status: string | null;
  metadata: any; // JSONB
}

interface AuditHistoryDrawerProps {
  entityType: string;
  entityId: string;
  trigger?: React.ReactNode;
}

export function AuditHistoryDrawer({ entityType, entityId, trigger }: AuditHistoryDrawerProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLogs(data as AuditLog[]);
    } catch (error) {
      console.error('Erro ao carregar histórico:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLogs();
    }
  }, [isOpen, entityId]);

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'created': return 'Criado';
      case 'updated': return 'Editado';
      case 'deleted': return 'Excluído';
      case 'status_changed': return 'Alteração de Status';
      default: return action;
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-[#612cb5]">
            <History className="h-4 w-4" />
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[540px]">
        <SheetHeader className="mb-6">
          <SheetTitle className="flex items-center gap-2 text-[#612cb5]">
            <History className="h-5 w-5" />
            Histórico de Alterações
          </SheetTitle>
          <SheetDescription>
            Registro completo de atividades e mudanças.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-120px)] pr-4">
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-4">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>Nenhum registro encontrado.</p>
            </div>
          ) : (
            <div className="relative border-l border-border ml-4 space-y-8">
              {logs.map((log) => (
                <div key={log.id} className="relative pl-8 group">
                  {/* Timeline Dot */}
                  <div className="absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full bg-border group-hover:bg-[#612cb5] transition-colors ring-4 ring-background" />

                  <div className="flex flex-col gap-2">
                    {/* Header: Action & Date */}
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-foreground">
                        {getActionLabel(log.action)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(log.created_at), "d 'de' MMM, HH:mm", { locale: ptBR })}
                      </span>
                    </div>

                    {/* User */}
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <User className="h-3 w-3" />
                      <span>{log.metadata?.user_name || log.user_email || 'Sistema'}</span>
                    </div>

                    {/* Status Change Details */}
                    {(log.previous_status || log.new_status) && (
                      <div className="flex items-center gap-2 mt-1 p-2 bg-secondary/30 rounded-md border border-border/50">
                        <StatusBadge status={log.previous_status as any} />
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <StatusBadge status={log.new_status as any} />
                      </div>
                    )}

                    {/* JUSTIFICATION DISPLAY (New Logic) */}
                    {log.metadata?.justification && (
                      <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md">
                        <div className="flex items-center gap-2 mb-1 text-amber-700 dark:text-amber-400 font-medium text-xs">
                          <ShieldAlert className="h-3 w-3" />
                          <span>Justificativa</span>
                        </div>
                        <p className="text-sm text-amber-900 dark:text-amber-100 italic">
                          "{log.metadata.justification}"
                        </p>
                      </div>
                    )}

                    {/* Other Metadata (Optional) */}
                    {log.metadata && !log.metadata.justification && Object.keys(log.metadata).length > 0 && (
                      <div className="mt-1">
                        {/* Exibe outros metadados se necessário, exceto user_name que já mostramos */}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}