"use client";

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { useCountry } from '@/integrations/supabase/CountryContext';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import FileInput from '@/components/FileInput';
import { UploadCloud } from 'lucide-react';
import CountrySelector from '@/components/CountrySelector';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const AdminUploadStandingOrders = () => {
  const { session, isLoading: isSessionLoading, user, userProfile } = useSession();
  const { currentCountry, availableCountries } = useCountry();
  const navigate = useNavigate();
  const [selectedFile, setSelectedFile] = useState<FileList | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedUploadCountry, setSelectedUploadCountry] = useState<string>(currentCountry === 'all' ? 'Switzerland' : currentCountry);
  const [uploadResult, setUploadResult] = useState<{ message: string; errors: string[] } | null>(null);

  const isAdmin = userProfile?.role === 'admin';

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
      showError("Please select a specific country for the standing orders.");
      return;
    }

    const file = selectedFile[0];
    const toastId = showLoading("Uploading and processing standing orders spreadsheet...");
    setIsUploading(true);
    setUploadResult(null); // Clear previous results

    try {
      const fileContent = await file.text();

      const { data, error: invokeError } = await supabase.functions.invoke('upload-standing-orders', {
        body: {
          fileName: file.name,
          fileContent: fileContent,
          uploaderId: user?.id,
          country: selectedUploadCountry,
        },
      });

      if (invokeError) {
        console.error("Supabase Function Invoke Error:", invokeError);
        throw new Error(`Network error: ${invokeError.message}`);
      }

      if (data) {
        setUploadResult({
          message: data.message || "Processing complete.",
          errors: data.errors || [],
        });

        if (!data.success || (data.errors && data.errors.length > 0)) {
          showError(data.message || `Upload completed with ${data.errors?.length || 0} errors.`);
        } else {
          showSuccess(data.message || "Standing orders spreadsheet uploaded and processed successfully!");
        }
      } else {
        throw new Error("Received an empty response from the server.");
      }

      setSelectedFile(null);
    } catch (error: any) {
      console.error("Standing orders upload error:", error);
      showError(error.message || "Failed to upload and process standing orders spreadsheet.");
    } finally {
      dismissToast(toastId);
      setIsUploading(false);
    }
  };

  return (
    <div className="container mx-auto py-8">
      <Card className="max-w-2xl mx-auto shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">Upload Standing Orders Spreadsheet</CardTitle>
          <CardDescription className="text-center">
            Upload a CSV file containing standing order data. New standing orders will be set to 'Pending' status.
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
              disabled={isUploading}
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

          {uploadResult && (
            <Alert variant={uploadResult.errors.length > 0 ? "destructive" : "default"} className="mt-4">
              <AlertTitle>{uploadResult.errors.length > 0 ? "Upload Completed with Errors" : "Upload Successful"}</AlertTitle>
              <AlertDescription>
                <p className="font-semibold">{uploadResult.message}</p>
                {uploadResult.errors.length > 0 && (
                  <div className="mt-2 max-h-40 overflow-y-auto">
                    <p className="font-bold">Specific Errors:</p>
                    <ul className="list-disc pl-5 text-xs space-y-1">
                      {uploadResult.errors.map((error, index) => (
                        <li key={index}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          <p className="text-sm text-muted-foreground text-center">
            Accepted format: CSV. Max file size: 5MB.
            <br />
            Expected columns: `Payee`, `Payment Date` (DD.MM.YYYY), `Category`, `Account Name`, `From Day`, `To Day`, `User Email`.
            <br />
            Optional columns: `SKU`, `Not Property Related` (Yes/No), `Account Address`, `IBAN Number`, `Sort Code`, `Account Number`, `Payment Reference`.
            <br />
            For Switzerland, the CSV must include: `Currency` and `Bank Account` (required).
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminUploadStandingOrders;