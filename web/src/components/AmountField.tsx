import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";

export function AmountField({
  id,
  label,
  value,
  onChange,
  presets = [10, 100, 1000],
  unit = "cUSDT",
  disabled,
  max,
  balance,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  presets?: number[];
  unit?: string;
  disabled?: boolean;
  max?: string; // full available balance; renders a Max button when known
  balance?: ReactNode; // available-balance readout, shown beside the Max button
}) {
  return (
    <div className="space-y-3">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative overflow-hidden rounded-xl border border-white/70 bg-card/75 shadow-[0_18px_40px_-28px_rgb(20_20_18/0.35),inset_0_1px_0_rgb(255_255_255/0.8)] transition-[border-color,box-shadow] focus-within:border-foreground/25 focus-within:shadow-[0_22px_48px_-28px_rgb(20_20_18/0.44),0_0_0_3px_rgb(255_217_26/0.2)] dark:border-border">
        <Input
          id={id}
          type="number"
          min="0"
          inputMode="decimal"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="h-24 border-0 bg-transparent pr-28 pl-5 text-4xl font-light tracking-[-0.055em] shadow-none tabular focus-visible:ring-0 md:text-5xl"
        />
        <span className="pointer-events-none absolute top-14 right-4 -translate-y-1/2 rounded-lg border border-border/70 bg-secondary/80 px-3 py-1.5 text-xs font-medium text-foreground">{unit}</span>
        {(balance || max !== undefined) && (
          <div className="flex items-center justify-between gap-3 border-t border-border/70 px-5 py-3 text-sm">
            <span className="min-w-0 truncate text-muted-foreground">{balance}</span>
            {max !== undefined && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(max)}
                className="shrink-0 rounded-lg border border-border/70 bg-secondary px-3.5 py-1.5 text-xs font-semibold text-foreground transition-[background-color,transform] hover:bg-muted active:translate-y-px disabled:opacity-50"
              >
                Max
              </button>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            disabled={disabled}
            onClick={() => onChange(String(preset))}
            className="min-h-8 rounded-lg border border-border/70 bg-card/60 px-3 text-xs font-medium text-muted-foreground transition-[background-color,border-color,color,transform] hover:border-foreground/25 hover:bg-card hover:text-foreground active:translate-y-px disabled:opacity-50"
          >
            {preset.toLocaleString()}
          </button>
        ))}
      </div>
    </div>
  );
}
