import { useState } from "react";
import { toast } from "sonner";

/// Wraps a write path so the button can disable itself and failures surface once.
export function useTx() {
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toast.error("Transaction failed", { description: String(error).slice(0, 140) });
    } finally {
      setBusy(false);
    }
  }
  return { busy, run };
}
