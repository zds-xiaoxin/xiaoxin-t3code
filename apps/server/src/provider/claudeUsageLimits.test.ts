import { describe, expect, it } from "vite-plus/test";

import {
  claudeRateLimitEventToUpdate,
  claudeUsageResponseToLimits,
  claudeUsageProbeCheckedAt,
} from "./claudeUsageLimits.ts";

const checkedAt = "2026-07-18T10:00:00.000Z";
const noNames = { overageIncluded: undefined } as const;

describe("claudeUsageProbeCheckedAt", () => {
  const cachedAt = "2026-07-18T09:00:00.000Z";
  const row = { utilization: 89, resets_at: "2026-07-18T11:20:00.248Z" };
  const config = {
    oauthAccount: { accountUuid: "account-a", emailAddress: "dev@example.com" },
    cachedUsageUtilization: {
      accountUuid: "account-a",
      fetchedAtMs: Date.parse(cachedAt),
      utilization: { five_hour: row },
    },
  };
  const input = {
    config,
    accountEmail: "dev@example.com",
    checkedAt,
    response: { rate_limits_available: true, rate_limits: { five_hour: row } },
  };
  it("preserves the observation time only for matching account and usage data", () => {
    expect(claudeUsageProbeCheckedAt(input)).toBe(cachedAt);
    for (const patch of [
      { config: undefined },
      { config: "invalid" },
      { accountEmail: "other@example.com" },
      { accountEmail: undefined },
      {
        config: {
          ...config,
          cachedUsageUtilization: { ...config.cachedUsageUtilization, accountUuid: "account-b" },
        },
      },
      {
        config: {
          ...config,
          cachedUsageUtilization: { ...config.cachedUsageUtilization, fetchedAtMs: Number.NaN },
        },
      },
      {
        config: {
          ...config,
          cachedUsageUtilization: {
            ...config.cachedUsageUtilization,
            fetchedAtMs: Date.parse(checkedAt) + 1000,
          },
        },
      },
      { response: { rate_limits_available: false, rate_limits: null } },
    ])
      expect(claudeUsageProbeCheckedAt({ ...input, ...patch })).toBe(checkedAt);
  });
  it("accepts fresh usage, reset windows and an empty successful response", () => {
    for (const rate_limits of [
      { five_hour: { ...row, utilization: 100 } },
      { five_hour: { ...row, utilization: 0, resets_at: "2026-07-18T16:20:00Z" } },
      {},
    ])
      expect(
        claudeUsageProbeCheckedAt({
          ...input,
          response: { rate_limits_available: true, rate_limits },
        }),
      ).toBe(checkedAt);
  });
  it("recognizes an old answer even if another session changed the cache during the query", () => {
    const changedConfig = {
      ...config,
      cachedUsageUtilization: {
        ...config.cachedUsageUtilization,
        fetchedAtMs: Date.parse(checkedAt),
        utilization: { five_hour: { ...row, utilization: 100 } },
      },
    };
    expect(
      claudeUsageProbeCheckedAt({ ...input, previousConfig: config, config: changedConfig }),
    ).toBe(cachedAt);
  });
});

