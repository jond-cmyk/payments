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
import MultiSelectFilter from '@/components/MultiSelectFilter'; // Import MultiSelectFilter

interface PaymentRequestFiltersProps {
  filterSupplierName: string;
  setFilterSupplierName: (value: string) => void;
  filterSkuNumber: string;
  setFilterSkuNumber: (value: string) => void;
  filterStatuses: PaymentRequest['status'][]; // CHANGED: Array of statuses
  setFilterStatuses: (values: PaymentRequest['status'][]) => void; // CHANGED: Array setter
  filterDatePaymentRequired: Date | undefined;
  setFilterDatePaymentRequired: (date: Date | undefined) => void;
  filterRequesters: string[]; // CHANGED: Array of requester IDs
  setFilterRequesters: (values: string[]) => void; // CHANGED: Array setter
  filterStartDate: Date | undefined;
  setFilterStartDate: (date: Date | undefined) => void;
  filterEndDate: Date | undefined;
  setFilterEndDate: (date: Date | undefined) => void;
  allProfiles: Profile[] | undefined;
  clearFilters: () => void;
  hasActiveFilters: boolean;
  handleTextFilterChange: (setter: React.Dispatch<React.SetStateAction<string>>, value: string) => void;
}

const statusOptions = [
  { value: 'all', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'setup_awaiting_approval', label: 'Payment Setup' },
  { value: 'approved', label: 'Payment Complete' },
  { value: 'declined', label: 'Declined' },
  { value: 'queried', label: 'Queried' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'paused', label: 'Paused' },
];

const PaymentRequestFilters: React.FC<PaymentRequestFiltersProps> = ({
  filterSupplierName,
  setFilterSupplierName,
  filterSkuNumber,
  setFilterSkuNumber,
  filterStatuses,
  setFilterStatuses,
  filterDatePaymentRequired,
  setFilterDatePaymentRequired,
  filterRequesters,
  setFilterRequesters,
  filterStartDate,
  setFilterStartDate,
  filterEndDate,
  setFilterEndDate,
  allProfiles,
  clearFilters,
  hasActiveFilters,
  handleTextFilterChange,
}) => {
  const { currentCountry, setCurrentCountry } = useCountry();

  const requesterOptions: { value: string; label: string }[] = [
    { value: 'all', label: 'All Requesters' },
    ...(allProfiles || []).map((profile) => ({
      value: profile.id,
      label: `${profile.first_name || ''} ${profile.last_name || ''} (${profile.user_email})`,
    })),
  ];

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
        <MultiSelectFilter
          label="Status"
          placeholder="Select Statuses"
          options={statusOptions}
          selectedValues={filterStatuses}
          onValueChange={(values) => setFilterStatuses(values as PaymentRequest['status'][])}
        />
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
        <MultiSelectFilter
          label="Requester"
          placeholder="Select Requesters"
          options={requesterOptions}
          selectedValues={filterRequesters}
          onValueChange={setFilterRequesters}
        />
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