import type { KeepAwakeMode } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import { describe, expect, it } from "@effect/vitest";

import { keepAwakeCommandArgs, makeKeepAwakeController } from "./KeepAwake.ts";

describe("keepAwakeCommandArgs", () => {
  it("holds nothing when off", () => {
    expect(keepAwakeCommandArgs("off", 42)).toBeNull();
  });

  it("prevents idle system sleep only in system mode", () => {
    expect(keepAwakeCommandArgs("system", 42)).toEqual(["-i", "-w", "42"]);
  });

  it("also keeps the display on in display mode, tied to the server pid", () => {
    expect(keepAwakeCommandArgs("display", 42)).toEqual(["-d", "-i", "-w", "42"]);
  });
});

function harness(input: {
  platform?: NodeJS.Platform;
  mode: KeepAwakeMode;
  active: number;
  failCount?: boolean;
}) {
  const state = {
    mode: input.mode,
    active: input.active,
    failCount: input.failCount ?? false,
    started: [] as string[],
    stopped: [] as string[],
  };
  const controller = makeKeepAwakeController({
    platform: input.platform ?? "darwin",
    pid: 7,
    readMode: Effect.sync(() => state.mode),
    countActiveRuns: Effect.suspend(() =>
      state.failCount ? Effect.fail("db unavailable") : Effect.succeed(state.active),
    ),
    hold: (args) =>
      Effect.sync(() => state.started.push(args.join(" "))).pipe(
        Effect.andThen(Effect.never),
        Effect.onInterrupt(() => Effect.sync(() => state.stopped.push(args.join(" ")))),
      ),
  });
  return { state, controller };
}

describe("makeKeepAwakeController", () => {
  it.effect("starts holding when a run becomes active and releases when none are left", () =>
    Effect.gen(function* () {
      const { state, controller } = harness({ mode: "display", active: 0 });
      yield* Effect.addFinalizer(() => controller.release);
      yield* controller.reconcile;
      expect(controller.isHolding()).toBe(false);
      state.active = 2;
      yield* controller.reconcile;
      yield* controller.reconcile;
      expect(state.started).toEqual(["-d -i -w 7"]);
      expect(controller.isHolding()).toBe(true);
      state.active = 0;
      yield* controller.reconcile;
      yield* Effect.yieldNow;
      expect(state.stopped).toEqual(["-d -i -w 7"]);
      expect(controller.isHolding()).toBe(false);
    }).pipe(Effect.scoped),
  );
  it.effect("swaps the assertion when the mode changes while a run is active", () =>
    Effect.gen(function* () {
      const { state, controller } = harness({ mode: "display", active: 1 });
      yield* Effect.addFinalizer(() => controller.release);
      yield* controller.reconcile;
      state.mode = "system";
      yield* controller.reconcile;
      expect(state.started).toEqual(["-d -i -w 7", "-i -w 7"]);
      expect(state.stopped).toEqual(["-d -i -w 7"]);
      state.mode = "off";
      yield* controller.reconcile;
      expect(state.stopped).toEqual(["-d -i -w 7", "-i -w 7"]);
      expect(controller.isHolding()).toBe(false);
    }).pipe(Effect.scoped),
  );
  it.effect("never holds on other platforms", () =>
    Effect.gen(function* () {
      const { state, controller } = harness({ platform: "linux", mode: "display", active: 3 });
      yield* Effect.addFinalizer(() => controller.release);
      yield* controller.reconcile;
      expect(state.started).toEqual([]);
      expect(controller.isHolding()).toBe(false);
    }).pipe(Effect.scoped),
  );
  it.effect("keeps the current assertion when the active-run read fails", () =>
    Effect.gen(function* () {
      const { state, controller } = harness({ mode: "display", active: 1 });
      yield* Effect.addFinalizer(() => controller.release);
      yield* controller.reconcile;
      state.failCount = true;
      expect(yield* Effect.flip(controller.reconcile)).toBeDefined();
      expect(controller.isHolding()).toBe(true);
      expect(state.stopped).toEqual([]);
    }).pipe(Effect.scoped),
  );
  it.effect("release interrupts a held assertion", () =>
    Effect.gen(function* () {
      const { state, controller } = harness({ mode: "system", active: 1 });
      yield* Effect.addFinalizer(() => controller.release);
      yield* controller.reconcile;
      yield* controller.release;
      expect(state.stopped).toEqual(["-i -w 7"]);
      expect(controller.isHolding()).toBe(false);
    }).pipe(Effect.scoped),
  );
});

describe("hold lifecycle", () => {
  it.effect("a forked hold effect stops when interrupted", () =>
    Effect.gen(function* () {
      let stopped = false;
      const fiber = yield* Effect.forkDetach(
        Effect.never.pipe(Effect.onInterrupt(() => Effect.sync(() => (stopped = true)))),
      );
      yield* Effect.yieldNow;
      yield* Fiber.interrupt(fiber);
      expect(stopped).toBe(true);
    }),
  );
});
