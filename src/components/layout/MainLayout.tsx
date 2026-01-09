import { ReactNode } from 'react';
import { AppSidebar } from './AppSidebar';

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    // MUDANÇA: h-screen (fixo) ao invés de min-h-screen, e overflow-hidden para não scrollar a janela
    <div className="flex h-screen w-full bg-background overflow-hidden">
      <AppSidebar />

      {/* MUDANÇA: h-full e overflow-y-auto permitem que SÓ este container tenha scroll */}
      <main className="flex-1 h-full overflow-y-auto relative scroll-smooth">
        <div className="p-6 lg:p-8 pb-20">
          {children}
        </div>
      </main>
    </div>
  );
}