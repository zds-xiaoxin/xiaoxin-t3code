import { expect, it, vi } from "vite-plus/test";
import { act, fakeTimers, render } from "../test/render";
import { usePanelPresence } from "./panelAnimations";

it("retains the last committed open panel without render loops for fresh values", async () => {
  const renders = vi.fn();
  function Probe({
    open,
    scope,
    label,
    animated = true,
  }: {
    open: boolean;
    scope: string;
    label: string;
    animated?: boolean;
  }) {
    const result = usePanelPresence(open, { label }, animated, scope, 200);
    renders(result.present, result.value?.label ?? null);
    return null;
  }
  await using screen = await render(<Probe open scope="a" label="first" />, { router: false });
  using _timers = fakeTimers();
  expect(renders.mock.calls).toEqual([[true, "first"]]);
  await screen.rerender(<Probe open scope="a" label="updated" />);
  expect(renders.mock.lastCall).toEqual([true, "updated"]);
  expect(renders).toHaveBeenCalledTimes(2);
  await screen.rerender(<Probe open={false} scope="a" label="uncommitted-close" />);
  expect(renders.mock.lastCall).toEqual([true, "updated"]);
  await act(() => {
    vi.advanceTimersByTime(200);
  });
  expect(renders.mock.lastCall).toEqual([false, null]);
  await screen.rerender(<Probe open scope="b" label="second" />);
  expect(renders.mock.lastCall).toEqual([true, "second"]);
  await screen.rerender(<Probe open={false} scope="a" label="other-scope" />);
  expect(renders.mock.lastCall).toEqual([false, null]);
  await screen.rerender(<Probe open scope="a" label="reopened" />);
  await screen.rerender(<Probe open={false} scope="a" label="closed" animated={false} />);
  expect(renders.mock.lastCall).toEqual([false, null]);
});
