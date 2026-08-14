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
      <div className="relative">
        <Input
          id={id}
          type="number"
          min="0"
          inputMode="decimal"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="h-14 pr-24 font-mono text-2xl tabular md:text-2xl"
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
            className="label rounded-full border border-border px-3 py-1.5 text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
          >
            {preset.toLocaleString()}
          </button>
        ))}
      </div>
    </div>
  );
}
