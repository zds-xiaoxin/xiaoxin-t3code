// @effect-diagnostics nodeBuiltinImport:off - cleanup uses Node's retrying rm, which the FileSystem service does not expose.
import * as NodeServices from "@effect/platform-node/NodeServices";
import { ClaudeSettings, type ServerProvider } from "@t3tools/contracts";
import { vi } from "vite-plus/test";
import * as ClaudeSdk from "@anthropic-ai/claude-agent-sdk";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";
import * as TestClock from "effect/testing/TestClock";
import { claudeUsageResponseToLimits } from "./claudeUsageLimits.ts";
import { resolveUsageLimitsAfterProbe } from "@t3tools/provider-core/server/usageLimits";

import {
  buildClaudeCapabilitiesProbeQueryOptions,
  probeClaudeCapabilities,
  probeClaudeWorkspaceSnapshot,
} from "./ClaudeProvider.ts";

vi.mock("@anthropic-ai/claude-agent-sdk", { spy: true });

const decodeClaudeSettings = Schema.decodeEffect(ClaudeSettings);
const encodeJson = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));

it.effect("does not let a newly queried cached reading overwrite live exhaustion", () =>
  Effect.gen(function* () {
    const observedAt = "2026-11-11T09:06:28.409Z";
    const queriedAt = "2026-11-11T09:54:02.479Z";
    const resetsAt = "2026-11-11T11:20:00.248Z";
    yield* TestClock.setTime(Date.parse(queriedAt));
    const rateLimits = {
      five_hour: { utilization: 89, resets_at: resetsAt },
      seven_day: { utilization: 64, resets_at: "2026-11-14T21:00:00.248Z" },
    };
    const query = vi.spyOn(ClaudeSdk, "query").mockImplementation(
      () =>
        ({
          initializationResult: async () => ({
            account: { email: "dev@example.com", subscriptionType: "pro", tokenSource: "oauth" },
            commands: [],
          }),
          usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: async () => ({
            rate_limits_available: true,
            rate_limits: rateLimits,
          }),
        }) as unknown as ReturnType<typeof ClaudeSdk.query>,
    );
    yield* Effect.addFinalizer(() => Effect.sync(() => query.mockRestore()));
    const fs = yield* FileSystem.FileSystem;
    const configDir = yield* fs.makeTempDirectoryScoped();
    yield* fs.writeFileString(
      `${configDir}/.claude.json`,
      yield* encodeJson({
        oauthAccount: { accountUuid: "test-account", emailAddress: "dev@example.com" },
        cachedUsageUtilization: {
          accountUuid: "test-account",
          fetchedAtMs: Date.parse(observedAt),
          utilization: rateLimits,
        },
      }),
    );
    const capabilities = yield* probeClaudeCapabilities(
      yield* decodeClaudeSettings({ binaryPath: "claude", homePath: configDir }),
      { PATH: process.env.PATH },
    );
    assert.equal(capabilities.usageCheckedAt, observedAt);
    const probed = claudeUsageResponseToLimits({
      response: capabilities.usage!,
      checkedAt: capabilities.usageCheckedAt!,
    }).limits;
    const live = {
      checkedAt: "2026-11-11T09:24:34.134Z",
      windows: [
        {
          id: "five_hour",
          kind: "session" as const,
          label: "Session",
          usedPercent: 100,
          resetsAt,
        },
      ],
    };
    assert.equal(
      resolveUsageLimitsAfterProbe({ published: live, probed })?.windows[0]?.usedPercent,
      100,
    );
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it("drops strict MCP mode, and only that, next to an administrator's managed-mcp.json", () => {
  const options = buildClaudeCapabilitiesProbeQueryOptions({
    executablePath: "/usr/bin/claude",
    abortController: new AbortController(),
    environment: { HOME: "/home/user" },
    cwd: undefined,
    managedMcpConfig: true,
  });

  // Claude exits before initializing when handed --strict-mcp-config here.
  assert.equal(options.strictMcpConfig, undefined);
  assert.deepEqual(options.mcpServers, {});
  assert.equal(options.env?.ENABLE_CLAUDEAI_MCP_SERVERS, "false");
});

it.effect("reports a deleted worktree's scan as finished, not pending", () =>
  Effect.gen(function* () {
    const snapshot = yield* probeClaudeWorkspaceSnapshot(
      yield* decodeClaudeSettings({}),
      { skills: [], slashCommands: [] } as unknown as ServerProvider,
      "/nonexistent/t3-deleted-worktree",
      { HOME: "/nonexistent/t3-home" },
    );
    assert.strictEqual(snapshot.slashCommandsPending, false);
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("keeps the probe subprocess alive while gateway model discovery can finish", () =>
  Effect.gen(function* () {
    let abortSignal: AbortSignal | undefined;
    const query = vi.spyOn(ClaudeSdk, "query").mockImplementation(({ options }) => {
      abortSignal = options?.abortController?.signal;
      return {
        initializationResult: async () => ({
          account: { email: "dev@example.com", subscriptionType: "pro", tokenSource: "oauth" },
          commands: [{ name: "review", description: "Review changes", argumentHint: "[path]" }],
          models: [{ value: "gateway/claude-relay", displayName: "Relay", description: "" }],
        }),
        usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: () =>
          new Promise((_, reject) => reject(new Error("usage unavailable"))),
      } as ReturnType<typeof ClaudeSdk.query>;
    });
    yield* Effect.addFinalizer(() => Effect.sync(() => query.mockRestore()));
    const fileSystem = yield* FileSystem.FileSystem;
    const configDir = yield* fileSystem.makeTempDirectoryScoped();
    // Claude Code also reads these from settings.json, which is where gateway users set them.
    yield* fileSystem.writeFileString(
      `${configDir}/settings.json`,
      yield* encodeJson({
        env: {
          ANTHROPIC_BASE_URL: "https://gateway.example",
          CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: "1",
        },
      }),
    );
    const capabilities = yield* probeClaudeCapabilities(
      yield* decodeClaudeSettings({ binaryPath: "claude" }),
      { PATH: process.env.PATH, CLAUDE_CONFIG_DIR: configDir },
    );
    assert.deepEqual(
      capabilities.models?.map((model) => model.value),
      ["gateway/claude-relay"],
    );
    assert.equal(abortSignal?.aborted, false);
    yield* TestClock.adjust("3 seconds");
    assert.equal(abortSignal?.aborted, true);
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
