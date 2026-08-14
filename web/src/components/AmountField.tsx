import { Input } from "@/components/ui/input";

export function AmountField({
  id,
  label,
  value,
  onChange,
  presets = [10, 100, 1000],
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  presets?: number[];
  disabled?: boolean;
}) {
  return (
    <div className="space-y-3">
      <label htmlFor={id} className="label block text-muted-foreground">
        {label}
      </label>
      <div className="relative overflow-hidden rounded-sm border border-border bg-background/75 shadow-[inset_3px_0_0_var(--paper-margin)]">
        <Input
          id={id}
          type="number"
          min="0"
          inputMode="decimal"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="h-16 border-0 bg-transparent pr-24 pl-5 font-mono text-2xl shadow-none tabular focus-visible:ring-0 md:text-2xl"
        />
        <span className="label pointer-events-none absolute inset-y-0 right-4 flex items-center text-muted-foreground">
          cUSDT
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            disabled={disabled}
            onClick={() => onChange(String(preset))}
            className="label border-b border-border px-1 py-1.5 text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
          >
            {preset.toLocaleString()}
          </button>
        ))}
      </div>
    </div>
  );
}
