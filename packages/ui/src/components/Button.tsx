import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";
import { type ButtonHTMLAttributes, forwardRef } from "react";
import "./Button.css";

const button = cva("p-button", {
  variants: {
    variant: {
      primary: "p-button--primary",
      secondary: "p-button--secondary",
      ghost: "p-button--ghost",
      danger: "p-button--danger",
    },
    size: {
      sm: "p-button--sm",
      md: "p-button--md",
      lg: "p-button--lg",
    },
  },
  defaultVariants: { variant: "primary", size: "md" },
});

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  isLoading?: boolean;
}

/**
 * Base interactive control. Every irreversible action in the app (submit
 * application, delete account, confirm destructive change) MUST use
 * `variant="danger"` — see the security posture in the project plan; the
 * visual distinction is not cosmetic, it's the last confirmation step.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, isLoading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={clsx(button({ variant, size }), className)}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        {...props}
      >
        {isLoading && <span className="p-button__spinner" aria-hidden="true" />}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
