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

const AdminUploadDirectDebits = () => {
  const { session, isLoading: isSessionLoading, user, userProfile } = useSession();
  const { currentCountry, availableCountries } = useCountry();
  const navigate = useNavigate();
  const [selectedFile, setSelectedFile] = useState<FileList | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedUploadCountry, setSelectedUploadCountry] = useState<string>(currentCountry === 'all' ? 'Switzerland' : currentCountry);
  const [uploadResult, setUploadResult] = useState<{ message: string; errors: string[] } | null>(null);
  const [serverDebugInfo, setServerDebugInfo] = useState<string>('');

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
      showError("Please select a specific country for the direct debits.");
      return;
    }

    const file = selectedFile[0];
    const toastId = showLoading("Uploading and processing direct debits spreadsheet...");
    setIsUploading(true);
    setServerDebugInfo('');
    setUploadResult(null); // Clear previous results

    try {
      const fileContent = await file.text();

      const { data, error: invokeError } = await supabase.functions.invoke('upload-direct-debits', {
        body: {
          fileName: file.name,
          fileContent: fileContent,
          uploaderId: user?.id,
          country: selectedUploadCountry,
        },
      });

      if (invokeError) {
        console.error("[Client] Supabase Function Invoke Error:", invokeError);
        throw new Error(`Network error: ${invokeError.message}`);
      }

      if (data) {
        const resultData = data as any;
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
          showSuccess(resultData.message || "Direct debits spreadsheet uploaded and processed successfully!");
        }
      } else {
        throw new Error("Received an empty response from the server.");
      }
      
      setSelectedFile(null);
    } catch (error: any) {
      console.error("[Client] Direct debits upload error:", error);
      showError(error.message || "Failed to upload and process direct debits spreadsheet.");
    } finally {
      dismissToast(toastId);
      setIsUploading(false);
    }
  };

  return (
    <div className="container mx-auto py-8">
      <div className="max-w-2xl mx-auto space-y-6">
        
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-center">Upload Direct Debits Spreadsheet</CardTitle>
            <CardDescription className="text-center">
              Upload a CSV file containing direct debit data. New direct debits will be set to 'Pending' status.
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
              Expected columns: `Payee`, `Payment Date` (DD.MM.YYYY), `Category`, `Account Number`, `User Email`.
              <br />
              Optional columns: `SKU`, `Not Property Related` (Yes/No), `Payment Reference`.
              <br />
              For Switzerland, the CSV must include: `Currency` and `Bank Account` (required).
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminUploadDirectDebits;