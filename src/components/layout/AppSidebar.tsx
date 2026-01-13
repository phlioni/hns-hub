import { useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Target,
  Inbox,
  Settings,
  LogOut,
  ChevronLeft,
  Menu,
  Shield,
  BarChart3,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useState } from 'react';

const navItems = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard },
  { title: 'Propostas', url: '/proposals', icon: FileText },
  { title: 'OKRs', url: '/okrs', icon: Target },
  { title: 'Solicitações', url: '/requests', icon: Inbox },
  { title: 'Auditoria', url: '/audit', icon: ShieldCheck, restricted: true },
  { title: 'Gestão de Acesso', url: '/access', icon: Shield, restricted: true },
  { title: 'Configurações', url: '/settings', icon: Settings },
];

export function AppSidebar() {
  const location = useLocation();
  const { profile, role, signOut, user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const isMasterUser = user?.email === 'pedro.diniz@mosten.com';

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
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
    <aside
      className={cn(
        'h-full flex flex-col border-r border-sidebar-border transition-all duration-300',
        collapsed ? 'w-16' : 'w-64',
        'bg-gradient-to-b from-sidebar to-background'
      )}
    >
      {/* Header Personalizado */}
      <div
        className={cn(
          "h-16 flex items-center justify-between border-b border-sidebar-border shrink-0 transition-all duration-300",
          // Lógica do Fundo: Roxo se expandido, Padrão se colapsado
          !collapsed ? "bg-[#612cb5] px-4" : "justify-center bg-sidebar px-2"
        )}
      >
        {!collapsed ? (
          // EXPANDIDO: Texto Branco no fundo Roxo
          <span className="font-bold text-white text-sm leading-tight truncate">
            Centro de Controle<br />e Transparência
          </span>
        ) : (
          // COLAPSADO: Mantém o ícone pequeno "CCT"
          <div className="w-10 h-8 rounded-lg bg-gradient-primary flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-primary-foreground">CCT</span>
          </div>
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "transition-colors shrink-0",
            // Lógica do Botão: Branco se expandido (para contrastar com roxo), Padrão se colapsado
            !collapsed
              ? "text-white hover:bg-white/20 hover:text-white ml-auto"
              : "text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent"
          )}
        >
          {collapsed ? <Menu className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto custom-scrollbar">
        {navItems.map((item) => {
          if (item.restricted && !isMasterUser) return null;

          return (
            <Link
              key={item.url}
              to={item.url}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                isActive(item.url)
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground sidebar-item-active'
                  : 'text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent/50'
              )}
            >
              <item.icon className={cn('h-5 w-5 flex-shrink-0', isActive(item.url) && 'text-primary')} />
              {!collapsed && <span>{item.title}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="p-4 border-t border-sidebar-border shrink-0">
        <div className={cn('flex items-center gap-3', collapsed && 'justify-center')}>
          <Avatar className="h-9 w-9 border border-sidebar-border">
            <AvatarFallback className="bg-secondary text-secondary-foreground text-sm">
              {getInitials(profile?.full_name ?? null, profile?.email ?? null)}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {profile?.full_name || profile?.email || 'Usuário'}
              </p>
              <p className="text-xs text-muted-foreground">{getRoleLabel(role)}</p>
            </div>
          )}
          {!collapsed && (
            <Button
              variant="ghost"
              size="icon"
              onClick={signOut}
              className="text-sidebar-foreground hover:text-destructive hover:bg-destructive/10"
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </aside>
  );
}