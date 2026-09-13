import { forwardRef, useId, type InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string
    error?: string
    helperText?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ label, error, helperText, className = '', ...props }, ref) => {
        const generatedId = useId()
        const inputId = props.id ?? generatedId
        const descriptionId = error || helperText ? `${inputId}-description` : undefined

        return (
            <div className="w-full">
                {label && (
                    <label htmlFor={inputId} className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
                        {label}
                    </label>
                )}
                <input
                    ref={ref}
                    id={inputId}
                    aria-invalid={Boolean(error)}
                    aria-describedby={descriptionId}
                    className={`
            w-full px-4 py-3 text-base
            bg-[var(--color-surface)] 
            border border-[var(--color-border)]
            rounded-xl
            text-[var(--color-text)]
            transition-all duration-200
            placeholder:text-[var(--color-text-muted)]
            focus:outline-none focus:border-[var(--color-primary)]
            focus:ring-2 focus:ring-[var(--color-primary)]/20
            disabled:opacity-50 disabled:cursor-not-allowed
            [color-scheme:light]
            ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''}
            ${className}
          `}
                    {...props}
                />
                {error && (
                    <p id={descriptionId} className="mt-1.5 text-sm text-red-500">{error}</p>
                )}
                {helperText && !error && (
                    <p id={descriptionId} className="mt-1.5 text-sm text-[var(--color-text-muted)]">{helperText}</p>
                )}
            </div>
        )
    }
)

Input.displayName = 'Input'
