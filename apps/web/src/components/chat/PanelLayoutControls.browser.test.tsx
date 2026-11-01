import { render } from "../../../test/render";
import { expect, it, vi } from "vite-plus/test";
const state = vi.hoisted(() => ({ mobile: true }));
vi.mock("../../hooks/useMediaQuery", () => ({ useIsMobile: () => state.mobile }));
vi.mock("../ui/toggle", () => ({
  Toggle: ({
    onPressedChange,
    pressed,
    ...props
  }: {
    onPressedChange?: (value: boolean) => void;
    pressed?: boolean;
  }) => <button {...props} onClick={() => onPressedChange?.(!pressed)} />,
}));
vi.mock("../ui/tooltip", () => ({
  Tooltip: (props: { children: React.ReactNode }) => <>{props.children}</>,
  TooltipTrigger: (props: { render?: React.ReactNode; children?: React.ReactNode }) => (
    <>{props.children ?? props.render}</>
  ),
  TooltipPopup: (props: object) => <span {...props} />,
}));
vi.mock("../ui/popover", () => ({
  PopoverCreateHandle: vi.fn(),
  PopoverTrigger: (props: { render: React.ReactNode }) => (
    <section data-desktop-popover>{props.render}</section>
  ),
}));
import { PanelLayoutControls } from "./PanelLayoutControls";
it("uses an explicit mobile sheet toggle and preserves the desktop popover trigger", async () => {
  state.mobile = true;
  const toggle = vi.fn();
  const props = {
    terminalAvailable: false,
    terminalOpen: false,
    terminalShortcutLabel: null,
    threadPanelOpen: false,
    threadPanelPresentation: "popover" as const,
    threadPanelShortcutLabel: null,
    threadPanelHasAttention: false,
    rightPanelAvailable: false,
    rightPanelOpen: false,
    rightPanelShortcutLabel: null,
    onToggleTerminal: vi.fn(),
    onToggleThreadPanel: toggle,
    onToggleRightPanel: vi.fn(),
  };
  await using screen = await render(<PanelLayoutControls {...props} />, { router: false });
  expect(screen.container.querySelectorAll("section")).toHaveLength(0);
  await screen.getByRole("button", { name: "Toggle thread details panel" }).click();
  expect(toggle).toHaveBeenCalledOnce();
  state.mobile = false;
  await screen.rerender(<PanelLayoutControls {...props} threadPanelOpen />);
  expect(screen.container.querySelectorAll("section")).toHaveLength(1);
  await screen.getByRole("button", { name: "Toggle thread details panel" }).click();
  expect(toggle).toHaveBeenCalledOnce();
});
