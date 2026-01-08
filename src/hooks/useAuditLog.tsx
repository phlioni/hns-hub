import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface LogAuditParams {
  action: string;
  entityType: string;
  entityId: string;
  previousStatus?: string;
  newStatus?: string;
  metadata?: Record<string, any>; // Permite passar { justification: "..." }
}

export function useAuditLog() {
  const { user } = useAuth();
  const [isLogging, setIsLogging] = useState(false);

  const logAudit = async ({
    action,
    entityType,
    entityId,
    previousStatus,
    newStatus,
    metadata = {}
  }: LogAuditParams) => {
    setIsLogging(true);
    try {
      // Tenta obter o nome do usuário, se não tiver, usa o email
      const userName = user?.user_metadata?.full_name || user?.email || 'Sistema';

      const { error } = await supabase.from('audit_logs').insert({
        user_id: user?.id,
        user_email: user?.email,
        action,
        entity_type: entityType,
        entity_id: entityId,
        previous_status: previousStatus,
        new_status: newStatus,
        metadata: {
          ...metadata,
          user_name: userName
        }
      });

      if (error) {
        console.error('Erro ao gravar log de auditoria:', error);
        // Não lançamos erro para o usuário não ser bloqueado por falha de log, 
        // mas logamos no console.
      }
    } catch (error) {
      console.error('Erro interno ao gravar log:', error);
    } finally {
      setIsLogging(false);
    }
  };

  return { logAudit, isLogging };
}