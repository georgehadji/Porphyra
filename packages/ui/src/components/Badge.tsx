import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";
import type { HTMLAttributes } from "react";
import "./Badge.css";

const badge = cva("p-badge", {
  variants: {
    tone: {
      neutral: "p-badge--neutral",
      brand: "p-badge--brand",
      success: "p-badge--success",
      warning: "p-badge--warning",
      danger: "p-badge--danger",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badge> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={clsx(badge({ tone }), className)} {...props} />;
}
