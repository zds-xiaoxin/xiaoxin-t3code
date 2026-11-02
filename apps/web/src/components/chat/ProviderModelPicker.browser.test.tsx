import {
  ProviderDriverKind,
  ProviderInstanceId,
  type ModelSelection,
  type ProviderOptionSelection,
} from "@t3tools/contracts";
import { useState } from "react";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "~/index.css";

import { render } from "../../../test/render";
import { deriveProviderInstanceEntries } from "../../providerInstances";
import { ProviderModelPicker } from "./ProviderModelPicker";
import { ComposerEffortMenu, describeComposerEffort } from "./ComposerModelEffort";
import { markOpenToPermissions } from "./composerEventScope";
import { runtimeModeConfig, runtimeModeOptions } from "./runtimeModeConfig";

it("keeps model selection separate from parameter changes and permission shortcuts", async () => {
  const instanceId = ProviderInstanceId.make("codex");
  const models = ["first", "second"].map((slug) => ({
    slug,
    name: `${slug} model`,
    isCustom: true,
    capabilities: {
      optionDescriptors: [
        {
          id: "reasoningEffort",
          label: "Effort",
          type: "select" as const,
          options: [
            { id: "low", label: "Low" },
            { id: "high", label: "High" },
          ],
          currentValue: "high",
        },
      ],
    },
  }));
  const entries = deriveProviderInstanceEntries([
    {
      instanceId,
      driver: ProviderDriverKind.make("codex"),
      enabled: true,
      installed: true,
      version: null,
      status: "ready",
      auth: { status: "authenticated" },
      checkedAt: "2026-11-01T00:00:00.000Z",
      models,
      slashCommands: [],
      skills: [],
    },
  ]);
  function Controls() {
    const [model, setModel] = useState("first");
    const [options, setOptions] = useState<ReadonlyArray<ProviderOptionSelection>>([]);
    const traits = {
      provider: ProviderDriverKind.make("codex"),
      instanceId,
      models,
      model,
      modelOptions: options,
      planModeEnabled: false,
      onModelOptionsChange: (next: ReadonlyArray<ProviderOptionSelection> | undefined) =>
        setOptions(next ?? []),
    };
    const effort = describeComposerEffort(traits, "label", "sm");
    return (
      <>
        <ProviderModelPicker
          environmentId={null}
          activeInstanceId={instanceId}
          model={model}
          lockedProvider={null}
          instanceEntries={entries}
          modelOptionsByInstance={new Map([[instanceId, models]])}
          onInstanceModelChange={(_, next) => setModel(next)}
        />
        <ComposerEffortMenu
          traits={traits}
          modelLabel={model}
          suffix={effort.suffix}
          detail={effort.detail}
          size="sm"
          hidden={false}
          disabled={false}
          ownsModeShortcut
          runtimeMode="approval-required"
          runtimeModeOptions={runtimeModeOptions.map((mode) => ({
            mode,
            ...runtimeModeConfig[mode],
          }))}
          onRuntimeModeChange={vi.fn()}
        />
      </>
    );
  }
  await using screen = await render(<Controls />);
  await screen.getByRole("button", { name: "first model", exact: true }).click();
  await page.getByRole("option", { name: /second model/ }).click();
  await expect.element(page.getByRole("combobox")).not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("button", { name: "second model", exact: true }))
    .toBeVisible();
  const parameters = screen.getByRole("button", { name: /Model options|模型参数/ });
  await parameters.click();
  await page.getByRole("radio", { name: "Low", exact: true }).click();
  await expect.element(page.getByRole("radio", { name: "Low", exact: true })).toBeChecked();
  markOpenToPermissions(parameters.element() as HTMLButtonElement);
  await parameters.click();
  await expect
    .element(
      page.getByRole("menuitemradio", {
        name: runtimeModeConfig["approval-required"].label,
        exact: true,
      }),
    )
    .toHaveFocus();
  await userEvent.keyboard("{Escape}");
  await expect.element(page.getByRole("radio", { name: "Low", exact: true })).toBeChecked();
  await userEvent.keyboard("{Escape}");
  await expect
    .element(page.getByRole("radio", { name: "Low", exact: true }))
    .not.toBeInTheDocument();
  markOpenToPermissions(parameters.element() as HTMLButtonElement);
  await parameters.click();
  await expect
    .element(
      page.getByRole("menuitemradio", {
        name: runtimeModeConfig["approval-required"].label,
        exact: true,
      }),
    )
    .toHaveFocus();
  await userEvent.keyboard("{Escape}");
  await userEvent.keyboard("{Escape}");
  await expect
    .element(page.getByRole("radio", { name: "Low", exact: true }))
    .not.toBeInTheDocument();
});

