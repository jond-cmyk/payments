// @ts-ignore
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
// @ts-ignore
import { parse } from 'https://deno.land/std@0.224.0/csv/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Flexible header mapping (lowercase keys)
const HEADER_MAP: Record<string, string[]> = {
  transaction_date: ['date', 'transaction date'],
  description: ['text', 'description'],
  amount: ['amount'],
  currency: ['currency'],
  type: ['type'],
  entry: ['entry'],
  bank: ['bank', 'account'],
  contra_account: ['contra account', 'contra-account'],
  exchange_rate: ['exchange rate', 'exchangerate'],
  comment: ['comment', 'payment identifier/message'],
  sku: ['sku', 'department'],
  category: ['category'],
  not_sku_related: ['not sku related', 'notskurelated'],
  merchant_name: ['merchant name', 'merchantname'],
  reason_for_payment: ['reason for payment', 'reasonforpayment'],
  user_email: ['user email', 'useremail', 'email'],
  original_transaction_id: ['original transaction id', 'originaltransactionid'],
};

const REQUIRED_HEADERS = ['transaction_date', 'description', 'amount', 'currency'];

// Helper to find a header key from multiple variants
function findHeader(headers: string[], key: string): string | undefined {
  const variants = HEADER_MAP[key];
  if (!variants) return undefined;
  for (const variant of variants) {
    const found = headers.find(h => h.toLowerCase() === variant);
    if (found) return found;
  }
  return undefined;
}

// Helper to get a value from a record using the flexible header map
function getValue(record: Record<string, string>, key: string): string | undefined {
  const variants = HEADER_MAP[key];
  if (!variants) return undefined;
  for (const variant of variants) {
    const foundKey = Object.keys(record).find(k => k.toLowerCase() === variant);
    if (foundKey && record[foundKey] !== undefined) {
      return record[foundKey];
    }
  }
  return undefined;
}

