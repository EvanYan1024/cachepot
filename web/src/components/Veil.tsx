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

/// A value that lives on-chain as ciphertext. Sealed values use a consistent
/// privacy placeholder; technical handles live in progressive disclosure.
export function Veil({ sealed, loading, handle, className, children }: VeilProps) {
  if (sealed || loading) {
    return (
      <span
        role="img"
        aria-label={loading ? "Decrypting" : "Encrypted value"}
        className={cn(
          "relative inline-flex select-none items-center overflow-hidden rounded-sm border border-border bg-accent align-middle",
          loading && "animate-pulse",
          className,
        )}
      >
        <span className="relative truncate px-2 font-mono text-xs leading-none tracking-[0.16em] text-muted-foreground">
          {loading ? "······" : "••••••"}
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
