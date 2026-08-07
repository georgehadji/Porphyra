import { clsx } from "clsx";
import { type InputHTMLAttributes, forwardRef, useId } from "react";
import "./Input.css";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  errorMessage?: string;
  hint?: string;
}

/**
 * Always renders a real `<label>` — the source of most SaaS a11y failures is
 * an input with a placeholder standing in for a label. `errorMessage`
 * carries `role="alert"` so a screen reader announces it as it appears.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, errorMessage, hint, id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const hintId = hint ? `${inputId}-hint` : undefined;
    const errorId = errorMessage ? `${inputId}-error` : undefined;

    return (
      <div className="p-field">
        <label className="p-field__label" htmlFor={inputId}>
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          className={clsx("p-input", errorMessage && "p-input--error", className)}
          aria-invalid={errorMessage ? true : undefined}
          aria-describedby={clsx(hintId, errorId) || undefined}
          {...props}
        />
        {hint && !errorMessage && (
          <p id={hintId} className="p-field__hint">
            {hint}
          </p>
        )}
        {errorMessage && (
          <p id={errorId} className="p-field__error" role="alert">
            {errorMessage}
          </p>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";
