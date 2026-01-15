import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"
import { addBusinessDays } from "https://esm.sh/date-fns@2.30.0"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

        // Create a Supabase client with the Auth context of the function
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        const { type, data } = await req.json()

        if (!type || !data) {
            throw new Error('Missing "type" (proposal|request) or "data" object in request body.')
        }

        let result;

        if (type === 'proposal') {
            const { id, title, description, attachments, status, deadline, project_code, justification } = data

            const allowedStatuses = [
                'new', 'in_review', 'awaiting_code', 'awaiting_contract', 'operational_start',
                'execution_forwarded', 'understanding', 'construction', 'delivered', 'cancelled'
            ];

            // =================================================================================
            // LÓGICA DE ATUALIZAÇÃO (Fluxo: Código -> Novo -> Assinatura -> Start -> Execução)
            // =================================================================================
            if (id) {
                // 1. Obter dados atuais para auditoria e lógica condicional
                const { data: currentProposal, error: fetchError } = await supabase
                    .from('proposals')
                    .select('status, title, code_received_date, awaiting_contract_date, operational_start_date, execution_forwarded_date')
                    .eq('id', id)
                    .single();

                if (fetchError) throw new Error(`Proposal not found: ${fetchError.message}`);

                const updatePayload: any = { updated_at: new Date().toISOString() };
                const nowISO = new Date().toISOString();

                let newStatus = currentProposal.status;
                let autoJustification = justification;

                // Campos opcionais básicos
                if (title) updatePayload.title = title;
                if (description) updatePayload.description = description;
                if (deadline) updatePayload.deadline = deadline;
                if (attachments) updatePayload.attachments = attachments;

                // --- CENÁRIO: RECEBIMENTO DE CÓDIGO (Fluxo 2) ---
                // Se receber o código do projeto, salva o código, muda para 'new' e grava a data
                if (project_code) {
                    updatePayload.project_code = project_code;

                    // Só muda para 'new' se ainda estiver em 'awaiting_code' ou se for forçado
                    // Isso evita retroceder status se a proposta já estiver adiantada
                    if (currentProposal.status === 'awaiting_code') {
                        updatePayload.status = 'new';
                        newStatus = 'new';
                        updatePayload.code_received_date = nowISO; // Grava data do código
                        autoJustification = autoJustification || "Código recebido via automação. Status alterado para Novo.";
                    }
                }

                // --- CENÁRIO: ALTERAÇÃO DE STATUS EXPLÍCITA (Fluxos 4, 5, 6) ---
                if (status) {
                    if (!allowedStatuses.includes(status)) {
                        throw new Error(`Invalid status: ${status}.`);
                    }
                    updatePayload.status = status;
                    newStatus = status;

                    // Lógica de Datas para Timeline
                    if (status === 'delivered') {
                        updatePayload.delivery_date = nowISO;
                    }
                    else if (status === 'awaiting_contract') {
                        // Só atualiza data se ainda não tiver, para preservar o histórico original se reprocessado
                        if (!currentProposal.awaiting_contract_date) {
                            updatePayload.awaiting_contract_date = nowISO;
                        }
                    }
                    else if (status === 'operational_start') {
                        if (!currentProposal.operational_start_date) {
                            updatePayload.operational_start_date = nowISO;
                        }
                    }
                    else if (status === 'execution_forwarded') {
                        if (!currentProposal.execution_forwarded_date) {
                            updatePayload.execution_forwarded_date = nowISO;
                        }
                    }
                }

                updatePayload.last_justification = autoJustification || "Alteração via integração externa (API)";

                // Executa o Update
                result = await supabase
                    .from('proposals')
                    .update(updatePayload)
                    .eq('id', id)
                    .select()
                    .single();

                if (result.error) throw result.error;

                // INSERIR AUDIT LOG
                let action = 'edited';
                if (newStatus !== currentProposal.status) {
                    action = 'status_changed';
                }

                await supabase.from('audit_logs').insert({
                    action: action,
                    entity_type: 'proposal',
                    entity_id: id,
                    user_email: 'API Integration',
                    previous_status: currentProposal.status,
                    new_status: newStatus,
                    metadata: {
                        entity_title: result.data.title,
                        justification: updatePayload.last_justification,
                        changed_fields: Object.keys(updatePayload)
                    }
                });

            }
            // =================================================================================
            // LÓGICA DE CRIAÇÃO (Fluxo 1: Nasce como Aguardando Código)
            // =================================================================================
            else {
                if (!title) throw new Error('Proposal "title" is required');

                // Padrão do Fluxo 1: Entra como 'awaiting_code' se não especificado
                const initialStatus = status || 'awaiting_code';

                if (!allowedStatuses.includes(initialStatus)) {
                    throw new Error(`Invalid status: ${initialStatus}. Allowed: ${allowedStatuses.join(', ')}`);
                }

                const entryDateObj = new Date();
                let finalDeadline = deadline;
                if (!finalDeadline) {
                    finalDeadline = addBusinessDays(entryDateObj, 5).toISOString();
                }

                const insertPayload: any = {
                    title,
                    description,
                    attachments: attachments || [],
                    status: initialStatus,
                    deadline: finalDeadline,
                    project_code: project_code || null,
                    last_justification: justification || "Entrada via automação de e-mail (Solicitação)",
                    entry_date: entryDateObj.toISOString(),
                };

                // Se por acaso já nascer com código (raro no fluxo descrito, mas possível via API direta)
                if (initialStatus === 'new' || project_code) {
                    insertPayload.code_received_date = entryDateObj.toISOString();
                }

                // Se nascer aguardando código, setamos a data específica também para redundância na timeline
                if (initialStatus === 'awaiting_code') {
                    insertPayload.awaiting_code_date = entryDateObj.toISOString();
                }

                result = await supabase.from('proposals').insert(insertPayload).select().single();

                if (result.error) throw result.error;

                // INSERIR AUDIT LOG
                await supabase.from('audit_logs').insert({
                    action: 'created',
                    entity_type: 'proposal',
                    entity_id: result.data.id,
                    user_email: 'API Integration',
                    new_status: initialStatus,
                    metadata: {
                        entity_title: result.data.title,
                        justification: insertPayload.last_justification
                    }
                });
            }

        } else if (type === 'request') {
            // Lógica de Requests mantida igual
            const { requester_name, description, priority } = data

            if (!requester_name || !description) {
                throw new Error('Requester name and description are required for requests')
            }

            result = await supabase.from('requests').insert({
                requester_name,
                description,
                priority: priority || 'medium',
                status: 'pending'
            }).select().single()

        } else {
            throw new Error('Invalid type. Supported types are: "proposal", "request"')
        }

        if (result.error) {
            throw result.error
        }

        return new Response(JSON.stringify({
            success: true,
            message: `${type} processed successfully`,
            id: result.data?.id,
            data: result.data
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error) {
        return new Response(JSON.stringify({
            success: false,
            error: error.message
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})