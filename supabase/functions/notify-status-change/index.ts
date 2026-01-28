import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"

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
        const n8nWebhookUrl = Deno.env.get('N8N_WEBHOOK_URL')

        if (!n8nWebhookUrl) {
            throw new Error('N8N_WEBHOOK_URL is not defined')
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        const payload = await req.json()
        const { type, table, record, old_record, schema } = payload

        console.log(`Processing webhook for ${table} - Type: ${type}`)

        if (type === 'UPDATE' && record.status === old_record.status) {
            return new Response(JSON.stringify({ message: 'Status did not change, skipping notification.' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        const proposalId = record.id
        const currentStatus = record.status

        // 1. Buscar e-mails configurados para o status atual
        const { data: notificationSettings, error: settingsError } = await supabase
            .from('status_notifications')
            .select('emails')
            .eq('status', currentStatus)
            .single();

        if (settingsError && settingsError.code !== 'PGRST116') {
            console.error('Error fetching notification settings:', settingsError);
        }

        const recipientEmails = notificationSettings?.emails || [];

        // 2. Buscar o histórico completo na tabela audit_logs
        const { data: logs, error: logsError } = await supabase
            .from('audit_logs')
            .select('*')
            .eq('entity_id', proposalId)
            .eq('entity_type', 'proposal')
            .order('created_at', { ascending: true })

        if (logsError) {
            throw new Error(`Error fetching audit logs: ${logsError.message}`)
        }

        // 3. Função auxiliar para datas
        const getLogDate = (targetStatus: string): string | null => {
            const log = logs?.find((l: any) => l.new_status === targetStatus)
            return log ? log.created_at : null
        }

        // 4. Montar a Linha do Tempo Estruturada
        const processSteps = [
            { step: 1, label: "Solicitação Recebida", status_key: "new" },
            { step: 2, label: "Em Construção", status_key: "construction" },
            { step: 3, label: "Proposta Enviada", status_key: "delivered" },
            { step: 4, label: "Aguardando Assinatura", status_key: "awaiting_contract" },
            { step: 5, label: "Start Operacional", status_key: "operational_start" },
            { step: 6, label: "Encaminhado p/ Execução", status_key: "execution_forwarded" }
        ]

        const structuredTimeline = processSteps.map(step => {
            let date: string | null = null;

            if (step.step === 1) {
                date = record.entry_date;
            } else {
                date = getLogDate(step.status_key);
            }

            const isCurrent = record.status === step.status_key;

            return {
                order: step.step,
                label: step.label,
                status_key: step.status_key,
                completed: !!date,
                date: date,
                is_current_step: isCurrent
            }
        });

        // 5. Montar o payload final para o n8n
        const notificationPayload = {
            proposal: record,
            // Adicionado idemail explicitamente na raiz do JSON
            idemail: record.idemail || null,
            timeline: structuredTimeline,
            recipients: recipientEmails,
            current_status: record.status,
            timestamp: new Date().toISOString(),
            trigger_event: type
        }

        // 6. Enviar para o n8n
        const n8nResponse = await fetch(n8nWebhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true'
            },
            body: JSON.stringify(notificationPayload),
        })

        if (!n8nResponse.ok) {
            throw new Error(`Failed to send to n8n: ${n8nResponse.statusText}`)
        }

        return new Response(JSON.stringify({ success: true, message: 'Notification sent to n8n' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error) {
        console.error('Error processing notification:', error)
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        })
    }
})