import "~/index.css";
import { describe, expect, it } from "vite-plus/test";
import { render } from "../../../test/render";
import { SkinActivityBand } from "./SkinActivityBand";

const band = () => document.querySelector<HTMLElement>(".skin-activity-band");

describe("SkinActivityBand", () => {
  it("renders nothing while idle", async () => {
    await using _screen = await render(
      <SkinActivityBand working={false} subagentsSettled={0} subagentsTotal={0} />,
      { router: false },
    );
    expect(band()).toBeNull();
  });

  it("shows progress while working, then a check, then eases out and unmounts", async () => {
    await using screen = await render(
      <SkinActivityBand working subagentsSettled={1} subagentsTotal={3} />,
      { router: false },
    );
    await expect.poll(() => band()?.dataset.state).toBe("working");
    expect(band()!.textContent).toContain("工作中 · 子任务 1/3");
    expect(document.querySelectorAll(".skin-activity-rail i[data-done]").length).toBe(1);
    expect(document.querySelectorAll(".skin-activity-rail i[data-current]").length).toBe(1);
    // The glint moves pre-drawn layers with transforms only, so the text never repaints per frame.
    const glint = document.querySelector<HTMLElement>(".skin-activity-glint")!;
    expect(getComputedStyle(glint).animationName).toBe("skin-glint");
    expect(getComputedStyle(glint.firstElementChild!).animationName).toBe("skin-glint-counter");
    const label = document.querySelector<HTMLElement>(".skin-activity-label")!;
    expect(getComputedStyle(label).animationName).toBe("none");
    expect(getComputedStyle(band()!).backdropFilter).toBe("none");

    await screen.rerender(
      <SkinActivityBand working={false} subagentsSettled={3} subagentsTotal={3} />,
    );
    await expect.poll(() => band()?.dataset.state).toBe("done");
    expect(band()!.textContent).toContain("完成");
    expect(document.querySelector(".skin-activity-glint")).toBeNull();
    await expect.poll(() => band()?.dataset.state, { timeout: 3000 }).toBe("leaving");
    await expect.poll(() => band(), { timeout: 3000 }).toBeNull();
  });
});
