import * as z from 'zod';

export const transactionDetailSchema = z.object({
  category: z.string().min(1, "Category is required for completion."),
  merchant_name: z.string().min(1, "Merchant Name is required for completion."),
  notes: z.string().optional(),
  sku: z.string().min(1, "SKU is required for completion."),
  comment: z.string().optional(),
  new_receipt_files: z.any()
    .optional()
    .refine((files) => !files || files.length === 0 || Array.from(files as FileList).every(file => file.size <= 5 * 1024 * 1024), "Max file size is 5MB per file.")
    .refine((files) => !files || files.length === 0 || Array.from(files as FileList).every(file => file.type === "application/pdf"), "Only .pdf files are accepted."),
});

export type TransactionDetailSchema = z.infer<typeof transactionDetailSchema>;