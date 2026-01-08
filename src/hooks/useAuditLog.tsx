import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

type EntityType = 'proposal' | 'objective' | 'key_result' | 'initiative' | 'request';

interface LogAuditParams {
  action: string;
  entityType: EntityType;
  entityId: string;
  previousStatus?: string | null;
  newStatus?: string | null;
  metadata?: Record<string, any>;
}

export function useAuditLog() {
  const { user, profile } = useAuth();

  const logAudit = async ({
    action,
    entityType,
    entityId,
    previousStatus,
    newStatus,
    metadata = {},
  }: LogAuditParams) => {
    try {
      const { error } = await supabase.from('audit_logs').insert({
        user_id: user?.id,
        user_email: profile?.email || user?.email,
        action,
        entity_type: entityType,
        entity_id: entityId,
        previous_status: previousStatus,
        new_status: newStatus,
        metadata,
      });

      if (error) {
        console.error('Error logging audit:', error);
      }
    } catch (error) {
      console.error('Error logging audit:', error);
    }
  };

  return { logAudit };
}
