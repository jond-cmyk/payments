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
    .refine((files) => !files || files.length === 0 || Array.from(files as FileList).every(file => file.type === "application/pdf"), "Only .pdf files are accepted."),
}).superRefine((data, ctx) => {
  if (!data.not_sku_related) {
    if (!data.sku || data.sku.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SKU is required unless 'Not SKU Related' is checked.",
        path: ['sku'],
      });
    } else if (!data.sku.startsWith('CH')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SKU must start with 'CH'.",
        path: ['sku'],
      });
    } else if (!/^CH\d+$/.test(data.sku)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SKU must be 'CH' followed by numbers.",
        path: ['sku'],
      });
    }
  }
});

export type TransactionDetailSchema = z.infer<typeof transactionDetailSchema>;