import { useState } from "react";
import { createProjectionCache } from "../../hooks/projectionCache";
import { shallow } from "zustand/vanilla/shallow";
import type { HandoffTimelineRun } from "@t3tools/client-runtime/handoff";
import {
  computeStableMessagesTimelineRows,
  deriveMessagesTimelineRowsWithState,
  type MessagesTimelineRowsProjection,
  type MessagesTimelineRow,
  type StableMessagesTimelineRowsState,
} from "./MessagesTimeline.logic";
function handoffRunsSignature(runs: ReadonlyArray<HandoffTimelineRun>): string {
  return runs
    .map(
      (run) =>
        `${run.id}\0${run.providerInstanceId}\0${run.ordinal}\0${run.modelSelection.instanceId}\0${run.modelSelection.model}`,
    )
    .join("\n");
}

export function useStableHandoffRuns(
  runs: ReadonlyArray<HandoffTimelineRun>,
): ReadonlyArray<HandoffTimelineRun> {
  const [project] = useState(() =>
    createProjectionCache<
      ReadonlyArray<HandoffTimelineRun>,
      { signature: string; value: ReadonlyArray<HandoffTimelineRun> }
    >((input, previous) => {
      const signature = handoffRunsSignature(input);
      return previous?.signature === signature
        ? previous
        : {
            signature,
            value: input.map((run) => ({
              id: run.id,
              ordinal: run.ordinal,
              providerInstanceId: run.providerInstanceId,
              modelSelection: run.modelSelection,
            })),
          };
    }),
  );
  return project(null, runs).value;
}

type MessagesTimelineRowsInput = MessagesTimelineRowsProjection["input"];

// Equivalent expanded sets do not invalidate the projection cache.
function sameRowsInput(left: MessagesTimelineRowsInput, right: MessagesTimelineRowsInput): boolean {
  for (const key of Object.keys(right) as Array<keyof MessagesTimelineRowsInput>) {
    const previous = left[key];
    const next = right[key];
    if (Object.is(previous, next)) continue;
    if (previous instanceof Set && next instanceof Set && shallow(previous, next)) continue;
    return false;
  }
  return Object.keys(left).length === Object.keys(right).length;
}

/**
 * Rows derived from the previous projection of the same list, so a streamed
 * text update patches its message rows instead of deriving every row again.
 */
export function useIncrementalTimelineRows(
  identity: string,
  input: MessagesTimelineRowsInput,
): MessagesTimelineRow[] {
  const [project] = useState(() =>
    createProjectionCache<MessagesTimelineRowsInput, MessagesTimelineRowsProjection>(
      deriveMessagesTimelineRowsWithState,
      sameRowsInput,
    ),
  );
  return project(identity, input).rows;
}

export function useStableRows(
  rows: MessagesTimelineRow[],
  identity: string,
): MessagesTimelineRow[] {
  const [project] = useState(() =>
    createProjectionCache<MessagesTimelineRow[], StableMessagesTimelineRowsState>(
      (input, previous) =>
        computeStableMessagesTimelineRows(input, previous ?? { byId: new Map(), result: [] }),
    ),
  );
  return project(identity, rows).result;
}
