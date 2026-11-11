import { useState, type ReactNode } from "react";
import { ArchiveIcon, PinIcon, PinOffIcon } from "lucide-react";
import { setProjectToolsInline, useProjectToolsInline } from "../../sidebarProjectFirst";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "../ui/popover";
import { SidebarMenuButton, SidebarMenuItem } from "../ui/sidebar";
import { HistorySyncButton } from "./HistorySyncButton";

interface ProjectToolsProps {
  openArchivedHistory: () => void;
  stickyProjects: ReactNode;
}

function ArchivedHistoryActions({
  openArchivedHistory,
  onDone,
}: {
  openArchivedHistory: () => void;
  onDone: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        size="xs"
        variant="ghost-muted"
        onClick={() => {
          onDone();
          openArchivedHistory();
        }}
      >
        已归档会话
      </Button>
      <HistorySyncButton />
    </div>
  );
}

/** The inline row above the project list, shown only when the user pins it there. */
export function SidebarProjectTools({ openArchivedHistory, stickyProjects }: ProjectToolsProps) {
  const inline = useProjectToolsInline();
  const [open, setOpen] = useState(false);
  if (!inline) return null;
  return (
    <div className="mb-1 flex items-center gap-1 px-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={<Button size="xs" variant="ghost-muted" />}>
          历史与归档
        </PopoverTrigger>
        <PopoverPopup side="right" align="start" width="sm" padding="compact">
          <PopoverTitle>历史与归档</PopoverTitle>
          <div className="mt-2">
            <ArchivedHistoryActions
              openArchivedHistory={openArchivedHistory}
              onDone={() => setOpen(false)}
            />
          </div>
        </PopoverPopup>
      </Popover>
      <Popover>
        <PopoverTrigger render={<Button size="xs" variant="ghost-muted" />}>
          项目工具
        </PopoverTrigger>
        <PopoverPopup side="right" align="start" width="sm" padding="compact">
          <PopoverTitle>项目工具</PopoverTitle>
          <div className="mt-2">{stickyProjects}</div>
        </PopoverPopup>
      </Popover>
    </div>
  );
}

/** Footer icon that always reaches 历史与归档 and 项目工具, and can pin them above the projects. */
export function SidebarArchiveMenuItem({ openArchivedHistory, stickyProjects }: ProjectToolsProps) {
  const inline = useProjectToolsInline();
  const [open, setOpen] = useState(false);
  return (
    <SidebarMenuItem className="shrink-0">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={<SidebarMenuButton aria-label="历史与归档" size="icon" />}>
          <ArchiveIcon />
        </PopoverTrigger>
        <PopoverPopup side="top" align="start" width="sm" padding="compact">
          <div className="flex items-center justify-between gap-2">
            <PopoverTitle>历史与归档</PopoverTitle>
            <Button
              size="xs"
              variant="ghost-muted"
              aria-pressed={inline}
              onClick={() => setProjectToolsInline(!inline)}
            >
              {inline ? <PinOffIcon /> : <PinIcon />}
              {inline ? "取消置顶" : "置顶"}
            </Button>
          </div>
          <div className="mt-2">
            <ArchivedHistoryActions
              openArchivedHistory={openArchivedHistory}
              onDone={() => setOpen(false)}
            />
          </div>
          <div className="mt-3 border-t pt-2">
            <PopoverTitle>项目工具</PopoverTitle>
            <div className="mt-2">{stickyProjects}</div>
          </div>
        </PopoverPopup>
      </Popover>
    </SidebarMenuItem>
  );
}
