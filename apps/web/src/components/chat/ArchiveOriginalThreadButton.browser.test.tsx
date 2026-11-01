import { act, render } from "../../../test/render";
import { expect, it, vi } from "vite-plus/test";
import { AsyncResult } from "effect/reactivity";
import * as Cause from "effect/Cause";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
const test = vi.hoisted(() => ({
  permitted: true,
  supported: true,
  archive: vi.fn(),
  unarchive: vi.fn(),
  refresh: vi.fn(),
  notice: vi.fn(),
  finish: vi.fn(),
  invalidate: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("@effect/atom-react", () => ({
  useAtomValue: () => ({ environment: { capabilities: { threadArchiveSafety: test.supported } } }),
}));
vi.mock("../../state/server", () => ({ serverEnvironment: { configValueAtom: () => "config" } }));
vi.mock("../../state/session", () => ({ useEnvironmentScope: () => test.permitted }));
vi.mock("../../state/threads", () => ({
  threadEnvironment: { archive: "archive", unarchive: "unarchive" },
}));
vi.mock("../../state/use-orchestration-command", () => ({
  useOrchestrationCommand: (command: string) =>
    command === "archive" ? test.archive : test.unarchive,
}));
vi.mock("../../lib/archivedThreadsState", () => ({
  refreshArchivedThreadsForEnvironment: (...args: unknown[]) => test.refresh(...args),
}));
vi.mock("@t3tools/client-runtime/state/thread-undo", () => ({
  begin: () => ({ finish: test.finish, isCurrent: () => true }),
  invalidate: (...args: unknown[]) => test.invalidate(...args),
}));
vi.mock("../../hooks/showThreadUndoNotice", () => ({
  showThreadUndoNotice: (...args: unknown[]) => test.notice(...args),
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => test.navigate,
}));
vi.mock("../ui/button", () => ({ Button: (props: object) => <button {...props} /> }));
import { ArchiveOriginalThreadButton } from "./ArchiveOriginalThreadButton";
const environmentId = "fixture" as EnvironmentId;
const threadId = "original" as ThreadId;
const setup = () => {
  vi.clearAllMocks();
  test.permitted = true;
  test.supported = true;
  test.archive.mockResolvedValue(AsyncResult.success(undefined));
  test.unarchive.mockResolvedValue(AsyncResult.success(undefined));
};
const mount = (disconnected = false) =>
  render(
    <ArchiveOriginalThreadButton
      environmentId={environmentId}
      threadId={threadId}
      disconnected={disconnected}
    />,
    { router: false },
  );

it("archives exactly one original with server safety enabled, and reuses Undo without navigation", async () => {
  setup();
  await using screen = await mount();
  await act(() => screen.container.querySelector("button")!.click());
  expect(test.archive).toHaveBeenCalledExactlyOnceWith({
    environmentId,
    input: { threadId, requireIdle: true },
  });
  expect(test.notice).toHaveBeenCalledOnce();
  await act(async () => test.notice.mock.calls[0]![0].undo());
  expect(test.unarchive).toHaveBeenCalledExactlyOnceWith({ environmentId, input: { threadId } });
  expect(test.refresh).toHaveBeenCalledTimes(2);
  expect(test.navigate).not.toHaveBeenCalled();
});
it("preserves the rejected thread and provides schedule management without changing schedules", async () => {
  setup();
  test.archive.mockResolvedValue(
    AsyncResult.failure(Cause.fail(new Error("原会话绑定了已启用的定时任务"))),
  );
  await using screen = await mount();
  await act(() => screen.container.querySelector("button")!.click());
  expect(test.notice).not.toHaveBeenCalled();
  expect(test.unarchive).not.toHaveBeenCalled();
  expect(screen.container.textContent).toContain("已启用的定时任务");
  await screen.getByRole("button", { name: "管理定时任务" }).click();
  expect(test.navigate).toHaveBeenCalledWith({
    to: "/settings/scheduled-tasks",
    search: { environmentId },
  });
});
it.each(["permission", "unsupported", "offline"])(
  "blocks unsafe submit when %s",
  async (condition) => {
    setup();
    test.permitted = condition !== "permission";
    test.supported = condition !== "unsupported";
    await using screen = await mount(condition === "offline");
    const button = screen.container.querySelector("button")!;
    expect(button.disabled).toBe(true);
    button.click();
    expect(test.archive).not.toHaveBeenCalled();
  },
);
it("coalesces repeated clicks until the original request finishes", async () => {
  setup();
  let finish!: (value: unknown) => void;
  test.archive.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await using screen = await mount();
  await act(() => {
    const button = screen.container.querySelector("button")!;
    button.click();
    button.click();
  });
  expect(test.archive).toHaveBeenCalledOnce();
  await act(() => finish(AsyncResult.success(undefined)));
});
