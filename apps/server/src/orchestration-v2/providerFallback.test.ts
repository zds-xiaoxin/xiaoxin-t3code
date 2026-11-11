import { describe, expect, it } from "vite-plus/test";
import { ProviderInstanceId, RunId, type OrchestrationV2Run } from "@t3tools/contracts";
import { providerFallbackCandidates, providerFallbackModelSelection } from "./providerFallback.ts";

const id = ProviderInstanceId.make;
const run = (instance: string, ordinal: number, previous?: OrchestrationV2Run) =>
  ({
    id: RunId.make(`run:${ordinal}`),
    providerInstanceId: id(instance),
    ...(previous ? { providerFallbackOfRunId: previous.id } : {}),
  }) as OrchestrationV2Run;

describe("provider fallback chain", () => {
  it("honors the off switch, preserves list order and visits a cycle only once", () => {
    const a = run("a", 1);
    const b = run("b", 2, a);
    const c = run("c", 3, b);
    const settings = {
      providerFallbackEnabled: true,
      providerFallbackChains: {
        [id("a")]: [id("b"), id("c"), id("b")],
        [id("b")]: [id("a"), id("d")],
      },
    };
    expect(
      providerFallbackCandidates({ ...settings, providerFallbackEnabled: false }, a, [a]),
    ).toEqual([]);
    expect(providerFallbackCandidates(settings, a, [a])).toEqual(["b", "c", "d"]);
    expect(providerFallbackCandidates(settings, b, [a, b])).toEqual(["c", "d"]);
    expect(providerFallbackCandidates(settings, c, [a, b, c])).toEqual(["d"]);
    const d = run("d", 4, c);
    expect(providerFallbackCandidates(settings, d, [a, b, c, d])).toEqual([]);
    expect(providerFallbackCandidates(settings, b, [b])).toEqual([]);
    expect(providerFallbackCandidates({ ...settings, providerFallbackChains: {} }, a, [a])).toEqual(
      [],
    );
  });

  it("keeps a compatible model and drops foreign options when using a target default", () => {
    const source = {
      instanceId: id("a"),
      model: "source-model",
      options: [{ id: "reasoningEffort", value: "high" }],
    };
    const models = [
      {
        slug: "target-model",
        name: "Target",
        isCustom: false,
        isDefault: true,
        capabilities: null,
      },
    ];
    expect(providerFallbackModelSelection(id("b"), source, true, undefined)).toEqual({
      ...source,
      instanceId: "b",
    });
    expect(providerFallbackModelSelection(id("b"), source, false, models)).toEqual({
      instanceId: "b",
      model: "target-model",
    });
    expect(providerFallbackModelSelection(id("b"), source, false, undefined)).toBeNull();
    expect(providerFallbackModelSelection(id("b"), source, true, [])).toBeNull();
  });
});
