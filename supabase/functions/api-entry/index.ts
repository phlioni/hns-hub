import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"
import { addBusinessDays } from "https://esm.sh/date-fns@2.30.0"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// --- FUNÇÃO AUXILIAR PARA GERAR PREFIXO ---
function generatePrefix(name: string): string {
    if (!name) return 'UNK';
    const cleanName = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (cleanName.length < 3) return cleanName.padEnd(3, 'X');

    const firstLetter = cleanName[0];
    const rest = cleanName.slice(1);
    const consonants = rest.replace(/[AEIOU]/g, '');
    const code = (firstLetter + consonants).slice(0, 3);

    if (code.length < 3) {
        return cleanName.slice(0, 3).padEnd(3, 'X');
    }
    return code;
}

// --- FUNÇÃO AUXILIAR PARA EXTRAIR TAGS ---
function extractTags(title: string): string[] {
    if (!title) return [];
    // Busca por textos entre colchetes, ex: [ESTRATÉGICO]
    const regex = /\[(.*?)\]/g;
    const matches = [...title.matchAll(regex)];
    // Retorna array com as tags em maiúsculo e sem os colchetes
    return matches.map(m => m[1].toUpperCase().trim());
}

serve(async (req) => {
    // Tratamento de OPTIONS (CORS)
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

        // Usa a Service Key para ignorar RLS e garantir escrita
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        const body = await req.json()
        const { type, data } = body

        // [DEBUG] Verificando entrada de dados
        console.log(`Recebido type: ${type}`);
        if (data) {
            console.log(`Dados recebidos - Client: ${data.client}, Reason: ${data.reason}, Code: ${data.project_code}`);
        }

        if (!type || !data) {
            throw new Error('Missing "type" (proposal|request) or "data" object in request body.')
        }

        let result;

        if (type === 'proposal') {
            const { id, title, description, attachments, status, deadline, project_code, justification, idemail, client, reason } = data

            const allowedStatuses = [
                'new', 'in_review', 'awaiting_code', 'awaiting_contract', 'operational_start',
                'execution_forwarded', 'understanding', 'construction', 'delivered', 'cancelled', 'edited'
            ];

            // Extrai tags se houver título
            const extractedTags = title ? extractTags(title) : [];

            // =================================================================================
            // 1. ATUALIZAÇÃO (Fluxo normal se já existe ID da Proposta)
            // =================================================================================
            if (id) {
                // --- INICIO BLOCO DE UPDATE ---
                const { data: currentProposal, error: fetchError } = await supabase
                    .from('proposals').select('status, title').eq('id', id).single();
                if (fetchError) throw new Error(`Proposal not found: ${fetchError.message}`);

                const updatePayload: any = { updated_at: new Date().toISOString() };

                if (project_code) updatePayload.project_code = project_code;
                if (status) updatePayload.status = status;

                // Se o título foi atualizado, atualizamos também as tags
                if (title) {
                    updatePayload.title = title;
                    updatePayload.tags = extractedTags;
                }

                // REGRA DE SOBRESCRITA DE STATUS EM UPDATE (OPCIONAL, MAS BOA PRÁTICA)
                // Se a tag OPERAÇÕES for adicionada num update, força o status?
                // Mantive o comportamento padrão aqui, mas se quiser forçar no update também, descomente abaixo:
                /*
                if (extractedTags.some(t => t === 'OPERAÇÕES')) {
                    updatePayload.status = 'execution_forwarded';
                }
                */

                // Nota: Mantive a lógica original de update simplificada aqui conforme seu código original
                result = await supabase.from('proposals').update(updatePayload).eq('id', id).select().single();
                if (result.error) throw result.error;

                await supabase.from('audit_logs').insert({
                    action: 'edited', entity_type: 'proposal', entity_id: id, user_email: 'API Integration',
                    metadata: { entity_title: result.data.title, tags_extracted: extractedTags }
                });
                // --- FIM BLOCO DE UPDATE ---

            }
            // =================================================================================
            // 2. PROCESSAMENTO SEM ID (Criação ou Match)
            // =================================================================================
            else {

                // ... Se passou pelas lógicas de match e ainda não tem result ...
                if (!result) {

                    const finalTitle = title || 'Nova Proposta (Sem Título)';
                    let initialStatus = status || 'awaiting_code';

                    // --- REGRA DE NEGÓCIO: TAG [OPERAÇÕES] FORÇA STATUS ---
                    // Verifica se existe a tag OPERAÇÕES (uppercase vindo do extractTags)
                    if (extractedTags.includes('OPERAÇÕES')) {
                        console.log("Tag [OPERAÇÕES] detectada. Forçando status para 'execution_forwarded'.");
                        initialStatus = 'execution_forwarded';
                    }

                    // =============================================================
                    // LÓGICA DE GERAÇÃO DE CÓDIGO (CLIENTE)
                    // =============================================================
                    let finalProjectCode = project_code;

                    // [DEBUG] Verifica se entra na condição
                    if (!finalProjectCode && client) {
                        console.log("Iniciando geração de código automático...");

                        try {
                            // 1. Gera Prefixo e Ano
                            const prefix = generatePrefix(client);
                            const currentYear = new Date().getFullYear().toString().slice(-2);

                            // 2. Busca último sequencial
                            const { data: lastEntry, error: codeError } = await supabase
                                .from('client_codes')
                                .select('sequence_number')
                                .eq('code_prefix', prefix)
                                .order('sequence_number', { ascending: false })
                                .limit(1)
                                .maybeSingle();

                            if (codeError) {
                                console.error("Erro ao buscar sequencial:", codeError);
                            }

                            // 3. Calcula novo sequencial
                            const nextSequence = (lastEntry?.sequence_number || 0) + 1;
                            const sequenceString = nextSequence.toString().padStart(3, '0');

                            // 4. Formata Código Final
                            finalProjectCode = `${prefix}${sequenceString}-${currentYear}`;
                            console.log(`Código Gerado: ${finalProjectCode}`);

                            // 5. Salva na tabela auxiliar
                            const { error: insertCodeError } = await supabase.from('client_codes').insert({
                                client_name: client,
                                project_code: finalProjectCode,
                                code_prefix: prefix,
                                code_year: currentYear,
                                sequence_number: nextSequence,
                                reason: reason || justification || 'Criação de Proposta Automática'
                            });

                            if (insertCodeError) {
                                console.error("FALHA CRÍTICA ao salvar client_codes:", insertCodeError);
                                throw new Error(`Falha ao registrar código do cliente: ${insertCodeError.message}`);
                            } else {
                                console.log("Sucesso ao salvar em client_codes");
                            }

                        } catch (err) {
                            console.error("Erro no bloco de geração de código:", err);
                            throw err;
                        }
                    } else {
                        console.log("Pulo da geração de código: 'project_code' já existe ou 'client' não informado.");
                    }
                    // =============================================================

                    const entryDateObj = new Date();
                    let finalDeadline = deadline;
                    if (!finalDeadline) {
                        finalDeadline = addBusinessDays(entryDateObj, 5).toISOString();
                    }

                    const insertPayload: any = {
                        title: finalTitle,
                        description: description || null,
                        attachments: attachments || [],
                        status: initialStatus,
                        deadline: finalDeadline,
                        project_code: finalProjectCode || null,
                        idemail: idemail || null,
                        last_justification: justification || "Entrada via automação",
                        entry_date: entryDateObj.toISOString(),
                        tags: extractedTags
                    };

                    console.log(`Inserindo proposta. Tags: ${extractedTags}. Status Final: ${initialStatus}`);
                    result = await supabase.from('proposals').insert(insertPayload).select().single();

                    if (result.error) {
                        console.error("Erro ao inserir proposta:", result.error);
                        throw result.error;
                    }

                    await supabase.from('audit_logs').insert({
                        action: 'created',
                        entity_type: 'proposal',
                        entity_id: result.data.id,
                        user_email: 'API Integration',
                        new_status: initialStatus,
                        metadata: {
                            entity_title: result.data.title,
                            generated_project_code: finalProjectCode,
                            tags: extractedTags,
                            forced_status: extractedTags.includes('OPERAÇÕES')
                        }
                    });
                }
            }

        } else if (type === 'request') {
            // Lógica de requests...
            const { requester_name, description, priority } = data
            result = await supabase.from('requests').insert({
                requester_name: requester_name || 'Solicitante Anônimo',
                description: description || 'Sem descrição',
                priority: priority || 'medium',
                status: 'pending'
            }).select().single()
        } else {
            throw new Error('Invalid type.')
        }

        if (result.error) throw result.error

        return new Response(JSON.stringify({
            success: true,
            id: result.data?.id,
            data: result.data
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error) {
        console.error("Erro Geral na API:", error.message);
        return new Response(JSON.stringify({
            success: false,
            error: error.message
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})