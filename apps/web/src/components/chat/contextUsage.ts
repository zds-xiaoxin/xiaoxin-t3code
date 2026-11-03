import * as DateTime from "effect/DateTime";
import { latestProviderTurnTokenUsage } from "../../lib/contextWindow";
import type {
  OrchestrationV2ThreadProjection,
  OrchestrationV2ProviderTurn,
  OrchestrationV2ProviderThread,
} from "@t3tools/contracts";

/** Reports from another provider session do not describe the active session's context. */
export function latestContextUsage(
  projection: {
    readonly thread: Pick<OrchestrationV2ThreadProjection["thread"], "activeProviderThreadId">;
    readonly providerThreads?: ReadonlyArray<
      Pick<OrchestrationV2ProviderThread, "id" | "contextUsage" | "updatedAt">
    >;
    readonly providerTurns: ReadonlyArray<
      Pick<OrchestrationV2ProviderTurn, "providerThreadId" | "tokenUsage">
    >;
  } | null,
) {
  if (!projection?.thread.activeProviderThreadId) return null;
  const turnUsage = latestProviderTurnTokenUsage(
    projection.providerTurns.filter(
      (turn) => turn.providerThreadId === projection.thread.activeProviderThreadId,
    ),
  );
  if (turnUsage !== null) return turnUsage;
  const providerThread = projection.providerThreads?.find(
    (thread) => thread.id === projection.thread.activeProviderThreadId,
  );
  return providerThread?.contextUsage == null
    ? null
    : {
        ...providerThread.contextUsage,
        updatedAt: DateTime.formatIso(providerThread.updatedAt),
      };
}
