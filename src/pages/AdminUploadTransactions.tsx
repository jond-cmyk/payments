"use client";

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { useCountry } from '@/integrations/supabase/CountryContext'; // Import useCountry

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import FileInput from '@/components/FileInput';
import { UploadCloud } from 'lucide-react';
import CountrySelector from '@/components/CountrySelector'; // Import CountrySelector

const AdminUploadTransactions = () => {
  const { session, isLoading: isSessionLoading, user, userProfile } = useSession();
  const { currentCountry, availableCountries } = useCountry(); // Use useCountry hook
  const navigate = useNavigate();
  const [selectedFile, setSelectedFile] = useState<FileList | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedUploadCountry, setSelectedUploadCountry] = useState<string>(currentCountry === 'all' ? 'Switzerland' : currentCountry); // State for selected country, default to Switzerland if currentCountry is 'all'

  const isAdmin = userProfile?.role === 'admin';

  // Update selectedUploadCountry when currentCountry changes in context
  React.useEffect(() => {
    setSelectedUploadCountry(currentCountry === 'all' ? 'Switzerland' : currentCountry);
  }, [currentCountry]);

  if (isSessionLoading) {
    return <div className="flex items-center justify-center h-full text-lg">Loading...</div>;
  }

  if (!session) {
    navigate('/login');
    return null;
  }

  if (!userProfile) {
    showError("Your user profile could not be loaded. Please try again.");
    navigate('/dashboard');
    return null;
  }

  // Restrict access to admin users only
  if (!isAdmin) {
    showError("You do not have permission to view this page.");
    navigate('/dashboard');
    return null;
  }

  const handleFileUpload = async () => {
    if (!selectedFile || selectedFile.length === 0) {
      showError("Please select a file to upload.");
      return;
    }
    if (!selectedUploadCountry || selectedUploadCountry === 'all') {
      showError("Please select a specific country for the transactions.");
      return;
    }

    const file = selectedFile[0];
    const toastId = showLoading("Uploading and processing spreadsheet...");
    setIsUploading(true);

    try {
      const fileContent = await file.text();

      const { data, error: invokeError } = await supabase.functions.invoke('upload-transactions', {
        body: {
          fileName: file.name,
          fileContent: fileContent,
          uploaderId: user?.id,
          country: selectedUploadCountry, // Pass the selected country
        },
      });

      if (invokeError) {
        console.error("Supabase Function Invoke Error:", invokeError);
        if (data?.error) {
          throw new Error(data.error);
        }
        throw new Error(invokeError.message);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      showSuccess(data?.message || "Spreadsheet uploaded and processed successfully!");
      setSelectedFile(null);
    } catch (error: any) {
      showError(error.message || "Failed to upload and process spreadsheet.");
      console.error("Spreadsheet upload error:", error);
    } finally {
      dismissToast(toastId);
      setIsUploading(false);
    }
  };

  return (
    <div className="container mx-auto py-8">
      <Card className="max-w-2xl mx-auto shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">Upload Transactions Spreadsheet</CardTitle>
          <CardDescription className="text-center">
            Upload a CSV file containing transaction data. The system will process it and assign transactions to users.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col space-y-2">
            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              Select Country for Upload
            </label>
            <CountrySelector
              className="w-full"
              value={selectedUploadCountry}
              onValueChange={setSelectedUploadCountry}
              // Admins are not locked to a country, so they can always change it here
              disabled={isUploading}
              // Filter out 'All Countries' option for this selector
              availableCountries={availableCountries.filter(c => c.value !== 'all')}
            />
          </div>
          <FileInput
            label="Choose CSV File"
            accept=".csv"
            value={selectedFile}
            onChange={setSelectedFile}
            disabled={isUploading}
          />
          <Button
            onClick={handleFileUpload}
            disabled={!selectedFile || selectedFile.length === 0 || isUploading || selectedUploadCountry === 'all'}
            className="w-full bg-dyad-blue hover:bg-dyad-blue-foreground text-dyad-blue-foreground shadow-sm"
          >
            <UploadCloud className="mr-2 h-4 w-4" />
            {isUploading ? "Uploading..." : "Upload and Process"}
          </Button>
          <p className="text-sm text-muted-foreground text-center">
            Accepted format: CSV. Max file size: 5MB.
            <br />
            Expected columns for card transactions: `transaction_date`, `description`, `amount`, `currency`, `user_email`, `original_transaction_id`.
            <br />
            Expected columns for general transactions: `Date`, `Text`, `Amount`, `Currency`.
            Optional columns: `Approval`, `Type`, `Entry`, `Bank`, `Contra account`, `Exchange rate`, `Comment`, `SKU`, `Reason For Payment`.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminUploadTransactions;