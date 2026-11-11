import type { SDKControlGetUsageResponse, SDKRateLimitInfo } from "@anthropic-ai/claude-agent-sdk";
import type {
  ProviderUsageLimitsUpdate,
  ServerProviderUsageLimits,
  ServerProviderUsageWindow,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";

import {
  clampPercent,
  makeUnavailableUsageLimits,
  makeUsageLimits,
} from "@t3tools/provider-core/server/usageLimits";

const SESSION_MINS = 5 * 60;
const WEEK_MINS = 7 * 24 * 60;

const WINDOWS: Readonly<
  Record<string, Pick<ServerProviderUsageWindow, "kind" | "label" | "windowDurationMins">>
> = {
  five_hour: { kind: "session", label: "Session", windowDurationMins: SESSION_MINS },
  seven_day: { kind: "weekly", label: "Weekly", windowDurationMins: WEEK_MINS },
};

/** Reuse probed display names for streamed bucket types so mid-turn updates target the same row. */
const OVERAGE_INCLUDED_EVENT_TYPE = "seven_day_overage_included";

// The SDK does not yet type the spend budget returned by `get_usage`.
const SpendMoney = Schema.Struct({
  amount_minor: Schema.Natural,
  currency: Schema.NonEmptyString,
  exponent: Schema.Natural,
});
const decodeSpendBudget = Schema.decodeUnknownOption(
  Schema.Struct({ enabled: Schema.Boolean, used: SpendMoney, limit: SpendMoney }),
);

export interface ClaudeScopedLimitNames {
  readonly overageIncluded: string | undefined;
}

export const makeClaudeScopedLimitNames = Ref.make<ClaudeScopedLimitNames>({
  overageIncluded: undefined,
});

function scopedWindowId(displayName: string): string {
  return `seven_day_${displayName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
}

function scopedWindow(
  displayName: string,
  usedPercent: number,
  resetsAt: string | undefined,
): ServerProviderUsageWindow {
  return {
    id: scopedWindowId(displayName),
    kind: "weekly",
    label: `Weekly · ${displayName}`,
    windowDurationMins: WEEK_MINS,
    usedPercent: clampPercent(usedPercent),
    ...(resetsAt ? { resetsAt } : {}),
  };
}

function percentFromAmounts(used: number | null | undefined, limit: number | null | undefined) {
  if (
    typeof used !== "number" ||
    typeof limit !== "number" ||
    !Number.isFinite(used) ||
    !Number.isFinite(limit) ||
    used < 0 ||
    limit <= 0
  ) {
    return undefined;
  }
  const percent = (used / limit) * 100;
  return Number.isFinite(percent) ? clampPercent(percent) : undefined;
}

function readSpendPercent(rateLimits: NonNullable<SDKControlGetUsageResponse["rate_limits"]>) {
  const spend = Option.getOrUndefined(
    decodeSpendBudget((rateLimits as { readonly spend?: unknown }).spend),
  );
  // Minor-unit ratios require matching currency and scale; spend.percent is rounded.
  if (
    spend?.enabled &&
    spend.used.currency.trim().length > 0 &&
    spend.used.currency.trim() === spend.limit.currency.trim() &&
    spend.used.exponent === spend.limit.exponent
  ) {
    const percent = percentFromAmounts(spend.used.amount_minor, spend.limit.amount_minor);
    if (percent !== undefined) return percent;
  }

  const extra = rateLimits.extra_usage;
  if (extra?.is_enabled !== true) return undefined;
  const percent = percentFromAmounts(extra.used_credits, extra.monthly_limit) ?? extra.utilization;
  return typeof percent === "number" && Number.isFinite(percent) && percent >= 0
    ? clampPercent(percent)
    : undefined;
}

/**
 * `model_scoped` shipped in the CLI after the SDK typings we pin, so it is
 * read structurally until the `.d.ts` catches up.
 */
interface ModelScopedWindow {
  readonly display_name: string;
  readonly utilization: number | null;
  readonly resets_at: string | null;
}

function readModelScoped(rateLimits: object): ReadonlyArray<ModelScopedWindow> {
  const raw = (rateLimits as { readonly model_scoped?: unknown }).model_scoped;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (entry): entry is ModelScopedWindow =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as ModelScopedWindow).display_name === "string",
  );
}

function isoFromEpochSeconds(value: number | undefined): string | undefined {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return undefined;
  const dt = DateTime.make(value * 1000);
  return Option.isSome(dt) ? DateTime.formatIso(dt.value) : undefined;
}

function isoFromString(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const dt = DateTime.make(value);
  return Option.isSome(dt) ? DateTime.formatIso(dt.value) : undefined;
}

function makeWindow(
  id: keyof typeof WINDOWS & string,
  usedPercent: number,
  resetsAt: string | undefined,
): ServerProviderUsageWindow {
  const window = WINDOWS[id]!;
  return {
    id,
    ...window,
    usedPercent: clampPercent(usedPercent),
    ...(resetsAt ? { resetsAt } : {}),
  };
}

const decodeUsageCache = Schema.decodeUnknownOption(
  Schema.Struct({
    oauthAccount: Schema.Struct({ accountUuid: Schema.String, emailAddress: Schema.String }),
    cachedUsageUtilization: Schema.Struct({
      accountUuid: Schema.String,
      fetchedAtMs: Schema.Number,
      utilization: Schema.Record(Schema.String, Schema.Unknown),
    }),
  }),
);
const decodeCachedWindow = Schema.decodeUnknownOption(
  Schema.Struct({
    utilization: Schema.Number,
    resets_at: Schema.NullOr(Schema.String),
  }),
);

// get_usage can return a disk-cache fallback without identifying it in the reply.
export function claudeUsageProbeCheckedAt(input: {
  readonly config: unknown;
  readonly previousConfig?: unknown;
  readonly accountEmail: string | undefined;
  readonly response: Pick<SDKControlGetUsageResponse, "rate_limits_available" | "rate_limits">;
  readonly checkedAt: string;
}): string {
  let observedAt = input.checkedAt;
  for (const config of [input.previousConfig, input.config]) {
    const decoded = decodeUsageCache(config);
    if (Option.isNone(decoded) || !input.response.rate_limits) continue;
    const { oauthAccount, cachedUsageUtilization: cache } = decoded.value;
    if (
      !input.accountEmail ||
      oauthAccount.emailAddress.toLowerCase() !== input.accountEmail.toLowerCase() ||
      cache.accountUuid !== oauthAccount.accountUuid ||
      !Number.isFinite(cache.fetchedAtMs) ||
      cache.fetchedAtMs <= 0 ||
      cache.fetchedAtMs > Date.parse(observedAt)
    )
      continue;
    let matched = false;
    for (const id of Object.keys(WINDOWS) as Array<"five_hour" | "seven_day">) {
      const reported = input.response.rate_limits[id];
      if (!reported || typeof reported.utilization !== "number") continue;
      const cached = decodeCachedWindow(cache.utilization[id]);
      if (
        Option.isNone(cached) ||
        cached.value.utilization !== reported.utilization ||
        isoFromString(cached.value.resets_at) !== isoFromString(reported.resets_at)
      ) {
        matched = false;
        break;
      }
      matched = true;
    }
    if (matched) observedAt = isoFromEpochSeconds(cache.fetchedAtMs / 1000) ?? observedAt;
  }
  return observedAt;
}

/** Stream utilization is 0-1. Drop unnamed overage buckets until probed to avoid unreconcilable rows. */
export function claudeRateLimitEventToUpdate(
  info: SDKRateLimitInfo,
  names: ClaudeScopedLimitNames,
): ProviderUsageLimitsUpdate | undefined {
  const type: string | undefined = info.rateLimitType;
  const unified = (
    info as {
      readonly unifiedWindows?: Record<
        string,
        {
          readonly utilization?: number;
          readonly resetsAt?: number;
          readonly status?: string;
        }
      >;
    }
  ).unifiedWindows;
  const windows: ServerProviderUsageWindow[] = [];
  for (const id of Object.keys(WINDOWS)) {
    const value = unified?.[id] ?? (type === id ? info : undefined);
    if (!value) continue;
    const status = value.status ?? (type === id ? info.status : undefined);
    const usedPercent =
      status === "rejected"
        ? 100
        : typeof value.utilization === "number" && Number.isFinite(value.utilization)
          ? value.utilization * 100
          : undefined;
    if (usedPercent !== undefined)
      windows.push(makeWindow(id, usedPercent, isoFromEpochSeconds(value.resetsAt)));
  }
  if (
    type === OVERAGE_INCLUDED_EVENT_TYPE &&
    names.overageIncluded &&
    typeof info.utilization === "number" &&
    Number.isFinite(info.utilization)
  ) {
    windows.push(
      scopedWindow(
        names.overageIncluded,
        info.utilization * 100,
        isoFromEpochSeconds(info.resetsAt),
      ),
    );
  }
  return windows.length > 0 ? { windows } : undefined;
}

/** get_usage percentages are already 0-100. */
export function claudeUsageResponseToLimits(input: {
  readonly response: Pick<SDKControlGetUsageResponse, "rate_limits_available" | "rate_limits">;
  readonly checkedAt: string;
  readonly probedAt?: string;
}): { readonly limits: ServerProviderUsageLimits; readonly names: ClaudeScopedLimitNames } {
  const { response, checkedAt } = input;
  if (!response.rate_limits_available || !response.rate_limits) {
    return {
      limits: makeUnavailableUsageLimits({
        checkedAt,
        reason: response.rate_limits_available ? "probeFailed" : "unsupported",
      }),
      names: { overageIncluded: undefined },
    };
  }
  const windows: ServerProviderUsageWindow[] = [];
  for (const id of Object.keys(WINDOWS)) {
    const window = response.rate_limits[id as "five_hour" | "seven_day"];
    if (!window || typeof window.utilization !== "number") continue;
    windows.push(makeWindow(id, window.utilization, isoFromString(window.resets_at)));
  }
  // The CLI's overage allowlist currently has one model; events refer to its first entry.
  let overageIncluded: string | undefined;
  for (const entry of readModelScoped(response.rate_limits)) {
    if (typeof entry.utilization !== "number") continue;
    windows.push(
      scopedWindow(entry.display_name, entry.utilization, isoFromString(entry.resets_at)),
    );
    overageIncluded ??= entry.display_name;
  }
  const spendPercent = readSpendPercent(response.rate_limits);
  if (spendPercent !== undefined) {
    windows.push({
      id: "monthly_spend",
      kind: "monthly",
      label: "Monthly spend",
      usedPercent: spendPercent,
    });
  }
  return {
    limits: {
      ...makeUsageLimits({ checkedAt, windows }),
      ...(input.probedAt !== undefined &&
      Date.parse(input.probedAt) - Date.parse(checkedAt) > 5 * 60_000
        ? {
            unavailable: {
              reason: "probeFailed" as const,
              message: "Claude could not read fresh usage limits. The last reading is out of date.",
            },
          }
        : {}),
    },
    names: { overageIncluded },
  };
}

export const recordClaudeUsageResponse = (
  namesRef: Ref.Ref<ClaudeScopedLimitNames>,
  input: Parameters<typeof claudeUsageResponseToLimits>[0],
): Effect.Effect<ServerProviderUsageLimits> => {
  const { limits, names } = claudeUsageResponseToLimits(input);
  return Ref.set(namesRef, names).pipe(Effect.as(limits));
};
