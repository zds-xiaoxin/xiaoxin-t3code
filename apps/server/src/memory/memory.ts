import type {
  MemoryEntry,
  MemoryScope,
  MemoryState,
  ThreadId,
  UserMemoryMutation,
} from "@t3tools/contracts";

export type MemoryMutation =
  | UserMemoryMutation
  | {
      readonly type: "propose";
      readonly text: string;
      readonly scope: MemoryScope;
      readonly threadId: ThreadId;
    };

export function applyMemoryMutation(
  state: MemoryState | undefined,
  mutation: MemoryMutation,
  stamp: { readonly id: string; readonly now: string },
): MemoryState {
  const current = state ?? { approved: [], pending: [] };
  if (mutation.type === "add" || mutation.type === "propose") {
    const entry: MemoryEntry = {
      id: stamp.id,
      text: mutation.text,
      scope: mutation.scope,
      createdAt: stamp.now,
      updatedAt: stamp.now,
      source:
        mutation.type === "propose"
          ? { kind: "agent-proposed", threadId: mutation.threadId }
          : { kind: "user" },
    };
    return mutation.type === "propose"
      ? { ...current, pending: [...current.pending, entry] }
      : { ...current, approved: [...current.approved, entry] };
  }
  const pending = mutation.type === "approve" || mutation.type === "reject";
  const entry = (pending ? current.pending : current.approved).find(({ id }) => id === mutation.id);
  if (!entry) throw new Error("Memory entry no longer exists.");
  switch (mutation.type) {
    case "approve":
      return {
        approved: [
          ...current.approved,
          {
            ...entry,
            text: mutation.text ?? entry.text,
            scope: mutation.scope ?? entry.scope,
            updatedAt: stamp.now,
          },
        ],
        pending: current.pending.filter(({ id }) => id !== mutation.id),
      };
    case "reject":
      return { ...current, pending: current.pending.filter(({ id }) => id !== mutation.id) };
    case "delete":
      return { ...current, approved: current.approved.filter(({ id }) => id !== mutation.id) };
    case "edit":
      return {
        ...current,
        approved: current.approved.map((item) =>
          item.id === mutation.id
            ? { ...item, text: mutation.text, scope: mutation.scope, updatedAt: stamp.now }
            : item,
        ),
      };
  }
}

export function memoriesForProject(state: MemoryState | undefined, projectId?: string) {
  return (state?.approved ?? [])
    .toReversed()
    .filter(({ scope }) => scope.kind === "global" || scope.projectId === projectId)
    .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function formatMemoryContext(
  state: MemoryState | undefined,
  projectId: string,
  cap = 2000,
): string {
  const entries = memoriesForProject(state, projectId);
  if (entries.length === 0) return "";
  const header =
    "T3 approved memories (user-reviewed context; changes require a new proposal and user approval):";
  const truncated = "\n[Memory truncated; newest first.]";
  let output = header;
  for (const entry of entries) {
    const line = `\n- [${entry.scope.kind}] ${entry.text.replace(/\s+/g, " ")}`;
    if (output.length + line.length + truncated.length > cap)
      return (output + truncated).slice(0, cap);
    output += line;
  }
  return output;
}
