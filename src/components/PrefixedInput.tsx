"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface PrefixedInputProps extends React.ComponentPropsWithoutRef<typeof Input> {
  prefix: string;
  placeholder?: string;
}

const PrefixedInput = React.forwardRef<HTMLInputElement, PrefixedInputProps>(
  ({ className, prefix, value, onChange, ...props }, ref) => {
    // The visual prefix is displayed, but the input itself will handle the full string.
    // We no longer manipulate the onChange event or the value here.
    // Validation for the prefix and numeric content will be handled by the Zod schema.
    
    // Ensure the displayed value always starts with the prefix if it's not empty,
    // or is just the prefix if the actual value is empty.
    // This is for display only, the actual input value is controlled by react-hook-form.
    const displayValue = (value && String(value).startsWith(prefix)) ? String(value) : prefix;

    return (
      <div className="relative flex items-center">
        <span className="absolute left-3 text-muted-foreground pointer-events-none">{prefix}</span>
        <Input
          ref={ref}
          className={cn("pl-10", className)} // Adjust padding to make space for the prefix
          value={value} // Pass the raw value from react-hook-form directly
          onChange={onChange} // Pass the onChange from react-hook-form directly
          {...props}
        />
      </div>
    );
  }
);
PrefixedInput.displayName = "PrefixedInput";

export default PrefixedInput;