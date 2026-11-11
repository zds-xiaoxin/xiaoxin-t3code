import { useAtomValue } from "@effect/atom-react";
import {
  type EnvironmentId,
  type MemoryEntry,
  type MemoryScope,
  type ProjectId,
  type UserMemoryMutation,
} from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import { useState } from "react";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { toastManager } from "../ui/toast";
import { Badge } from "../ui/badge";
import { useSettingsScope } from "./SettingsScopeContext";
import { SettingsPageContainer, SettingsSection } from "./settingsLayout";

type ProjectChoice = { id: ProjectId; title: string };

function MemoryEditor({
  initial,
  approving = false,
  projects,
  onSave,
  onCancel,
  busy,
}: {
  initial?: MemoryEntry;
  approving?: boolean;
  projects: readonly ProjectChoice[];
  onSave: (text: string, scope: MemoryScope) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [text, setText] = useState(initial?.text ?? "");
  const initialProjectId = initial?.scope.kind === "project" ? initial.scope.projectId : undefined;
  const [scopeId, setScopeId] = useState(
    initial?.scope.kind === "project" ? initial.scope.projectId : "global",
  );
  return (
    <form
      className="space-y-3 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const scope: MemoryScope =
          scopeId === "global"
            ? { kind: "global" }
            : { kind: "project", projectId: scopeId as ProjectId };
        onSave(text.trim(), scope);
      }}
    >
      <Textarea
        aria-label="记忆内容"
        rows={3}
        maxLength={500}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          范围
          <select
            aria-label="记忆范围"
            className="rounded-md border bg-background px-2 py-1"
            value={scopeId}
            onChange={(event) => setScopeId(event.target.value)}
          >
            <option value="global">全局</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
            {initial?.scope.kind === "project" &&
            !projects.some(({ id }) => id === initialProjectId) ? (
              <option value={initial.scope.projectId}>{initial.scope.projectId}</option>
            ) : null}
          </select>
        </label>
        <Button type="submit" size="sm" disabled={busy || text.trim().length === 0}>
          {approving ? "保存并批准" : "保存记忆"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          取消
        </Button>
      </div>
    </form>
  );
}