describe("claudeUsageResponseToLimits", () => {
  it("marks an expired cached startup reading unavailable instead of current quota", () => {
    const response = {
      rate_limits_available: true,
      rate_limits: { five_hour: { utilization: 89, resets_at: "2026-07-18T14:39:00Z" } },
    };
    const stale = claudeUsageResponseToLimits({
      response,
      checkedAt,
      probedAt: "2026-07-18T10:06:00Z",
    }).limits;
    expect(stale.unavailable?.reason).toBe("probeFailed");
    expect(stale.checkedAt).toBe(checkedAt);
    expect(
      claudeUsageResponseToLimits({ response, checkedAt, probedAt: "2026-07-18T10:01:00Z" }).limits
        .unavailable,
    ).toBeUndefined();
  });

  it("maps the session, weekly, and model-scoped weekly windows", () => {
    expect(
      claudeUsageResponseToLimits({
        checkedAt,
        response: {
          rate_limits_available: true,
          rate_limits: {
            five_hour: { utilization: 54, resets_at: "2026-07-18T14:39:00Z" },
            seven_day: { utilization: 18.4, resets_at: "2026-07-24T08:59:00+00:00" },
            seven_day_opus: { utilization: 3, resets_at: null },
            ...({
              model_scoped: [
                { display_name: "Fable", utilization: 73, resets_at: "2026-07-24T08:59:00Z" },
                { display_name: "Ghost", utilization: null, resets_at: null },
              ],
            } as object),
            extra_usage: {
              is_enabled: false,
              monthly_limit: null,
              used_credits: null,
              utilization: null,
            },
          },
        },
      }),
    ).toEqual({
      names: { overageIncluded: "Fable" },
      limits: {
        checkedAt,
        windows: [
          {
            id: "five_hour",
            kind: "session",
            label: "Session",
            usedPercent: 54,
            windowDurationMins: 300,
            resetsAt: "2026-07-18T14:39:00.000Z",
          },
          {
            id: "seven_day",
            kind: "weekly",
            label: "Weekly",
            usedPercent: 18.4,
            windowDurationMins: 10080,
            resetsAt: "2026-07-24T08:59:00.000Z",
          },
          {
            id: "seven_day_fable",
            kind: "weekly",
            label: "Weekly · Fable",
            usedPercent: 73,
            windowDurationMins: 10080,
            resetsAt: "2026-07-24T08:59:00.000Z",
          },
        ],
      },
    });
  });

  it("names the overage-included bucket only from a scoped entry that drew a row", () => {
    expect(
      claudeUsageResponseToLimits({
        checkedAt,
        response: {
          rate_limits_available: true,
          rate_limits: {
            ...({
              model_scoped: [
                { display_name: "Ghost", utilization: null, resets_at: null },
                { display_name: "Fable", utilization: 5, resets_at: null },
              ],
            } as object),
          },
        },
      }).names,
    ).toEqual({ overageIncluded: "Fable" });
  });

  it("skips a window the endpoint reports without a utilization", () => {
    expect(
      claudeUsageResponseToLimits({
        checkedAt,
        response: {
          rate_limits_available: true,
          rate_limits: {
            five_hour: { utilization: null, resets_at: null },
            seven_day: { utilization: 250, resets_at: null },
          },
        },
      }).limits.windows,
    ).toEqual([
      {
        id: "seven_day",
        kind: "weekly",
        label: "Weekly",
        usedPercent: 100,
        windowDurationMins: 10080,
      },
    ]);
  });

  const enterpriseResponse = {
    rate_limits_available: true,
    rate_limits: {
      five_hour: null,
      seven_day: null,
      spend: {
        enabled: true,
        used: { amount_minor: 4_631, currency: "USD", exponent: 2 },
        limit: { amount_minor: 50_000, currency: "USD", exponent: 2 },
        percent: 9,
      },
      extra_usage: {
        is_enabled: true,
        used_credits: 4_631,
        monthly_limit: 50_000,
        utilization: 9.261999999999999,
        currency: "USD",
        decimal_places: 2,
      },
    },
  };
  const monthlyWindow = {
    id: "monthly_spend",
    kind: "monthly",
    label: "Monthly spend",
    usedPercent: expect.closeTo(9.262, 10),
  };

  it("maps the captured Enterprise budget precisely, preferring spend beside rolling windows", () => {
    expect(claudeUsageResponseToLimits({ checkedAt, response: enterpriseResponse }).limits).toEqual(
      {
        checkedAt,
        windows: [monthlyWindow],
      },
    );
    const response = {
      ...enterpriseResponse,
      rate_limits: {
        ...enterpriseResponse.rate_limits,
        five_hour: { utilization: 12, resets_at: null },
        extra_usage: {
          ...enterpriseResponse.rate_limits.extra_usage,
          used_credits: 30_000,
          utilization: 60,
        },
      },
    };
    expect(claudeUsageResponseToLimits({ checkedAt, response }).limits.windows).toEqual([
      {
        id: "five_hour",
        kind: "session",
        label: "Session",
        usedPercent: 12,
        windowDurationMins: 300,
      },
      monthlyWindow,
    ]);
  });

  it("falls back to enabled extra usage amounts or utilization when spend is unusable", () => {
    const response = {
      ...enterpriseResponse,
      rate_limits: {
        ...enterpriseResponse.rate_limits,
        spend: {
          ...enterpriseResponse.rate_limits.spend,
          enabled: false,
          used: { amount_minor: 30_000, currency: "USD", exponent: 2 },
        },
        extra_usage: { ...enterpriseResponse.rate_limits.extra_usage, utilization: 9 },
      },
    };
    expect(claudeUsageResponseToLimits({ checkedAt, response }).limits.windows).toEqual([
      monthlyWindow,
    ]);
    const utilizationOnly = {
      ...response,
      rate_limits: {
        ...response.rate_limits,
        spend: { enabled: true, used: null, limit: null, percent: 9 },
        extra_usage: {
          ...enterpriseResponse.rate_limits.extra_usage,
          used_credits: null,
          monthly_limit: null,
        },
      },
    };
    expect(
      claudeUsageResponseToLimits({ checkedAt, response: utilizationOnly }).limits.windows,
    ).toEqual([monthlyWindow]);
  });

  it("omits disabled budgets and refuses invalid money without an enabled fallback", () => {
    const rateLimits = enterpriseResponse.rate_limits;
    const response = {
      ...enterpriseResponse,
      rate_limits: {
        ...rateLimits,
        spend: { ...rateLimits.spend, enabled: false },
        extra_usage: { ...rateLimits.extra_usage, is_enabled: false },
      },
    };
    expect(claudeUsageResponseToLimits({ checkedAt, response }).limits.windows).toEqual([]);
    response.rate_limits.spend = {
      ...rateLimits.spend,
      limit: { ...rateLimits.spend.limit, currency: "EUR" },
    };
    expect(claudeUsageResponseToLimits({ checkedAt, response }).limits.windows).toEqual([]);
    response.rate_limits.spend = {
      ...rateLimits.spend,
      limit: { ...rateLimits.spend.limit, amount_minor: 0 },
    };
    expect(claudeUsageResponseToLimits({ checkedAt, response }).limits.windows).toEqual([]);
  });
});

