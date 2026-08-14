import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type VeilProps = {
  /// true while the value is still ciphertext to this browser
  sealed: boolean;
  loading?: boolean;
  /// the on-chain handle — shown hatched-over while sealed, and keys the reveal animation
  handle?: `0x${string}`;
  className?: string;
  children: ReactNode;
};

/// A value that lives on-chain as ciphertext. Sealed, it shows its handle under
/// a hatch; unsealed, it wipes open. Same footprint either way so nothing jumps.
export function Veil({ sealed, loading, handle, className, children }: VeilProps) {
  if (sealed || loading) {
    return (
      <span
        role="img"
        aria-label={loading ? "Decrypting" : "Encrypted value"}
        className={cn(
          "relative inline-flex select-none items-center overflow-hidden rounded-sm border border-border bg-muted/50 align-middle",
          loading && "animate-pulse",
          className,
        )}
      >
        <span className="hatch veil-drift absolute inset-0" />
        <span className="relative truncate px-2 font-mono text-[10px] leading-none text-muted-foreground/60">
          {handle ? handle.slice(2, 30) : "encrypted"}
        </span>
      </span>
    );
  }
  return (
    <span key={handle} className="unseal inline-block">
      {children}
    </span>
  );
}
