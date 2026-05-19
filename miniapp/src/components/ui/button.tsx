import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ZAI Button — Yagona tugma komponent
 *
 * Variantlar:
 *   default   — brand gradient (primary CTA)
 *   secondary — oq fon, border (ikkilamchi)
 *   outline   — transparent, primary border
 *   ghost     — transparent, hover
 *   destructive — qizil
 *   link      — underline
 *
 * O'lchamlar: sm, default, lg, icon
 * Loading: <Button loading>...</Button>
 * Icon: <Button icon={<Plus/>}>Qo'shish</Button>
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-brand-gradient text-white shadow-premium hover:brightness-110 rounded-xl",
        secondary:
          "bg-card text-foreground border border-border shadow-card-zai hover:bg-accent hover:shadow-elevated-zai rounded-xl",
        outline:
          "border-2 border-primary text-primary bg-transparent hover:bg-primary/5 rounded-xl",
        ghost:
          "text-foreground bg-transparent hover:bg-accent rounded-xl",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 rounded-xl",
        link:
          "text-primary underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        default: "h-11 px-5 text-sm",
        sm: "h-9 px-4 text-xs",
        lg: "h-12 px-6 text-base",
        icon: "h-10 w-10 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  icon?: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, icon, children, disabled, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : icon ? (
          <span className="shrink-0">{icon}</span>
        ) : null}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
