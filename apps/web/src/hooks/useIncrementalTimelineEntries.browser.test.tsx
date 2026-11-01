import { render } from "../../test/render";
import { expect, it, vi } from "vite-plus/test";
import { useIncrementalTimelineEntries } from "./useIncrementalTimelineEntries";

it("renders fresh equivalent timeline inputs without scheduling a render loop", async () => {
  const renders = vi.fn();
  function Probe({ revision }: { revision: number }) {
    const entries = useIncrementalTimelineEntries("fixture-thread", {
      visibleTurnItems: [],
      optimisticMessages: [],
      anchoredMessages: [],
      attachmentUrlById: new Map(),
    });
    renders(revision, entries);
    return null;
  }
  await using screen = await render(<Probe revision={0} />, { router: false });
  await screen.rerender(<Probe revision={1} />);
  expect(renders).toHaveBeenCalledTimes(2);
  expect(renders.mock.calls.map(([revision, entries]) => [revision, entries.length])).toEqual([
    [0, 0],
    [1, 0],
  ]);
});
