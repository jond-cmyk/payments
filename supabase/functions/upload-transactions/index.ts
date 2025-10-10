import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { parse } from 'https://deno.land/std@0.190.0/csv/mod.ts'; // For CSV parsing

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          persistSession: false,
        },
      }
    );

    const payload = await req.json();
    const { fileName, fileContent, uploaderId } = payload;

    if (!fileName || !fileContent || !uploaderId) {
      return new Response(JSON.stringify({ error: 'Missing file data or uploader ID in payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Received file: ${fileName} from uploader: ${uploaderId}`);

    let records;
    try {
      records = await parse(fileContent, {
        skipFirstRow: true, // Assuming header row
        columns: ['transaction_date', 'description', 'amount', 'currency', 'user_email', 'original_transaction_id'], // Expected columns
      });
    } catch (csvParseError) {
      console.error('CSV parsing error:', csvParseError);
      return new Response(JSON.stringify({ error: `Failed to parse CSV file: ${csvParseError.message}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const transactionsToInsert = [];
    const errors: string[] = [];

    for (const record of records) {
      const { transaction_date, description, amount, currency, user_email, original_transaction_id } = record;

      // Basic validation for required fields
      if (!transaction_date || !description || !amount || !currency || !user_email) {
        errors.push(`Missing required fields (date, description, amount, currency, or user_email) for a transaction. Skipping record: ${JSON.stringify(record)}`);
        continue;
      }

      // Validate and parse amount
      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount)) {
        errors.push(`Invalid amount '${amount}' for transaction '${description}'. Skipping record.`);
        continue;
      }

      // Find user_id based on user_email
      const { data: profile, error: profileError } = await supabaseClient
        .from('profile_with_email')
        .select('id')
        .eq('user_email', user_email)
        .single();

      if (profileError || !profile) {
        errors.push(`Could not find user for email '${user_email}' for transaction '${description}'. Error: ${profileError?.message || 'Profile not found'}.`);
        continue;
      }

      transactionsToInsert.push({
        user_id: profile.id,
        original_transaction_id: original_transaction_id || null,
        transaction_date: transaction_date,
        description: description,
        amount: parsedAmount,
        currency: currency,
        status: 'pending_input', // Default status
      });
    }

    if (transactionsToInsert.length > 0) {
      const { error: insertError } = await supabaseClient
        .from('transactions')
        .insert(transactionsToInsert);

      if (insertError) {
        throw new Error(`Failed to insert transactions into database: ${insertError.message}`);
      }
    }

    let message = `${transactionsToInsert.length} transactions processed successfully.`;
    if (errors.length > 0) {
      message += ` ${errors.length} records skipped due to errors. Please check logs for details.`;
      console.error('Transaction processing errors:', errors);
      return new Response(JSON.stringify({ message: message, errors: errors }), {
        status: 200, // Still return 200 if some processed, but include errors
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ message: message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Edge Function unhandled error:', error);
    return new Response(JSON.stringify({ error: error.message || 'An unexpected error occurred in the Edge Function.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});