describe("claudeRateLimitEventToUpdate", () => {
  it("reads unified windows even when the CLI omits top-level utilization", () => {
    const result = claudeRateLimitEventToUpdate(
      {
        status: "allowed",
        rateLimitType: "five_hour",
        unifiedWindows: {
          five_hour: { utilization: 0.89, resetsAt: 1794396000 },
          seven_day: { utilization: 0.64, resetsAt: 1794690000 },
        },
      } as Parameters<typeof claudeRateLimitEventToUpdate>[0],
      noNames,
    );
    expect(result?.windows.map(({ id, usedPercent }) => ({ id, usedPercent }))).toEqual([
      { id: "five_hour", usedPercent: 89 },
      { id: "seven_day", usedPercent: 64 },
    ]);
    expect(
      claudeRateLimitEventToUpdate(
        {
          status: "rejected",
          rateLimitType: "five_hour",
          resetsAt: 1794396000,
        },
        noNames,
      )?.windows[0]?.usedPercent,
    ).toBe(100);
    expect(
      claudeRateLimitEventToUpdate(
        {
          status: "allowed",
          rateLimitType: "five_hour",
          utilization: Number.NaN,
        },
        noNames,
      ),
    ).toBeUndefined();
  });

  it("scales the 0–1 utilization and epoch-second reset onto the probe's window id", () => {
    expect(
      claudeRateLimitEventToUpdate(
        {
          status: "allowed_warning",
          rateLimitType: "seven_day",
          utilization: 0.85,
          resetsAt: 1_784_000_000,
        },
        noNames,
      ),
    ).toEqual({
      windows: [
        {
          id: "seven_day",
          kind: "weekly",
          label: "Weekly",
          usedPercent: 85,
          windowDurationMins: 10080,
          resetsAt: "2026-07-14T03:33:20.000Z",
        },
      ],
    });
  });

  it("lands the streamed overage-included bucket on the row the probe named", () => {
    const event = {
      status: "allowed",
      rateLimitType: "seven_day_overage_included" as never,
      utilization: 0.4,
    } as const;
    expect(claudeRateLimitEventToUpdate(event, noNames)).toBeUndefined();
    expect(claudeRateLimitEventToUpdate(event, { overageIncluded: "Fable" })).toEqual({
      windows: [
        {
          id: "seven_day_fable",
          kind: "weekly",
          label: "Weekly · Fable",
          usedPercent: 40,
          windowDurationMins: 10080,
        },
      ],
    });
  });
});
