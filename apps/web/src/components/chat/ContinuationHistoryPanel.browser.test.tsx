import { act, render, type Screen } from "../../../test/render";
import { describe, expect, it, vi } from "vite-plus/test";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/reactivity";
import type { EnvironmentId, OrchestrationV2ThreadProjection } from "@t3tools/contracts";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
const test = vi.hoisted(() => ({
  shells: [] as unknown[],
  state: {} as Record<string, unknown>,
  load: vi.fn(async () => undefined),
  quote: vi.fn(() => true),
  navigate: vi.fn(),
  file: vi.fn(),
  read: vi.fn(),
  archived: {
    snapshots: [] as unknown[],
    isLoading: false,
    error: null as string | null,
    refresh: vi.fn(),
  },
  phase: "connected",
}));
vi.mock("../../state/entities", () => ({
  useThreadShells: () => test.shells,
  useProjects: () => [],
}));
vi.mock("../../state/threads", () => ({
  useEnvironmentThread: (env: unknown, id: unknown) => {
    test.read(env, id);
    return env === null ? { ...test.state, data: Option.none() } : test.state;
  },
  threadEnvironment: { loadEarlierHistory: "load" },
}));
vi.mock("@effect/atom-react", () => ({
  useAtomValue: () => AsyncResult.success({ phase: test.phase }),
}));
vi.mock("../../connection/catalog", () => ({
  environmentCatalog: { stateAtom: () => "connection" },
}));
vi.mock("../../lib/archivedThreadsState", () => ({
  useArchivedThreadSnapshots: () => test.archived,
}));
vi.mock("@t3tools/client-runtime/state/shell", () => ({
  presentThreadShell: (environmentId: unknown, thread: object) => ({ ...thread, environmentId }),
}));
vi.mock("./ArchiveOriginalThreadButton", () => ({ ArchiveOriginalThreadButton: () => null }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => test.load }));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => test.navigate,
}));
vi.mock("../files/projectFilesQueryState", () => ({
  useProjectFileQuery: (...args: unknown[]) => {
    test.file(...args);
    return { data: { contents: "虚构交接内容" } };
  },
}));
vi.mock("../ui/button", () => ({ Button: (props: object) => <button {...props} /> }));
vi.mock("../ui/input", () => ({ Input: (props: object) => <input {...props} /> }));
import { ContinuationHistoryPanel } from "./ContinuationHistoryPanel";
const env = "fictional" as EnvironmentId;
const shell = (id: string, parent: string | null) =>
  ({
    id,
    environmentId: env,
    title: id,
    createdAt: "2026-10-07T00:00:00Z",
    itemCount: 2000,
    worktreePath: "/fictional",
    lineage: { parentThreadId: null, relationshipToParent: null },
    continuedFromThreadId: parent,
    deletedAt: null,
    archivedAt: null,
    forkedFrom: null,
  }) as unknown as EnvironmentThreadShell;
const click = async (screen: Screen, text: string, segment = "parent") => {
  const panel =
    [...screen.container.querySelectorAll('[aria-label="原会话"]')].find((node) =>
      [...node.querySelectorAll("p")].some((paragraph) => paragraph.textContent === segment),
    ) ?? screen.container;
  const button = [...panel.querySelectorAll("button")].find(
    (node) => node.textContent?.trim() === text,
  )!;
  await act(() => button.click());
};
const setup = () => {
  vi.clearAllMocks();
  test.archived = { snapshots: [], isLoading: false, error: null, refresh: vi.fn() };
  test.phase = "connected";
  test.shells = [
    shell("grandparent", null),
    shell("parent", "grandparent"),
    shell("current", "parent"),
    shell("child", "current"),
  ];
  test.state = {
    data: Option.some({
      messages: [],
      visibleTurnItems: [
        { position: 1999, item: { id: "last", type: "assistant_message", text: "末页虚构结果" } },
        { position: 1998, item: { id: "tool", type: "command_execution", text: "hidden tool" } },
      ],
    }),
    error: Option.none(),
    history: { hasMoreHistory: true, loading: false, error: null },
  };
};
const mount = () =>
  render(
    <ContinuationHistoryPanel
      environmentId={env}
      thread={shell("current", "parent")}
      projection={
        {
          messages: [
            { role: "user", text: "。先完整读取 /fictional/HANDOFF.md，按其中未完成事项继续；" },
          ],
        } as unknown as OrchestrationV2ThreadProjection
      }
      onQuote={test.quote}
    />,
    { router: false },
  );
