import { Skeleton } from "@/components/ui/skeleton";
import { formatAmount } from "@/lib/contracts";
import { cn } from "@/lib/utils";

/// The pot is the one value the protocol publishes. If it cannot be decrypted we
/// say so — showing a zero would be indistinguishable from an empty pot.
export function PrizeAmount({
  amount,
  unavailable,
  className,
}: {
  amount?: bigint;
  unavailable: boolean;
  className?: string;
}) {
  if (amount !== undefined) {
    return (
      <div className={cn("numeral leading-none", className)}>
        {formatAmount(amount)}
        <span className="ml-2 font-sans text-lg font-medium tracking-normal text-muted-foreground">cUSDT</span>
      </div>
    );
  }
  if (unavailable) {
    return (
      <div className={cn("numeral leading-none text-muted-foreground", className)}>
        —<span className="label ml-3 align-middle">public decryption unavailable</span>
      </div>
    );
  }
  return <Skeleton className="mt-3 h-16 w-56" />;
}
