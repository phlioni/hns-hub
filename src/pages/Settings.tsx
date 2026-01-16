import { useEffect, useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Settings as SettingsIcon, Mail, Plus, X, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { StatusNotification } from '@/types/database';
import { toast } from 'sonner';

// Mapa de labels amigáveis para os status
const statusLabels: Record<string, string> = {
  new: 'Novo',
  understanding: 'Entendimento',
  construction: 'Construção',
  in_review: 'Em Revisão',
  awaiting_code: 'Aguardando Código',
  awaiting_contract: 'Aguardando Assinatura',
  operational_start: 'Start Operacional',
  execution_forwarded: 'Encaminhado p/ Execução',
  delivered: 'Entregue',
  cancelled: 'Cancelado'
};

export default function Settings() {
  const [notifications, setNotifications] = useState<StatusNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmails, setNewEmails] = useState<Record<string, string>>({}); // Estado para inputs temporários

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('status_notifications')
        .select('*')
        .order('status', { ascending: true });

      if (error) throw error;
      setNotifications(data || []);
    } catch (error) {
      console.error('Erro ao carregar configurações:', error);
      toast.error('Falha ao carregar configurações de notificação');
    } finally {
      setLoading(false);
    }
  };

  const handleAddEmail = (status: string) => {
    const emailToAdd = newEmails[status]?.trim();
    if (!emailToAdd) return;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailToAdd)) {
      toast.error('E-mail inválido');
      return;
    }

    setNotifications(prev => prev.map(item => {
      if (item.status === status) {
        if (item.emails.includes(emailToAdd)) {
          toast.warning('Este e-mail já está na lista');
          return item;
        }
        return { ...item, emails: [...item.emails, emailToAdd] };
      }
      return item;
    }));

    // Limpa o input
    setNewEmails(prev => ({ ...prev, [status]: '' }));
  };

  const handleRemoveEmail = (status: string, emailToRemove: string) => {
    setNotifications(prev => prev.map(item => {
      if (item.status === status) {
        return { ...item, emails: item.emails.filter(e => e !== emailToRemove) };
      }
      return item;
    }));
  };

  const handleSave = async (status: string, emails: string[]) => {
    try {
      const { error } = await supabase
        .from('status_notifications')
        .upsert({ status, emails, updated_at: new Date().toISOString() });

      if (error) throw error;
      toast.success(`Configuração para "${statusLabels[status] || status}" salva com sucesso!`);
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao salvar configuração');
    }
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
        <div className="flex items-center gap-2 mb-6">
          <SettingsIcon className="h-6 w-6 text-[#612cb5]" />
          <h1 className="text-3xl font-bold text-[#612cb5]">Configurações</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" /> Notificações de E-mail por Etapa
            </CardTitle>
            <CardDescription>
              Configure quem deve receber e-mails quando uma proposta atingir cada etapa.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {Object.keys(statusLabels).map((statusKey) => {
              const config = notifications.find(n => n.status === statusKey) || { status: statusKey, emails: [] };

              return (
                <div key={statusKey} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold text-gray-700">
                      {statusLabels[statusKey] || statusKey}
                    </Label>
                    <Button
                      size="sm"
                      onClick={() => handleSave(statusKey, config.emails)}
                      className="h-8 bg-[#612cb5] hover:bg-[#502495] text-white"
                    >
                      <Save className="w-3 h-3 mr-1" /> Salvar
                    </Button>
                  </div>

                  <div className="flex gap-2">
                    <Input
                      placeholder="Adicionar novo e-mail..."
                      className="max-w-md h-9"
                      value={newEmails[statusKey] || ''}
                      onChange={(e) => setNewEmails({ ...newEmails, [statusKey]: e.target.value })}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddEmail(statusKey)}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleAddEmail(statusKey)}
                      className="h-9"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-2 min-h-[30px] p-2 bg-gray-50 rounded-md border border-dashed border-gray-200">
                    {config.emails.length === 0 ? (
                      <span className="text-sm text-muted-foreground italic">Nenhum e-mail configurado.</span>
                    ) : (
                      config.emails.map((email) => (
                        <div key={email} className="flex items-center gap-1 bg-white border px-2 py-1 rounded-full text-xs shadow-sm">
                          <span>{email}</span>
                          <button
                            onClick={() => handleRemoveEmail(statusKey, email)}
                            className="text-gray-400 hover:text-red-500 ml-1"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                  <Separator className="mt-4" />
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}