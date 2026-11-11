import type { ServerProvider } from "@t3tools/contracts";
import { DEFAULT_QUOTA_PREFERENCES, quotaState, quotaWindow } from "../usage/quotaTopbarModel";

export function modelPickerQuota(
  provider: Pick<ServerProvider, "driver" | "usageLimits">,
  now: number,
) {
  const limits = provider.usageLimits;
  const account = {
    id: "",
    driver: provider.driver,
    label: "",
    alias: "",
    limits,
    connected: true,
    failed: !!limits?.unavailable,
  };
  const status = quotaState(account, quotaWindow(account, DEFAULT_QUOTA_PREFERENCES), now);
  if (limits?.unavailable || status.state !== "current" || status.remaining === null) return null;
  return { label: `剩 ${status.remaining}%`, low: status.remaining < 15 };
}
