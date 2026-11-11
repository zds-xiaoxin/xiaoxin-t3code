import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import {
  continuationPrompt,
  rankSimilarThreads,
  scheduleSimilarThreadSearch,
  similarThreadQuery,
} from "./similarThreads";

const env = EnvironmentId.make("local"),
  other = EnvironmentId.make("remote");
const projectId = ProjectId.make("project");
const current = { environmentId: env, threadId: ThreadId.make("new") };
const project = { environmentId: env, projectId };
function thread(
  id: string,
  environmentId = env,
  sameProject = true,
  archivedAt: string | null = null,
) {
  return {
    id: ThreadId.make(id),
    environmentId,
    projectId: sameProject ? projectId : ProjectId.make("other"),
    archivedAt,
  };
}
describe("similar threads", () => {
  it("prioritizes the same project, preserves search relevance, excludes current/archived/duplicates and limits to three", () => {
    const threads = [
      thread("outside", env, false),
      thread("settled"),
      thread("remote", other),
      thread("active"),
      thread("new"),
      thread("archive", env, true, "2026-11-05"),
      thread("fourth"),
    ];
    const matches = [...threads, threads[1]!].map((t) => ({
      environmentId: t.environmentId,
      threadId: t.id,
    }));
    expect(rankSimilarThreads(threads, matches, current, project).map((t) => t.id)).toEqual([
      "settled",
      "active",
      "fourth",
    ]);
    expect(rankSimilarThreads([], matches, current, project)).toEqual([]);
  });
  it("searches only after 500ms of idle input and cancels replaced or unmounted drafts", () => {
    vi.useFakeTimers();
    try {
      const publish = vi.fn();
      const cancel = scheduleSimilarThreadSearch("old draft", publish);
      vi.advanceTimersByTime(499);
      expect(publish).not.toHaveBeenCalled();
      cancel();
      const cancelNext = scheduleSimilarThreadSearch("  newest draft  ", publish);
      vi.advanceTimersByTime(500);
      expect(publish).toHaveBeenCalledExactlyOnceWith("newest draft");
      cancelNext();
      const cancelUnmount = scheduleSimilarThreadSearch("another draft", publish);
      cancelUnmount();
      vi.runAllTimers();
      expect(publish).toHaveBeenCalledTimes(1);
      expect(similarThreadQuery(" 12345 ")).toBe("");
      expect(similarThreadQuery(" 123456 ")).toBe("123456");
      expect(similarThreadQuery("继续优化侧栏")).toBe("继续优化侧栏");
      expect(similarThreadQuery("a".repeat(10000)).length).toBeLessThan(10000);
    } finally {
      vi.useRealTimers();
    }
  });
  it("keeps the destination's existing draft when continuing and does not duplicate identical text", () => {
    expect(continuationPrompt("unfinished", "new draft")).toBe("unfinished\n\nnew draft");
    expect(continuationPrompt("", "new draft")).toBe("new draft");
    expect(continuationPrompt("new draft", "new draft")).toBe("new draft");
  });
});
