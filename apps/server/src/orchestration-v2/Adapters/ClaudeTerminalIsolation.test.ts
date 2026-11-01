// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, describe, expect, it } from "@effect/vitest";
import { isolateClaudeTerminalOptions } from "./ClaudeTerminalIsolation.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-tui-isolation-test-"));
  roots.push(root);
  for (const dir of ["home/.claude", "workspace", "tmp"]) {
    NodeFS.mkdirSync(NodePath.join(root, dir), { recursive: true });
  }
  NodeFS.writeFileSync(NodePath.join(root, ".t3-claude-tui-sandbox"), "1\n");
  return {
    root,
    options: {
      cwd: NodePath.join(root, "workspace"),
      env: {
        CLAUDE_CONFIG_DIR: NodePath.join(root, "home/.claude"),
        PATH: "/usr/bin:/bin",
        HOME: NodeOS.homedir(),
        ANTHROPIC_API_KEY: "must-not-inherit",
        CLAUDE_CODE_OAUTH_TOKEN: "must-not-inherit",
        CLAUDE_CODE_ENTRYPOINT: "sdk-ts",
        BUN_OPTIONS: "--preload unrelated.js",
        HTTPS_PROXY: "http://127.0.0.1:7890",
        T3_CLAUDE_TUI_TEST_UPSTREAM: "http://127.0.0.1:12345",
        CLAUDE_CODE_MAX_OUTPUT_TOKENS: "512",
      },
    },
  };
}

