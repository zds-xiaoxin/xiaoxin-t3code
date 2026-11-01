import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import type { inboxReason } from "../../workbenchInbox";

export function InboxStatusMark({
  reason,
}: {
  reason: NonNullable<ReturnType<typeof inboxReason>>;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            role="img"
            aria-label={reason}
            className={`inline-flex w-2 shrink-0 items-center justify-center text-xs ${reason === "运行失败" ? "text-destructive" : reason === "有新结果" ? "text-muted-foreground" : "text-primary"}`}
          >
            {reason === "运行失败" ? "▲" : reason === "有新结果" ? "○" : "●"}
          </span>
        }
      />
      <TooltipPopup side="right">{reason}</TooltipPopup>
    </Tooltip>
  );
}
