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
  date: Date | undefined;
  setDate: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

const DatePicker = ({ date, setDate, placeholder = "Select a date", disabled = false, className, id }: DatePickerProps) => {
  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDate(undefined);
  };

  return (
    <Popover>
      <div className={cn("relative w-full", className)}>
        <PopoverTrigger asChild>
          <Button
            variant={"outline"}
            className={cn(
              "w-full justify-start text-left font-normal pr-10",
              !date && "text-muted-foreground"
            )}
            disabled={disabled}
            id={id}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date ? format(date, "PPP") : <span>{placeholder}</span>}
          </Button>
        </PopoverTrigger>
        {date && !disabled && (
          <div
            className="absolute right-0 top-0 h-full flex items-center px-3 cursor-pointer text-muted-foreground hover:text-foreground z-10"
            onClick={handleClear}
            title="Clear date"
          >
            <X className="h-4 w-4" />
          </div>
        )}
      </div>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={setDate}
          initialFocus
          disabled={disabled}
        />
      </PopoverContent>
    </Popover>
  );
};

export default DatePicker;