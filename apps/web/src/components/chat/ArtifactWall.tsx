import { uiText } from "~/i18n";
import { usePreparedConnection } from "../../state/session";
import type { EnvironmentId, ThreadId, WallArtifact } from "@t3tools/contracts";
import { useEffect, useRef, useState } from "react";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FileIcon,
  GlobeIcon,
  MoreHorizontalIcon,
  XIcon,
} from "lucide-react";
import {
  artifactCounts,
  artifactCheckLabel,
  isArtifactVideo,
  artifactVideoDuration,
  groupArtifacts,
  ARTIFACT_DRAG_TYPE,
  artifactRevisionPrompt,
  artifactVersionKey,
} from "../../artifactWall";
import { artifactFileUrl, fileFromArtifact, loadWallArtifacts } from "../../lib/artifactWallClient";
import { useAtomCommand } from "../../state/use-atom-command";
import { shellEnvironment } from "../../state/shell";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { cn } from "~/lib/utils";
import { Dialog, DialogPopup, DialogTitle } from "../ui/dialog";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export function ArtifactWall({
  environmentId,
  threadId,
  onAttach,
  onRevise,
  revisionEnabled = false,
  active = true,
  onCount,
}: {
  environmentId: EnvironmentId;
  threadId: ThreadId;
  onAttach: (files: File[]) => void;
  onRevise?: (prompt: string) => boolean;
  revisionEnabled?: boolean;
  /** An inactive wall keeps loading (for the tab count) but renders nothing, so no thumbnails load. */
  active?: boolean;
  onCount?: (count: number) => void;
}) {
  const preparedConnection = usePreparedConnection(environmentId);
  const [scope, setScope] = useState<"thread" | "project">("thread");
  const [filter, setFilter] = useState<"all" | WallArtifact["kind"]>("all");
  const [state, setState] = useState<{
    key: string;
    artifacts: readonly WallArtifact[];
    error: string | null;
    loading: boolean;
  }>({ key: "", artifacts: [], error: null, loading: true });
  const [durations, setDurations] = useState<Record<string, number>>({});
  const [visible, setVisible] = useState(40);
  const [selected, setSelected] = useState<WallArtifact | null>(null);
  const [comparison, setComparison] = useState<WallArtifact | null>(null);
  const [compareMode, setCompareMode] = useState<"slider" | "a" | "b">("slider");
  const [split, setSplit] = useState(50);
  const [revisionNotes, setRevisionNotes] = useState<Record<string, string>>({});
  const [thumbCount, setThumbCount] = useState(40);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  // ⌘/Ctrl-click or the corner check picks up to two images to compare.
  const [picked, setPicked] = useState<string[]>([]);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const filmstrip = useRef<HTMLDivElement | null>(null);
  const loadMore = useRef<HTMLDivElement | null>(null);
  const scrollRoot = useRef<HTMLDivElement | null>(null);
  const openInEditor = useAtomCommand(shellEnvironment.openInEditor, { reportFailure: false });
  const key = `${environmentId}:${threadId}:${scope}`;
  const artifacts = state.key === key ? state.artifacts : [];
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Keep an abortable polling subscription to the selected remote artifact collection.
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const load = async () => {
      try {
        const artifacts = await loadWallArtifacts(
          environmentId,
          threadId,
          scope,
          controller.signal,
        );
        if (active) setState({ key, artifacts, error: null, loading: false });
      } catch (error) {
        if (active && !controller.signal.aborted)
          setState((s) => ({
            key,
            artifacts: s.key === key ? s.artifacts : [],
            error: error instanceof Error ? error.message : "暂时无法读取产物",
            loading: false,
          }));
      }
    };
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 15_000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Connection replacement and explicit retry both restart the polling subscription.
  }, [environmentId, threadId, scope, key, preparedConnection, retry]);
  const viewKey = `${key}:${filter}`;
  const [previousViewKey, setPreviousViewKey] = useState(viewKey);
  if (previousViewKey !== viewKey) {
    setPreviousViewKey(viewKey);
    setVisible(40);
    setSelected(null);
    setComparison(null);
    setActionError(null);
    setPicked([]);
  }
  const filtered = (() => artifacts.filter((a) => filter === "all" || a.kind === filter))();
  const counts = artifactCounts(artifacts);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Publish the current RPC-backed collection count to the host tab indicator.
  useEffect(() => {
    onCount?.(counts.all);
  }, [counts.all, onCount]);
  const groups = groupArtifacts(filtered.slice(0, visible));
  const images = (() => artifacts.filter((a) => a.kind === "image"))();
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Keep the browser intersection observer attached to the current pagination sentinel.
  useEffect(() => {
    const element = loadMore.current;
    if (!element || visible >= filtered.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible((n) => n + 40);
      },
      { root: scrollRoot.current, rootMargin: "80px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible, filtered.length]);
  const compare = (a: WallArtifact) => {
    setSelected(a);
    setComparison(null);
    setSplit(50);
    setCompareMode("slider");
    setThumbCount(40);
  };
  const togglePick = (a: WallArtifact) =>
    setPicked((current) =>
      current.includes(a.id)
        ? current.filter((id) => id !== a.id)
        : current.length >= 2
          ? [current[1]!, a.id]
          : [...current, a.id],
    );
  const openPickedCompare = () => {
    const [first, second] = picked.map((id) => artifacts.find((a) => a.id === id));
    if (!first || !second) return;
    setSelected(second);
    setComparison(first);
    setSplit(50);
    setCompareMode("slider");
    setThumbCount(40);
    setPicked([]);
  };
  const selectedImageIndex =
    selected && selected.kind === "image"
      ? images.findIndex((a) => artifactVersionKey(a) === artifactVersionKey(selected))
      : -1;
  const stepImage = (delta: number) => {
    if (selectedImageIndex < 0 || images.length < 2) return;
    const index = (selectedImageIndex + delta + images.length) % images.length;
    const next = images[index]!;
    setSelected(next);
    if (comparison && artifactVersionKey(comparison) === artifactVersionKey(next)) {
      setComparison(null);
    }
    setThumbCount((n) => Math.max(n, index + 20));
  };
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Arrow keys page through images while the viewer is open.
  useEffect(() => {
    if (selectedImageIndex < 0) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)))
        return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        stepImage(event.key === "ArrowLeft" ? -1 : 1);
      }
    };
    // Capture phase: the dialog's own key handling must not swallow paging.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Keep the current image centered in the filmstrip.
  useEffect(() => {
    if (!selected) return;
    const strip = filmstrip.current;
    const item = strip?.querySelector<HTMLElement>(
      `[data-film-key="${CSS.escape(artifactVersionKey(selected))}"]`,
    );
    item?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [selected]);
  const copyPath = async (a: WallArtifact) => {
    try {
      await navigator.clipboard.writeText(a.path);
    } catch {
      setActionError("无法复制路径");
    }
  };
  const revisionKey = selected ? `${key}:${artifactVersionKey(selected)}` : "";
  const revisionNote = revisionNotes[revisionKey] ?? "";
  // Access IDs are renewed on every listing; match the file by its stable version instead.
  const currentSelected = selected
    ? artifacts.find((a) => artifactVersionKey(a) === artifactVersionKey(selected))
    : undefined;
  const selectedIsCurrent = currentSelected !== undefined;
  const requestRevision = () => {
    if (!revisionEnabled || !selected || !selectedIsCurrent || !onRevise || !revisionNote.trim())
      return;
    try {
      if (!onRevise(artifactRevisionPrompt(selected, revisionNote))) {
        setActionError("输入框暂不可用，修改意见已保留，请稍后重试。");
        return;
      }
      setRevisionNotes((notes) => ({ ...notes, [revisionKey]: "" }));
      setSelected(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "无法加入草稿，修改意见已保留。");
    }
  };
  const reveal = async (a: WallArtifact) => {
    const result = await openInEditor({
      environmentId,
      input: { cwd: a.path, editor: "file-manager", reveal: true },
    });
    if (result._tag === "Failure") setActionError("无法在 Finder 中显示此文件");
  };
  const attach = async (a: WallArtifact) => {
    setBusy(true);
    setActionError(null);
    await (async () => {
      try {
        const file = await fileFromArtifact(environmentId, a);
        onAttach([file]);
        setSelected(null);
      } catch (error) {
        setActionError(error instanceof Error ? error.message : "无法附加此文件");
      }
    })().finally(() => {
      setBusy(false);
    });
  };
  const openPage = (a: WallArtifact) =>
    window.open(artifactFileUrl(environmentId, a.id) ?? "", "_blank", "noopener,noreferrer");
  const dragArtifact = (event: React.DragEvent, a: WallArtifact) => {
    event.dataTransfer.setData(ARTIFACT_DRAG_TYPE, JSON.stringify({ environmentId, artifact: a }));
    event.dataTransfer.effectAllowed = "copy";
  };
  // Check status and size are detail: they live in the hover text, not in the layout.
  const artifactTooltip = (a: WallArtifact) => (
    <span className="flex max-w-64 flex-col gap-0.5">
      <span className="break-all">{a.name}</span>
      <span className="text-muted-foreground">
        {a.width && a.height ? `${a.width}×${a.height}` : `${Math.ceil(a.sizeBytes / 1024)} KB`}
        {" · "}
        {artifactCheckLabel(a)}
      </span>
      <span className="text-muted-foreground">
        {a.verification?.label
          ? `${a.verification.label} · ${a.verification.checkedAt ?? ""}。此项为检查命令记录，不代表用户验收或已部署。`
          : "文件存在不代表检查通过。完成检查后，由 Agent 关联相应执行记录。"}
      </span>
    </span>
  );
  const thumb = (a: WallArtifact, className: string) =>
    a.kind === "image" ? (
      <img
        src={artifactFileUrl(environmentId, a.id) ?? undefined}
        alt={a.name}
        loading="lazy"
        decoding="async"
        className={className}
      />
    ) : isArtifactVideo(a) ? (
      <video
        src={`${artifactFileUrl(environmentId, a.id) ?? ""}#t=0.1`}
        preload="metadata"
        muted
        playsInline
        aria-label={`视频缩略图 ${a.name}`}
        className={className}
        onLoadedMetadata={(event) => {
          const duration = event.currentTarget.duration;
          if (Number.isFinite(duration))
            setDurations((values) =>
              values[a.id] === duration ? values : { ...values, [a.id]: duration },
            );
        }}
      />
    ) : (
      <div
        className={`${className} flex items-center justify-center bg-muted text-muted-foreground`}
      >
        {a.kind === "page" ? <GlobeIcon className="size-6" /> : <FileIcon className="size-6" />}
      </div>
    );
  if (!active) return null;
  return (
    <section aria-label="产物" className="min-w-0 px-3 pt-2 pb-2" data-artifact-wall>
      <div className="mb-2 flex min-w-0 items-center justify-end gap-1">
        <div className="flex gap-1" aria-label="产物范围">
          {(
            [
              ["thread", "本会话"],
              ["project", "本项目"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              size="xs"
              variant={scope === value ? "secondary" : "ghost"}
              aria-pressed={scope === value}
              onClick={() => {
                setScope(value);
                setFilter("all");
              }}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      {!(state.key === key && state.error && artifacts.length === 0) && (
        <div className="mb-2 flex flex-nowrap gap-0.5" aria-label="产物类型">
          {(
            [
              ["all", "全部"],
              ["image", "图片"],
              ["video", "视频"],
              ["page", "页面"],
              ["document", "文档"],
            ] as const
          )
            .filter(([value]) => value === "all" || counts[value] > 0)
            .map(([value, label]) => (
              <Button
                size="micro"
                variant={filter === value ? "secondary" : "ghost"}
                key={value}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label} {counts[value]}
              </Button>
            ))}
        </div>
      )}
      {actionError ? (
        <p role="alert" className="mb-2 text-2xs text-destructive">
          {actionError}
        </p>
      ) : null}
      <div
        ref={scrollRoot}
        className="max-h-[min(52dvh,28rem)] min-w-0 overflow-y-auto overscroll-contain"
        data-artifact-scroll
      >
        {state.key !== key || state.loading ? (
          <p className="py-2 text-2xs text-muted-foreground">正在读取产物…</p>
        ) : state.error ? (
          <div className="py-2">
            <p role="alert" className="text-2xs text-muted-foreground">
              {state.error}
            </p>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                setState((current) => ({ ...current, loading: true, error: null }));
                setRetry((n) => n + 1);
              }}
            >
              重试
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-2 text-2xs text-muted-foreground">
            {artifacts.length
              ? "没有此类产物"
              : scope === "thread"
                ? "这个会话还没有产物"
                : "这个项目还没有产物"}
          </p>
        ) : null}
        {groups.map((group) => {
          const isMedia = (a: WallArtifact) => a.kind === "image" || isArtifactVideo(a);
          const media = group.artifacts.filter(isMedia);
          const files = group.artifacts.filter((a) => !isMedia(a));
          return (
            <div key={group.label}>
              <p className="my-2 text-2xs text-muted-foreground">{group.label}</p>
              {media.length > 0 ? (
                <div
                  className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2"
                  data-artifact-media-grid
                >
                  {media.map((a) => {
                    const isPicked = picked.includes(a.id);
                    return (
                      <div
                        key={a.id}
                        className="group min-w-0"
                        draggable
                        onDragStart={(event) => dragArtifact(event, a)}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          setMenuFor(a.id);
                        }}
                        data-artifact-id={a.id}
                      >
                        <div
                          className={cn(
                            "relative aspect-square overflow-hidden rounded-lg border border-border bg-muted",
                            isPicked && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                          )}
                        >
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <button
                                  type="button"
                                  aria-label={
                                    isArtifactVideo(a) ? `播放 ${a.name}` : `查看 ${a.name}`
                                  }
                                  className="block size-full cursor-zoom-in"
                                  onClick={(event) => {
                                    if (a.kind === "image" && (event.metaKey || event.ctrlKey)) {
                                      togglePick(a);
                                      return;
                                    }
                                    compare(a);
                                  }}
                                />
                              }
                            >
                              {thumb(
                                a,
                                "size-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]",
                              )}
                            </TooltipTrigger>
                            <TooltipPopup>{artifactTooltip(a)}</TooltipPopup>
                          </Tooltip>
                          {a.kind === "image" ? (
                            <button
                              type="button"
                              aria-label={
                                isPicked ? `取消选择 ${a.name}` : `选择 ${a.name} 用于对比`
                              }
                              aria-pressed={isPicked}
                              onClick={() => togglePick(a)}
                              className={cn(
                                "absolute top-1.5 left-1.5 flex size-5 items-center justify-center rounded-full border-2 text-white shadow-sm transition-opacity focus-visible:opacity-100",
                                isPicked
                                  ? "border-primary bg-primary text-primary-foreground opacity-100"
                                  : "border-white/90 bg-black/25 opacity-0 group-hover:opacity-100",
                              )}
                            >
                              {isPicked ? <CheckIcon className="size-3" strokeWidth={3} /> : null}
                            </button>
                          ) : null}
                          {isArtifactVideo(a) ? (
                            <span className="pointer-events-none absolute right-1.5 bottom-1.5 rounded bg-black/60 px-1 text-2xs text-white">
                              ▶{" "}
                              {durations[a.id] !== undefined
                                ? artifactVideoDuration(durations[a.id]!)
                                : a.extension.toUpperCase()}
                            </span>
                          ) : null}
                          <Menu
                            open={menuFor === a.id}
                            onOpenChange={(open) => setMenuFor(open ? a.id : null)}
                          >
                            <MenuTrigger
                              render={
                                <button
                                  type="button"
                                  aria-label={`更多操作 ${a.name}`}
                                  className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100"
                                />
                              }
                            >
                              <MoreHorizontalIcon className="size-3.5" />
                            </MenuTrigger>
                            <MenuPopup align="end">
                              <MenuItem onClick={() => void attach(a)}>附加到输入框</MenuItem>
                              <MenuItem onClick={() => void reveal(a)}>在 Finder 中显示</MenuItem>
                              <MenuItem onClick={() => void copyPath(a)}>复制路径</MenuItem>
                              {a.kind === "image" ? (
                                <MenuItem onClick={() => togglePick(a)}>
                                  {isPicked ? "取消对比选择" : "选来对比"}
                                </MenuItem>
                              ) : null}
                            </MenuPopup>
                          </Menu>
                        </div>
                        <p className="mt-1 truncate text-2xs text-muted-foreground">{a.name}</p>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {files.length > 0 ? (
                <ul className={cn("flex flex-col", media.length > 0 && "mt-1.5")}>
                  {files.map((a) => (
                    <li
                      key={a.id}
                      className="group flex min-w-0 items-center gap-1 rounded-md px-1 hover:bg-accent/50 focus-within:bg-accent/50"
                      draggable
                      onDragStart={(event) => dragArtifact(event, a)}
                      data-artifact-id={a.id}
                    >
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <button
                              type="button"
                              aria-label={`打开 ${a.name}`}
                              className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1 text-left outline-hidden focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
                              onClick={() => (a.kind === "page" ? openPage(a) : void reveal(a))}
                            />
                          }
                        >
                          <Badge size="sm" variant="secondary">
                            {a.extension.toUpperCase()}
                          </Badge>
                          <span className="min-w-0 flex-1 truncate text-xs">{a.name}</span>
                          <span className="shrink-0 text-2xs text-muted-foreground group-hover:hidden group-focus-within:hidden">
                            {new Date(a.modifiedAt ?? a.createdAt).toLocaleTimeString("zh-CN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </TooltipTrigger>
                        <TooltipPopup>{artifactTooltip(a)}</TooltipPopup>
                      </Tooltip>
                      <Button
                        size="xs"
                        variant="ghost"
                        className="hidden shrink-0 group-hover:inline-flex group-focus-within:inline-flex"
                        onClick={() => (a.kind === "page" ? openPage(a) : void reveal(a))}
                        aria-label={
                          a.kind === "page"
                            ? `打开 ${a.name}`
                            : uiText("在 Finder 中显示 {0}", { "0": a.name })
                        }
                      >
                        {a.kind === "page" ? "打开" : "Finder"}
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
        {visible < filtered.length ? (
          <div ref={loadMore} className="py-2">
            <Button size="xs" variant="ghost" onClick={() => setVisible((n) => n + 40)}>
              加载更多
            </Button>
          </div>
        ) : null}
      </div>
      {picked.length > 0 ? (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-full border border-border bg-background/90 py-1 pr-1 pl-3 text-xs shadow-sm backdrop-blur">
          <span>
            已选 {picked.length} 张{picked.length < 2 ? " · 再选 1 张即可对比" : ""}
          </span>
          <span className="flex gap-1">
            <Button size="xs" variant="ghost" onClick={() => setPicked([])}>
              取消
            </Button>
            <Button size="xs" disabled={picked.length !== 2} onClick={openPickedCompare}>
              对比
            </Button>
          </span>
        </div>
      ) : null}
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogPopup
          variant="media"
          showCloseButton={false}
          className="h-[80dvh] w-full max-w-5xl"
          aria-describedby={undefined}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-lg bg-background p-4 text-foreground">
            <div className="flex min-w-0 items-center gap-2">
              <DialogTitle className="min-w-0 flex-1">
                <span className="block truncate">{selected?.name}</span>
              </DialogTitle>
              {selectedImageIndex >= 0 && images.length > 1 ? (
                <span className="hidden shrink-0 text-2xs text-muted-foreground sm:inline">
                  ← → 切换 · ⇧ 点胶片对比
                </span>
              ) : null}
              <Button size="xs" variant="ghost" onClick={() => setSelected(null)}>
                <XIcon className="size-3" />
                Esc 关闭
              </Button>
            </div>
            {selected && !selectedIsCurrent ? (
              <p role="alert" className="text-xs text-muted-foreground">
                文件已更新或移除。请关闭预览，再打开最新版本。
              </p>
            ) : null}
            {selected ? (
              <>
                {isArtifactVideo(selected) ? (
                  <div
                    className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-muted"
                    data-artifact-player
                  >
                    <video
                      key={selected.id}
                      src={
                        artifactFileUrl(environmentId, currentSelected?.id ?? selected.id) ??
                        undefined
                      }
                      controls
                      playsInline
                      preload="metadata"
                      className="size-full object-contain"
                      aria-label={`播放 ${selected.name}`}
                    />
                  </div>
                ) : (
                  <div
                    className="group/artifact-compare relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-muted"
                    data-artifact-compare
                  >
                    {selectedImageIndex >= 0 && images.length > 1 ? (
                      <>
                        <button
                          type="button"
                          aria-label="上一张"
                          onClick={() => stepImage(-1)}
                          className="absolute top-1/2 left-3 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-background/75 text-foreground shadow-sm backdrop-blur-md transition hover:bg-background"
                        >
                          <ChevronLeftIcon className="size-4" />
                        </button>
                        <button
                          type="button"
                          aria-label="下一张"
                          onClick={() => stepImage(1)}
                          className="absolute top-1/2 right-3 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-background/75 text-foreground shadow-sm backdrop-blur-md transition hover:bg-background"
                        >
                          <ChevronRightIcon className="size-4" />
                        </button>
                        <span className="pointer-events-none absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/55 px-2 py-0.5 text-2xs text-white tabular-nums">
                          {selectedImageIndex + 1} / {images.length}
                        </span>
                      </>
                    ) : null}
                    {comparison ? (
                      <img
                        src={artifactFileUrl(environmentId, comparison.id) ?? undefined}
                        alt={comparison.name}
                        className="absolute inset-0 size-full object-contain"
                        style={{
                          clipPath:
                            compareMode === "slider" ? `inset(0 ${100 - split}% 0 0)` : undefined,
                          visibility: compareMode === "b" ? "hidden" : "visible",
                        }}
                      />
                    ) : null}
                    <img
                      key={artifactVersionKey(selected)}
                      src={
                        artifactFileUrl(environmentId, currentSelected?.id ?? selected.id) ??
                        undefined
                      }
                      alt={selected.name}
                      className="artifact-viewer-image absolute inset-0 size-full object-contain"
                      style={
                        comparison
                          ? {
                              clipPath:
                                compareMode === "slider" ? `inset(0 0 0 ${split}%)` : undefined,
                              visibility: compareMode === "a" ? "hidden" : "visible",
                            }
                          : undefined
                      }
                    />
                    {comparison && compareMode === "slider" ? (
                      <>
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-y-0 w-px bg-background/95 ring-1 ring-inset ring-border"
                          style={{ left: `${split}%` }}
                        />
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          value={split}
                          onChange={(e) => setSplit(Number(e.target.value))}
                          aria-label="拖动中线对比"
                          aria-valuetext={`对比图 ${split}%，当前图 ${100 - split}%`}
                          className="absolute inset-0 size-full cursor-ew-resize opacity-0"
                        />
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute top-1/2 flex size-8 items-center justify-center rounded-full border border-border/60 bg-background/90 text-foreground shadow-sm backdrop-blur-md group-focus-within/artifact-compare:ring-2 group-focus-within/artifact-compare:ring-inset group-focus-within/artifact-compare:ring-ring"
                          style={{ left: `${split}%`, transform: "translate(-50%, -50%)" }}
                        >
                          <ChevronLeftIcon className="size-3.5" strokeWidth={1.5} />
                          <ChevronRightIcon className="-ml-1 size-3.5" strokeWidth={1.5} />
                        </span>
                      </>
                    ) : null}
                  </div>
                )}
                {comparison ? (
                  <div
                    role="group"
                    aria-label="图片对比方式"
                    className="mx-auto flex shrink-0 items-center gap-0.5 rounded-full bg-secondary p-0.5"
                  >
                    {(
                      [
                        ["single", "单图"],
                        ["slider", "滑动对比"],
                        ["a", "A 全图"],
                        ["b", "B 全图"],
                      ] as const
                    ).map(([mode, label]) => {
                      const on = mode !== "single" && compareMode === mode;
                      return (
                        <button
                          type="button"
                          key={mode}
                          aria-pressed={on}
                          onClick={() =>
                            mode === "single" ? setComparison(null) : setCompareMode(mode)
                          }
                          className={cn(
                            "rounded-full px-3 py-1 text-xs transition",
                            on
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                {comparison ? (
                  <div className="flex justify-between gap-2 text-2xs text-muted-foreground">
                    <span className="truncate">A · {comparison.name}</span>
                    <span className="truncate">B · {selected.name}</span>
                  </div>
                ) : null}
                {!isArtifactVideo(selected) && (
                  <div
                    ref={filmstrip}
                    className="artifact-filmstrip flex shrink-0 gap-2 overflow-x-auto rounded-xl bg-secondary/70 p-2"
                    aria-label="图片胶片条"
                    onScroll={(e) => {
                      if (
                        e.currentTarget.scrollLeft + e.currentTarget.clientWidth >=
                        e.currentTarget.scrollWidth - 40
                      )
                        setThumbCount((n) => n + 40);
                    }}
                  >
                    {images.slice(0, thumbCount).map((a) => {
                      const isCurrent = artifactVersionKey(a) === artifactVersionKey(selected);
                      const isComparison =
                        comparison !== null &&
                        artifactVersionKey(a) === artifactVersionKey(comparison);
                      return (
                        <button
                          type="button"
                          key={a.id}
                          data-film-key={artifactVersionKey(a)}
                          className={cn(
                            "size-12 shrink-0 overflow-hidden rounded-lg transition duration-150",
                            isCurrent
                              ? "scale-105 opacity-100 ring-2 ring-primary ring-offset-2 ring-offset-secondary"
                              : isComparison
                                ? "opacity-95 outline-2 -outline-offset-2 outline-dashed outline-primary"
                                : "opacity-60 hover:opacity-100",
                          )}
                          aria-label={`查看 ${a.name}（按住 Shift 或 Option 点击设为对比图）`}
                          aria-current={isCurrent ? "true" : undefined}
                          onClick={(event) => {
                            if (event.shiftKey || event.altKey) {
                              if (isCurrent) return;
                              setComparison(a);
                              setCompareMode("slider");
                              return;
                            }
                            setSelected(a);
                            if (isComparison) setComparison(null);
                          }}
                        >
                          {thumb(a, "size-full object-cover")}
                        </button>
                      );
                    })}
                  </div>
                )}
                {actionError ? (
                  <p role="alert" className="text-xs text-destructive">
                    {actionError}
                  </p>
                ) : null}
                {revisionEnabled && selected.kind === "image" && onRevise ? (
                  <div className="flex shrink-0 flex-col gap-2">
                    <label htmlFor="artifact-revision-note" className="text-xs">
                      修改意见
                    </label>
                    <textarea
                      id="artifact-revision-note"
                      rows={2}
                      maxLength={8000}
                      className="w-full resize-y rounded-md border border-border bg-background p-2 text-sm"
                      placeholder="例如：修正人物右手边缘，保留构图和其他区域。"
                      value={revisionNote}
                      onChange={(event) => {
                        const note = event.currentTarget.value;
                        setRevisionNotes((notes) => ({ ...notes, [revisionKey]: note }));
                      }}
                    />
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        加入当前会话草稿后发送；完成后选择两张图片对比。
                      </span>
                      <Button
                        size="sm"
                        disabled={!selectedIsCurrent || !revisionNote.trim()}
                        onClick={requestRevision}
                      >
                        加入返工草稿
                      </Button>
                    </div>
                  </div>
                ) : null}
                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => void reveal(selected)}>
                    在 Finder 中显示
                  </Button>
                  <Button size="sm" disabled={busy} onClick={() => void attach(selected)}>
                    {busy ? "正在附加…" : "附加到输入框"}
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        </DialogPopup>
      </Dialog>
    </section>
  );
}
