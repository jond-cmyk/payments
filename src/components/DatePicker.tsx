"use client";

import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DatePickerProps {
  date: Date | undefined | null;
  setDate: (date: Date | undefined | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

const DatePicker = ({ date, setDate, placeholder = "Select a date", disabled = false, className, id }: DatePickerProps) => {
  const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation(); // Stop click from bubbling to PopoverTrigger or any parent handlers
    e.preventDefault();
    setDate(null); // Explicitly set to null to clear
    setIsPopoverOpen(false);
  };

  return (
    <div className={cn("relative w-full", className)}>
      <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={"outline"}
            className={cn(
              "w-full justify-start text-left font-normal pr-10 relative z-10", // Ensure padding for the X icon
              !date && "text-muted-foreground"
            )}
            disabled={disabled}
            id={id}
            onClick={() => !disabled && setIsPopoverOpen(true)}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date ? format(date, "PPP") : <span>{placeholder}</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date || undefined}
            onSelect={(newDate) => {
              setDate(newDate);
              setIsPopoverOpen(false);
            }}
            initialFocus
            disabled={disabled}
          />
        </PopoverContent>
      </Popover>

      {/* Clear Button - Rendered completely outside the Popover context but positioned over the button */}
      {date && !disabled && (
        <div
          role="button"
          tabIndex={0}
          className="absolute right-0 top-0 h-full flex items-center px-3 cursor-pointer text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-r-md transition-colors z-20"
          onClick={handleClear}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              handleClear(e as unknown as React.MouseEvent);
            }
          }}
          title="Clear date"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Clear date</span>
        </div>
      )}
    </div>
  );
};

export default DatePicker;