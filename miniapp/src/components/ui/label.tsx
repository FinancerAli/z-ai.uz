"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Base label primitive — the consumer is expected to associate it with
 * an input via `htmlFor` or by nesting the control inside the label. We
 * disable the strict jsx-a11y rule at the file level because this is a
 * generic wrapper that doesn't own the form control.
 */
/* eslint-disable jsx-a11y/label-has-associated-control */
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}
/* eslint-enable jsx-a11y/label-has-associated-control */

export { Label }
