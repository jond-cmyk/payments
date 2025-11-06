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
import { UploadCloud, Info } from 'lucide-react';
import CountrySelector from '@/components/CountrySelector'; // Import CountrySelector
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const AdminUploadTransactions = () => {
  const { session, isLoading: isSessionLoading, user, userProfile } = useSession();
  const { currentCountry, availableCountries } = useCountry(); // Use useCountry hook
  const navigate = useNavigate();
  const [selectedFile, setSelectedFile] = useState<FileList | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedUploadCountry, setSelectedUploadCountry] = useState<string>(currentCountry === 'all' ? 'Switzerland' : currentCountry); // State for selected country, default to Switzerland if currentCountry is 'all'
  const [uploadResult, setUploadResult] = useState<{ message: string; errors: string[] } | null>(null);
  const [serverDebugInfo, setServerDebugInfo] = useState<string>('');

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
    setUploadResult(null); // Clear previous results
    setServerDebugInfo(''); // Clear previous debug info

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
        // This block now only handles network/gateway errors, not application logic errors
        console.error("Supabase Function Invoke Error:", invokeError);
        throw new Error(`Network error: ${invokeError.message}`);
      }

      // The function now ALWAYS returns a data object, even on failure.
      if (data) {
        const resultData = data as any; // Cast to any to access potential properties
        setUploadResult({
          message: resultData.message || "Processing complete.",
          errors: resultData.errors || [],
        });

        if (resultData.serverDebugInfo) {
          setServerDebugInfo(resultData.serverDebugInfo);
        }

        if (!resultData.success || (resultData.errors && resultData.errors.length > 0)) {
          showError(resultData.message || `Upload completed with ${resultData.errors?.length || 0} errors.`);
        } else {
          showSuccess(resultData.message || "Spreadsheet uploaded and processed successfully!");
        }
      } else {
        // This case should ideally not happen with the new server-side logic
        throw new Error("Received an empty response from the server.");
      }

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
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Pro Tip for Large Files</AlertTitle>
            <AlertDescription>
              If you are uploading a large spreadsheet (e.g., more than 500 rows) and experience a 'Network error' or timeout, please split the file into smaller chunks and upload them separately. This ensures the server has enough time to process each file.
            </AlertDescription>
          </Alert>
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

          {uploadResult && (
            <Alert variant={uploadResult.errors.length > 0 ? "destructive" : "default"} className="mt-4">
              <AlertTitle>{uploadResult.errors.length > 0 ? "Upload Completed with Errors" : "Upload Successful"}</AlertTitle>
              <AlertDescription>
                <p className="font-semibold">{uploadResult.message}</p>
                {uploadResult.errors.length > 0 && (
                  <div className="mt-2 max-h-60 overflow-y-auto bg-gray-100 p-2 rounded">
                    <p className="font-bold text-sm">Specific Errors:</p>
                    <pre className="text-xs whitespace-pre-wrap">
                      {uploadResult.errors.join('\n\n')}
                    </pre>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {serverDebugInfo && (
            <div className="mt-4 p-4 bg-gray-800 text-white rounded-md">
              <h4 className="font-semibold mb-2">Server Debug Information:</h4>
              <pre className="text-xs overflow-auto max-h-60 whitespace-pre-wrap">{serverDebugInfo}</pre>
            </div>
          )}

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