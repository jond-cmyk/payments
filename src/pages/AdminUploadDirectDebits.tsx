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

const AdminUploadDirectDebits = () => {
  const { session, isLoading: isSessionLoading, user, userProfile } = useSession();
  const { currentCountry, availableCountries } = useCountry();
  const navigate = useNavigate();
  const [selectedFile, setSelectedFile] = useState<FileList | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedUploadCountry, setSelectedUploadCountry] = useState<string>(currentCountry === 'all' ? 'Switzerland' : currentCountry);
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
    console.log(`[Client] Starting upload of file: ${file.name}`);
    console.log(`[Client] File size: ${file.size} bytes`);
    console.log(`[Client] Selected country: ${selectedUploadCountry}`);
    
    const toastId = showLoading("Uploading and processing direct debits spreadsheet...");
    setIsUploading(true);
    setServerDebugInfo('');

    try {
      console.log(`[Client] Reading file content...`);
      const fileContent = await file.text();
      console.log(`[Client] File content length: ${fileContent.length} characters`);
      
      // Show first 500 characters to see the CSV structure
      console.log(`[Client] First 500 chars of file: ${fileContent.substring(0, 500)}`);
      
      // Try to parse and show the first few lines
      const lines = fileContent.split('\n');
      console.log(`[Client] Total lines in file: ${lines.length}`);
      console.log(`[Client] First 5 lines:`);
      lines.slice(0, 5).forEach((line, index) => {
        console.log(`Line ${index + 1}: "${line}"`);
      });

      console.log(`[Client] Calling upload-direct-debits function...`);
      const { data, error: invokeError } = await supabase.functions.invoke('upload-direct-debits', {
        body: {
          fileName: file.name,
          fileContent: fileContent,
          uploaderId: user?.id,
          country: selectedUploadCountry,
        },
      });

      console.log(`[Client] Function response:`, { data, invokeError });

      if (invokeError) {
        console.error("[Client] Supabase Function Invoke Error:", invokeError);
        console.error("[Client] Full error details:", JSON.stringify(invokeError, null, 2));
        
        let errorMessage = invokeError.message;
        if (data?.error) {
          errorMessage = data.error;
        } else if (data?.message) {
          errorMessage = data.message;
        }
        
        throw new Error(errorMessage);
      }

      if (data?.error) {
        console.error("[Client] Function returned error:", data.error);
        throw new Error(data.error);
      }

      console.log(`[Client] Upload successful! Message: ${data?.message}`);
      if (data.errors && data.errors.length > 0) {
        console.warn(`[Client] Upload completed with ${data.errors.length} warnings/errors:`, data.errors);
      }
      
      // Store server debug info
      if (data?.serverDebugInfo) {
        setServerDebugInfo(data.serverDebugInfo);
        console.log(`[Client] Server debug info received:`, data.serverDebugInfo);
      } else {
        console.log(`[Client] No server debug info received`);
      }
      
      showSuccess(data?.message || "Direct debits spreadsheet uploaded and processed successfully!");
      setSelectedFile(null);
    } catch (error: any) {
      console.error("[Client] Direct debits upload error:", error);
      console.error("[Client] Error stack:", error.stack);
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
            <p className="text-sm text-muted-foreground text-center">
              Accepted format: CSV. Max file size: 5MB.
              <br />
              Expected columns: `Payee`, `Payment Date` (DD.MM.YYYY), `Category`, `Account Number`, `User Email`.
              <br />
              Optional columns: `SKU`, `Not Property Related` (Yes/No), `Payment Reference`, `Bank Account` (for Switzerland).
            </p>
            
            {serverDebugInfo && (
              <div className="mt-4 p-4 bg-gray-100 rounded-md">
                <h4 className="font-semibold mb-2">Server Debug Information:</h4>
                <pre className="text-xs overflow-auto max-h-40">{serverDebugInfo}</pre>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminUploadDirectDebits;