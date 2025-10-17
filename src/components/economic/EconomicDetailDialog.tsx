"use client";

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from '@/components/ui/button'; // Import Button
import { FileText } from 'lucide-react'; // Import FileText icon

// Helper to format a date string to DD-MM-YYYY
const formatDate = (dateInput: any): string => {
  if (!dateInput) return "-";
  let date: Date;
  if (typeof dateInput === "string") {
    date = new Date(dateInput);
  } else if (dateInput instanceof Date) {
    date = dateInput;
  } else {
    return "-";
  }
  if (isNaN(date.getTime())) return "-";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
};

// Helper to format amount with thousand separators and two decimal places
const formatAmount = (amountInput: any): string => {
  if (amountInput === null || amountInput === undefined) return "-";
  const num = typeof amountInput === "number" ? amountInput : parseFloat(String(amountInput));
  if (isNaN(num)) return "-";
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

// Define the DialogColumn type here and export it
export type DialogColumn = {
  key: string;
  header: string;
  format?: 'date' | 'amount' | 'currencyAmount' | 'boolean' | 'array' | 'object' | 'raw';
  path?: string[];
  render?: (item: any, index: number, allData: any[]) => React.ReactNode; // Added render function
};

interface EconomicDetailDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  data: any[] | null;
  columns: DialogColumn[]; // Use the exported DialogColumn type
  isLoading?: boolean;
}

const EconomicDetailDialog: React.FC<EconomicDetailDialogProps> = ({
  isOpen,
  onOpenChange,
  title,
  description,
  data,
  columns,
  isLoading,
}) => {
  // Generic getter for nested value, now correctly handles dot-separated paths in `paths` array
  const getNestedValue = (obj: any, paths: string[] | undefined, key: string): any => {
    if (!obj) return undefined;

    const candidatePaths = paths && paths.length > 0 ? paths : [key];

    for (const pathStr of candidatePaths) {
      let value = obj;
      const parts = pathStr.split('.'); // Split by dot for nested properties

      for (const part of parts) {
        if (value && typeof value === 'object' && part in value) {
          value = value[part];
        } else {
          value = undefined; // Path segment not found
          break;
        }
      }

      if (value !== undefined) {
        // If the value is a string that looks like a URL, extract the last segment for display
        if (typeof value === "string" && value.startsWith("http") && value.includes("/")) {
          const urlParts = value.split("/");
          const lastSegment = urlParts[urlParts.length - 1];
          // If the last segment is empty (e.g., URL ends with /), try the second to last
          return lastSegment || urlParts[urlParts.length - 2] || value;
        }
        return value; // Found a value for this path
      }
    }
    return undefined; // No value found for any candidate path
  };

  const renderCell = (item: any, column: DialogColumn, index: number, allData: any[]) => {
    // If a custom render function is provided, use it
    if (column.render) {
      return column.render(item, index, allData);
    }

    const rawValue = getNestedValue(item, column.path, column.key);
    
    let currencySymbol = '';
    // Use getNestedValue for robust currency extraction
    const currencyCandidates = [
      'currency',
      'currency.code',
      'customer.currency',
      'customer.currency.code',
      'debtor.currency',
      'debtor.currency.code',
      'creditor.currency',
      'creditor.currency.code',
    ];
    const foundCurrency = getNestedValue(item, currencyCandidates, 'currency');
    if (foundCurrency) {
      currencySymbol = foundCurrency;
    }

    // The specific 'pdf' column logic is now handled by the custom render function in Customers.tsx
    // This block is no longer strictly necessary here for the 'pdf' key, but kept for general URL handling if needed elsewhere.
    const isUrl = typeof rawValue === 'string' && (rawValue.startsWith('http://') || rawValue.startsWith('https://'));
    if (isUrl) { // Removed column.key === 'pdf' condition here
      return (
        <Button asChild variant="link" className="p-0 h-auto">
          <a href={rawValue} target="_blank" rel="noopener noreferrer">
            <FileText className="mr-1 h-4 w-4" /> View Document
          </a>
        </Button>
      );
    }

    switch (column.format) {
      case 'date':
        return formatDate(rawValue);
      case 'amount':
        return formatAmount(rawValue);
      case 'currencyAmount':
        return `${currencySymbol || ''} ${formatAmount(rawValue)}`; // Use the determined currencySymbol
      case 'boolean':
        return rawValue ? 'Yes' : 'No';
      case 'array':
        return Array.isArray(rawValue) ? rawValue.join(', ') : String(rawValue ?? '-');
      case 'object':
        return typeof rawValue === 'object' && rawValue !== null ? JSON.stringify(rawValue) : String(rawValue ?? '-');
      case 'raw':
      default:
        return String(rawValue ?? '-');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] flex flex-col"> {/* Increased max-w to 5xl */}
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full w-full pr-4"> {/* Added pr-4 for scrollbar spacing */}
            {isLoading ? (
              <div className="text-center text-muted-foreground py-8">Loading data...</div>
            ) : !data || data.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">No data found.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {columns.map((col) => (
                      <TableHead key={col.key}>{col.header}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((item, index) => (
                    <TableRow key={item.self || item.customerNumber || item.invoiceNumber || item.entryNumber || index}>
                      {columns.map((col) => (
                        <TableCell key={col.key}>
                          {renderCell(item, col, index, data)} {/* Pass all arguments */}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EconomicDetailDialog;