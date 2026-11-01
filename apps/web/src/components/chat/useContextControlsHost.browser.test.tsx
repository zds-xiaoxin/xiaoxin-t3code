import { expect, it, vi } from "vite-plus/test";
import { render } from "../../../test/render";
import { useContextControlsHost } from "./useContextControlsHost";

it("publishes the visible host across collapse, expansion and unmount", async () => {
  const onChange = vi.fn();
  function Probe({ collapsed }: { collapsed: boolean }) {
    const { collapsedHostRef, expandedHostRef } = useContextControlsHost(collapsed, onChange);
    return (
      <>
        <div data-testid="collapsed" ref={collapsedHostRef} />
        <div data-testid="expanded" ref={expandedHostRef} />
      </>
    );
  }
  await using screen = await render(<Probe collapsed={false} />, { router: false });
  const collapsedHost = screen.container.querySelector('[data-testid="collapsed"]');
  const expandedHost = screen.container.querySelector('[data-testid="expanded"]');
  expect(onChange).toHaveBeenLastCalledWith(expandedHost);
  await screen.rerender(<Probe collapsed />);
  expect(onChange).toHaveBeenLastCalledWith(collapsedHost);
  await screen.rerender(<Probe collapsed={false} />);
  expect(onChange).toHaveBeenLastCalledWith(expandedHost);
  await screen.unmount();
  expect(onChange).toHaveBeenLastCalledWith(null);
});
