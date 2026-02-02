import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MainLayout } from "@/components/layout/MainLayout";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
    Pencil,
    Loader2,
    Search,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    Hash,
    Plus,
    Trash2,
    AlertTriangle,
    ArrowRightLeft
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { StatusBadge } from "@/components/ui/status-badge";

interface ClientCode {
    id: string;
    client_name: string;
    project_code: string;
    reason: string | null;
    code_prefix: string;
    code_year: string;
    sequence_number: number;
    created_at: string;
}

interface LinkedProposal {
    id: string;
    title: string;
    status: string;
}

type SortDirection = 'asc' | 'desc';

interface SortConfig {
    key: keyof ClientCode;
    direction: SortDirection;
}

export default function ProjectCodes() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState("");

    // -- ESTADOS DE EDIÇÃO/CRIAÇÃO --
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingCode, setEditingCode] = useState<ClientCode | null>(null);

    // -- ESTADOS DE EXCLUSÃO --
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [codeToDelete, setCodeToDelete] = useState<ClientCode | null>(null);
    const [linkedProposals, setLinkedProposals] = useState<LinkedProposal[]>([]);
    const [isCheckingDeps, setIsCheckingDeps] = useState(false);

    // Ação escolhida na exclusão: 'reassign' (mover) ou 'delete_all' (apagar tudo)
    const [deleteAction, setDeleteAction] = useState<'reassign' | 'delete_all'>('reassign');
    const [targetReassignCode, setTargetReassignCode] = useState<string>("");

    // -- ORDENAÇÃO --
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'created_at', direction: 'desc' });

    // 1. BUSCAR CÓDIGOS
    const { data: codes, isLoading } = useQuery({
        queryKey: ["client_codes"],
        queryFn: async () => {
            const { data, error } = await supabase.from("client_codes").select("*");
            if (error) throw error;
            return data as ClientCode[];
        },
    });

    // --- FUNÇÕES DE MANIPULAÇÃO DE ERRO ---
    const handleSupabaseError = (error: any) => {
        if (error.message?.includes("duplicate key") || error.code === "23505") {
            toast({
                title: "Código Duplicado",
                description: "Este código de projeto já existe na base de dados.",
                variant: "destructive",
            });
        } else {
            toast({
                title: "Erro na operação",
                description: error.message,
                variant: "destructive",
            });
        }
    };

    // --- MUTATIONS (CRIAR / EDITAR) ---
    const createMutation = useMutation({
        mutationFn: async (values: any) => {
            const { error } = await supabase.from("client_codes").insert(values);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["client_codes"] });
            setIsDialogOpen(false);
            toast({ title: "Sucesso", description: "Novo código criado." });
        },
        onError: handleSupabaseError,
    });

    const updateMutation = useMutation({
        mutationFn: async (values: any) => {
            const { error } = await supabase
                .from("client_codes")
                .update({
                    client_name: values.client_name,
                    project_code: values.project_code,
                    code_year: values.code_year,
                    code_prefix: values.code_prefix,
                    sequence_number: values.sequence_number // Importante atualizar a sequência também se mudar
                })
                .eq("id", values.id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["client_codes"] });
            setIsDialogOpen(false);
            toast({ title: "Atualizado", description: "Código atualizado e propostas sincronizadas." });
        },
        onError: handleSupabaseError,
    });

    // --- MUTATION (EXCLUSÃO) ---
    const deleteMutation = useMutation({
        mutationFn: async () => {
            if (!codeToDelete) return;

            // CENÁRIO 1: Existem propostas vinculadas
            if (linkedProposals.length > 0) {

                if (deleteAction === 'delete_all') {
                    // Opção A: Excluir propostas primeiro
                    const { error: propError } = await supabase
                        .from('proposals')
                        .delete()
                        .eq('project_code', codeToDelete.project_code);

                    if (propError) throw propError;

                } else if (deleteAction === 'reassign') {
                    // Opção B: Reatribuir propostas para outro código
                    if (!targetReassignCode) throw new Error("Selecione um código de destino");

                    const { error: updateError } = await supabase
                        .from('proposals')
                        .update({ project_code: targetReassignCode })
                        .eq('project_code', codeToDelete.project_code);

                    if (updateError) throw updateError;
                }
            }

            // Finalmente, excluir o código da tabela client_codes
            const { error } = await supabase
                .from('client_codes')
                .delete()
                .eq('id', codeToDelete.id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["client_codes"] });
            setDeleteDialogOpen(false);
            setLinkedProposals([]);
            setCodeToDelete(null);
            toast({
                title: "Excluído",
                description: deleteAction === 'reassign' && linkedProposals.length > 0
                    ? "Código excluído e propostas reatribuídas."
                    : "Código e registros vinculados foram excluídos."
            });
        },
        onError: handleSupabaseError
    });

    // --- HANDLERS ---

    const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);

        // 1. Obter e Normalizar o Código
        const rawCode = formData.get("project_code") as string;
        const project_code = rawCode.toUpperCase().trim();
        const client_name = formData.get("client_name") as string;

        // 2. Extração Inteligente (Regex) para Prefixo, Sequência e Ano
        // Suporta formatos: MVT032-26, MVT032-2026, etc.
        const regex = /^([A-Z]+)(\d+)-(\d{2,4})$/;
        const match = project_code.match(regex);

        let inferredPrefix = "MANUAL";
        let inferredSequence = 0;
        // Default para ano atual (2 dígitos)
        let inferredYear = new Date().getFullYear().toString().slice(-2);

        if (match) {
            // Grupo 1: Prefixo (ex: MVT)
            inferredPrefix = match[1];

            // Grupo 2: Sequência (ex: 032 -> 32)
            inferredSequence = parseInt(match[2], 10);

            // Grupo 3: Ano (ex: 26 ou 2026) -> CORREÇÃO: Pega sempre os últimos 2 dígitos
            // Isso garante que se digitar 2026, salva 26. Se digitar 26, salva 26.
            inferredYear = match[3].slice(-2);
        } else {
            // Fallback para formatos fora do padrão
            const parts = project_code.split('-');

            // Tenta achar letras no início da primeira parte
            if (parts.length > 0) {
                const prefixMatch = parts[0].match(/^([A-Z]+)/);
                if (prefixMatch) inferredPrefix = prefixMatch[1];

                // Tenta pegar sequencia se estiver colada (ex: MVT032)
                const seqMatch = parts[0].match(/(\d+)$/);
                if (seqMatch) inferredSequence = parseInt(seqMatch[1], 10);
            }

            // Tenta achar ano na segunda parte
            if (parts.length > 1) {
                const y = parts[1];
                if (y.length >= 2) inferredYear = y.slice(-2); // Força 2 dígitos
            }
        }

        const payload = {
            client_name,
            project_code,
            code_prefix: inferredPrefix,
            code_year: inferredYear,
            sequence_number: inferredSequence,
        };

        if (editingCode) {
            updateMutation.mutate({ ...payload, id: editingCode.id });
        } else {
            createMutation.mutate(payload);
        }
    };

    // INÍCIO DO FLUXO DE EXCLUSÃO
    const handleDeleteClick = async (code: ClientCode) => {
        setCodeToDelete(code);
        setIsCheckingDeps(true);
        setLinkedProposals([]);
        setTargetReassignCode(""); // Reset
        setDeleteAction('reassign'); // Default action

        try {
            // Verificar propostas vinculadas
            const { data, error } = await supabase
                .from('proposals')
                .select('id, title, status')
                .eq('project_code', code.project_code);

            if (error) throw error;

            setLinkedProposals(data as LinkedProposal[]);
            setDeleteDialogOpen(true);
        } catch (error: any) {
            toast({
                title: "Erro ao verificar dependências",
                description: error.message,
                variant: "destructive"
            });
        } finally {
            setIsCheckingDeps(false);
        }
    };

    const openEdit = (code: ClientCode) => {
        setEditingCode(code);
        setIsDialogOpen(true);
    };

    const openCreate = () => {
        setEditingCode(null);
        setIsDialogOpen(true);
    };

    // --- FILTROS E ORDENAÇÃO ---
    const filteredCodes = useMemo(() => {
        if (!codes) return [];
        return codes.filter(
            (code) =>
                code.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                code.project_code.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [codes, searchTerm]);

    const sortedCodes = useMemo(() => {
        return [...filteredCodes].sort((a, b) => {
            const aValue = a[sortConfig.key];
            const bValue = b[sortConfig.key];
            if (aValue === null) return 1;
            if (bValue === null) return -1;
            if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [filteredCodes, sortConfig]);

    const requestSort = (key: keyof ClientCode) => {
        let direction: SortDirection = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
        setSortConfig({ key, direction });
    };

    const getSortIcon = (key: keyof ClientCode) => {
        if (sortConfig.key !== key) return <ArrowUpDown className="ml-2 h-4 w-4 text-muted-foreground/50" />;
        return sortConfig.direction === 'asc' ? <ArrowUp className="ml-2 h-4 w-4 text-primary" /> : <ArrowDown className="ml-2 h-4 w-4 text-primary" />;
    };

    const isSaving = createMutation.isPending || updateMutation.isPending;

    // Lista de códigos para o Select de reatribuição (excluindo o que está sendo deletado)
    const availableCodesForReassign = codes?.filter(c => c.id !== codeToDelete?.id) || [];

    return (
        <MainLayout>
            <div className="space-y-6 animate-fade-in">

                {/* HEADER */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-[#612cb5] flex items-center gap-2">
                            <Hash className="h-8 w-8" />
                            Códigos de Projeto
                        </h1>
                        <p className="text-muted-foreground mt-1">Gerencie os códigos utilizados nas propostas.</p>
                    </div>
                    <Button onClick={openCreate} className="bg-[#612cb5] hover:bg-[#502495] text-white">
                        <Plus className="h-4 w-4 mr-2" />
                        Novo Código
                    </Button>
                </div>

                {/* SEARCH */}
                <div className="flex items-center space-x-2 bg-background/95 backdrop-blur">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar..."
                            className="pl-9 bg-white"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {/* TABELA */}
                <div className="border rounded-lg bg-card text-card-foreground shadow-sm overflow-hidden">
                    {isLoading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50">
                                    <TableHead><Button variant="ghost" onClick={() => requestSort('project_code')} className="font-bold">Código {getSortIcon('project_code')}</Button></TableHead>
                                    <TableHead><Button variant="ghost" onClick={() => requestSort('client_name')} className="font-bold">Cliente {getSortIcon('client_name')}</Button></TableHead>
                                    <TableHead><Button variant="ghost" onClick={() => requestSort('code_year')} className="font-bold">Ano {getSortIcon('code_year')}</Button></TableHead>
                                    <TableHead><Button variant="ghost" onClick={() => requestSort('sequence_number')} className="font-bold">Seq. {getSortIcon('sequence_number')}</Button></TableHead>
                                    <TableHead className="text-right">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sortedCodes.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">Nenhum código encontrado.</TableCell>
                                    </TableRow>
                                ) : (
                                    sortedCodes.map((code) => (
                                        <TableRow key={code.id} className="hover:bg-muted/50 transition-colors group">
                                            <TableCell>
                                                <span className="font-mono font-bold text-[#612cb5] bg-[#612cb5]/10 px-2 py-1 rounded border border-[#612cb5]/20">
                                                    {code.project_code}
                                                </span>
                                            </TableCell>
                                            <TableCell className="font-medium">{code.client_name}</TableCell>
                                            <TableCell>{code.code_year}</TableCell>
                                            <TableCell>{code.sequence_number}</TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                                    <Button variant="ghost" size="icon" onClick={() => openEdit(code)} className="hover:text-[#612cb5]" title="Editar">
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(code)} className="hover:text-destructive text-destructive/70" title="Excluir">
                                                        {isCheckingDeps && codeToDelete?.id === code.id ? (
                                                            <Loader2 className="h-4 w-4 animate-spin" />
                                                        ) : (
                                                            <Trash2 className="h-4 w-4" />
                                                        )}
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    )}
                </div>

                {/* --- MODAL DE CRIAÇÃO/EDIÇÃO --- */}
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle className="text-[#612cb5]">
                                {editingCode ? "Editar Código" : "Novo Código de Projeto"}
                            </DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSave} className="space-y-4 pt-4">
                            <div className="space-y-2">
                                <Label htmlFor="project_code">Código do Projeto (Único)</Label>
                                <Input
                                    id="project_code"
                                    name="project_code"
                                    defaultValue={editingCode?.project_code}
                                    placeholder="EX: CLI-2024-01"
                                    required
                                    className="font-mono uppercase"
                                    onChange={(e) => e.target.value = e.target.value.toUpperCase()}
                                />
                                {editingCode && (
                                    <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200 flex items-start gap-2">
                                        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                                        Alterar este código atualizará automaticamente todas as propostas vinculadas.
                                    </p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="client_name">Nome do Cliente</Label>
                                <Input
                                    id="client_name"
                                    name="client_name"
                                    defaultValue={editingCode?.client_name}
                                    placeholder="Ex: Empresa X"
                                    required
                                />
                            </div>

                            <DialogFooter className="gap-2 pt-4">
                                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                                    Cancelar
                                </Button>
                                <Button type="submit" disabled={isSaving} className="bg-[#612cb5] hover:bg-[#502495]">
                                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    {editingCode ? "Salvar Alterações" : "Criar Código"}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>

                {/* --- MODAL DE EXCLUSÃO INTELIGENTE --- */}
                <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2 text-destructive">
                                <Trash2 className="h-5 w-5" />
                                Excluir Código: {codeToDelete?.project_code}
                            </DialogTitle>
                            <DialogDescription>
                                {linkedProposals.length > 0
                                    ? "Este código está vinculado a propostas ativas. Você precisa decidir o que fazer com elas."
                                    : "Tem certeza? Esta ação não pode ser desfeita."}
                            </DialogDescription>
                        </DialogHeader>

                        {linkedProposals.length > 0 && (
                            <div className="py-4 space-y-4">
                                <div className="bg-muted/50 rounded-lg p-3 border">
                                    <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Propostas Afetadas ({linkedProposals.length})</h4>
                                    <ScrollArea className="h-[120px]">
                                        <ul className="space-y-2">
                                            {linkedProposals.map(p => (
                                                <li key={p.id} className="text-sm flex items-center justify-between bg-background p-2 rounded border">
                                                    <span className="truncate max-w-[180px]" title={p.title}>{p.title}</span>
                                                    {/* @ts-ignore */}
                                                    <StatusBadge status={p.status} size="xs" />
                                                </li>
                                            ))}
                                        </ul>
                                    </ScrollArea>
                                </div>

                                <RadioGroup value={deleteAction} onValueChange={(v: 'reassign' | 'delete_all') => setDeleteAction(v)} className="space-y-3">
                                    <div className={`flex items-start space-x-3 p-3 rounded-lg border transition-colors ${deleteAction === 'reassign' ? 'border-[#612cb5] bg-[#612cb5]/5' : 'border-transparent'}`}>
                                        <RadioGroupItem value="reassign" id="r1" className="mt-1" />
                                        <div className="space-y-2 flex-1">
                                            <Label htmlFor="r1" className="font-semibold cursor-pointer">Substituir Código (Recomendado)</Label>
                                            <p className="text-xs text-muted-foreground">Move as propostas para outro código antes de excluir este.</p>

                                            {deleteAction === 'reassign' && (
                                                <div className="pt-1 animate-fade-in">
                                                    <Select value={targetReassignCode} onValueChange={setTargetReassignCode}>
                                                        <SelectTrigger className="w-full h-8 text-xs">
                                                            <SelectValue placeholder="Selecione o novo código..." />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {availableCodesForReassign.map(c => (
                                                                <SelectItem key={c.id} value={c.project_code}>
                                                                    {c.project_code} - {c.client_name}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className={`flex items-start space-x-3 p-3 rounded-lg border transition-colors ${deleteAction === 'delete_all' ? 'border-destructive bg-destructive/5' : 'border-transparent'}`}>
                                        <RadioGroupItem value="delete_all" id="r2" className="mt-1" />
                                        <div className="space-y-1">
                                            <Label htmlFor="r2" className="font-semibold text-destructive cursor-pointer">Excluir Tudo</Label>
                                            <p className="text-xs text-muted-foreground">Apaga o código E TODAS as propostas listadas acima. Cuidado!</p>
                                        </div>
                                    </div>
                                </RadioGroup>
                            </div>
                        )}

                        <DialogFooter className="gap-2 sm:gap-0">
                            <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
                            <Button
                                variant={deleteAction === 'delete_all' || linkedProposals.length === 0 ? "destructive" : "default"}
                                onClick={() => deleteMutation.mutate()}
                                disabled={deleteMutation.isPending || (deleteAction === 'reassign' && linkedProposals.length > 0 && !targetReassignCode)}
                                className={deleteAction === 'reassign' && linkedProposals.length > 0 ? "bg-[#612cb5] hover:bg-[#502495]" : ""}
                            >
                                {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {linkedProposals.length === 0
                                    ? "Confirmar Exclusão"
                                    : deleteAction === 'reassign'
                                        ? "Mover e Excluir"
                                        : "Excluir Tudo"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

            </div>
        </MainLayout>
    );
}