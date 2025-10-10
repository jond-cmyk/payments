"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface PrefixedInputProps extends React.ComponentPropsWithoutRef<typeof Input> {
  prefix: string;
}

const PrefixedInput = React.forwardRef<HTMLInputElement, PrefixedInputProps>(
  ({ className, prefix, value, onChange, ...props }, ref) => {
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let inputValue = e.target.value;

      // Ensure the prefix is always at the start
      if (!inputValue.startsWith(prefix)) {
        inputValue = prefix + inputValue.replace(prefix, ''); // Add prefix if missing, remove if it was somewhere else
      }

      // Extract the part after the prefix
      const afterPrefix = inputValue.substring(prefix.length);

      // Allow only numbers after the prefix
      const numericPart = afterPrefix.replace(/\D/g, '');

      // Construct the final value
      const finalValue = prefix + numericPart;

      // Create a synthetic event to pass the modified value
      const syntheticEvent = {
        ...e,
        target: {
          ...e.target,
          value: finalValue,
        },
      };
      onChange?.(syntheticEvent);
    };

    // Ensure the displayed value always starts with the prefix, or is just the prefix if empty
    const displayValue = (value && String(value).startsWith(prefix)) ? String(value) : prefix;

    return (
      <div className="relative flex items-center">
        <span className="absolute left-3 text-muted-foreground pointer-events-none">{prefix}</span>
        <Input
          ref={ref}
          className={cn("pl-10", className)} // Adjust padding to make space for the prefix
          value={displayValue}
          onChange={handleInputChange}
          {...props}
        />
      </div>
    );
  }
);
PrefixedInput.displayName = "PrefixedInput";

export default PrefixedInput;