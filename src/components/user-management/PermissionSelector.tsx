"use client";

import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { UserPermissions, defaultPermissions } from '@/types/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface PermissionSelectorProps {
  permissions: UserPermissions;
  setPermissions: (permissions: UserPermissions) => void;
  disabled?: boolean;
}

const PermissionSelector: React.FC<PermissionSelectorProps> = ({
  permissions,
  setPermissions,
  disabled = false,
}) => {
  const handleToggle = (category: keyof UserPermissions, key: string) => {
    if (disabled) return;
    setPermissions({
      ...permissions,
      [category]: {
        ...permissions[category],
        [key]: !permissions[category][key as keyof UserPermissions[typeof category]],
      },
    });
  };

  const handleCategoryToggle = (category: keyof UserPermissions, checked: boolean) => {
    if (disabled) return;
    const updatedCategory = Object.keys(permissions[category]).reduce((acc, key) => {
      acc[key] = checked;
      return acc;
    }, {} as any);

    setPermissions({
      ...permissions,
      [category]: updatedCategory,
    });
  };

  const renderCategory = (category: keyof UserPermissions, title: string, labels: Record<string, string>) => {
    const allChecked = Object.keys(labels).every((key) => permissions[category][key as keyof UserPermissions[typeof category]]);
    
    return (
      <Card className="h-full shadow-sm border-l-4 border-dyad-blue">
        <CardHeader className="pb-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              id={`cat-${category}`}
              checked={allChecked}
              onCheckedChange={(checked) => handleCategoryToggle(category, checked as boolean)}
              disabled={disabled}
            />
            <CardTitle className="text-lg font-bold cursor-pointer" onClick={() => !disabled && handleCategoryToggle(category, !allChecked)}>
              {title}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          {Object.entries(labels).map(([key, label]) => (
            <div key={key} className="flex items-start space-x-2">
              <Checkbox
                id={`${category}-${key}`}
                checked={permissions[category][key as keyof UserPermissions[typeof category]]}
                onCheckedChange={() => handleToggle(category, key)}
                disabled={disabled}
              />
              <Label
                htmlFor={`${category}-${key}`}
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer pt-0.5"
              >
                {label}
              </Label>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {renderCategory('sales', 'Sales', {
        customers: 'Customers',
        customer_deposits: 'Customer Deposits',
        customer_deposit_returns: 'Customer Deposit Returns',
        landlord_deposits: 'Landlord Deposits',
        deposit_return_advisement: 'Deposit Return Advisement',
        property_pnl: 'Property P&L',
      })}
      
      {renderCategory('support', 'Support', {
        dashboard: 'Dashboard',
        new_request: 'New Request',
        all_requests: 'All Requests',
        missing_receipts: 'Missing Receipts',
        completed_receipts: 'Completed Receipts',
        direct_debits: 'Direct Debits',
        standing_orders: 'Standing Orders',
      })}

      {renderCategory('admin', 'Admin', {
        admin_panel: 'Admin Panel',
        statistics: 'Statistics',
      })}
    </div>
  );
};

export default PermissionSelector;