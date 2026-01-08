import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { History, User, ArrowRight, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { AuditLog } from '@/types/database';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StatusBadge } from '@/components/ui/status-badge';
import { cn } from '@/lib/utils';

interface AuditHistoryDrawerProps {
  entityType: string;
  entityId: string;
  trigger?: React.ReactNode;
}

export function AuditHistoryDrawer({ entityType, entityId, trigger }: AuditHistoryDrawerProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) {
      fetchLogs();
    }
  }, [open, entityType, entityId]);

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
      console.error('Error fetching audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'created':
        return <div className="w-2 h-2 rounded-full bg-success" />;
      case 'updated':
        return <div className="w-2 h-2 rounded-full bg-info" />;
      case 'status_changed':
        return <div className="w-2 h-2 rounded-full bg-warning" />;
      case 'deleted':
        return <div className="w-2 h-2 rounded-full bg-destructive" />;
      default:
        return <div className="w-2 h-2 rounded-full bg-muted-foreground" />;
    }
  };

  const formatAction = (action: string) => {
    return action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="sm" className="gap-2">
            <History className="h-4 w-4" />
            History
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md bg-card border-border">
        <SheetHeader className="pb-4 border-b border-border">
          <SheetTitle className="flex items-center gap-2 text-foreground">
            <History className="h-5 w-5 text-primary" />
            Audit History
          </SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-120px)] pr-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <History className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No history available</p>
            </div>
          ) : (
            <div className="relative py-4">
              {/* Timeline line */}
              <div className="absolute left-[11px] top-0 bottom-0 w-px bg-border" />
              
              <div className="space-y-6">
                {logs.map((log, index) => (
                  <div key={log.id} className="relative flex gap-4 animate-slide-up" style={{ animationDelay: `${index * 50}ms` }}>
                    {/* Timeline dot */}
                    <div className="relative z-10 flex items-center justify-center w-6 h-6 rounded-full bg-card border border-border">
                      {getActionIcon(log.action)}
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 space-y-2 pb-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-foreground">
                          {formatAction(log.action)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(log.created_at), 'MMM d, yyyy • h:mm a')}
                        </span>
                      </div>
                      
                      {/* User info */}
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <User className="h-3.5 w-3.5" />
                        <span>{log.user_email || 'System'}</span>
                      </div>
                      
                      {/* Status change */}
                      {log.previous_status || log.new_status ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          {log.previous_status && (
                            <StatusBadge status={log.previous_status as any} className="opacity-60" />
                          )}
                          {log.previous_status && log.new_status && (
                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          )}
                          {log.new_status && (
                            <StatusBadge status={log.new_status as any} />
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
