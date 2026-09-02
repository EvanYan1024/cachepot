import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type VeilProps = {
  /// true while the value is still ciphertext to this browser
  sealed: boolean;
  loading?: boolean;
  failed?: boolean; // permit granted but this ciphertext did not decrypt
  /// the on-chain handle — shown hatched-over while sealed, and keys the reveal animation
  handle?: `0x${string}`;
  className?: string;
  children: ReactNode;
};

/// A value that lives on-chain as ciphertext. Sealed values render as a bare
/// asterisk mask inheriting the surrounding type, matching app.zama.org.
export function Veil({ sealed, loading, failed, handle, className, children }: VeilProps) {
  if (!sealed && failed) {
    return (
      <span title="Decryption failed" className={cn("select-none text-muted-foreground", className)}>
        unavailable
      </span>
    );
  }
  if (sealed || loading) {
    return (
      <span
        role="img"
        aria-label={loading ? "Decrypting" : "Encrypted value"}
        className={cn("select-none tracking-wider", loading && "animate-pulse", className)}
      >
        ******
      </span>
    );
  }
  return (
    <span key={handle} className="unseal inline-block">
      {children}
    </span>
  );
}
