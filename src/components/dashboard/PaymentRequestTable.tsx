"use client";

import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { PaymentRequest, Transaction, StandingOrder, DirectDebit } from '@/types/supabase';
import { format } from 'date-fns';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { UseMutationResult } from '@tanstack/react-query';
import CountryFlag from '@/components/CountryFlag'; // Import CountryFlag
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination"; // Import pagination components
import { Skeleton } from '@/components/ui/skeleton'; // NEW: Import Skeleton

type EconomicDepartment = {
  departmentNumber: number;
  name: string;
  self: string;
};

interface PaymentRequestTableProps {
  paymentRequests: (PaymentRequest & { requester_profile: { first_name: string | null, last_name: string | null } | null })[] | undefined;
  departments: EconomicDepartment[] | undefined;
  userRole: string | null;
  handleSort: (column: keyof PaymentRequest) => void;
  renderSortIcon: (column: keyof PaymentRequest) => React.ReactNode;
  getStatusBadge: (status: PaymentRequest['status'] | Transaction['status'] | StandingOrder['status'] | DirectDebit['status'], itemType?: 'payment_request' | 'transaction' | 'standing_order' | 'direct_debit') => React.ReactNode;
  handleToggleUrgent: (requestId: string, currentUrgentStatus: boolean) => Promise<void>;
  toggleUrgentMutation: UseMutationResult<boolean, Error, { id: string; is_urgent: boolean; }, unknown>;
  currentPage: number; // New prop
  itemsPerPage: number | 'all'; // New prop
  totalItems: number; // New prop
  onPageChange: (page: number) => void; // New prop
  isLoading: boolean; // NEW: Add isLoading prop
}