describe("continuation panel interactions", () => {
  it("does not turn a fork or subagent into a broken continuation", async () => {
    setup();
    await using screen = await render(
      <ContinuationHistoryPanel
        environmentId={env}
        thread={{
          ...shell("fork", "parent"),
          lineage: { ...shell("fork", null).lineage, relationshipToParent: "fork" },
        }}
        projection={null}
        onQuote={test.quote}
      />,
      { router: false },
    );
    expect(screen.container.innerHTML).toBe("");
    expect(test.read).not.toHaveBeenCalled();
  });

  it("opens an archived segment read-only without navigation or unarchive", async () => {
    setup();
    test.shells = [shell("current", "parent")];
    test.archived.snapshots = [
      {
        environmentId: env,
        snapshot: { threads: [{ ...shell("parent", null), archivedAt: "2026-10-08T00:00:00Z" }] },
      },
    ];
    await using screen = await mount();
    expect(screen.container.textContent).toContain("已归档");
    expect(test.read.mock.calls.every(([environmentId]) => environmentId === null)).toBe(true);
    await click(screen, "查看记录");
    expect(screen.container.textContent).toContain("末页虚构结果");
    expect(screen.container.textContent).not.toContain("取消归档");
    expect(screen.container.textContent).not.toContain("在主区打开");
    expect(test.navigate).not.toHaveBeenCalled();
  });
  it("distinguishes archive lookup failures and disconnects from broken links", async () => {
    setup();
    test.shells = [];
    test.archived.error = "failed";
    await using screen = await mount();
    expect(screen.container.textContent).toContain("续聊历史加载失败");
    expect(screen.container.textContent).not.toContain("续聊链已断开");
    await click(screen, "重试加载段序");
    expect(test.archived.refresh).toHaveBeenCalledOnce();
    test.phase = "offline";
    await screen.rerender(
      <ContinuationHistoryPanel
        environmentId={env}
        thread={shell("current", "parent")}
        projection={null}
        onQuote={test.quote}
      />,
    );
    expect(screen.container.textContent).toContain("连接已断开");
    expect(screen.container.textContent).not.toContain("续聊链已断开");
  });
  it("shows every generation, mounts only the selected transcript and pages on request", async () => {
    setup();
    await using screen = await mount();
    expect(screen.container.textContent).toContain("parent");
    expect(screen.container.textContent).toContain("grandparent");
    expect(test.read.mock.calls.every(([env]) => env === null)).toBe(true);
    await click(screen, "查看记录");
    expect(screen.container.textContent).toContain("末页虚构结果");
    expect(screen.container.textContent).not.toContain("hidden tool");
    await click(screen, "继续加载更早记录");
    expect(test.load).toHaveBeenCalledExactlyOnceWith({
      environmentId: env,
      input: { threadId: "parent" },
    });
    expect(test.read).toHaveBeenCalledWith(env, "parent");
    expect(test.read).not.toHaveBeenCalledWith(env, "grandparent");
    expect(test.navigate).not.toHaveBeenCalled();
  });
  it("filters loaded messages, quotes without navigation/send, and opens the handoff read-only", async () => {
    setup();
    await using screen = await mount();
    await click(screen, "查看记录");
    await screen.getByRole("textbox").fill("不存在");
    expect(screen.container.textContent).toContain("没有匹配消息");
    await screen.getByRole("textbox").fill("末页");
    await click(screen, "引用");
    expect(test.quote).toHaveBeenCalledExactlyOnceWith(
      "\n\n> 末页虚构结果\n\n来源：原会话《parent》（threadId: parent · 条目 last）\n\n",
    );
    expect(test.navigate).not.toHaveBeenCalled();
    await click(screen, "打开交接文件");
    expect(test.file).toHaveBeenLastCalledWith(env, "/fictional", "/fictional/HANDOFF.md", true);
    expect(screen.container.textContent).toContain("虚构交接内容");
  });
});
