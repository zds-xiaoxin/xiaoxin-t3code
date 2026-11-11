import { expect, it } from "vite-plus/test";
import * as current from "./claudeUsageLimits.ts";
import * as official from "./testFixtures/claudeUsageLimits-v0.1.9.reference.ts";

const names = { overageIncluded: undefined };
const scenarios = [
  {
    name: "unifiedWindows carries usage without top-level utilization",
    accepts: (implementation: typeof official) => {
      const event = {
        rateLimitType: "five_hour",
        status: "rejected",
        unifiedWindows: { five_hour: { utilization: 1, resetsAt: 1_900_000_000 } },
      };
      return implementation.claudeRateLimitEventToUpdate(event as never, names)
        ?.windows?.some((window) => window.id === "five_hour" && window.usedPercent === 100);
    },
  },
  {
    name: "rejected five-hour event omits utilization",
    accepts: (implementation: typeof official) => {
      const event = { rateLimitType: "five_hour", status: "rejected" };
      return implementation.claudeRateLimitEventToUpdate(event as never, names)
        ?.windows?.some((window) => window.id === "five_hour" && window.usedPercent === 100);
    },
  },
  {
    name: "six-minute-old startup reading is unavailable",
    accepts: (implementation: typeof official) => {
      const input = {
        checkedAt: "2026-07-18T10:00:00Z",
        probedAt: "2026-07-18T10:06:00Z",
        response: {
          rate_limits_available: true,
          rate_limits: { five_hour: { utilization: 89, resets_at: "2026-07-18T14:39:00Z" } },
        },
      };
      return implementation.claudeUsageResponseToLimits(input as never).limits.unavailable
        ?.reason === "probeFailed";
    },
  },
];

it.each(scenarios)("public source replay: $name", ({ accepts }) => {
  expect(Boolean(accepts(current as typeof official))).toBe(true);
  expect(Boolean(accepts(official))).toBe(false);
});
