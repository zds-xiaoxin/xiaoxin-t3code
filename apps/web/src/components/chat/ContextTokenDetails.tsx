import { uiText } from "~/i18n";
import { formatContextWindowTokens } from "~/lib/contextWindow";

export function ContextTokenDetails({
  usage,
}: {
  usage: {
    readonly inputTokens?: number | null | undefined;
    readonly outputTokens?: number | null | undefined;
    readonly cachedInputTokens?: number | null | undefined;
    readonly cacheCreationTokens?: number | null | undefined;
  };
}) {
  const details = [
    [uiText("Input"), usage.inputTokens],
    [uiText("Output"), usage.outputTokens],
    [uiText("Cache read"), usage.cachedInputTokens],
    [uiText("Cache write"), usage.cacheCreationTokens],
  ] as const;
  if (!details.some(([, value]) => value != null)) return null;
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-2xs leading-4">
      {details.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between gap-2">
          <span className="text-secondary-label">{label}</span>
          <span className="font-medium tabular-nums text-secondary-label">
            {formatContextWindowTokens(value ?? null)}
          </span>
        </div>
      ))}
    </div>
  );
}
