import { ProviderDriverKind, type ServerProviderUsageLimits } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { modelPickerQuota as formatQuota } from "./modelPickerQuota";
function modelPickerQuota(limits: ServerProviderUsageLimits | undefined, now: number) {
  return formatQuota({ driver: ProviderDriverKind.make("claudeAgent"), usageLimits: limits }, now);
}
const now = Date.parse("2026-11-05T12:00:00Z");
function limits(usedPercent: number): ServerProviderUsageLimits {
  return {
    checkedAt: new Date(now).toISOString(),
    windows: [
      { id: "session", kind: "session", label: "5h", usedPercent: 99 },
      {
        id: "weekly",
        kind: "weekly",
        label: "Week",
        usedPercent,
        resetsAt: new Date(now + 86400000).toISOString(),
      },
    ],
  };
}
describe("model picker remaining quota", () => {
  it("uses the weekly window, rounds/clamps the remaining value and warns only under 15%", () => {
    expect(modelPickerQuota(limits(27), now)).toEqual({ label: "剩 73%", low: false });
    expect(modelPickerQuota(limits(85), now)).toEqual({ label: "剩 15%", low: false });
    expect(modelPickerQuota(limits(86), now)).toEqual({ label: "剩 14%", low: true });
    expect(modelPickerQuota(limits(120), now)).toEqual({ label: "剩 0%", low: true });
    expect(modelPickerQuota(limits(-10), now)).toEqual({ label: "剩 100%", low: false });
  });
  it("hides unknown, stale, failed, unsupported and reset readings", () => {
    expect(modelPickerQuota(undefined, now)).toBeNull();
    expect(
      modelPickerQuota({ checkedAt: new Date(now).toISOString(), windows: [] }, now),
    ).toBeNull();
    expect(modelPickerQuota(limits(NaN), now)).toBeNull();
    expect(modelPickerQuota(limits(20), now + 11 * 60000)).toBeNull();
    expect(modelPickerQuota(limits(20), now + 86400000)).toBeNull();
    expect(
      modelPickerQuota(
        { ...limits(20), unavailable: { reason: "probeFailed", message: "failed" } },
        now,
      ),
    ).toBeNull();
    expect(
      modelPickerQuota(
        { ...limits(20), unavailable: { reason: "unsupported", message: "unsupported" } },
        now,
      ),
    ).toBeNull();
  });
});
