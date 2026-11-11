import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { expect, it } from "@effect/vitest";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import { Toolkit } from "effect/ai";
import * as ServerSettings from "../serverSettings.ts";
import * as ProjectService from "../project/ProjectService.ts";
import * as McpToolAccess from "../mcp/McpToolAccess.ts";
import * as McpInvocationContext from "../mcp/McpInvocationContext.ts";
import * as ProjectHandlers from "../mcp/toolkits/project/handlers.ts";
import { ProjectToolkit } from "../mcp/toolkits/project/tools.ts";
import { liveThreadsLayer } from "../mcp/McpToolAccess.testkit.ts";

const memoryTools = Toolkit.make(
  ProjectToolkit.tools.memory_propose,
  ProjectToolkit.tools.memory_list,
);
const scope: McpInvocationContext.McpInvocationScope = {
  environmentId: EnvironmentId.make("environment-test"),
  requestNamespace: "memory-test",
  client: undefined,
  issuedAt: 0,
  thread: {
    threadId: ThreadId.make("thread-test"),
    providerSessionId: "session-test",
    providerInstanceId: ProviderInstanceId.make("codex"),
  },
  capabilities: new Set(["orchestration"]),
};

it.effect(
  "MCP exposes proposals and approved reads, with no approval tool or cross-project writes",
  () =>
    Effect.gen(function* () {
      const tools = yield* memoryTools;
      const settings = yield* ServerSettings.ServerSettingsService;
      const proposed = yield* tools
        .handle("memory_propose", { text: "Agent fact", scope: { kind: "global" } })
        .pipe(Effect.flatMap(Stream.runCollect));
      expect(proposed[0]?.isFailure).toBe(false);
      expect((yield* settings.getSettings).memory?.approved).toEqual([]);
      expect((yield* settings.getSettings).memory?.pending[0]?.source).toEqual({
        kind: "agent-proposed",
        threadId: scope.thread!.threadId,
      });
      const listed = yield* tools.handle("memory_list", {}).pipe(Effect.flatMap(Stream.runCollect));
      expect(listed[0]?.result).toEqual([]);
      const refused = yield* tools
        .handle("memory_propose", {
          text: "Wrong project",
          scope: { kind: "project", projectId: "other-project" },
        })
        .pipe(Effect.flatMap(Stream.runCollect));
      expect(refused[0]?.isFailure).toBe(true);
      expect((yield* settings.getSettings).memory?.pending).toHaveLength(1);
      expect(Object.keys(ProjectToolkit.tools).filter((name) => /memory/.test(name))).toEqual([
        "memory_propose",
        "memory_list",
      ]);
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          McpToolAccess.HandlersLayer.layer(ProjectHandlers.layer),
          liveThreadsLayer,
          ServerSettings.layerTest(),
          Layer.mock(ProjectService.ProjectService)({}),
          NodeCrypto.layer,
        ),
      ),
      Effect.provideService(McpInvocationContext.McpInvocationContext, scope),
    ),
);
