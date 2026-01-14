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
                'understanding', 'construction', 'delivered', 'cancelled'
            ];

            // LOGICA DE ATUALIZAÇÃO (com ID)
            if (id) {
                // Primeiro, obter o status atual para auditoria
                const { data: currentProposal, error: fetchError } = await supabase
                    .from('proposals')
                    .select('status, title')
                    .eq('id', id)
                    .single();

                if (fetchError) throw new Error(`Proposal not found: ${fetchError.message}`);

                const updatePayload: any = { updated_at: new Date().toISOString() };

                // Inicializa newStatus com o status atual do banco
                let newStatus = currentProposal.status;

                if (title) updatePayload.title = title;
                if (description) updatePayload.description = description;
                if (deadline) updatePayload.deadline = deadline;

                // --- ALTERAÇÃO AQUI ---
                // Se receber o código do projeto, salva o código E muda o status para 'new'
                if (project_code) {
                    updatePayload.project_code = project_code;
                    updatePayload.status = 'new';
                    newStatus = 'new';
                }

                // Se vier justificativa no payload, salva na coluna da tabela
                if (justification) updatePayload.last_justification = justification;

                // Se o usuário enviou um status explicitamente no JSON, ele sobrescreve a regra anterior
                if (status) {
                    if (!allowedStatuses.includes(status)) {
                        throw new Error(`Invalid status: ${status}.`);
                    }
                    updatePayload.status = status;
                    newStatus = status;
                }

                if (attachments) updatePayload.attachments = attachments;

                result = await supabase
                    .from('proposals')
                    .update(updatePayload)
                    .eq('id', id)
                    .select()
                    .single();

                if (result.error) throw result.error;

                // INSERIR AUDIT LOG
                let action = 'edited';
                // Verifica se houve mudança de status (comparando o atual do banco com o novo calculado)
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
                        justification: justification || 'Alteração via integração externa (API)'
                    }
                });

            }
            // LOGICA DE CRIAÇÃO (sem ID)
            else {
                if (!title) throw new Error('Proposal "title" is required');

                const initialStatus = status || 'new';
                if (!allowedStatuses.includes(initialStatus)) {
                    throw new Error(`Invalid status: ${initialStatus}. Allowed: ${allowedStatuses.join(', ')}`);
                }

                const entryDateObj = new Date();
                let finalDeadline = deadline;
                if (!finalDeadline) {
                    finalDeadline = addBusinessDays(entryDateObj, 5).toISOString();
                }

                const insertPayload = {
                    title,
                    description,
                    attachments: attachments || [],
                    status: initialStatus,
                    deadline: finalDeadline,
                    project_code: project_code || null,
                    last_justification: justification || null, // Salva justificativa inicial se houver
                    entry_date: entryDateObj.toISOString(),
                };

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
                        justification: justification || 'Criação via integração externa (API)'
                    }
                });
            }

        } else if (type === 'request') {
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

        // RETORNO ATUALIZADO
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