"use client";

import React from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import DatePicker from '@/components/DatePicker';
import { Button } from '@/components/ui/button';
import { XCircle, RotateCcw } from 'lucide-react';
import { PaymentRequest, Profile } from '@/types/supabase';
import CountrySelector from '@/components/CountrySelector';
import { useCountry } from '@/integrations/supabase/CountryContext'; // Import useCountry

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
  filterStartDate: Date | undefined;
  setFilterStartDate: (date: Date | undefined) => void;
  filterEndDate: Date | undefined;
  setFilterEndDate: (date: Date | undefined) => void;
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
  filterStartDate,
  setFilterStartDate,
  filterEndDate,
  setFilterEndDate,
  allProfiles,
  clearFilters,
  hasActiveFilters,
  handleTextFilterChange,
}) => {
  const { currentCountry, setCurrentCountry } = useCountry(); // Use useCountry hook

  return (
    <div className="mb-4 p-4 border rounded-md bg-gray-50 shadow-sm">
      <h3 className="text-lg font-semibold mb-4 text-gray-800">Filter Payment Requests</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <div>
          <label htmlFor="country-selector" className="block text-sm font-medium text-gray-700 mb-1">Country</label>
          <CountrySelector className="w-full" triggerClassName="w-full" />
        </div>
        <div>
          <label htmlFor="supplier-name" className="block text-sm font-medium text-gray-700 mb-1">Supplier Name</label>
          <Input
            id="supplier-name"
            placeholder="e.g., Amazon"
            value={filterSupplierName}
            onChange={(e) => handleTextFilterChange(setFilterSupplierName, e.currentTarget.value)}
            className="w-full"
          />
        </div>
        <div>
          <label htmlFor="sku-number" className="block text-sm font-medium text-gray-700 mb-1">SKU Number</label>
          <Input
            id="sku-number"
            placeholder="e.g., SKU123"
            value={filterSkuNumber}
            onChange={(e) => handleTextFilterChange(setFilterSkuNumber, e.currentTarget.value)}
            className="w-full"
          />
        </div>
        <div>
          <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger id="status-filter" className="w-full">
              <SelectValue placeholder="All Statuses" />
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
        </div>
        <div>
          <label htmlFor="payment-date-required" className="block text-sm font-medium text-gray-700 mb-1">Payment Date Required</label>
          <DatePicker
            id="payment-date-required"
            date={filterDatePaymentRequired}
            setDate={setFilterDatePaymentRequired}
            placeholder="Select Date"
            className="w-full"
          />
        </div>
        <div>
          <label htmlFor="start-date" className="block text-sm font-medium text-gray-700 mb-1">Created Start Date</label>
          <DatePicker
            id="start-date"
            date={filterStartDate}
            setDate={setFilterStartDate}
            placeholder="Select Start Date"
            className="w-full"
          />
        </div>
        <div>
          <label htmlFor="end-date" className="block text-sm font-medium text-gray-700 mb-1">Created End Date</label>
          <DatePicker
            id="end-date"
            date={filterEndDate}
            setDate={setFilterEndDate}
            placeholder="Select End Date"
            className="w-full"
          />
        </div>
        <div>
          <label htmlFor="requester-filter" className="block text-sm font-medium text-gray-700 mb-1">Requester</label>
          <Select value={filterRequester} onValueChange={setFilterRequester}>
            <SelectTrigger id="requester-filter" className="w-full">
              <SelectValue placeholder="All Requesters" />
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
        </div>
        {hasActiveFilters && (
          <div className="col-span-full flex justify-end">
            <Button variant="outline" onClick={clearFilters} className="flex items-center gap-1">
              <RotateCcw className="h-4 w-4" /> Clear Filters
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentRequestFilters;