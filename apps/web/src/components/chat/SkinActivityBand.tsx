import { useEffect, useState } from "react";

const SKIN_ACTIVITY_STORAGE_KEY = "t3code:skin-activity:v1";

function activityEnabled(): boolean {
  try {
    return localStorage.getItem(SKIN_ACTIVITY_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

type Phase = "hidden" | "working" | "done" | "leaving";

/** How long the completion mark stays before the strip eases out, and the ease-out itself. */
const DONE_HOLD_MS = 1400;
const LEAVE_MS = 280;

/**
 * A thin themed strip above the composer. It exists only while the thread works, then shows a
 * drawn check, eases out, and unmounts — an idle thread runs no animation at all. It never takes
 * layout space or pointer events; each skin styles its effect in skins.css.
 */
export function SkinActivityBand(props: {
  readonly working: boolean;
  readonly subagentsSettled: number;
  readonly subagentsTotal: number;
}) {
  const { working, subagentsSettled, subagentsTotal } = props;
  const [phase, setPhase] = useState<Phase>(working ? "working" : "hidden");
  const [previousWorking, setPreviousWorking] = useState(working);
  // Adjust during render when the run starts or finishes (React's pattern for prop transitions).
  if (previousWorking !== working) {
    setPreviousWorking(working);
    setPhase(working ? "working" : phase === "hidden" ? "hidden" : "done");
  }
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Completion hold and ease-out run on timers.
  useEffect(() => {
    if (phase !== "done" && phase !== "leaving") return;
    const timer = window.setTimeout(
      () => setPhase(phase === "done" ? "leaving" : "hidden"),
      phase === "done" ? DONE_HOLD_MS : LEAVE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [phase]);
  if (phase === "hidden" || !activityEnabled()) return null;
  const total = Math.min(subagentsTotal, 12);
  const settled = Math.min(subagentsSettled, subagentsTotal);
  const label =
    phase === "working"
      ? subagentsTotal > 0
        ? `工作中 · 子任务 ${settled}/${subagentsTotal}`
        : "工作中"
      : "完成";
  return (
    <div className="skin-activity-anchor" aria-hidden="true">
      <div className="skin-activity-band" data-state={phase}>
        <span className="skin-activity-fx" />
        <span className="skin-activity-label">
          {label}
          {phase === "working" ? (
            <span className="skin-activity-glint">
              <span>{label}</span>
            </span>
          ) : null}
        </span>
        {total > 0 ? (
          <span className="skin-activity-rail">
            {Array.from({ length: total }, (_, index) => (
              <i
                key={index}
                data-done={index < settled ? "" : undefined}
                data-current={phase === "working" && index === settled ? "" : undefined}
              />
            ))}
          </span>
        ) : null}
        <svg className="skin-activity-done" viewBox="0 0 16 16" width="14" height="14">
          <path d="M3.5 8.5l3 3 6-7" />
        </svg>
      </div>
    </div>
  );
}
