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
  lease_id: z.string().optional().refine((val) => {
    if (val === undefined || val === null || val.trim() === '') return true;
    return /^\d+$/.test(val);
  }, "Lease ID must be a numerical value."),
  supplier_address: z.string().min(1, "Supplier Address is required"),
  iban_number: z.string().optional(),
  sort_code: z.string().optional(),
  account_number: z.string().optional(),
  bank_account_name: z.string().optional(),
  currency: z.string().min(1, "Currency is required"),
  total_amount: z.coerce.number(),
  notes: z.string().optional(),
  date_payment_required: z.date({
    required_error: "Date Payment Required is required",
  }),
  invoice_pdf: z.any()
    .optional()
    .refine((files) => !files || files.length === 0 || Array.from(files as FileList).every(file => file.size <= 5 * 1024 * 1024), "Max file size is 5MB per file.")
    .refine((files) => !files || files.length === 0 || Array.from(files as FileList).every(file => file.type === "application/pdf" || file.type === "image/jpeg" || file.type === "image/png"), "Only .pdf, .jpg, .jpeg, .png files are accepted."),
  receipt_required: z.boolean().default(false),
  is_urgent: z.boolean().default(false),
  country: z.string().min(1, "Country is required"),
  categories: z.array(z.object({
    category: z.string().min(1, "Category is required."),
    amount: z.coerce.number().min(0.01, "Amount must be positive."),
    sku: z.string().optional(),
    not_sku_related: z.boolean().default(false),
  })).min(1, "At least one category with an amount is required."),
  bank_details_verified: z.boolean().refine(val => val === true, "You must confirm bank details have been verified."),
}).superRefine((data, ctx) => {
  const skuPrefix = data.country === 'United Kingdom' ? 'UK' : 'CH';

  // Validate SKU per category
  data.categories.forEach((cat, index) => {
    if (!cat.not_sku_related) {
      if (!cat.sku || cat.sku.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `SKU is required for category ${index + 1} unless 'No SKU' is checked.`,
          path: ['categories', index, 'sku'],
        });
      } else if (!cat.sku.startsWith(skuPrefix)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `SKU must start with '${skuPrefix}'.`,
          path: ['categories', index, 'sku'],
        });
      } else if (!new RegExp(`^${skuPrefix}\\d+$`).test(cat.sku)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `SKU must be '${skuPrefix}' followed by numbers.`,
          path: ['categories', index, 'sku'],
        });
      }
    }
  });

  if (data.country === 'United Kingdom') {
    if (data.currency !== 'GBP') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Currency must be GBP for United Kingdom.",
        path: ['currency'],
      });
    }
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
        message: "Bank Account Number is required and must be 8 digits.",
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
  } else if (data.country === 'Switzerland') {
    if (!data.currency || data.currency.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Currency is required for Switzerland.",
        path: ['currency'],
      });
    }
    if (!data.iban_number || data.iban_number.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "IBAN Number is required.",
        path: ['iban_number'],
      });
    }
    if (!data.bank_account_name || data.bank_account_name.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Bank Account Name is required for Switzerland.",
        path: ['bank_account_name'],
      });
    }
  }
});

export type EditFormSchema = z.infer<typeof editFormSchema>;