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
import { format } from 'date-fns'; // Import format

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

// Utility function to extract a list from varied economic response shapes
export const extractList = (payload: any): any[] => {
  console.log("[extractList] DEBUG: Received payload type:", typeof payload);
  console.log("[extractList] DEBUG: Received payload:", JSON.stringify(payload, null, 2));

  if (!payload) {
    console.log("[extractList] Payload is null or undefined.");
    return [];
  }

  // First, check if payload itself is an array
  if (Array.isArray(payload)) {
    console.log(`[extractList] Found array as direct payload. Length: ${payload.length}`);
    return payload;
  }

  // If payload is an object, check common keys for arrays, including nested 'data' field
  if (typeof payload === "object" && payload !== null) {
    const potentialLists = [
      { key: 'collection', value: payload.collection },
      { key: 'items', value: payload.items },
      { key: 'results', value: payload.results },
      { key: 'entries', value: payload.entries },
      { key: 'invoices', value: payload.invoices },
      { key: 'accountingYears.collection', value: payload.accountingYears?.collection },
      { key: 'customerLedgerEntries.collection', value: payload.customerLedgerEntries?.collection },
      // NEW: Check if the payload has a 'data' field which itself contains a collection
      { key: 'data.collection', value: payload.data?.collection },
      { key: 'data.items', value: payload.data?.items },
      { key: 'data.results', value: payload.data?.results },
      { key: 'data.entries', value: payload.data?.entries },
      { key: 'data.invoices', value: payload.data?.invoices },
      { key: 'data.accountingYears.collection', value: payload.data?.accountingYears?.collection },
      { key: 'data.customerLedgerEntries.collection', value: payload.data?.customerLedgerEntries?.collection },
    ];

    for (const { key, value } of potentialLists) {
      console.log(`[extractList] Checking candidate '${key}'. Value type: ${typeof value}, isArray: ${Array.isArray(value)}`);
      if (Array.isArray(value)) {
        console.log(`[extractList] Found array in candidate '${key}'. Length: ${value.length}`);
        return value;
      }
    }

    // Fallback: if no specific list key, check if any direct property is an array
    for (const k of Object.keys(payload)) {
      const v = (payload as any)[k];
      console.log(`[extractList] Checking direct property '${k}'. Value type: ${typeof v}, isArray: ${Array.isArray(v)}`);
      if (Array.isArray(v)) {
        console.log(`[extractList] Found array in object key '${k}'. Length: ${v.length}`);
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
    // Determine currency symbol based on column key or general item properties
    if (column.format === 'currencyAmount') {
      // Try to find currency directly related to the amount field
      const amountCurrencyCandidates = [
        `${column.key}.currency.code`, // e.g., 'amount.currency.code'
        `${column.key}.currency`,     // e.g., 'amount.currency'
        'currency.code',              // general currency code
        'currency',                   // general currency
        'customer.currency.code',
        'customer.currency',
      ];
      const foundAmountCurrency = getNestedValue(item, amountCurrencyCandidates, ''); // Pass empty string as key to force path usage
      if (foundAmountCurrency) {
        currencySymbol = foundAmountCurrency;
      }
    } else {
      // For other columns, use general currency candidates
      const generalCurrencyCandidates = [
        'currency.code',
        'currency',
        'customer.currency.code',
        'customer.currency',
      ];
      const foundGeneralCurrency = getNestedValue(item, generalCurrencyCandidates, '');
      if (foundGeneralCurrency) {
        currencySymbol = foundGeneralCurrency;
      }
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
          <DialogTitle className="font-bold">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {/* The flex-1 class ensures this div takes up remaining vertical space */}
        <div className="flex-1 overflow-hidden"> 
          {/* ScrollArea now correctly fills the remaining space and handles overflow */}
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