const PaymentRequestTable: React.FC<PaymentRequestTableProps> = ({
  paymentRequests,
  departments,
  userRole,
  handleSort,
  renderSortIcon,
  getStatusBadge,
  handleToggleUrgent,
  toggleUrgentMutation,
  currentPage,
  itemsPerPage,
  totalItems,
  onPageChange,
  isLoading, // NEW: Destructure isLoading
}) => {
  const totalPages = itemsPerPage === 'all' ? 1 : Math.ceil(totalItems / (itemsPerPage as number));

  const departmentMap = useMemo(() => {
    if (!departments) return new Map<number, string>();
    return new Map(departments.map(d => [d.departmentNumber, d.name]));
  }, [departments]);

  const getAddressFromSku = (sku: string | null | undefined): string => {
    if (!sku) return 'N/A';
    const numericSku = parseInt(sku.replace(/\D/g, ''), 10);
    if (isNaN(numericSku)) return 'N/A';
    return departmentMap.get(numericSku) || 'Not Found';
  };

  const renderPaginationItems = () => {
    const items = [];
    const maxPagesToShow = 5; // Number of page links to show directly
    const startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
    const endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

    if (startPage > 1) {
      items.push(
        <PaginationItem key="1">
          <PaginationLink onClick={() => onPageChange(1)}>1</PaginationLink>
        </PaginationItem>
      );
      if (startPage > 2) {
        items.push(<PaginationItem key="ellipsis-start"><PaginationEllipsis /></PaginationItem>);
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      items.push(
        <PaginationItem key={i}>
          <PaginationLink isActive={i === currentPage} onClick={() => onPageChange(i)}>
            {i}
          </PaginationLink>
        </PaginationItem>
      );
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        items.push(<PaginationItem key="ellipsis-end"><PaginationEllipsis /></PaginationItem>);
      }
      items.push(
        <PaginationItem key={totalPages}>
          <PaginationLink onClick={() => onPageChange(totalPages)}>{totalPages}</PaginationLink>
        </PaginationItem>
      );
    }

    return items;
  };

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer hover:text-primary th-resizable" onClick={() => handleSort('supplier_name')}>
                <div className="flex items-center">
                  Supplier Name {renderSortIcon('supplier_name')}
                </div>
              </TableHead>
              <TableHead className="cursor-pointer hover:text-primary th-resizable" onClick={() => handleSort('sku_number')}>
                <div className="flex items-center">
                  SKU {renderSortIcon('sku_number')}
                </div>
              </TableHead>
              <TableHead className="th-resizable">Property Address</TableHead>
              <TableHead className="cursor-pointer hover:text-primary th-resizable" onClick={() => handleSort('date_payment_required')}>
                <div className="flex items-center">
                  Payment Due {renderSortIcon('date_payment_required')}
                </div>
              </TableHead>
              <TableHead className="th-resizable">Status</TableHead>
              <TableHead className="cursor-pointer hover:text-primary th-resizable" onClick={() => handleSort('created_at')}>
                <div className="flex items-center">
                  Created {renderSortIcon('created_at')}
                </div>
              </TableHead>
              <TableHead className="cursor-pointer hover:text-primary th-resizable" onClick={() => handleSort('payment_setup_date')}>
                <div className="flex items-center">
                  Setup {renderSortIcon('payment_setup_date')}
                </div>
              </TableHead>
              <TableHead className="cursor-pointer hover:text-primary th-resizable" onClick={() => handleSort('payment_approved_date')}>
                <div className="flex items-center">
                  Approved {renderSortIcon('payment_approved_date')}
                </div>
              </TableHead>
              <TableHead className="cursor-pointer hover:text-primary th-resizable" onClick={() => handleSort('requester_id')}>
                <div className="flex items-center">
                  Requester {renderSortIcon('requester_id')}
                </div>
              </TableHead>
              <TableHead className="cursor-pointer hover:text-primary th-resizable" onClick={() => handleSort('country')}>
                <div className="flex items-center">
                  Country {renderSortIcon('country')}
                </div>
              </TableHead>
              {userRole === 'admin' && <TableHead className="text-center th-resizable">Urgent</TableHead>}
              <TableHead className="text-right th-resizable">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: itemsPerPage === 'all' ? 10 : itemsPerPage as number }).map((_, index) => (
                <TableRow key={index}>
                  <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                  {userRole === 'admin' && <TableCell className="text-center"><Skeleton className="h-6 w-10 mx-auto" /></TableCell>}
                  <TableCell className="text-right"><Skeleton className="h-8 w-full ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : (
              paymentRequests?.map((request) => {
                const requesterName = request.requester_profile ? `${request.requester_profile.first_name || ''} ${request.requester_profile.last_name || ''}`.trim() : null;
                return (
                  <TableRow
                    key={request.id}
                    className={cn(
                      "transition-all duration-200 ease-in-out",
                      request.is_urgent ? "bg-red-600 text-white hover:bg-red-700" :
                      request.is_reminded ? "bg-blue-100 text-blue-800 hover:bg-blue-200" : // Blue for reminded requests
                      "hover:bg-gradient-to-r hover:from-dyad-blue-light/10 hover:to-background"
                    )}
                  >
                    <TableCell className="font-medium">{request.supplier_name}</TableCell>
                    <TableCell>{request.sku_number}</TableCell>
                    <TableCell>
                      {request.not_sku_related ? 'N/A' : getAddressFromSku(request.sku_number)}
                    </TableCell>
                    <TableCell>{format(new Date(request.date_payment_required), 'PPP')}</TableCell>
                    <TableCell>
                      {getStatusBadge(request.status, 'payment_request')}
                    </TableCell>
                    <TableCell>{format(new Date(request.created_at), 'PPP')}</TableCell>
                    <TableCell>
                      {request.payment_setup_date ? format(new Date(request.payment_setup_date), 'PPP') : 'N/A'}
                    </TableCell>
                    <TableCell>
                      {request.payment_approved_date ? format(new Date(request.payment_approved_date), 'PPP') : 'N/A'}
                    </TableCell>
                    <TableCell>{requesterName || 'N/A'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <CountryFlag countryName={request.country} />
                        <span>{request.country}</span>
                      </div>
                    </TableCell>
                    {userRole === 'admin' && (
                      <TableCell className="text-center">
                        <Switch
                          checked={request.is_urgent}
                          onCheckedChange={() => handleToggleUrgent(request.id, request.is_urgent)}
                          disabled={toggleUrgentMutation.isPending}
                          aria-label={`Toggle urgent status for ${request.supplier_name}`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className={cn(
                          request.is_urgent && "text-gray-900 hover:text-white hover:bg-red-800 border-gray-900",
                          request.is_reminded && "text-blue-800 hover:text-blue-900 hover:bg-blue-300 border-blue-800"
                        )}
                      >
                        <Link to={`/request/${request.id}`}>View Details</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      {totalPages > 1 && (
        <Pagination className="mt-4">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious onClick={() => onPageChange(Math.max(1, currentPage - 1))} />
            </PaginationItem>
            {renderPaginationItems()}
            <PaginationItem>
              <PaginationNext onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))} />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </>
  );
};

export default PaymentRequestTable;