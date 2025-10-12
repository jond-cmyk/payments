"use client";

import * as React from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
// Removed ChevronDown import as it will now be handled by the parent component

import { cn } from "@/lib/utils";

const CustomAccordionTrigger = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      ref={ref}
      className={cn(
        "flex flex-1 items-center justify-between py-4 font-medium transition-all hover:underline", // Removed [&[data-state=open]>svg]:rotate-180 as the icon is no longer here
        className
      )}
      {...props}
    >
      {children} {/* This must now be the ONLY child passed to AccordionPrimitive.Trigger */}
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
));
CustomAccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName;

export { CustomAccordionTrigger };