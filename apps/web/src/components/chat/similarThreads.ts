import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import type { EnvironmentThreadSearchMatch } from "@t3tools/client-runtime/state/thread-search";
import {
  THREAD_SEARCH_QUERY_MAX_LENGTH,
  type ScopedProjectRef,
  type ScopedThreadRef,
} from "@t3tools/contracts";

const SIMILAR_THREADS_DEBOUNCE_MS = 500;
export function similarThreadQuery(prompt: string): string {
  const query = prompt.trim().slice(0, THREAD_SEARCH_QUERY_MAX_LENGTH).trim();
  return query.length >= 6 ? query : "";
}
export function scheduleSimilarThreadSearch(prompt: string, publish: (query: string) => void) {
  const timer = setTimeout(() => publish(similarThreadQuery(prompt)), SIMILAR_THREADS_DEBOUNCE_MS);
  return () => clearTimeout(timer);
}
export function rankSimilarThreads<
  T extends Pick<EnvironmentThreadShell, "environmentId" | "id" | "projectId" | "archivedAt">,
>(
  threads: readonly T[],
  matches: readonly Pick<EnvironmentThreadSearchMatch, "environmentId" | "threadId">[],
  current: ScopedThreadRef,
  project: ScopedProjectRef,
): readonly T[] {
  const byKey = new Map(threads.map((thread) => [`${thread.environmentId}:${thread.id}`, thread]));
  const seen = new Set<string>();
  return matches
    .flatMap((match) => {
      const key = `${match.environmentId}:${match.threadId}`;
      const thread = byKey.get(key);
      if (
        !thread ||
        seen.has(key) ||
        thread.archivedAt ||
        (thread.id === current.threadId && thread.environmentId === current.environmentId)
      )
        return [];
      seen.add(key);
      return [thread];
    })
    .sort(
      (a, b) =>
        Number(b.environmentId === project.environmentId && b.projectId === project.projectId) -
        Number(a.environmentId === project.environmentId && a.projectId === project.projectId),
    )
    .slice(0, 3);
}
export function continuationPrompt(existing: string, incoming: string): string {
  return existing.trim() && existing !== incoming ? `${existing}\n\n${incoming}` : incoming;
}
