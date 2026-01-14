import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/hooks/useAuth';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, MoreVertical, Search, ShieldAlert, UserCheck, Trash2, Plus, Pencil, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

interface UserProfile {
    id: string;
    full_name: string | null;
    email: string;
    avatar_url: string | null;
    created_at: string;
    user_roles: {
        role: 'admin' | 'member' | 'account_manager';
    }[];
}

// Atualizado para incluir account_manager
const createUserSchema = z.object({
    fullName: z.string().min(2, "Nome é obrigatório"),
    email: z.string().email("E-mail inválido"),
    password: z.string().min(6, "Senha deve ter 6 caracteres"),
    role: z.enum(["admin", "member", "account_manager"]),
});

type CreateUserForm = z.infer<typeof createUserSchema>;

export default function AccessControl() {
    const { user: currentUser } = useAuth();
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState('');

    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

    const createForm = useForm<CreateUserForm>({
        resolver: zodResolver(createUserSchema),
        defaultValues: { fullName: '', email: '', password: '', role: 'member' }
    });

    const [editName, setEditName] = useState('');

    const { data: users, isLoading } = useQuery({
        queryKey: ['users-access-control'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('profiles')
                .select('*, user_roles(role)')
                .order('full_name');
            if (error) throw error;
            return data as unknown as UserProfile[];
        },
    });

    // 1. Criar Usuário
    const createUserMutation = useMutation({
        mutationFn: async (data: CreateUserForm) => {
            const { error } = await supabase.rpc('create_user_by_admin', {
                new_email: data.email,
                new_password: data.password,
                new_name: data.fullName,
                new_role: data.role
            });
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success('Usuário criado com sucesso!');
            setIsCreateOpen(false);
            createForm.reset();
            queryClient.invalidateQueries({ queryKey: ['users-access-control'] });
        },
        onError: (error: any) => {
            toast.error(`Erro ao criar: ${error.message}`);
        }
    });

    // 2. Editar Role
    const updateRoleMutation = useMutation({
        mutationFn: async ({ userId, newRole }: { userId: string; newRole: 'admin' | 'member' | 'account_manager' }) => {
            const { error } = await supabase
                .from('user_roles')
                .update({ role: newRole })
                .eq('user_id', userId);
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success('Permissão atualizada!');
            queryClient.invalidateQueries({ queryKey: ['users-access-control'] });
        },
        onError: () => toast.error('Erro ao atualizar permissão.'),
    });

    // 3. Editar Nome (USANDO NOVA FUNÇÃO RPC)
    const updateProfileMutation = useMutation({
        mutationFn: async () => {
            if (!selectedUser) return;
            const { error } = await supabase.rpc('update_profile_by_admin', {
                target_user_id: selectedUser.id,
                new_full_name: editName
            });
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success('Perfil atualizado!');
            setIsEditOpen(false);
            queryClient.invalidateQueries({ queryKey: ['users-access-control'] });
        },
        onError: (error: any) => toast.error(`Erro ao atualizar perfil: ${error.message}`),
    });

    // 4. Excluir Usuário
    const deleteUserMutation = useMutation({
        mutationFn: async (userId: string) => {
            const { error } = await supabase.rpc('delete_user_by_admin', { user_id_to_delete: userId });
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success('Usuário excluído.');
            setIsDeleteAlertOpen(false);
            queryClient.invalidateQueries({ queryKey: ['users-access-control'] });
        },
        onError: (error: any) => toast.error(`Erro ao excluir: ${error.message}`),
    });

    const filteredUsers = users?.filter(
        (user) =>
            user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleEditClick = (user: UserProfile) => {
        setSelectedUser(user);
        setEditName(user.full_name || '');
        setIsEditOpen(true);
    };

    const handleDeleteClick = (user: UserProfile) => {
        setSelectedUser(user);
        setIsDeleteAlertOpen(true);
    };

    const getRoleBadge = (role: string) => {
        switch (role) {
            case 'admin':
                return <Badge variant="default" className="bg-primary/20 text-primary hover:bg-primary/30 border-primary/20">Admin</Badge>;
            case 'account_manager':
                return <Badge variant="secondary" className="bg-purple-100 text-purple-700 hover:bg-purple-200 border-purple-200">Gestão de Contas</Badge>;
            default:
                return <Badge variant="secondary" className="bg-muted text-muted-foreground">Membro</Badge>;
        }
    };

    const getInitials = (name: string | null, email: string) => {
        if (name) return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
        return email[0].toUpperCase();
    };

    return (
        <MainLayout>
            <div className="space-y-6 animate-fade-in">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-foreground">Gestão de Acesso</h1>
                        <p className="text-muted-foreground">Gerencie os usuários e permissões da plataforma.</p>
                    </div>
                    <Button onClick={() => setIsCreateOpen(true)} className="btn-glow">
                        <Plus className="w-4 h-4 mr-2" /> Novo Usuário
                    </Button>
                </div>

                <Card className="border-border/50 shadow-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle>Usuários Cadastrados</CardTitle>
                                <CardDescription>
                                    Total de {users?.length} usuários na organização
                                </CardDescription>
                            </div>
                            <div className="relative w-full max-w-xs">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Buscar..."
                                    className="pl-9 h-9"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
                        ) : (
                            <div className="rounded-md border border-border">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                                            <TableHead className="w-[300px]">Usuário</TableHead>
                                            <TableHead>Cargo</TableHead>
                                            <TableHead>Data de Entrada</TableHead>
                                            <TableHead className="text-right">Ações</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredUsers?.map((user) => {
                                            const role = user.user_roles?.[0]?.role || 'member';
                                            const isCurrentUser = user.id === currentUser?.id;

                                            return (
                                                <TableRow key={user.id} className="group">
                                                    <TableCell>
                                                        <div className="flex items-center gap-3">
                                                            <Avatar className="h-9 w-9 border border-border">
                                                                <AvatarImage src={user.avatar_url || ''} />
                                                                <AvatarFallback className="bg-secondary text-xs">
                                                                    {getInitials(user.full_name, user.email)}
                                                                </AvatarFallback>
                                                            </Avatar>
                                                            <div className="flex flex-col">
                                                                <span className="font-medium text-sm text-foreground">
                                                                    {user.full_name || 'Sem nome'}
                                                                </span>
                                                                <span className="text-xs text-muted-foreground">{user.email}</span>
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>{getRoleBadge(role)}</TableCell>
                                                    <TableCell className="text-sm text-muted-foreground">
                                                        {new Date(user.created_at).toLocaleDateString('pt-BR')}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                                                                >
                                                                    <MoreVertical className="h-4 w-4 text-muted-foreground" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end">
                                                                <DropdownMenuItem onClick={() => handleEditClick(user)}>
                                                                    <Pencil className="mr-2 h-4 w-4" /> Editar Perfil
                                                                </DropdownMenuItem>

                                                                {role !== 'admin' && (
                                                                    <DropdownMenuItem
                                                                        onClick={() => updateRoleMutation.mutate({ userId: user.id, newRole: 'admin' })}
                                                                        className="text-primary focus:text-primary"
                                                                    >
                                                                        <ShieldAlert className="mr-2 h-4 w-4" /> Promover a Admin
                                                                    </DropdownMenuItem>
                                                                )}

                                                                {role !== 'account_manager' && (
                                                                    <DropdownMenuItem
                                                                        onClick={() => updateRoleMutation.mutate({ userId: user.id, newRole: 'account_manager' })}
                                                                    >
                                                                        <Shield className="mr-2 h-4 w-4" /> Mudar para Gestão de Contas
                                                                    </DropdownMenuItem>
                                                                )}

                                                                {role !== 'member' && !isCurrentUser && (
                                                                    <DropdownMenuItem
                                                                        onClick={() => updateRoleMutation.mutate({ userId: user.id, newRole: 'member' })}
                                                                    >
                                                                        <UserCheck className="mr-2 h-4 w-4" /> Rebaixar a Membro
                                                                    </DropdownMenuItem>
                                                                )}

                                                                {!isCurrentUser && (
                                                                    <>
                                                                        <div className="h-px bg-border my-1" />
                                                                        <DropdownMenuItem
                                                                            onClick={() => handleDeleteClick(user)}
                                                                            className="text-destructive focus:text-destructive"
                                                                        >
                                                                            <Trash2 className="mr-2 h-4 w-4" /> Excluir Usuário
                                                                        </DropdownMenuItem>
                                                                    </>
                                                                )}
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Modal: Criar Usuário */}
                <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Novo Usuário</DialogTitle>
                            <DialogDescription>Crie um novo acesso para a plataforma.</DialogDescription>
                        </DialogHeader>
                        <form onSubmit={createForm.handleSubmit((data) => createUserMutation.mutate(data))}>
                            <div className="space-y-4 py-2">
                                <div className="space-y-2">
                                    <Label>Nome Completo</Label>
                                    <Input {...createForm.register('fullName')} placeholder="Ex: João Silva" />
                                    {createForm.formState.errors.fullName && <p className="text-destructive text-xs">{createForm.formState.errors.fullName.message}</p>}
                                </div>
                                <div className="space-y-2">
                                    <Label>E-mail</Label>
                                    <Input {...createForm.register('email')} placeholder="email@empresa.com" />
                                    {createForm.formState.errors.email && <p className="text-destructive text-xs">{createForm.formState.errors.email.message}</p>}
                                </div>
                                <div className="space-y-2">
                                    <Label>Senha Temporária</Label>
                                    <Input {...createForm.register('password')} type="password" placeholder="******" />
                                    {createForm.formState.errors.password && <p className="text-destructive text-xs">{createForm.formState.errors.password.message}</p>}
                                </div>
                                <div className="space-y-2">
                                    <Label>Função</Label>
                                    <Select onValueChange={(val) => createForm.setValue('role', val as 'admin' | 'member' | 'account_manager')} defaultValue="member">
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecione" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="member">Membro</SelectItem>
                                            <SelectItem value="account_manager">Gestão de Contas</SelectItem>
                                            <SelectItem value="admin">Administrador</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <DialogFooter className="mt-4">
                                <Button type="submit" disabled={createUserMutation.isPending}>
                                    {createUserMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                    Criar Usuário
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>

                {/* Modal: Editar Usuário */}
                <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Editar Perfil</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-2">
                            <div className="space-y-2">
                                <Label>Nome Completo</Label>
                                <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button onClick={() => updateProfileMutation.mutate()} disabled={updateProfileMutation.isPending}>
                                Salvar Alterações
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Alert: Excluir Usuário */}
                <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Tem certeza absoluta?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Essa ação excluirá permanentemente o acesso de <strong>{selectedUser?.email}</strong> e não pode ser desfeita.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={() => selectedUser && deleteUserMutation.mutate(selectedUser.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                                Sim, excluir usuário
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

            </div>
        </MainLayout>
    );
}