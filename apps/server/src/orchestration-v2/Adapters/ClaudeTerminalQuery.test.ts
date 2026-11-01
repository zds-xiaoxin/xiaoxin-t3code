// @effect-diagnostics cryptoRandomUUIDInEffect:off
// @effect-diagnostics cryptoRandomUUID:off
// @effect-diagnostics globalDate:off
// @effect-diagnostics globalFetch:off
// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Pty from "@t3tools/shared/PtyAdapter";
import type { SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  makeClaudeTerminalQueryFactory,
  type ClaudeTerminalQueryRuntime,
} from "./ClaudeTerminalQuery.ts";

const cleanup: Array<() => void> = [];
afterEach(() => {
  for (const close of cleanup.splice(0).reverse()) close();
});

function prompts() {
  const values: SDKUserMessage[] = [];
  let notify: (() => void) | undefined;
  let closed = false;
  return {
    offer(text: string) {
      values.push({
        type: "user",
        session_id: "",
        parent_tool_use_id: null,
        uuid: crypto.randomUUID(),
        message: { role: "user", content: text },
      });
      notify?.();
    },
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<SDKUserMessage>> {
          for (;;) {
            if (closed || values.length > 0) break;
            await new Promise<void>((resolve) => {
              notify = resolve;
            });
          }
          const value = values.shift();
          return value ? { done: false, value } : { done: true, value: undefined };
        },
        async return(): Promise<IteratorResult<SDKUserMessage>> {
          closed = true;
          notify?.();
          return { done: true, value: undefined };
        },
      };
    },
  };
}

async function nextResult(query: ClaudeTerminalQueryRuntime) {
  const messages: SDKMessage[] = [];
  for (;;) {
    const next = await query.next();
    if (next.done) throw new Error("The query closed before its result.");
    const message = next.value;
    messages.push(message);
    if (message.type === "result") return { result: message, messages };
  }
}

