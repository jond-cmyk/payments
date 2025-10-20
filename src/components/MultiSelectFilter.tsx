"use client";

import * as React from "react";
import { Check, ChevronDown, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

interface Option {
  value: string;
  label: string;
}

interface MultiSelectFilterProps {
  options: Option[];
  selectedValues: string[];
  onValueChange: (values: string[]) => void;
  placeholder: string;
  label: string;
  className?: string;
  disabled?: boolean;
}

const MultiSelectFilter: React.FC<MultiSelectFilterProps> = ({
  options,
  selectedValues,
  onValueChange,
  placeholder,
  label,
  className,
  disabled,
}) => {
  const [open, setOpen] = React.useState(false);

  const handleSelect = (value: string) => {
    const isSelected = selectedValues.includes(value);
    let newValues: string[];

    if (value === 'all') {
      // Handle 'All' selection: if currently selected, deselect all. If not, select all.
      newValues = isSelected ? [] : options.map(o => o.value);
    } else {
      // Handle individual selection
      newValues = isSelected
        ? selectedValues.filter((v) => v !== value)
        : [...selectedValues, value];
    }
    
    // Ensure 'all' is removed if any specific item is selected, and vice versa
    if (newValues.includes('all') && newValues.length > 1) {
        newValues = newValues.filter(v => v !== 'all');
    } else if (newValues.length === options.length - 1 && options.some(o => o.value === 'all')) {
        // If all non-'all' options are selected, treat it as 'all' selected
        newValues = options.map(o => o.value);
    } else if (newValues.length === options.length) {
        // If all options including 'all' are selected, normalize to just 'all' or keep all
        // For simplicity, we keep all selected values as they are.
    }

    onValueChange(newValues);
  };

  const displayLabel = React.useMemo(() => {
    if (selectedValues.length === 0) return placeholder;
    if (selectedValues.includes('all')) return `All ${label}`;
    
    const selectedLabels = options
      .filter(option => selectedValues.includes(option.value))
      .map(option => option.label);

    if (selectedLabels.length > 2) {
      return `${selectedLabels.slice(0, 2).join(', ')} +${selectedLabels.length - 2}`;
    }
    return selectedLabels.join(', ');
  }, [selectedValues, options, placeholder, label]);

  return (
    <div className={cn("space-y-1", className)}>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between h-10 text-left font-normal"
            disabled={disabled}
          >
            <span className="truncate">{displayLabel}</span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <Command>
            <CommandInput placeholder={`Search ${label}...`} />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup>
                {options.map((option) => {
                  const isSelected = selectedValues.includes(option.value);
                  return (
                    <CommandItem
                      key={option.value}
                      value={option.label}
                      onSelect={() => handleSelect(option.value)}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => handleSelect(option.value)}
                        />
                        <span>{option.label}</span>
                      </div>
                      {isSelected && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {/* Removed the selected values badge display block */}
    </div>
  );
};

export default MultiSelectFilter;