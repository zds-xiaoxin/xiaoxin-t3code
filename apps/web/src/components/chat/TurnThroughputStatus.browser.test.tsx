import { expect, it, vi } from "vite-plus/test";
import { act, fakeTimers, render } from "../../../test/render";
import * as DateTime from "effect/DateTime";
import type { OrchestrationV2ThreadProjection } from "@t3tools/contracts";
import { TurnThroughput } from "./TurnThroughputStatus";
function fixture() {
  const at = (n: number) => DateTime.makeUnsafe(n);
  return {
    runs: [
      {
        id: "run",
        ordinal: 1,
        activeAttemptId: "attempt",
        providerInstanceId: "codex",
        modelSelection: { model: "gpt-6-astra" },
        status: "running",
        requestedAt: at(0),
        startedAt: at(0),
        completedAt: null,
      },
    ],
    attempts: [],
    providerTurns: [
      {
        id: "turn",
        runAttemptId: "attempt",
        ordinal: 1,
        status: "running",
        startedAt: at(0),
        completedAt: null,
        turnTokenUsage: { usageStatus: "partial", outputTokens: 100 },
        tokenUsage: { updatedAt: new Date(9000).toISOString() },
      },
    ],
    turnItems: [],
  } as unknown as OrchestrationV2ThreadProjection;
}
it("updates locally, suspends while hidden/disconnected and tears down its clock", async () => {
  using visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const p = fixture();
  await using screen = await render(<TurnThroughput projection={p} disconnected />, {
    router: false,
  });
  using _timers = fakeTimers();
  vi.setSystemTime(10000);
  await screen.rerender(<TurnThroughput projection={p} />);
  const text = () => screen.container.textContent;
  expect(text()).toContain("10.0 tok/s");
  await act(() => {
    vi.advanceTimersByTime(10000);
  });
  expect(text()).toContain("5.0 tok/s");
  await act(() => {
    visibility.mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(vi.getTimerCount()).toBe(0);
  await act(() => {
    visibility.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(vi.getTimerCount()).toBe(1);
  await screen.rerender(<TurnThroughput projection={p} disconnected />);
  expect(text()).not.toContain("— tok/s");
  expect(text()).toContain("用量数据已过期");
  expect(text()).toContain("连接断开");
  expect(vi.getTimerCount()).toBe(0);
  await screen.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
it("retains a finished round without a collapse timer so details stay available", async () => {
  const at = (n: number) => DateTime.makeUnsafe(n);
  const p = fixture();
  const done = {
    ...p,
    runs: p.runs.map((r) => ({ ...r, status: "completed" as const, completedAt: at(10000) })),
    providerTurns: p.providerTurns.map((t) => ({
      ...t,
      status: "completed" as const,
      completedAt: at(10000),
      turnTokenUsage: { usageStatus: "complete" as const, outputTokens: 100 },
    })),
  } as unknown as OrchestrationV2ThreadProjection;
  await using screen = await render(<TurnThroughput projection={done} />, { router: false });
  using _timers = fakeTimers();
  vi.setSystemTime(20000);
  expect(screen.container.textContent).toContain("10.0 tok/s");
  expect(screen.container.textContent).not.toContain("无新活动");
  await act(() => {
    vi.advanceTimersByTime(2 * 60 * 1000);
  });
  expect(screen.container.textContent).toContain("10.0 tok/s");
  expect(vi.getTimerCount()).toBe(0);
  await screen.unmount();
  vi.setSystemTime(10_000_000);
  await using reopened = await render(<TurnThroughput projection={done} />, { router: false });
  expect(reopened.container.textContent).toContain("10.0 tok/s");
  expect(vi.getTimerCount()).toBe(0);
});