it("keeps each registry image when adding a model from another ACP agent", async () => {
  const icons = [
    "https://cdn.agentclientprotocol.com/registry/icons/picker-explicit.svg",
    "https://cdn.agentclientprotocol.com/registry/v1/latest/picker-by-id.svg",
  ];
  const cache = await caches.open("t3-acp-registry-icons-v1");
  await using _cachedIcons = {
    async [Symbol.asyncDispose]() {
      await Promise.all(icons.map((url) => cache.delete(url)));
    },
  };
  for (const [index, url] of icons.entries()) {
    await cache.put(
      url,
      new Response(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${11 + index * 6}" height="10"><path d="M0 0h10v10H0z"/></svg>`,
        { headers: { "content-type": "image/svg+xml" } },
      ),
    );
  }
  const entries = deriveProviderInstanceEntries(
    ["First", "Second"].map((name) => ({
      instanceId: ProviderInstanceId.make(name.toLowerCase()),
      driver: ProviderDriverKind.make("acpRegistry"),
      displayName: `${name} agent`,
      enabled: true,
      installed: true,
      version: null,
      status: "ready" as const,
      auth: { status: "authenticated" as const },
      checkedAt: "2026-01-01T00:00:00.000Z",
      models: [
        { slug: name.toLowerCase(), name: `${name} model`, isCustom: false, capabilities: {} },
      ],
      slashCommands: [],
      skills: [],
    })),
  ).map((entry, index) => ({
    ...entry,
    ...(index === 0 ? { acpRegistryIconUrl: icons[0] } : { acpRegistryAgentId: "picker-by-id" }),
  }));
  const first = { instanceId: entries[0]!.instanceId, model: "first" };
  const options = new Map(entries.map((entry) => [entry.instanceId, entry.models]));

  function Picker() {
    const [selection, setSelection] = useState<ReadonlyArray<ModelSelection>>([first]);
    return (
      <ProviderModelPicker
        environmentId={null}
        activeInstanceId={first.instanceId}
        model={first.model}
        {...(selection.length > 1 ? { selectedModels: selection } : {})}
        lockedProvider={null}
        instanceEntries={entries}
        modelOptionsByInstance={options}
        onToggleModel={(instanceId, model) => setSelection([...selection, { instanceId, model }])}
        onInstanceModelChange={(instanceId, model) => setSelection([{ instanceId, model }])}
      />
    );
  }

  await using screen = await render(<Picker />);
  const imageWidths = () =>
    Array.from(
      screen.container.querySelectorAll<HTMLImageElement>("[data-chat-provider-model-picker] img"),
      (image) => image.naturalWidth,
    );
  await vi.waitFor(() => expect(imageWidths()).toEqual([11]));
  await screen.getByRole("button", { name: "First model", exact: true }).click();
  await page.getByRole("button", { name: "Second agent", exact: true }).click();
  await userEvent.keyboard("{Shift>}");
  try {
    await page.getByRole("option", { name: /Second model/ }).click();
  } finally {
    await userEvent.keyboard("{/Shift}");
  }
  await userEvent.keyboard("{Escape}");
  await vi.waitFor(() => expect(imageWidths()).toEqual([11, 17]));
});

it("keeps a docked picker open after a pick and hands focus to that model's effort", async () => {
  const instanceId = ProviderInstanceId.make("codex");
  const entries = deriveProviderInstanceEntries([
    {
      instanceId,
      driver: ProviderDriverKind.make("codex"),
      enabled: true,
      installed: true,
      version: null,
      status: "ready",
      auth: { status: "authenticated" },
      checkedAt: "2026-01-01T00:00:00.000Z",
      models: [],
      slashCommands: [],
      skills: [],
    },
  ]);
  const options = new Map([
    [
      instanceId,
      [
        { slug: "original", name: "Original model" },
        { slug: "second", name: "Second model" },
        { slug: "plain", name: "Plain model" },
      ],
    ],
  ]);
  // The last level is the selected one; "plain" has no effort to pick.
  const levels: Record<string, ReadonlyArray<string>> = {
    original: ["Low", "High"],
    second: ["Medium"],
    plain: [],
  };

  function Picker() {
    const [model, setModel] = useState("original");
    return (
      <ProviderModelPicker
        environmentId={null}
        activeInstanceId={instanceId}
        model={model}
        lockedProvider={null}
        instanceEntries={entries}
        modelOptionsByInstance={options}
        triggerAriaLabel="Choose model"
        onInstanceModelChange={(_, selected) => setModel(selected)}
        effortColumn={(levels[model] ?? []).map((level, index, all) => (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={index === all.length - 1}
            data-effort-row
            data-effort-level
          >
            {level}
          </button>
        ))}
      />
    );
  }

  await using screen = await render(<Picker />);
  await screen.getByRole("button", { name: "Choose model" }).click();
  const search = page.getByPlaceholder("Search models...");
  await expect.element(search).toHaveFocus();
  await userEvent.keyboard("{ArrowRight}");
  await expect.element(page.getByRole("radio", { name: "High" })).toHaveFocus();
  await userEvent.keyboard("{ArrowLeft}");
  await expect.element(search).toHaveFocus();

  await page.getByRole("option", { name: /Second model/ }).click();
  await expect.element(page.getByRole("radio", { name: "Medium" })).toHaveFocus();

  await page.getByRole("option", { name: /Plain model/ }).click();
  await page.getByRole("option", { name: /Second model/ }).click();
  await expect.element(page.getByRole("radio", { name: "Medium" })).toHaveFocus();
  await userEvent.keyboard("{Escape}");
  await expect.element(search).not.toBeInTheDocument();
});
