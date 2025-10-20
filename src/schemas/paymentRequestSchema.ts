import * as z from 'zod';

// List of major currencies, expanded and sorted alphabetically
export const majorCurrencies = [
  { value: 'ALL', label: 'ALL - Albanian Lek' },
  { value: 'AMD', label: 'AMD - Armenian Dram' },
  { value: 'AUD', label: 'AUD - Australian Dollar' },
  { value: 'AZN', label: 'AZN - Azerbaijani Manat' },
  { value: 'BAM', label: 'BAM - Bosnia and Herzegovina Convertible Mark' },
  { value: 'BGN', label: 'BGN - Bulgarian Lev' },
  { value: 'BYN', label: 'BYN - Belarusian Ruble' },
  { value: 'CAD', label: 'CAD - Canadian Dollar' },
  { value: 'CHF', label: 'CHF - Swiss Franc' },
  { value: 'CNY', label: 'CNY - Chinese Yuan' },
  { value: 'CZK', label: 'CZK - Czech Koruna' },
  { value: 'DKK', label: 'DKK - Danish Krone' },
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'GBP', label: 'GBP - British Pound' },
  { value: 'GEL', label: 'GEL - Georgian Lari' },
  { value: 'HKD', label: 'HKD - Hong Kong Dollar' },
  { value: 'HUF', label: 'HUF - Hungarian Forint' },
  { value: 'INR', label: 'INR - Indian Rupee' },
  { value: 'ISK', label: 'ISK - Icelandic Króna' },
  { value: 'JPY', label: 'JPY - Japanese Yen' },
  { value: 'MKD', label: 'MKD - Macedonian Denar' },
  { value: 'MDL', label: 'MDL - Moldovan Leu' },
  { value: 'MXN', label: 'MXN - Mexican Peso' },
  { value: 'NOK', label: 'NOK - Norwegian Krone' },
  { value: 'NZD', label: 'NZD - New Zealand Dollar' },
  { value: 'PLN', label: 'PLN - Polish Zloty' },
  { value: 'RON', label: 'RON - Romanian Leu' },
  { value: 'RSD', label: 'RSD - Serbian Dinar' },
  { value: 'SEK', label: 'SEK - Swedish Krona' },
  { value: 'SGD', label: 'SGD - Singapore Dollar' },
  { value: 'TRY', label: 'TRY - Turkish Lira' },
  { value: 'UAH', label: 'UAH - Ukrainian Hryvnia' },
  { value: 'USD', label: 'USD - United States Dollar' },
  { value: 'ZAR', label: 'ZAR - South African Rand' },
].sort((a, b) => a.label.localeCompare(b.label));

// Zod schema for editing payment requests (requester)
export const editFormSchema = z.object({
  supplier_name: z.string().min(1, "Supplier Name is required"),
  sku_number: z.string().optional(), // Make optional initially, then refine
  not_sku_related: z.boolean().default(false), // New field
  lease_id: z.string().optional().refine((val) => { // New field
    if (val === undefined || val === null || val.trim() === '') return true; // Optional, so empty is fine
    return /^\d+$/.test(val); // Must be numerical if present
  }, "Lease ID must be a numerical value."),
  supplier_address: z.string().min(1, "Supplier Address is required"),
  iban_number: z.string().optional(), // Made optional
  sort_code: z.string().optional(), // New field
  account_number: z.string().optional(), // New field
  bank_account_name: z.string().optional(), // New field
  currency: z.string().min(1, "Currency is required"),
  total_amount: z.coerce.number().min(0.01, "Total Amount must be positive."), // CHANGED: Use total_amount
  notes: z.string().optional(), // CHANGED: Renamed from reason_for_payment and made optional
  date_payment_required: z.date({
    required_error: "Date Payment Required is required",
  }),
  invoice_pdf: z.any()
    .optional() // Make optional for editing, only required if a new file is selected
    .refine((files) => !files || files.length === 0 || Array.from(files as FileList).every(file => file.size <= 5 * 1024 * 1024), "Max file size is 5MB per file.") // 5MB limit per file
    .refine((files) => !files || files.length === 0 || Array.from(files as FileList).every(file => file.type === "application/pdf" || file.type === "image/jpeg" || file.type === "image/png"), "Only .pdf, .jpg, .jpeg, .png files are accepted."),
  receipt_required: z.boolean().default(false),
  is_urgent: z.boolean().default(false), // New field
  country: z.string().min(1, "Country is required"), // ADDED: country field to schema
  categories: z.array(z.object({ // CHANGED: Use categories array
    category: z.string().min(1, "Category is required."),
    amount: z.coerce.number().min(0.01, "Amount must be positive."),
  })).min(1, "At least one category with an amount is required."),
  bank_details_verified: z.boolean().refine(val => val === true, "You must confirm bank details have been verified."), // NEW: Bank details verified
}).superRefine((data, ctx) => {
  // Determine SKU prefix based on the request's country
  const skuPrefix = data.country === 'United Kingdom' ? 'UK' : 'CH';

  if (!data.not_sku_related) {
    if (!data.sku_number || data.sku_number.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `SKU Number is required unless 'Not SKU Related' is checked.`,
        path: ['sku_number'],
      });
    } else if (!data.sku_number.startsWith(skuPrefix)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `SKU Number must start with '${skuPrefix}'.`,
        path: ['sku_number'],
      });
    } else if (!new RegExp(`^${skuPrefix}\\d+$`).test(data.sku_number)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `SKU Number must be '${skuPrefix}' followed by numbers.`,
        path: ['sku_number'],
      });
    }
  }

  // NEW: Currency validation based on country
  if (data.country === 'United Kingdom') {
    if (data.currency !== 'GBP') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Currency must be GBP for United Kingdom.",
        path: ['currency'],
      });
    }
  } else if (data.country === 'Switzerland') {
    if (!data.currency || data.currency.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Currency is required for Switzerland.",
        path: ['currency'],
      });
    }
  }
  // Note: For other countries, currency is required by z.string().min(1)

  // Conditional validation for bank details based on country
  if (data.country === 'United Kingdom') {
    if (!data.sort_code || !/^\d{2}-\d{2}-\d{2}$/.test(data.sort_code)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Sort Code is required and must be in XX-XX-XX format.",
        path: ['sort_code'],
      });
    }
    if (!data.account_number || !/^\d{8}$/.test(data.account_number.replace(/\s/g, ''))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Account Number is required and must be 8 digits.",
        path: ['account_number'],
      });
    }
    if (!data.bank_account_name || data.bank_account_name.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Bank Account Name is required.",
        path: ['bank_account_name'],
      });
    }
    if (data.iban_number && data.iban_number.trim() !== '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "IBAN Number should not be provided for United Kingdom.",
        path: ['iban_number'],
      });
    }
  } else {
    if (!data.iban_number || data.iban_number.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "IBAN Number is required.",
        path: ['iban_number'],
      });
    }
    if (data.sort_code && data.sort_code.trim() !== '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Sort Code should not be provided for this country.",
        path: ['sort_code'],
      });
    }
    if (data.account_number && data.account_number.trim() !== '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Account Number should not be provided for this country.",
        path: ['account_number'],
      });
    }
    if (data.bank_account_name && data.bank_account_name.trim() !== '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Bank Account Name should not be provided for this country.",
        path: ['bank_account_name'],
      });
    }
  }
});

export type EditFormSchema = z.infer<typeof editFormSchema>;