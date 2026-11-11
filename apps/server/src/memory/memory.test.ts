import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import {
  ProjectId,
  ThreadId,
  ServerSettingsPatch,
  UserMemoryMutation,
  type MemoryState,
} from "@t3tools/contracts";
import { applyMemoryMutation, formatMemoryContext, memoriesForProject } from "./memory.ts";

const decodePatch = Schema.decodeUnknownSync(ServerSettingsPatch);
const decodeUserMutation = Schema.decodeUnknownSync(UserMemoryMutation);

const scope = { kind: "global" } as const;
const stamp = { id: "memory-1", now: "2026-11-05T10:00:00.000Z" };
const projectId = ProjectId.make("project-1");
const threadId = ThreadId.make("thread-1");

describe("T3 memory", () => {
  it("supports CRUD, keeps provenance and rejects stale mutations", () => {
    const added = applyMemoryMutation(
      undefined,
      { type: "add", text: "Keep answers short.", scope },
      stamp,
    );
    const edited = applyMemoryMutation(
      added,
      { type: "edit", id: stamp.id, text: "Use Chinese.", scope: { kind: "project", projectId } },
      { ...stamp, now: "2026-11-06T10:00:00.000Z" },
    );
    expect(edited.approved[0]).toMatchObject({
      text: "Use Chinese.",
      createdAt: stamp.now,
      updatedAt: "2026-11-06T10:00:00.000Z",
      source: { kind: "user" },
    });
    expect(added.approved[0]!.text).toBe("Keep answers short.");
    expect(applyMemoryMutation(edited, { type: "delete", id: stamp.id }, stamp).approved).toEqual(
      [],
    );
    expect(() => applyMemoryMutation(edited, { type: "approve", id: stamp.id }, stamp)).toThrow();
  });

  it("proposals never alter approved facts; rejects discard and approval can edit", () => {
    const approved = applyMemoryMutation(
      undefined,
      { type: "add", text: "Existing fact", scope },
      { ...stamp, id: "existing" },
    );
    const proposed = applyMemoryMutation(
      approved,
      { type: "propose", text: "Untrusted proposal", scope, threadId },
      stamp,
    );
    expect(proposed.approved).toBe(approved.approved);
    expect(formatMemoryContext(proposed, projectId)).not.toContain("Untrusted proposal");
    expect(applyMemoryMutation(proposed, { type: "reject", id: stamp.id }, stamp)).toEqual(
      approved,
    );
    const accepted = applyMemoryMutation(proposed, { type: "approve", id: stamp.id }, stamp);
    expect(accepted.pending).toEqual([]);
    expect(accepted.approved.at(-1)).toMatchObject({
      text: "Untrusted proposal",
      source: { kind: "agent-proposed", threadId },
    });
    const revised = applyMemoryMutation(
      proposed,
      {
        type: "approve",
        id: stamp.id,
        text: "User corrected fact",
        scope: { kind: "project", projectId },
      },
      stamp,
    );
    expect(revised.approved.at(-1)).toMatchObject({
      text: "User corrected fact",
      scope: { kind: "project", projectId },
    });
    expect(() => applyMemoryMutation(revised, { type: "approve", id: stamp.id }, stamp)).toThrow();
  });

  it("filters scopes and formats compact newest-first capped approved context", () => {
    let state: MemoryState | undefined;
    for (let index = 0; index < 9; index++) {
      state = applyMemoryMutation(
        state,
        {
          type: "add",
          text: `${index} ${"中文".repeat(200)}\nmore`,
          scope:
            index === 1
              ? { kind: "project", projectId: ProjectId.make("other") }
              : index === 2
                ? { kind: "project", projectId }
                : scope,
        },
        { id: String(index), now: `2026-11-0${index + 1}T00:00:00.000Z` },
      );
    }
    expect(memoriesForProject(state, projectId)).toHaveLength(8);
    expect(memoriesForProject(state)).toHaveLength(7);
    expect(formatMemoryContext(undefined, projectId)).toBe("");
    const formatted = formatMemoryContext(state, projectId);
    expect(formatted.length).toBeLessThanOrEqual(2000);
    expect(formatted).toContain("\n- [global] 8 ");
    expect(formatted).toContain("Memory truncated");
    expect(formatted).not.toContain("\nmore");
    expect(formatMemoryContext(state, projectId, 300).length).toBeLessThanOrEqual(300);
  });

  it("does not accept raw memory replacement or agent-only proposal commands on the user RPC", () => {
    expect(
      decodePatch({
        memory: { approved: [{ text: "injected" }], pending: [] },
      }),
    ).toEqual({});
    expect(() =>
      decodeUserMutation({
        type: "propose",
        text: "fact",
        scope,
        threadId,
      }),
    ).toThrow();
  });
});