describe("Claude terminal account isolation", () => {
  it("uses the selected account, preserves Keychain access, and accepts ordinary projects", () => {
    const { root, options } = fixture();
    const config = NodeFS.realpathSync(NodePath.join(root, "home/.claude"));
    const input = {
      ...options,
      cwd: NodeOS.homedir(),
      env: { ...options.env, CLAUDE_CONFIG_DIR: config },
    };
    for (const settings of [
      { fastMode: false },
      { fastMode: true },
      { ultracode: false },
      { ultracode: true },
    ]) {
      const configured = isolateClaudeTerminalOptions(undefined, { ...input, settings });
      expect(configured.settings).toMatchObject(settings);
    }
    const isolated = isolateClaudeTerminalOptions(undefined, input);
    expect(isolated.cwd).toBe(NodeFS.realpathSync(NodeOS.homedir()));
    expect(isolated.env?.CLAUDE_CONFIG_DIR).toBe(config);
    expect(isolated.env?.HOME).toBe(NodeFS.realpathSync(NodeOS.homedir()));
    expect(isolated.env?.XDG_CONFIG_HOME).toBe(NodePath.join(config, ".t3-terminal/home/.config"));
    expect(isolated.env).not.toHaveProperty("ANTHROPIC_API_KEY");
    expect(isolated.env).not.toHaveProperty("CLAUDE_CODE_OAUTH_TOKEN");
    expect(isolated.env?.T3_CLAUDE_TUI_TEST_UPSTREAM).toBe(options.env.T3_CLAUDE_TUI_TEST_UPSTREAM);
    expect(isolated.env).not.toHaveProperty("CLAUDE_SECURESTORAGE_CONFIG_DIR");
    expect(isolateClaudeTerminalOptions(undefined, isolated)).toEqual(isolated);
    expect(input.env.HOME).toBe(NodeOS.homedir());
  });

  it("refuses default and aliased accounts before launching the daily TUI", () => {
    const { root, options } = fixture();
    expect(() => isolateClaudeTerminalOptions(undefined, { ...options, env: {} })).toThrow(
      "explicit separate",
    );
    expect(() =>
      isolateClaudeTerminalOptions(undefined, {
        ...options,
        env: { CLAUDE_CONFIG_DIR: NodeOS.homedir() },
      }),
    ).toThrow();
    const config = NodeFS.realpathSync(NodePath.join(root, "home/.claude"));
    NodeFS.symlinkSync(config, NodePath.join(root, "alias"), "dir");
    expect(() =>
      isolateClaudeTerminalOptions(undefined, {
        ...options,
        env: { CLAUDE_CONFIG_DIR: NodePath.join(root, "alias") },
      }),
    ).toThrow("path alias");
    NodeFS.symlinkSync(
      NodePath.join(root, "workspace"),
      NodePath.join(config, ".t3-terminal"),
      "dir",
    );
    expect(() =>
      isolateClaudeTerminalOptions(undefined, { ...options, env: { CLAUDE_CONFIG_DIR: config } }),
    ).toThrow("symlink");
  });

  it("uses only the sandbox home, keeps routing, and drops inherited identity and credentials", () => {
    const { root, options } = fixture();
    const settings = { fastMode: false, ultracode: true };
    const isolated = isolateClaudeTerminalOptions(root, { ...options, settings });
    expect(isolated.settings).toMatchObject(settings);
    expect(isolated.env).toMatchObject({
      HOME: NodeFS.realpathSync(NodePath.join(root, "home")),
      CLAUDE_CONFIG_DIR: NodeFS.realpathSync(NodePath.join(root, "home/.claude")),
      HTTPS_PROXY: options.env.HTTPS_PROXY,
      T3_CLAUDE_TUI_TEST_UPSTREAM: "http://127.0.0.1:12345",
      CLAUDE_CODE_MAX_OUTPUT_TOKENS: "512",
    });
    for (const key of [
      "ANTHROPIC_API_KEY",
      "CLAUDE_CODE_OAUTH_TOKEN",
      "CLAUDE_CODE_ENTRYPOINT",
      "BUN_OPTIONS",
    ]) {
      expect(isolated.env).not.toHaveProperty(key);
    }
    expect(isolated.settingSources).toEqual([]);
    expect(isolated.settings).toMatchObject({ disableDeepLinkRegistration: "disable" });
    expect(options.env.HOME).toBe(NodeOS.homedir());
  });

  it("rejects a missing marker, default account, real workspace, and symlinked account directory", () => {
    const { root, options } = fixture();
    expect(() =>
      isolateClaudeTerminalOptions(root, {
        ...options,
        env: { CLAUDE_CONFIG_DIR: NodePath.join(NodeOS.homedir(), ".claude") },
      }),
    ).toThrow();
    expect(() =>
      isolateClaudeTerminalOptions(root, { ...options, cwd: NodeOS.homedir() }),
    ).toThrow();
    const account = NodePath.join(root, "home/.claude");
    NodeFS.rmdirSync(account);
    NodeFS.symlinkSync(NodeOS.homedir(), account, "dir");
    expect(() => isolateClaudeTerminalOptions(root, options)).toThrow();
    NodeFS.unlinkSync(account);
    NodeFS.mkdirSync(account);
    NodeFS.unlinkSync(NodePath.join(root, ".t3-claude-tui-sandbox"));
    expect(() => isolateClaudeTerminalOptions(root, options)).toThrow();
  });

  it("rejects escape options instead of silently falling back to the SDK", () => {
    const { root, options } = fixture();
    for (const extra of [
      { extraArgs: { print: null } },
      { extraArgs: { settings: "/private/settings.json" } },
      { extraArgs: { "setting-sources": "user,project" } },
      { settings: { env: { HOME: NodeOS.homedir() } } },
      { settings: { env: { CLAUDE_CODE_ENTRYPOINT: "cli" } } },
      { settings: { hooks: { Stop: [] } } },
      { additionalDirectories: [NodeOS.homedir()] },
      { resumeSessionAt: "unsupported-rewind" },
      { mcpServers: { external: { command: "unsupported-stdio" } } },
      { env: { ...options.env, T3_CLAUDE_TUI_TEST_UPSTREAM: "https://example.com" } },
      { env: { ...options.env, T3_CLAUDE_TUI_TEST_UPSTREAM: "http://user:pass@127.0.0.1:12345" } },
    ])
      expect(() => isolateClaudeTerminalOptions(root, { ...options, ...extra })).toThrow();
  });
});
