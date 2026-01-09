import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Mail, Lock, ArrowRight, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const loginSchema = z.object({
  email: z.string().email('Por favor, digite um e-mail válido'),
  password: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const { signIn, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const handleLogin = async (data: LoginFormData) => {
    setLoading(true);
    try {
      const { error } = await signIn(data.email, data.password);
      if (error) {
        if (error.message.includes('Invalid login')) {
          toast.error('E-mail ou senha inválidos');
        } else {
          toast.error(error.message);
        }
      } else {
        toast.success('Bem-vindo de volta!');
        navigate('/');
      }
    } catch (error) {
      toast.error('Ocorreu um erro inesperado');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-background">
      {/* Background Tech Pattern */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_800px_at_50%_-30%,hsl(var(--primary)/0.15),transparent)]"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_600px_at_50%_130%,hsl(var(--secondary)/0.15),transparent)]"></div>
        {/* Isometric subtle elements */}
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary/5 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '8s' }}></div>
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-secondary/5 rounded-full blur-3xl animate-pulse delay-1000" style={{ animationDuration: '10s' }}></div>
      </div>

      {/* Login Card */}
      <Card className="w-full max-w-md mx-4 relative z-10 border-primary/10 shadow-2xl bg-card/95 backdrop-blur-sm animate-slide-up">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-glow ring-4 ring-primary/10">
              <ShieldCheck className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">
            CCT
          </CardTitle>
          <CardDescription className="text-foreground/80 text-base mt-2">
            Centro de Controle e Transparência
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center mb-6">
            <h2 className="text-lg font-medium">Bem-vindo de volta</h2>
            <p className="text-sm text-muted-foreground">Entre com suas credenciais para acessar.</p>
          </div>
          <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <div className="relative group">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  className="pl-10 input-enhanced bg-background/50"
                  {...loginForm.register('email')}
                />
              </div>
              {loginForm.formState.errors.email && (
                <p className="text-sm text-destructive font-medium animate-shake">{loginForm.formState.errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative group">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className="pl-10 input-enhanced bg-background/50"
                  {...loginForm.register('password')}
                />
              </div>
              {loginForm.formState.errors.password && (
                <p className="text-sm text-destructive font-medium animate-shake">{loginForm.formState.errors.password.message}</p>
              )}
            </div>

            <Button type="submit" className="w-full btn-glow mt-6" disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Acessar Painel
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}