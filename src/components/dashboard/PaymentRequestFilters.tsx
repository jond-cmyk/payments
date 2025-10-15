"use client";

import React from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import DatePicker from '@/components/DatePicker';
import { Button } from '@/components/ui/button';
import { XCircle, RotateCcw } from 'lucide-react';
import { PaymentRequest, Profile } from '@/types/supabase';
import CountrySelector from '@/components/CountrySelector';

interface PaymentRequestFiltersProps {
  filterSupplierName: string;
  setFilterSupplierName: (value: string) => void;
  filterSkuNumber: string;
  setFilterSkuNumber: (value: string) => void;
  filterStatus: PaymentRequest['status'] | 'all';
  setFilterStatus: (value: PaymentRequest['status'] | 'all') => void;
  filterDatePaymentRequired: Date | undefined;
  setFilterDatePaymentRequired: (date: Date | undefined) => void;
  filterRequester: string;
  setFilterRequester: (value: string) => void;
  filterStartDate: Date | undefined; // NEW: Start date for range filter
  setFilterStartDate: (date: Date | undefined) => void; // NEW: Setter for start date
  filterEndDate: Date | undefined; // NEW: End date for range filter
  setFilterEndDate: (date: Date | undefined) => void; // NEW: Setter for end date
  allProfiles: Profile[] | undefined;
  clearFilters: () => void;
  hasActiveFilters: boolean;
  handleTextFilterChange: (setter: React.Dispatch<React.SetStateAction<string>>, value: string) => void;
}

const PaymentRequestFilters: React.FC<PaymentRequestFiltersProps> = ({
  filterSupplierName,
  setFilterSupplierName,
  filterSkuNumber,
  setFilterSkuNumber,
  filterStatus,
  setFilterStatus,
  filterDatePaymentRequired,
  setFilterDatePaymentRequired,
  filterRequester,
  setFilterRequester,
  filterStartDate, // NEW
  setFilterStartDate, // NEW
  filterEndDate, // NEW
  setFilterEndDate, // NEW
  allProfiles,
  clearFilters,
  hasActiveFilters,
  handleTextFilterChange,
}) => {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-4 p-4 border rounded-md bg-gray-50">
      <span className="font-medium text-gray-700">Filters:</span>
      <CountrySelector className="w-[240px]" triggerClassName="w-full" />
      <Input
        placeholder="Filter by Supplier Name"
        value={filterSupplierName}
        onChange={(e) => handleTextFilterChange(setFilterSupplierName, e.currentTarget.value)}
        className="max-w-xs"
      />
      <Input
        placeholder="Filter by SKU Number"
        value={filterSkuNumber}
        onChange={(e) => handleTextFilterChange(setFilterSkuNumber, e.currentTarget.value)}
        className="max-w-xs"
      />
      <Select value={filterStatus} onValueChange={setFilterStatus}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Filter by Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          <SelectItem value="pending">Pending</SelectItem>
          <SelectItem value="setup_awaiting_approval">Payment Setup</SelectItem>
          <SelectItem value="approved">Payment Complete</SelectItem>
          <SelectItem value="declined">Declined</SelectItem>
          <SelectItem value="queried">Queried</SelectItem>
        </SelectContent>
      </Select>
      <DatePicker
        date={filterDatePaymentRequired}
        setDate={setFilterDatePaymentRequired}
        placeholder="Filter by Payment Date"
        className="w-[200px]"
      />
      {/* NEW: Date Range Filters */}
      <DatePicker
        date={filterStartDate}
        setDate={setFilterStartDate}
        placeholder="Start Date"
        className="w-[200px]"
      />
      <DatePicker
        date={filterEndDate}
        setDate={setFilterEndDate}
        placeholder="End Date"
        className="w-[200px]"
      />
      <Select value={filterRequester} onValueChange={setFilterRequester}>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Filter by Requester" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Requesters</SelectItem>
          {allProfiles?.map((profile) => (
            <SelectItem key={profile.id} value={profile.id}>
              {profile.first_name || ''} {profile.last_name || ''} ({profile.user_email})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hasActiveFilters && (
        <Button variant="outline" onClick={clearFilters} className="flex items-center gap-1">
          <XCircle className="h-4 w-4" /> Clear Filters
        </Button>
      )}
    </div>
  );
};

export default PaymentRequestFilters;