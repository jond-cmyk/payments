"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input, InputProps } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { UploadCloud, FileText, X } from "lucide-react";

interface FileInputProps extends Omit<InputProps, 'value' | 'onChange'> {
  label: string;
  value?: FileList | null;
  onChange: (files: FileList | null) => void;
  accept?: string;
  disabled?: boolean;
  multiple?: boolean; // New prop for multiple files
}

const FileInput = React.forwardRef<HTMLInputElement, FileInputProps>(
  ({ label, value, onChange, accept, disabled, multiple = false, className, ...props }, ref) => {
    const inputRef = React.useRef<HTMLInputElement>(null);
    const [fileNames, setFileNames] = React.useState<string[]>([]);

    React.useEffect(() => {
      if (value && value.length > 0) {
        const names = Array.from(value).map(file => file.name);
        setFileNames(names);
      } else {
        setFileNames([]);
      }
    }, [value]);

    const handleButtonClick = () => {
      inputRef.current?.click();
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      onChange(files);
    };

    const handleRemoveFile = (indexToRemove: number) => {
      if (value) {
        const newFileList = new DataTransfer();
        Array.from(value).forEach((file, index) => {
          if (index !== indexToRemove) {
            newFileList.items.add(file);
          }
        });
        onChange(newFileList.files);
      }
    };

    return (
      <div className={cn("flex flex-col space-y-2", className)}>
        <Input
          type="file"
          ref={(e) => {
            if (inputRef) (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = e;
            if (typeof ref === 'function') ref(e);
            else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = e;
          }}
          onChange={handleFileChange}
          accept={accept}
          className="hidden" // Hide the native file input
          disabled={disabled}
          multiple={multiple} // Pass the multiple prop to the native input
          {...props}
        />
        <Button
          type="button"
          onClick={handleButtonClick}
          disabled={disabled}
          className="bg-dyad-blue hover:bg-dyad-blue-light text-dyad-blue-foreground flex-shrink-0"
        >
          <UploadCloud className="mr-2 h-4 w-4" />
          {label}
        </Button>
        {fileNames.length > 0 ? (
          <div className="space-y-1">
            {fileNames.map((name, index) => (
              <div key={index} className="flex items-center justify-between text-sm text-muted-foreground">
                <span className="flex items-center truncate">
                  <FileText className="mr-1 h-4 w-4" /> {name}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveFile(index)}
                  disabled={disabled}
                  className="h-auto p-1 text-red-500 hover:bg-red-50"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">
            No file(s) chosen
          </span>
        )}
      </div>
    );
  }
);
FileInput.displayName = "FileInput";

export default FileInput;