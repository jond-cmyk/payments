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
import { Button } from '@/components/ui/button';
import { FileText } from 'lucide-react';

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

export const formatAmount = (amountInput: any): string => {
  if (amountInput === null || amountInput === undefined) return "-";
  const num = typeof amountInput === "number" ? amountInput : parseFloat(String(amountInput));
  if (isNaN(num)) return "-";
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export type DialogColumn = {
  key: string;
  header: string;
  format?: 'date' | 'amount' | 'currencyAmount' | 'boolean' | 'array' | 'object' | 'raw';
  path?: string[];
  render?: (item: any, index: number, allData: any[]) => React.ReactNode;
};

interface EconomicDetailDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  data: any[] | null;
  columns: DialogColumn[];
  isLoading?: boolean;
}

const extractList = (payload: any): any[] => {
  if (!payload) {
    console.log("[extractList] Payload is null or undefined.");
    return [];
  }

  const candidates = [
    payload.collection,
    payload.items,
    payload.results,
    payload.entries,
    payload.invoices,
    payload.customerLedgerEntries?.collection,
  ];

  for (const c of candidates) {
    if (Array.isArray(c)) {
      console.log(`[extractList] Found array in candidate: ${JSON.stringify(c.slice(0, 2))}...`);
      return c;
    }
  }
  
  if (Array.isArray(payload)) {
    console.log(`[extractList] Payload is an array: ${JSON.stringify(payload.slice(0, 2))}...`);
    return payload;
  }

  if (typeof payload === "object") {
    for (const k of Object.keys(payload)) {
      const v = (payload as any)[k];
      if (Array.isArray(v)) {
        console.log(`[extractList] Found array in object key '${k}': ${JSON.stringify(v.slice(0, 2))}...`);
        return v;
      }
    }
  }
  
  console.log("[extractList] No list found in payload. Full payload:", JSON.stringify(payload, null, 2));
  return [];
};

const EconomicDetailDialog: React.FC<EconomicDetailDialogProps> = ({
  isOpen,
  onOpenChange,
  title,
  description,
  data,
  columns,
  isLoading,
}) => {
  const getNestedValue = (obj: any, paths: string[] | undefined, key: string): any => {
    if (!obj) return undefined;

    const candidatePaths = paths && paths.length > 0 ? paths : [key];

    for (const pathStr of candidatePaths) {
      let value = obj;
      const parts = pathStr.split('.');

      for (const part of parts) {
        if (value && typeof value === 'object' && part in value) {
          value = value[part];
        } else {
          value = undefined;
          break;
        }
      }

      if (value !== undefined) {
        if (typeof value === "string" && value.startsWith("http") && value.includes("/")) {
          const urlParts = value.split("/");
          const lastSegment = urlParts[urlParts.length - 1];
          return lastSegment || urlParts[urlParts.length - 2] || value;
        }
        return value;
      }
    }
    return undefined;
  };

  const renderCell = (item: any, column: DialogColumn, index: number, allData: any[]) => {
    if (column.render) {
      return column.render(item, index, allData);
    }

    const rawValue = getNestedValue(item, column.path, column.key);
    
    let currencySymbol = '';
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

    const isUrl = typeof rawValue === 'string' && (rawValue.startsWith('http://') || rawValue.startsWith('https://'));
    if (isUrl) {
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
        return `${currencySymbol || ''} ${formatAmount(rawValue)}`;
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
      <DialogContent className="sm:max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full w-full pr-4">
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
                        <TableCell key={col.key}>{renderCell(item, col, index, data)}</TableCell>
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