async function fixture(failStart = false, rejectSpawn = false) {
  const root = NodeFS.realpathSync(
    NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-tui-runtime-test-")),
  );
  cleanup.push(() => NodeFS.rmSync(root, { recursive: true, force: true }));
  for (const dir of ["home/.claude/projects/fake", "workspace", "tmp"])
    NodeFS.mkdirSync(NodePath.join(root, dir), { recursive: true });
  NodeFS.writeFileSync(NodePath.join(root, ".t3-claude-tui-sandbox"), "1\n");
  const session = crypto.randomUUID();
  const transcript = NodePath.join(root, "home/.claude/projects/fake", `${session}.jsonl`);
  NodeFS.writeFileSync(transcript, "");
  const tracking = { started: 0, active: 0 };
  const trackAgent = () => {
    tracking.started++;
    tracking.active++;
    return () => {
      tracking.active--;
    };
  };
  const spawns: Pty.PtySpawnInput[] = [];
  const kills: number[] = [];
  const drains: Array<() => Promise<void>> = [];
  const submitted = Promise.withResolvers<void>();
  const approvals: unknown[] = [];
  let activeHook = "";
  const append = (row: object) =>
    NodeFS.appendFileSync(
      transcript,
      JSON.stringify({
        // oxlint-disable-next-line t3code/no-wall-clock-in-tests -- Transcript freshness is protocol data, not an elapsed-time assertion.
        timestamp: new Date().toISOString(),
        ...row,
      }) + "\n",
    );
  const hook = async (kind: string, data: object = {}) => {
    const response = await fetch(activeHook + kind, {
      method: "POST",
      body: JSON.stringify({
        session_id: session,
        transcript_path: transcript,
        model: "offline-model",
        ...data,
      }),
    });
    expect(response.status).toBe(200);
    return response.text();
  };
  const spawn = (input: Pty.PtySpawnInput) =>
    rejectSpawn
      ? Effect.fail(new Pty.PtySpawnError({ adapter: "fixture", cause: "spawn rejected" }))
      : Effect.sync(() => {
          spawns.push(input);
          const settingsAt = input.args!.indexOf("--settings");
          const settingsPath = input.args![settingsAt + 1]!;
          const settings = JSON.parse(NodeFS.readFileSync(settingsPath, "utf8"));
          const command: string = settings.hooks.SessionStart[0].hooks[0].command;
          activeHook = command.match(/http:\/\/[^ ]+/)![0].replace(/session-start$/, "");
          expect(NodeFS.statSync(settingsPath).mode & 0o777).toBe(0o600);
          let dataListener: ((data: string) => void) | undefined;
          const exitListeners = new Set<(event: Pty.PtyExitEvent) => void>();
          let typed = "";
          let jobs = Promise.resolve();
          const enqueue = (run: () => Promise<void>) => {
            jobs = jobs.then(run);
            void jobs.catch(() => undefined);
          };
          drains.push(() => jobs);
          const child: Pty.PtyProcess = {
            pid: 12345 + spawns.length,
            onData(listener) {
              dataListener = listener;
              return () => {
                dataListener = undefined;
              };
            },
            onExit(listener) {
              exitListeners.add(listener);
              if (failStart) queueMicrotask(() => listener({ exitCode: 7, signal: null }));
              return () => {
                exitListeners.delete(listener);
              };
            },
            resize() {},
            kill() {
              kills.push(child.pid);
              for (const listener of exitListeners) listener({ exitCode: 0, signal: null });
            },
            write(data) {
              if (data === "\x1b") {
                enqueue(async () => {
                  append({
                    type: "user",
                    uuid: crypto.randomUUID(),
                    message: { role: "user", content: "[Request interrupted by user]" },
                  });
                  await hook("stop");
                });
              } else if (data === "\r") {
                const text = typed;
                typed = "";
                enqueue(async () => {
                  await hook("prompt-submit", { prompt: text });
                  append({
                    type: "user",
                    uuid: crypto.randomUUID(),
                    message: { role: "user", content: text },
                  });
                  submitted.resolve();
                  if (text === "WAIT") return;
                  const toolId = crypto.randomUUID();
                  await hook("pre-tool-use", {
                    tool_name: "Read",
                    tool_use_id: toolId,
                    tool_input: { file_path: "fixture.txt" },
                  });
                  const approval = JSON.parse(
                    await hook("permission", {
                      tool_name: "Read",
                      tool_use_id: toolId,
                      tool_input: { file_path: "fixture.txt" },
                    }),
                  );
                  approvals.push(approval.hookSpecificOutput.decision);
                  append({
                    type: "assistant",
                    uuid: crypto.randomUUID(),
                    message: {
                      id: crypto.randomUUID(),
                      role: "assistant",
                      model: "offline-model",
                      content: [
                        {
                          type: "tool_use",
                          id: toolId,
                          name: "Read",
                          input: { file_path: "fixture.txt" },
                        },
                      ],
                      stop_reason: "tool_use",
                      usage: { input_tokens: 10, output_tokens: 2 },
                    },
                  });
                  append({
                    type: "user",
                    uuid: crypto.randomUUID(),
                    message: {
                      role: "user",
                      content: [
                        { type: "tool_result", tool_use_id: toolId, content: "fixture only" },
                      ],
                    },
                  });
                  append({
                    type: "assistant",
                    uuid: crypto.randomUUID(),
                    message: {
                      id: crypto.randomUUID(),
                      role: "assistant",
                      model: "offline-model",
                      content: [{ type: "text", text: `DONE:${text}` }],
                      stop_reason: "end_turn",
                      usage: { input_tokens: 12, output_tokens: 3 },
                    },
                  });
                  append({ type: "system", subtype: "turn_duration", durationMs: 10 });
                  await hook("stop");
                });
              } else {
                typed += data.replace(/\x1b\[20[01]~/g, "");
              }
              dataListener?.("");
            },
          };
          if (!failStart)
            queueMicrotask(() =>
              enqueue(async () => {
                await hook("session-start");
              }),
            );
          return child;
        });
  // oxlint-disable-next-line t3code/no-manual-effect-runtime-in-tests -- Native callbacks need a runtime independent of the awaiting test fiber.
  const factory = await Effect.runPromise(
    makeClaudeTerminalQueryFactory.pipe(Effect.provideService(Pty.PtyAdapter, { spawn })),
  );
  const open = (resume = false, terminalSubagentContext?: string) => {
    const input = prompts();
    const query = factory({
      sandbox: root,
      trackAgent,
      prompt: input,
      options: {
        ...(terminalSubagentContext === undefined ? {} : { terminalSubagentContext }),
        cwd: NodePath.join(root, "workspace"),
        env: {
          CLAUDE_CONFIG_DIR: NodePath.join(root, "home/.claude"),
          T3CODE_THREAD_ID: "fixture-thread",
        },
        ...(resume ? { resume: session } : { sessionId: session }),
        canUseTool: async (_name, toolInput) => ({ behavior: "allow", updatedInput: toolInput }),
      },
    });
    cleanup.push(query.close);
    return { input, query };
  };
  return {
    root,
    open,
    spawns,
    tracking,
    kills,
    approvals,
    submitted,
    hook,
    drain: () => Promise.all(drains.map((drain) => drain())),
  };
}

describe("Claude terminal runtime (offline PTY fixture)", () => {
  it.live("returns device context from the native SubagentStart hook", () =>
    Effect.promise(async () => {
      const f = await fixture();
      const { input, query } = f.open(false, "Device instructions");
      input.offer("ONE");
      await nextResult(query);
      expect(
        JSON.parse(
          await f.hook("subagent-start", {
            agent_id: "offline-agent",
            agent_type: "general-purpose",
          }),
        ),
      ).toEqual({
        hookSpecificOutput: {
          hookEventName: "SubagentStart",
          additionalContext: "Device instructions",
        },
      });
      await f.drain();
      query.close();
    }),
  );
  it.live("reports a failed TUI start without creating an SDK or print-mode child", () =>
    Effect.promise(async () => {
      const f = await fixture(true);
      const { query } = f.open();
      await expect(query.next()).rejects.toThrow("Claude exited with code 7");
      expect(f.spawns).toHaveLength(1);
      expect(f.spawns[0]!.args).not.toContain("-p");
      expect(f.tracking).toEqual({ started: 1, active: 0 });
      const rejected = await fixture(false, true);
      await expect(rejected.open().query.next()).rejects.toThrow(
        "Failed to spawn PTY process with fixture.",
      );
      expect(rejected.tracking).toEqual({ started: 1, active: 0 });
    }),
  );
  it.live("keeps tools, the second turn and resumed history on the isolated account", () =>
    Effect.promise(async () => {
      const f = await fixture();
      const first = f.open();
      first.input.offer("ONE");
      const one = await nextResult(first.query);
      expect(one.result).toMatchObject({ subtype: "success", result: "DONE:ONE" });
      expect(f.tracking).toEqual({ started: 1, active: 1 });
      expect(one.messages.some((m) => m.type === "assistant")).toBe(true);
      first.input.offer("TWO");
      expect((await nextResult(first.query)).result).toMatchObject({ result: "DONE:TWO" });
      await f.drain();
      await first.query[Symbol.asyncDispose]();
      expect(f.tracking.active).toBe(0);
      const resumed = f.open(true);
      resumed.input.offer("THREE");
      const three = await nextResult(resumed.query);
      expect(three.result).toMatchObject({ result: "DONE:THREE" });
      expect(JSON.stringify(three.messages)).not.toContain("DONE:ONE");
      expect(f.approvals).toHaveLength(3);
      expect(f.approvals.every((a) => (a as { behavior: string }).behavior === "allow")).toBe(true);
      expect(f.spawns[1]!.args).toContain("--resume");
      for (const spawn of f.spawns) {
        expect(spawn.args).not.toContain("-p");
        expect(spawn.env.HOME).toBe(NodePath.join(f.root, "home"));
        expect(spawn.env.CLAUDE_CODE_ENTRYPOINT).toBeUndefined();
        expect(spawn.env.T3CODE_THREAD_ID).toBe("fixture-thread");
      }
      await f.drain();
      resumed.query.close();
      expect(f.kills).toHaveLength(2);
    }),
  );

  it.live("interrupts a pending turn and closes only its own child", () =>
    Effect.promise(async () => {
      const f = await fixture();
      const { input, query } = f.open();
      input.offer("WAIT");
      await f.submitted.promise;
      const result = nextResult(query);
      await query.interrupt();
      expect((await result).result).toMatchObject({ terminal_reason: "aborted_streaming" });
      await f.drain();
      query.close();
      expect(f.spawns).toHaveLength(1);
      expect(f.kills).toEqual([12346]);
    }),
  );
});
