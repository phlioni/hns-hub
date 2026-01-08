// supabase/functions/api-entry/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

        // Create a Supabase client with the Auth context of the function
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // Parse request body
        const { type, data } = await req.json()

        if (!type || !data) {
            throw new Error('Missing "type" (proposal|request) or "data" object in request body.')
        }

        let result;

        if (type === 'proposal') {
            // Logic for creating a new Proposal
            const { title, description, attachments } = data

            if (!title) {
                throw new Error('Proposal "title" is required')
            }

            // Default status is 'new'
            result = await supabase.from('proposals').insert({
                title,
                description,
                attachments: attachments || [],
                status: 'new',
                entry_date: new Date().toISOString()
            }).select().single()

        } else if (type === 'request') {
            // Logic for creating a new Request
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

        // Return successful response
        return new Response(JSON.stringify({
            success: true,
            message: `${type} created successfully`,
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