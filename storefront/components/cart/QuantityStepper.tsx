'use client';

interface QuantityStepperProps {
  value: number;
  max: number;
  /** Used to give the buttons unambiguous accessible names when several steppers are on screen. */
  label: string;
  onChange: (next: number) => void;
}

/** Button-driven (not a bare number input) so it is fully keyboard/screen-reader operable. */
export function QuantityStepper({ value, max, label, onChange }: QuantityStepperProps) {
  const button =
    'flex h-8 w-8 items-center justify-center text-base font-bold text-muted transition-colors hover:text-maroon disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted';

  return (
    <div role="group" aria-label={`Quantity of ${label}`} className="inline-flex items-center rounded-full border border-line bg-white text-sm">
      <button type="button" className={button} disabled={value <= 1} onClick={() => onChange(value - 1)} aria-label={`Decrease quantity of ${label}`}>
        −
      </button>
      <span className="min-w-7 text-center font-semibold text-ink" aria-live="polite">
        {value}
      </span>
      <button type="button" className={button} disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={`Increase quantity of ${label}`}>
        +
      </button>
    </div>
  );
}
