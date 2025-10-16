"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText } from 'lucide-react';

interface CsvStructureViewerProps {
  onFileAnalyzed: (structure: string) => void;
}

const CsvStructureViewer: React.FC<CsvStructureViewerProps> = ({ onFileAnalyzed }) => {
  const [csvStructure, setCsvStructure] = useState<string>('');

  const handleFileAnalysis = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const lines = text.split('\n');
      
      // Get headers (first line)
      const headers = lines[0]?.split(',').map(h => h.trim()) || [];
      
      // Get first few data rows
      const sampleRows = lines.slice(1, 4).map((line, index) => {
        const cells = line.split(',').map(c => c.trim());
        const rowObj: Record<string, string> = {};
        headers.forEach((header, i) => {
          rowObj[header] = cells[i] || '';
        });
        return `Row ${index + 1}: ${JSON.stringify(rowObj, null, 2)}`;
      });

      const structure = `File: ${file.name}\n` +
        `Total rows: ${lines.length}\n\n` +
        `HEADERS FOUND:\n${headers.map((h, i) => `${i + 1}. "${h}"`).join('\n')}\n\n` +
        `SAMPLE DATA (first 3 rows):\n${sampleRows.join('\n\n')}`;

      setCsvStructure(structure);
      onFileAnalyzed(structure);
    } catch (error) {
      console.error('Error analyzing CSV:', error);
      setCsvStructure(`Error analyzing file: ${error}`);
    }
  };

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center">
          <FileText className="mr-2 h-5 w-5" /> CSV Structure Analyzer
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Upload CSV to analyze structure:</label>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileAnalysis}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>
          
          {csvStructure && (
            <div className="mt-4 p-4 bg-gray-50 rounded-md">
              <h4 className="font-semibold mb-2">CSV Structure Analysis:</h4>
              <pre className="text-xs overflow-auto max-h-60 whitespace-pre-wrap">{csvStructure}</pre>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default CsvStructureViewer;