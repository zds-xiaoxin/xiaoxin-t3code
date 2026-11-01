import { useState } from "react";
import { expect, it } from "vite-plus/test";
import { ClaudeSettings } from "@t3tools/contracts";
import { render } from "../../../test/render";
import "~/index.css";
import { ProviderSettingsForm } from "./ProviderSettingsForm";

it("saves and restores the Claude runtime choice without changing its configured home", async () => {
  let saved: unknown = { homePath: "/isolated/claude-test", binaryPath: "claude" };
  function Settings() {
    const [value, setValue] = useState(saved);
    return (
      <section className="mx-auto grid max-w-2xl gap-5 p-8">
        <h1>Claude instance · isolated component preview</h1>
        <ProviderSettingsForm
          definition={{ settingsSchema: ClaudeSettings }}
          value={value}
          idPrefix="claude-test"
          variant="card"
          onChange={(next) => {
            saved = next;
            setValue(next);
          }}
        />
      </section>
    );
  }
  await using screen = await render(<Settings />);
  const toggle = screen.getByRole("switch", { name: "Interactive Claude Code (TUI)" });
  await expect.element(toggle).not.toBeChecked();
  await toggle.click();
  await expect.element(toggle).toBeChecked();
  expect(saved).toEqual({
    homePath: "/isolated/claude-test",
    binaryPath: "claude",
    interactiveCli: true,
  });
  await screen.rerender(<Settings key="restored" />);
  await expect.element(toggle).toBeChecked();
  await toggle.click();
  await expect.element(toggle).not.toBeChecked();
  expect(saved).toEqual({ homePath: "/isolated/claude-test", binaryPath: "claude" });
});
