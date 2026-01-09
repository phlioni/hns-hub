import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { User, Shield } from 'lucide-react';

export default function Settings() {
  const { profile, role, user } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [saving, setSaving] = useState(false);

  const handleUpdateProfile = async () => {
    if (!user) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName })
        .eq('id', user.id);

      if (error) throw error;
      toast.success('Perfil atualizado com sucesso');
    } catch (error) {
      console.error('Erro ao atualizar perfil:', error);
      toast.error('Falha ao atualizar perfil');
    } finally {
      setSaving(false);
    }
  };

  const getInitials = (name: string | null, email: string | null) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    if (email) {
      return email[0].toUpperCase();
    }
    return 'U';
  };

  const getRoleLabel = (role: string | null) => {
    if (role === 'admin') return 'Administrador';
    return 'Membro';
  };

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="animate-fade-in">
          <h1 className="text-3xl font-bold text-foreground">Configurações</h1>
          <p className="text-muted-foreground mt-1">Gerencie sua conta e preferências</p>
        </div>

        {/* Profile Section */}
        <Card className="glass-card animate-slide-up">
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              <CardTitle className="text-foreground">Perfil</CardTitle>
            </div>
            <CardDescription>Suas informações pessoais</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-6">
              <Avatar className="h-20 w-20 border-2 border-border">
                <AvatarFallback className="bg-secondary text-secondary-foreground text-xl">
                  {getInitials(profile?.full_name ?? null, profile?.email ?? null)}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="text-lg font-semibold text-foreground">{profile?.full_name || 'Usuário'}</h3>
                <p className="text-muted-foreground">{profile?.email}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Shield className="h-4 w-4 text-primary" />
                  <Badge variant="secondary">{getRoleLabel(role)}</Badge>
                </div>
              </div>
            </div>

            <Separator className="bg-border" />

            <div className="grid gap-4 max-w-md">
              <div className="space-y-2">
                <Label htmlFor="fullName">Nome Completo</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Digite seu nome completo"
                  className="input-enhanced"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  value={profile?.email || ''}
                  disabled
                  className="input-enhanced opacity-60"
                />
                <p className="text-xs text-muted-foreground">O e-mail não pode ser alterado</p>
              </div>
              <Button
                onClick={handleUpdateProfile}
                disabled={saving}
                className="w-fit btn-glow"
              >
                {saving ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}