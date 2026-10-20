import type { InputHTMLAttributes } from 'react';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
}

/** Labelled text input shared by the account forms. */
export function Field({ label, hint, id, required, className = '', ...props }: FieldProps) {
  const inputId = id ?? props.name;
  return (
    <div className={className}>
      <label htmlFor={inputId} className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink/80">
        {label}
        {required && <span aria-hidden> *</span>}
      </label>
      <input
        id={inputId}
        required={required}
        aria-describedby={hint ? `${inputId}-hint` : undefined}
        className="w-full rounded-lg border border-line bg-cream px-4 py-2.5 text-sm outline-none transition-colors focus:border-maroon focus:ring-1 focus:ring-maroon"
        {...props}
      />
      {hint && (
        <p id={`${inputId}-hint`} className="mt-1.5 text-xs italic text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
