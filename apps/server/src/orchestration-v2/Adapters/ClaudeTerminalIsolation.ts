// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import type { Options } from "@anthropic-ai/claude-agent-sdk";

const FORWARDED_ENV = new Set([
  "PATH",
  "Path",
  "USER",
  "LOGNAME",
  "PATHEXT",
  "SystemRoot",
  "ComSpec",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "HTTPS_PROXY",
  "HTTP_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "https_proxy",
  "http_proxy",
  "all_proxy",
  "no_proxy",
  "NODE_EXTRA_CA_CERTS",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "CLAUDE_CODE_MAX_OUTPUT_TOKENS",
  "CLAUDE_CODE_MAX_RETRIES",
  "T3_CLAUDE_TUI_TEST_UPSTREAM",
]);
const SETTING_KEYS = new Set([
  "autoCompactWindow",
  "showThinkingSummaries",
  "alwaysThinkingEnabled",
  "effortLevel",
  "disableDeepLinkRegistration",
  "env",
]);
const EXTRA_FLAGS = new Set(["thinking-display"]);
const fail = (reason: string): never => {
  throw new Error(`Claude TUI prototype isolation: ${reason}. No SDK fallback was started.`);
};

function within(root: string, path: string) {
  const relative = NodePath.relative(root, path);
  return (
    relative === "" ||
    (!relative.startsWith(`..${NodePath.sep}`) &&
      relative !== ".." &&
      !NodePath.isAbsolute(relative))
  );
}

function real(path: string) {
  try {
    return NodeFS.realpathSync(path);
  } catch {
    return fail("the sandbox paths must exist before starting");
  }
}

function rejectLinks(directory: string) {
  for (const entry of NodeFS.readdirSync(directory, { withFileTypes: true })) {
    const path = NodePath.join(directory, entry.name);
    if (entry.isSymbolicLink()) fail("sandbox symlinks are not supported");
    if (entry.isDirectory()) rejectLinks(path);
  }
}

export function isolateClaudeTerminalOptions(
  sandbox: string | undefined,
  options: Options,
): Options {
  if (sandbox === undefined) return isolateSelectedAccount(options);
  if (!NodePath.isAbsolute(sandbox)) fail("an absolute dedicated sandbox is required");
  const root = real(sandbox);
  const userHome = real(NodeOS.homedir());
  const protectedPaths = [
    NodePath.join(userHome, ".claude"),
    NodePath.join(userHome, "Library/Application Support/Claude"),
    NodePath.join(userHome, ".t3/userdata"),
  ];
  if (
    root === userHome ||
    root === NodePath.parse(root).root ||
    protectedPaths.some((p) => within(root, p) || within(p, root))
  ) {
    fail("the sandbox overlaps the default Claude or T3 account");
  }
  rejectLinks(root);
  const marker = NodePath.join(root, ".t3-claude-tui-sandbox");
  if (!NodeFS.existsSync(marker) || NodeFS.readFileSync(marker, "utf8").trim() !== "1") {
    fail("the sandbox marker is missing");
  }
  const home = real(NodePath.join(root, "home"));
  const config = real(NodePath.join(home, ".claude"));
  const workspace = real(NodePath.join(root, "workspace"));
  const temp = real(NodePath.join(root, "tmp"));
  const cwd = real(options.cwd ?? process.cwd());
  if (!within(workspace, cwd)) fail("the working directory must stay in the sandbox workspace");
  const parent = options.env ?? process.env;
  validateTestUpstream(parent);
  if (!parent.CLAUDE_CONFIG_DIR || real(parent.CLAUDE_CONFIG_DIR) !== config) {
    fail("select the dedicated sandbox account, never a default or existing account");
  }
  if (options.resumeSessionAt || options.forkSession)
    fail("rollback and fork need separate validation");
  if (options.hooks || options.plugins?.length)
    fail("SDK hooks and plugins need separate validation");
  if (typeof options.settings === "string") fail("settings file overrides are not supported");
  for (const flag of Object.keys(options.extraArgs ?? {})) {
    if (!EXTRA_FLAGS.has(flag)) fail(`unsupported launch flag --${flag}`);
  }
  const settings = typeof options.settings === "object" ? options.settings : {};
  for (const key of Object.keys(settings)) {
    if (!SETTING_KEYS.has(key)) fail(`unsupported settings key ${key}`);
  }
  for (const key of Object.keys(settings.env ?? {})) {
    if (key !== "ENABLE_TOOL_SEARCH") fail("settings cannot override identity or authentication");
  }
  for (const directory of options.additionalDirectories ?? []) {
    if (!within(root, real(directory))) fail("additional directories must stay in the sandbox");
  }
  for (const server of Object.values(options.mcpServers ?? {})) {
    if (server.type !== "http" && server.type !== "sse")
      fail("only HTTP MCP servers are supported in this prototype");
  }
  const env: NodeJS.ProcessEnv = Object.fromEntries(
    Object.entries(parent).filter(([key, value]) => FORWARDED_ENV.has(key) && value !== undefined),
  );
  Object.assign(env, {
    HOME: home,
    USERPROFILE: home,
    CLAUDE_CONFIG_DIR: config,
    XDG_CONFIG_HOME: NodePath.join(home, ".config"),
    XDG_CACHE_HOME: NodePath.join(home, ".cache"),
    XDG_DATA_HOME: NodePath.join(home, ".local/share"),
    APPDATA: NodePath.join(home, "AppData/Roaming"),
    LOCALAPPDATA: NodePath.join(home, "AppData/Local"),
    TMPDIR: temp,
    TMP: temp,
    TEMP: temp,
    TERM: "xterm-256color",
    DISABLE_AUTOUPDATER: "1",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
  });
  return {
    ...options,
    env,
    cwd,
    settings: { ...settings, disableDeepLinkRegistration: "disable" },
    settingSources: [],
  };
}

