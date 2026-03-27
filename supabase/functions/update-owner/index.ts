import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // 1. Tratamento de CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // 2. Conexão com o Supabase
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // 3. Captura do body enviado pelo n8n
        const body = await req.json()
        const { type, data } = body

        // Validação básica do formato
        if (type !== 'proposal' || !data) {
            throw new Error('Formato inválido. Esperado "type": "proposal" com objeto "data".')
        }

        const { id, owner } = data

        // Validação estrita: se faltar o ID ou o Owner, a função barra a execução
        if (!id || !owner) {
            throw new Error('Os campos "id" e "owner" são obrigatórios.')
        }

        console.log(`Atualizando proposta ${id} com o responsável: ${owner}`);

        // 4. Executa a atualização no banco de dados
        const { data: resultData, error } = await supabase
            .from('proposals')
            .update({ 
                owner: owner,
                updated_at: new Date().toISOString() 
            })
            .eq('id', id)
            .select()
            .single()

        if (error) throw error

        // 5. Retorna sucesso
        return new Response(JSON.stringify({
            success: true,
            message: 'Responsável atualizado com sucesso.',
            data: resultData
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error: any) {
        console.error("Erro na atualização:", error.message);
        
        return new Response(JSON.stringify({
            success: false,
            error: error.message
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})