"use client";

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import FileInput from '@/components/FileInput';
import { UploadCloud } from 'lucide-react';

const AdminUploadTransactions = () => {
  const { session, isLoading: isSessionLoading, user, userProfile } = useSession();
  const navigate = useNavigate();
  const [selectedFile, setSelectedFile] = useState<FileList | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const isAdmin = userProfile?.role === 'admin';

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

    const file = selectedFile[0];
    const toastId = showLoading("Uploading and processing spreadsheet...");
    setIsUploading(true);

    try {
      const fileContent = await file.text();

      const { data, error } = await supabase.functions.invoke('upload-transactions', { // Calling the unified Edge Function
        body: {
          fileName: file.name,
          fileContent: fileContent,
          uploaderId: user?.id,
        },
      });

      if (error) {
        throw new Error(error.message);
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
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">Upload Transactions Spreadsheet</CardTitle>
          <CardDescription className="text-center">
            Upload a CSV file containing transaction data. The system will process it and assign transactions to users.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <FileInput
            label="Choose CSV File"
            accept=".csv"
            value={selectedFile}
            onChange={setSelectedFile}
            disabled={isUploading}
          />
          <Button
            onClick={handleFileUpload}
            disabled={!selectedFile || selectedFile.length === 0 || isUploading}
            className="w-full bg-dyad-blue hover:bg-dyad-blue-foreground text-dyad-blue-foreground"
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