import { Button } from "@/components/ui/button";
import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";

interface PinPadProps {
  value: string;
  onChange: (next: string) => void;
  length?: number;
  disabled?: boolean;
  label?: string;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export function PinPad({ value, onChange, length = 4, disabled, label }: PinPadProps) {
  const push = (d: string) => {
    if (disabled) return;
    if (value.length >= length) return;
    onChange(value + d);
  };
  const back = () => {
    if (disabled) return;
    onChange(value.slice(0, -1));
  };

  return (
    <div className="flex flex-col items-center gap-6">
      {label ? (
        <p className="text-sm font-medium text-stone-600">{label}</p>
      ) : null}
      <div
        className="flex items-center gap-3"
        role="group"
        aria-label="PIN entry display"
      >
        {Array.from({ length }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-4 w-4 rounded-full border-2 transition-colors",
              value.length > i
                ? "border-[var(--color-brand-600)] bg-[var(--color-brand-600)]"
                : "border-stone-300"
            )}
            aria-hidden
          />
        ))}
      </div>
      <div className="grid w-full max-w-xs grid-cols-3 gap-3">
        {KEYS.map((k) => (
          <Button
            key={k}
            type="button"
            variant="outline"
            size="xl"
            className="h-16 text-2xl font-semibold"
            onClick={() => push(k)}
            disabled={disabled}
            aria-label={`Digit ${k}`}
          >
            {k}
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="xl"
          className="h-16"
          onClick={back}
          disabled={disabled || value.length === 0}
          aria-label="Backspace"
        >
          <Delete className="h-6 w-6" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="xl"
          className="h-16 text-2xl font-semibold"
          onClick={() => push("0")}
          disabled={disabled}
          aria-label="Digit 0"
        >
          0
        </Button>
        <div />
      </div>
    </div>
  );
}
