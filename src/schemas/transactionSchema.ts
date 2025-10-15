import * as z from 'zod';

export const transactionDetailSchema = z.object({
  category: z.string().min(1, "Category is required for completion."),
  merchant_name: z.string().min(1, "Merchant Name is required for completion."),
  notes: z.string().optional(),
  sku: z.string().optional(), // Make optional initially, then refine
  not_sku_related: z.boolean().default(false), // New field
  comment: z.string().optional(),
  new_receipt_files: z.any()
    .optional()
    .refine((files) => !files || files.length === 0 || Array.from(files as FileList).every(file => file.size <= 5 * 1024 * 1024), "Max file size is 5MB per file.")
    .refine((files) => !files || files.length === 0 || Array.from(files as FileList).every(file => file.type === "application/pdf" || file.type === "image/jpeg" || file.type === "image/png"), "Only .pdf, .jpg, .jpeg, .png files are accepted."),
}).superRefine((data, ctx) => {
  // This schema is used for transactions, which are already associated with a country.
  // The country context is not directly available here, so we'll assume 'CH' as default for validation
  // or rely on the backend for more robust country-specific SKU validation.
  // For now, keeping 'CH' as the default prefix for client-side validation.
  const skuPrefix = 'CH'; // Default for transaction schema, as country context is not directly available here.

  if (!data.not_sku_related) {
    if (!data.sku || data.sku.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SKU is required unless 'Not SKU Related' is checked.",
        path: ['sku'],
      });
    } else if (!data.sku.startsWith(skuPrefix)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `SKU must start with '${skuPrefix}'.`,
        path: ['sku'],
      });
    } else if (!new RegExp(`^${skuPrefix}\\d+$`).test(data.sku)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `SKU must be '${skuPrefix}' followed by numbers.`,
        path: ['sku'],
      });
    }
  }
});

export type TransactionDetailSchema = z.infer<typeof transactionDetailSchema>;