"use client";

import React, { useState, useMemo } from 'react';
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
import { Button } from '@/components/ui/button';
import { FileText, ArrowUp, ArrowDown } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

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
  description?: React.ReactNode;
  data: any[] | null;
  columns: DialogColumn[];
  isLoading?: boolean;
  defaultSort?: { key: string; direction: 'ascending' | 'descending' };
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
  defaultSort,
}) => {
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'ascending' | 'descending' } | null>(defaultSort || null);

  React.useEffect(() => {
    if (isOpen) {
      setSortConfig(defaultSort || null);
    }
  }, [isOpen, defaultSort]);

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

  const sortedData = useMemo(() => {
    if (!data) return null;
    let sortableData = [...data];
    if (sortConfig !== null) {
      const columnToSort = columns.find(c => c.key === sortConfig.key);
      if (!columnToSort) return sortableData;

      sortableData.sort((a, b) => {
        const aValue = getNestedValue(a, columnToSort.path, columnToSort.key);
        const bValue = getNestedValue(b, columnToSort.path, columnToSort.key);

        if (aValue == null && bValue == null) return 0;
        if (aValue == null) return sortConfig.direction === 'ascending' ? -1 : 1;
        if (bValue == null) return sortConfig.direction === 'ascending' ? 1 : -1;

        const numA = parseFloat(String(aValue));
        const numB = parseFloat(String(bValue));

        if (!isNaN(numA) && !isNaN(numB)) {
          return sortConfig.direction === 'ascending' ? numA - numB : numB - numA;
        }

        if (columnToSort.format === 'date') {
            const dateA = new Date(aValue).getTime();
            const dateB = new Date(bValue).getTime();
            if (!isNaN(dateA) && !isNaN(dateB)) {
                return sortConfig.direction === 'ascending' ? dateA - dateB : dateB - dateA;
            }
        }

        const stringA = String(aValue).toLowerCase();
        const stringB = String(bValue).toLowerCase();
        
        if (stringA < stringB) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (stringA > stringB) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableData;
  }, [data, sortConfig, columns]);

  const handleSort = (key: string) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const renderCell = (item: any, column: DialogColumn, index: number, allData: any[]) => {
    if (column.render) {
      return column.render(item, index, allData);
    }

    const rawValue = getNestedValue(item, column.path, column.key);
    
    let currencySymbol = '';
    if (column.format === 'currencyAmount') {
      const amountCurrencyCandidates = [
        `${column.key}.currency.code`,
        `${column.key}.currency`,
        'currency.code',
        'currency',
        'customer.currency.code',
        'customer.currency',
      ];
      const foundAmountCurrency = getNestedValue(item, amountCurrencyCandidates, '');
      if (foundAmountCurrency) {
        currencySymbol = foundAmountCurrency;
      }
    } else {
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
      <DialogContent className="sm:max-w-[95%] xl:max-w-[90%] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-bold">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="relative flex-1 overflow-y-auto pr-4">
          {isLoading ? (
            <div className="text-center text-muted-foreground py-8">Loading data...</div>
          ) : !sortedData || sortedData.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">No data found.</div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  {columns.map((col) => (
                    <TableHead key={col.key} onClick={() => handleSort(col.key)} className="cursor-pointer hover:bg-muted/50">
                      <div className="flex items-center">
                        {col.header}
                        {sortConfig?.key === col.key && (
                          sortConfig.direction === 'ascending' ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />
                        )}
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedData.map((item, index) => (
                  <TableRow key={item.self || item.customerNumber || item.invoiceNumber || item.entryNumber || index}>
                    {columns.map((col) => (
                      <TableCell key={col.key}>{renderCell(item, col, index, sortedData)}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EconomicDetailDialog;