function MemoryEnvironment({
  environmentId,
  projects,
}: {
  environmentId: EnvironmentId;
  projects: readonly ProjectChoice[];
}) {
  const config = useAtomValue(serverEnvironment.configValueAtom(environmentId));
  const allowed = useAtomValue(serverEnvironment.updateSettings.permissionAtom(environmentId));
  const update = useAtomCommand(serverEnvironment.updateSettings);
  const [editor, setEditor] = useState<MemoryEntry | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const memory = config?.settings.memory ?? { approved: [], pending: [] };
  const mutate = async (memoryMutation: UserMemoryMutation) => {
    setBusy(true);
    try {
      const result = await update({ environmentId, input: { patch: {}, memoryMutation } });
      if (AsyncResult.isSuccess(result)) {
        setEditor(null);
        toastManager.add({
          type: "success",
          title:
            memoryMutation.type === "approve" ? "记忆已批准，将在下一次普通回合生效" : "记忆已更新",
        });
      }
    } finally {
      setBusy(false);
    }
  };
  const scopeTitle = (scope: MemoryScope) =>
    scope.kind === "global"
      ? "全局"
      : (projects.find(({ id }) => id === scope.projectId)?.title ?? `项目 ${scope.projectId}`);
  const groups = [
    ...new Set([
      "global",
      ...memory.approved.flatMap(({ scope }) =>
        scope.kind === "project" ? [scope.projectId] : [],
      ),
    ]),
  ];
  const renderRow = (entry: MemoryEntry, pending: boolean) =>
    editor !== "new" && editor?.id === entry.id ? (
      <MemoryEditor
        key={entry.id}
        initial={entry}
        approving={pending}
        projects={projects}
        busy={busy}
        onCancel={() => setEditor(null)}
        onSave={(text, scope) =>
          void mutate({ type: pending ? "approve" : "edit", id: entry.id, text, scope })
        }
      />
    ) : (
      <div key={entry.id} className="space-y-2 border-b p-4 last:border-b-0">
        <p className="whitespace-pre-wrap break-words text-sm">{entry.text}</p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {scopeTitle(entry.scope)} ·{" "}
            {entry.source.kind === "user" ? "用户添加" : `Agent 提案 · ${entry.source.threadId}`} ·{" "}
            {new Date(entry.updatedAt).toLocaleString()}
          </p>
          <div className="flex gap-2">
            {pending ? (
              <Button
                size="xs"
                disabled={!allowed || busy}
                onClick={() => void mutate({ type: "approve", id: entry.id })}
              >
                批准
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="xs"
              disabled={!allowed || busy}
              onClick={() => setEditor(entry)}
            >
              {pending ? "修改后批准" : "编辑"}
            </Button>
            <Button
              variant="ghost"
              size="xs"
              disabled={!allowed || busy}
              onClick={() => void mutate({ type: pending ? "reject" : "delete", id: entry.id })}
            >
              {pending ? "拒绝" : "删除"}
            </Button>
          </div>
        </div>
      </div>
    );
  if (!config) return <p role="status">正在加载记忆…</p>;
  if (!config.memorySettings)
    return (
      <p className="p-4 text-sm text-muted-foreground">此环境尚不支持记忆，请先升级服务器。</p>
    );
  return (
    <>
      <p className="px-4 text-sm text-muted-foreground">
        已批准的记忆由此环境统一提供给所有模型。Agent
        只能提案，需你批准后才会生效。每次普通回合最多注入约 2,000 字符，优先最近更新。
      </p>
      <SettingsSection
        id="memory"
        title="待确认"
        titleAction={<Badge variant="secondary">{memory.pending.length}</Badge>}
      >
        {memory.pending.length ? (
          memory.pending.toReversed().map((entry) => renderRow(entry, true))
        ) : (
          <p className="p-4 text-sm text-muted-foreground">暂无待确认提案</p>
        )}
      </SettingsSection>
      <SettingsSection
        title="添加记忆"
        headerAction={
          editor !== "new" ? (
            <Button size="xs" disabled={!allowed || busy} onClick={() => setEditor("new")}>
              添加记忆
            </Button>
          ) : null
        }
      >
        {editor === "new" ? (
          <MemoryEditor
            projects={projects}
            busy={busy}
            onCancel={() => setEditor(null)}
            onSave={(text, scope) => void mutate({ type: "add", text, scope })}
          />
        ) : (
          <p className="p-4 text-sm text-muted-foreground">
            保存适合长期复用的简短事实与偏好，最多 500 字符。
          </p>
        )}
      </SettingsSection>
      {groups.map((key) => (
        <SettingsSection
          key={key}
          title={
            key === "global"
              ? "全局"
              : (projects.find(({ id }) => id === key)?.title ?? `项目 ${key}`)
          }
        >
          {memory.approved
            .filter(({ scope }) =>
              key === "global"
                ? scope.kind === "global"
                : scope.kind === "project" && scope.projectId === key,
            )
            .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .map((entry) => renderRow(entry, false))}
          {key === "global" && !memory.approved.some(({ scope }) => scope.kind === "global") ? (
            <p className="p-4 text-sm text-muted-foreground">暂无全局记忆</p>
          ) : null}
        </SettingsSection>
      ))}
    </>
  );
}

export function MemorySettings() {
  const { environment, groups } = useSettingsScope();
  const projects = groups.flatMap((group) =>
    group.memberProjects
      .filter((project) => project.environmentId === environment?.environmentId)
      .map((project) => ({ id: project.id, title: group.displayName })),
  );
  return (
    <SettingsPageContainer>
      {environment ? (
        <MemoryEnvironment
          key={environment.environmentId}
          environmentId={environment.environmentId}
          projects={projects}
        />
      ) : (
        <p className="p-4 text-sm text-muted-foreground">连接环境后管理记忆。</p>
      )}
    </SettingsPageContainer>
  );
}
