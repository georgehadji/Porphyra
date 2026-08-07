import { clsx } from "clsx";
import type { HTMLAttributes } from "react";
import "./Card.css";

export type CardProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: CardProps) {
  return <div className={clsx("p-card", className)} {...props} />;
}
