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

        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        const { type, data } = await req.json()

        if (!type || !data) {
            throw new Error('Missing "type" (proposal|request) or "data" object in request body.')
        }

        let result;

        if (type === 'proposal') {
            // Adicionado 'idemail' na desestruturação
            const { id, title, description, attachments, status, deadline, project_code, justification, idemail } = data

            const allowedStatuses = [
                'new', 'in_review', 'awaiting_code', 'awaiting_contract', 'operational_start',
                'execution_forwarded', 'understanding', 'construction', 'delivered', 'cancelled', 'edited'
            ];

            // =================================================================================
            // ATUALIZAÇÃO
            // =================================================================================
            if (id) {
                const { data: currentProposal, error: fetchError } = await supabase
                    .from('proposals')
                    .select('status, title')
                    .eq('id', id)
                    .single();

                if (fetchError) throw new Error(`Proposal not found: ${fetchError.message}`);

                const updatePayload: any = { updated_at: new Date().toISOString() };

                let newStatus = currentProposal.status;
                let autoJustification = justification;

                if (title) updatePayload.title = title;
                if (description) updatePayload.description = description;
                if (deadline) updatePayload.deadline = deadline;
                if (attachments) updatePayload.attachments = attachments;

                // Se vier idemail na atualização (raro, mas possível correção), atualiza também
                if (idemail) updatePayload.idemail = idemail;

                // --- FLUXO 2: Recebimento de Código (Automático) ---
                if (project_code) {
                    updatePayload.project_code = project_code;

                    if (currentProposal.status === 'awaiting_code') {
                        updatePayload.status = 'new';
                        newStatus = 'new';
                        autoJustification = autoJustification || "Código recebido via automação. Status alterado para Novo.";
                    }
                }

                // --- OUTROS FLUXOS: Status explícito ---
                if (status) {
                    if (!allowedStatuses.includes(status)) {
                        throw new Error(`Invalid status: ${status}.`);
                    }
                    updatePayload.status = status;
                    newStatus = status;
                }

                updatePayload.last_justification = autoJustification || "Alteração via integração externa (API)";

                result = await supabase
                    .from('proposals')
                    .update(updatePayload)
                    .eq('id', id)
                    .select()
                    .single();

                if (result.error) throw result.error;

                // LOG NO AUDIT
                let action = 'edited';
                if (newStatus !== currentProposal.status || project_code) {
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
                        project_code_assigned: !!project_code
                    }
                });

            }
            // =================================================================================
            // CRIAÇÃO
            // =================================================================================
            else {
                if (!title) throw new Error('Proposal "title" is required');

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
                    // Adicionado o novo campo aqui
                    idemail: idemail || null,
                    last_justification: justification || "Entrada via automação (Solicitação)",
                    entry_date: entryDateObj.toISOString(),
                };

                result = await supabase.from('proposals').insert(insertPayload).select().single();

                if (result.error) throw result.error;

                await supabase.from('audit_logs').insert({
                    action: 'created',
                    entity_type: 'proposal',
                    entity_id: result.data.id,
                    user_email: 'API Integration',
                    new_status: initialStatus,
                    metadata: {
                        entity_title: result.data.title,
                        justification: insertPayload.last_justification,
                        origin_email_id: idemail // Loga o ID do email também nos metadados para facilitar debug
                    }
                });
            }

        } else if (type === 'request') {
            const { requester_name, description, priority } = data
            if (!requester_name || !description) throw new Error('Requester name and description are required')

            result = await supabase.from('requests').insert({
                requester_name,
                description,
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
        return new Response(JSON.stringify({
            success: false,
            error: error.message
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})