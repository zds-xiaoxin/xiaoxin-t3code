import type {
  ModelSelection,
  OrchestrationV2Run,
  ProviderInstanceId,
  ServerProviderModel,
  ServerSettings,
} from "@t3tools/contracts";

export function providerFallbackCandidates(
  settings: Pick<ServerSettings, "providerFallbackEnabled" | "providerFallbackChains">,
  source: OrchestrationV2Run,
  runs: ReadonlyArray<OrchestrationV2Run>,
): ReadonlyArray<ProviderInstanceId> {
  if (!settings.providerFallbackEnabled) return [];
  const attempted = new Set<ProviderInstanceId>();
  const seenRuns = new Set<string>();
  let root = source;
  while (!seenRuns.has(root.id)) {
    seenRuns.add(root.id);
    attempted.add(root.providerInstanceId);
    if (root.providerFallbackOfRunId === undefined) break;
    const previous = runs.find((run) => run.id === root.providerFallbackOfRunId);
    if (previous === undefined) return [];
    root = previous;
  }
  const visited = new Set<ProviderInstanceId>([root.providerInstanceId]);
  const pending = [...(settings.providerFallbackChains[root.providerInstanceId] ?? [])];
  const candidates: ProviderInstanceId[] = [];
  for (let i = 0; i < pending.length; i++) {
    const instanceId = pending[i]!;
    if (visited.has(instanceId)) continue;
    visited.add(instanceId);
    if (!attempted.has(instanceId)) candidates.push(instanceId);
    pending.push(...(settings.providerFallbackChains[instanceId] ?? []));
  }
  return candidates;
}

export function providerFallbackModelSelection(
  instanceId: ProviderInstanceId,
  source: ModelSelection,
  sameDriver: boolean,
  models: ReadonlyArray<ServerProviderModel> | undefined,
): ModelSelection | null {
  const sameModel = sameDriver && models?.find((model) => model.slug === source.model);
  if (sameModel || (sameDriver && models === undefined)) return { ...source, instanceId };
  const model = models?.find((model) => model.isDefault) ?? models?.[0];
  return model === undefined ? null : { instanceId, model: model.slug };
}
