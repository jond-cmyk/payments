"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input, InputProps } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { UploadCloud } from "lucide-react";

interface FileInputProps extends Omit<InputProps, 'value' | 'onChange'> {
  label: string;
  value?: FileList | null;
  onChange: (files: FileList | null) => void;
  accept?: string;
  disabled?: boolean;
}

const FileInput = React.forwardRef<HTMLInputElement, FileInputProps>(
  ({ label, value, onChange, accept, disabled, className, ...props }, ref) => {
    const inputRef = React.useRef<HTMLInputElement>(null);
    const [fileName, setFileName] = React.useState<string | null>(null);

    React.useEffect(() => {
      if (value && value.length > 0) {
        setFileName(value[0].name);
      } else {
        setFileName(null);
      }
    }, [value]);

    const handleButtonClick = () => {
      inputRef.current?.click();
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      onChange(files);
    };

    return (
      <div className={cn("flex items-center space-x-2", className)}>
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
        {fileName && (
          <span className="text-sm text-muted-foreground truncate flex-grow">
            {fileName}
          </span>
        )}
        {!fileName && (
          <span className="text-sm text-muted-foreground truncate flex-grow">
            No file chosen
          </span>
        )}
      </div>
    );
  }
);
FileInput.displayName = "FileInput";

export default FileInput;