function validateTestUpstream(parent: NodeJS.ProcessEnv) {
  if (parent.T3_CLAUDE_TUI_TEST_UPSTREAM) {
    const upstream = new URL(parent.T3_CLAUDE_TUI_TEST_UPSTREAM);
    if (
      upstream.protocol !== "http:" ||
      upstream.hostname !== "127.0.0.1" ||
      !upstream.port ||
      upstream.username ||
      upstream.password ||
      upstream.pathname !== "/" ||
      upstream.search ||
      upstream.hash
    ) {
      fail("test metering must use a loopback-only upstream");
    }
  }
}

function isolateSelectedAccount(options: Options): Options {
  const parent = options.env ?? process.env;
  validateTestUpstream(parent);
  const configured = parent.CLAUDE_CONFIG_DIR?.trim();
  if (!configured || !NodePath.isAbsolute(configured))
    return fail(
      "TUI requires an explicit separate Claude account directory in Settings > Providers",
    );
  const config = real(configured);
  const userHome = real(NodeOS.homedir());
  const protectedPaths = [
    NodePath.join(userHome, ".claude"),
    NodePath.join(userHome, "Library/Application Support/Claude"),
    NodePath.join(userHome, ".t3/userdata"),
  ].map((path) => (NodeFS.existsSync(path) ? real(path) : path));
  if (
    config !== NodePath.resolve(configured) ||
    config === userHome ||
    config === NodePath.parse(config).root ||
    protectedPaths.some((path) => within(config, path) || within(path, config))
  )
    fail("use a separate account directory, not the default Claude account or a path alias");
  for (const name of [
    ".claude.json",
    ".credentials.json",
    "settings.json",
    "settings.local.json",
    "remote-settings.json",
  ]) {
    if (NodeFS.lstatSync(NodePath.join(config, name), { throwIfNoEntry: false })?.isSymbolicLink())
      fail("account settings and credentials cannot be symlinks");
  }
  const root = NodePath.join(config, ".t3-terminal");
  for (const directory of [root, NodePath.join(root, "home"), NodePath.join(root, "tmp")]) {
    if (NodeFS.lstatSync(directory, { throwIfNoEntry: false })?.isSymbolicLink())
      fail("the terminal home cannot be a symlink");
    NodeFS.mkdirSync(directory, { recursive: true, mode: 0o700 });
  }
  const home = real(NodePath.join(root, "home"));
  rejectLinks(home);
  const temp = real(NodePath.join(root, "tmp"));
  const cwd = real(options.cwd ?? process.cwd());
  if (options.resumeSessionAt || options.forkSession || options.hooks || options.plugins?.length)
    fail("fork, rollback, SDK hooks and plugins are not supported in experimental TUI mode");
  if (typeof options.settings === "string") fail("settings file overrides are not supported");
  for (const flag of Object.keys(options.extraArgs ?? {})) {
    if (!EXTRA_FLAGS.has(flag)) fail(`unsupported launch flag --${flag}`);
  }
  const settings = typeof options.settings === "object" ? options.settings : {};
  for (const key of Object.keys(settings)) {
    if (!SETTING_KEYS.has(key)) fail(`unsupported settings key ${key}`);
  }
  for (const key of Object.keys(settings.env ?? {})) {
    if (key !== "ENABLE_TOOL_SEARCH") fail("settings cannot override identity or authentication");
  }
  for (const server of Object.values(options.mcpServers ?? {})) {
    if (server.type !== "http" && server.type !== "sse")
      fail("TUI currently supports HTTP/SSE MCP only");
  }
  const env = Object.fromEntries(
    Object.entries(parent).filter(([key, value]) => FORWARDED_ENV.has(key) && value !== undefined),
  );
  return {
    ...options,
    cwd,
    env: {
      ...env,
      // macOS Keychain needs the real HOME; CLAUDE_CONFIG_DIR selects the separate login.
      HOME: userHome,
      USERPROFILE: userHome,
      CLAUDE_CONFIG_DIR: config,
      XDG_CONFIG_HOME: NodePath.join(home, ".config"),
      XDG_CACHE_HOME: NodePath.join(home, ".cache"),
      XDG_DATA_HOME: NodePath.join(home, ".local/share"),
      APPDATA: NodePath.join(home, "AppData/Roaming"),
      LOCALAPPDATA: NodePath.join(home, "AppData/Local"),
      TMPDIR: temp,
      TMP: temp,
      TEMP: temp,
      TERM: "xterm-256color",
      DISABLE_AUTOUPDATER: "1",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    },
    settings: { ...settings, disableDeepLinkRegistration: "disable" },
    settingSources: [],
  };
}