// @ts-ignore
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // @ts-ignore
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    // @ts-ignore
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('Server configuration error: Missing Supabase credentials.');
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false } });
    const payload = await req.json();
    const { fileName, fileContent, uploaderId, country } = payload;

    if (!fileName || !fileContent || !uploaderId || !country) {
      throw new Error('Invalid request: Missing file data, uploader ID, or country.');
    }

    const separator = fileContent.includes(';') ? ';' : ',';
    const parsedRows = await parse(fileContent, { header: false, separator, trimLeadingWhitespace: true, lazyQuotes: true }) as string[][];

    if (parsedRows.length < 2) {
      return new Response(JSON.stringify({ success: false, message: 'CSV file is empty or has no data rows.', errors: [] }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const headers = parsedRows[0].map(h => h.trim());
    const dataRows = parsedRows.slice(1);

    // Strip BOM from the first header if it exists
    if (headers[0] && headers[0].startsWith('\uFEFF')) {
      headers[0] = headers[0].substring(1);
    }

    const missingHeaders = REQUIRED_HEADERS.filter(key => !findHeader(headers, key));
    if (missingHeaders.length > 0) {
      const friendlyNames = missingHeaders.map(key => HEADER_MAP[key][0].split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '));
      throw new Error(`CSV file is missing required columns: ${friendlyNames.join(', ')}.`);
    }

    const { data: existingEntriesData, error: fetchEntriesError } = await supabaseClient
      .from('transactions')
      .select('entry')
      .eq('country', country);

    if (fetchEntriesError) {
      throw new Error(`Database error: Failed to check for duplicate entries: ${fetchEntriesError.message}`);
    }
    const existingEntries = new Set(existingEntriesData?.map(row => row.entry).filter(Boolean) || []);
    const userEmailToIdCache: Record<string, string> = {};

    const transactionsToInsert = [];
    const errors: string[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNum = i + 2;

      try {
        if (row.length !== headers.length) {
          throw new Error(`Column count mismatch. Expected ${headers.length}, but got ${row.length}.`);
        }

        const record: Record<string, string> = {};
        headers.forEach((header, index) => {
          record[header] = row[index] || "";
        });

        const transaction_date_str = getValue(record, 'transaction_date');
        const description = getValue(record, 'description');
        const amount_str = getValue(record, 'amount');
        const currency = getValue(record, 'currency');
        const entry = getValue(record, 'entry');

        if (!transaction_date_str || !description || !amount_str || !currency) {
          throw new Error(`Missing required value for Date, Text, Amount, or Currency.`);
        }

        if (entry && existingEntries.has(entry)) {
          throw new Error(`Duplicate Entry number '${entry}' already exists for this country.`);
        }

        const dateParts = transaction_date_str.split(/[./-]/);
        let transaction_date: string;
        if (dateParts.length === 3) {
          const [p1, p2, p3] = dateParts;
          if (p1.length === 4) transaction_date = `${p1}-${p2.padStart(2, '0')}-${p3.padStart(2, '0')}`; // YYYY-MM-DD
          else transaction_date = `${p3.length === 2 ? `20${p3}` : p3}-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}`; // DD.MM.YYYY
        } else {
          throw new Error(`Invalid date format '${transaction_date_str}'. Please use DD.MM.YYYY or YYYY-MM-DD.`);
        }

        const parsedAmount = parseFloat(amount_str.replace(/,/g, '').replace(/\s/g, ''));
        if (isNaN(parsedAmount)) {
          throw new Error(`Invalid amount '${amount_str}'.`);
        }

        let parsedExchangeRate: number | null = null;
        const exchange_rate_str = getValue(record, 'exchange_rate');
        if (exchange_rate_str) {
          const rate = parseFloat(exchange_rate_str.replace(',', '.').replace(/\s/g, ''));
          if (!isNaN(rate)) parsedExchangeRate = rate;
        }

        const not_sku_related_str = getValue(record, 'not_sku_related');
        const not_sku_related = not_sku_related_str?.toLowerCase() === 'yes' || not_sku_related_str?.toLowerCase() === 'true';

        let requesterId = uploaderId;
        const userEmail = getValue(record, 'user_email');
        if (userEmail) {
          if (userEmailToIdCache[userEmail]) {
            requesterId = userEmailToIdCache[userEmail];
          } else {
            const { data: profileRow, error: profileError } = await supabaseClient.from('profile_with_email').select('id').eq('user_email', userEmail).single();
            if (profileError || !profileRow) {
              errors.push(`Row ${rowNum}: Could not find user with email '${userEmail}'. Assigning to uploader.`);
            } else {
              requesterId = profileRow.id;
              userEmailToIdCache[userEmail] = profileRow.id;
            }
          }
        }

        transactionsToInsert.push({
          requester_id: requesterId,
          status: 'pending_input',
          type: getValue(record, 'type') || null,
          transaction_date,
          entry: entry || null,
          description,
          amount: parsedAmount,
          bank: getValue(record, 'bank') || null,
          contra_account: getValue(record, 'contra_account') || null,
          currency,
          exchange_rate: parsedExchangeRate,
          comment: getValue(record, 'comment') || null,
          sku: not_sku_related ? null : (getValue(record, 'sku') || null),
          reason_for_payment: getValue(record, 'reason_for_payment') || null,
          receipt_urls: [],
          category: getValue(record, 'category') || null,
          merchant_name: getValue(record, 'merchant_name') || null,
          notes: null,
          not_sku_related,
          country,
        });
      } catch (rowError) {
        errors.push(`Row ${rowNum}: ${rowError.message}`);
      }
    }

    let insertedCount = 0;
    if (transactionsToInsert.length > 0) {
      const { data: insertData, error: insertError } = await supabaseClient
        .from('transactions')
        .insert(transactionsToInsert)
        .select();

      if (insertError) {
        throw new Error(`Database insert failed: ${insertError.message}`);
      }
      insertedCount = insertData?.length || 0;
    }

    const success = errors.length === 0 && insertedCount > 0;
    let message = `${insertedCount} of ${dataRows.length} transactions processed successfully.`;
    if (errors.length > 0) {
      message = `${insertedCount} transactions inserted. ${errors.length} records were skipped due to errors.`;
    }

    return new Response(JSON.stringify({ success, message, errors }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[upload-transactions] Edge Function Error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ success: false, message: 'An unexpected server error occurred.', errors: [errorMessage] }), {
      status: 200, // IMPORTANT: Return 200 so client can parse the error message
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});