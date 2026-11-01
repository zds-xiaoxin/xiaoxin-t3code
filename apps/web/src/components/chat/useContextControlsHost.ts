import { useLayoutEffect, useRef } from "react";

// Both composer layouts stay mounted during transitions. Publish only the visible host.
export function useContextControlsHost(
  collapsed: boolean,
  onChange?: (node: HTMLDivElement | null) => void,
) {
  const collapsedHostRef = useRef<HTMLDivElement>(null);
  const expandedHostRef = useRef<HTMLDivElement>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Publish the visible DOM host after refs commit and clear it on layout change or unmount.
  useLayoutEffect(() => {
    onChange?.(collapsed ? collapsedHostRef.current : expandedHostRef.current);
    return () => onChange?.(null);
  }, [collapsed, onChange]);
  return { collapsedHostRef, expandedHostRef };
}
