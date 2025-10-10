import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { parse } from 'https://deno.land/std@0.190.0/csv/mod.ts';

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

    console.log(`[upload-transactions] Received file: ${fileName} from uploader: ${uploaderId}`);
    console.log(`[upload-transactions] File content (first 200 chars): ${fileContent.substring(0, 200)}`);
    console.log(`[upload-transactions] File content length: ${fileContent.length}`);

    let records: Record<string, string>[];
    try {
      records = await parse(fileContent, {
        header: true,
        separator: ',',
      }) as Record<string, string>[];
      console.log(`[upload-transactions] CSV parsed successfully. Number of records: ${records.length}`);
      console.log(`[upload-transactions] First parsed record: ${JSON.stringify(records[0])}`);
    } catch (csvParseError) {
      console.error('[upload-transactions] CSV parsing error:', csvParseError);
      return new Response(JSON.stringify({ error: `Failed to parse CSV file: ${csvParseError.message}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const transactionsToInsert = [];
    const errors: string[] = [];

    const expectedHeaders = ['transaction_date', 'description', 'amount', 'currency', 'user_email', 'original_transaction_id'];

    if (records.length > 0) {
        const actualHeaders = Object.keys(records[0]);
        const missingHeaders = expectedHeaders.filter(h => !actualHeaders.includes(h));
        if (missingHeaders.length > 0) {
            errors.push(`Missing expected CSV headers: ${missingHeaders.join(', ')}`);
            console.error(`[upload-transactions] Missing headers: ${missingHeaders.join(', ')}`);
        }
    }

    for (const record of records) {
      console.log(`[upload-transactions] Processing record: ${JSON.stringify(record)}`);
      const { transaction_date, description, amount, currency, user_email, original_transaction_id } = record;

      if (!transaction_date || !description || !amount || !currency || !user_email) {
        errors.push(`Missing required fields (date, description, amount, currency, or user_email) for a transaction. Skipping record: ${JSON.stringify(record)}`);
        console.warn(`[upload-transactions] Skipping record due to missing fields: ${JSON.stringify(record)}`);
        continue;
      }

      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount)) {
        errors.push(`Invalid amount '${amount}' for transaction '${description}'. Skipping record.`);
        console.warn(`[upload-transactions] Skipping record due to invalid amount: ${record.description}`);
        continue;
      }

      const { data: profile, error: profileError } = await supabaseClient
        .from('profile_with_email')
        .select('id')
        .eq('user_email', user_email)
        .single();

      if (profileError || !profile) {
        errors.push(`Could not find user for email '${user_email}' for transaction '${description}'. Error: ${profileError?.message || 'Profile not found'}.`);
        console.warn(`[upload-transactions] Skipping record due to user not found: ${user_email} for ${record.description}. Error: ${profileError?.message || 'Profile not found'}`);
        continue;
      }
      console.log(`[upload-transactions] Found user ID: ${profile.id} for email: ${user_email}`);

      transactionsToInsert.push({
        user_id: profile.id,
        original_transaction_id: original_transaction_id || null,
        transaction_date: transaction_date,
        description: description,
        amount: parsedAmount,
        currency: currency,
        status: 'pending_input',
      });
    }

    console.log(`[upload-transactions] Transactions prepared for insertion: ${transactionsToInsert.length}`);
    console.log(`[upload-transactions] First transaction to insert: ${JSON.stringify(transactionsToInsert[0])}`);


    if (transactionsToInsert.length > 0) {
      const { data: insertData, error: insertError } = await supabaseClient
        .from('transactions')
        .insert(transactionsToInsert)
        .select(); // Add .select() to get the inserted data back for logging

      if (insertError) {
        console.error('[upload-transactions] Failed to insert transactions into database:', insertError);
        throw new Error(`Failed to insert transactions into database: ${insertError.message}`);
      }
      console.log(`[upload-transactions] Successfully inserted ${insertData?.length || 0} transactions.`);
    } else {
      console.warn('[upload-transactions] No transactions to insert after processing.');
    }

    let message = `${transactionsToInsert.length} transactions processed successfully.`;
    if (errors.length > 0) {
      message += ` ${errors.length} records skipped due to errors. Please check logs for details.`;
      console.error('[upload-transactions] Transaction processing errors summary:', errors);
      return new Response(JSON.stringify({ message: message, errors: errors }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ message: message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[upload-transactions] Edge Function unhandled error:', error);
    return new Response(JSON.stringify({ error: error.message || 'An unexpected error occurred in the Edge Function.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});