import {
  resolveProviderInstanceEnabled,
  type ProviderInstanceConfig,
  type ProviderInstanceId,
  type ServerSettings,
  type ServerSettingsPatch,
} from "@t3tools/contracts";
import { ArrowDownIcon, ArrowUpIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { FoldedSettingsSection } from "./FoldedSettingsSection";
import { SettingsRow } from "./settingsLayout";

export function ProviderFallbackSettings({
  settings,
  instances,
  selectedInstanceId,
  canWriteSettings,
  canManageProviders,
  onUpdate,
  onUpdateInstance,
}: {
  readonly settings: Pick<ServerSettings, "providerFallbackEnabled" | "providerFallbackChains">;
  readonly instances: ReadonlyArray<{
    readonly instanceId: ProviderInstanceId;
    readonly label: string;
    readonly instance: ProviderInstanceConfig;
  }>;
  readonly selectedInstanceId?: ProviderInstanceId | undefined;
  readonly canWriteSettings: boolean;
  readonly canManageProviders: boolean;
  readonly onUpdate: (patch: ServerSettingsPatch) => void;
  readonly onUpdateInstance: (id: ProviderInstanceId, instance: ProviderInstanceConfig) => void;
}) {
  const [selected, setSelected] = useState<ProviderInstanceId | null>(null);
  const source =
    instances.find((instance) => instance.instanceId === selected) ??
    instances.find((instance) => instance.instanceId === selectedInstanceId) ??
    instances[0];
  const chain =
    source === undefined ? [] : (settings.providerFallbackChains[source.instanceId] ?? []);
  const label = (id: ProviderInstanceId) =>
    instances.find((instance) => instance.instanceId === id)?.label ?? id;
  const updateChain = (next: ReadonlyArray<ProviderInstanceId>) => {
    if (source === undefined) return;
    onUpdate({
      providerFallbackChains: { ...settings.providerFallbackChains, [source.instanceId]: next },
    });
  };
  const available = instances.filter(
    ({ instanceId, instance }) =>
      instanceId !== source?.instanceId &&
      !chain.includes(instanceId) &&
      resolveProviderInstanceEnabled(instance),
  );
  const move = (index: number, offset: number) => {
    const next = [...chain];
    [next[index], next[index + offset]] = [next[index + offset]!, next[index]!];
    updateChain(next);
  };
  return (
    <FoldedSettingsSection
      id="provider-fallback"
      title="额度用完自动切换"
      summary={settings.providerFallbackEnabled ? "开启" : "关闭"}
      control={
        <Switch
          aria-label="额度用完自动切换"
          checked={settings.providerFallbackEnabled}
          disabled={!canWriteSettings}
          onCheckedChange={(providerFallbackEnabled) => onUpdate({ providerFallbackEnabled })}
        />
      }
    >
      <p className="px-3 py-2.5 text-xs text-muted-foreground sm:px-4">
        仅在额度用完或限流时重试当前消息；切换后继续使用新通道。跨通道沿用现有历史交接，可能受上下文预算限制。
      </p>
      {source ? (
        <>
          <SettingsRow
            title="当前通道"
            description="为每个通道设置备用顺序。首次未匹配到同名模型时，使用备用通道的默认模型。"
          >
            <Select
              value={source.instanceId}
              items={instances.map(({ instanceId, label }) => ({ value: instanceId, label }))}
              onValueChange={setSelected}
            >
              <SelectTrigger aria-label="配置备用通道的来源">
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                {instances.map(({ instanceId, label, instance }) => (
                  <SelectItem key={instanceId} value={instanceId}>
                    {label}
                    {instance.billingMode === "metered" ? " · 按量计费" : ""}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </SettingsRow>
          <SettingsRow
            title="按量计费"
            description={`将 ${source.label} 标为付费 API，选择备用通道时显示费用标签。`}
          >
            <Switch
              aria-label={`${source.label} 按量计费`}
              checked={source.instance.billingMode === "metered"}
              disabled={!canManageProviders}
              onCheckedChange={(metered) =>
                onUpdateInstance(source.instanceId, {
                  ...source.instance,
                  billingMode: metered ? "metered" : "subscription",
                })
              }
            />
          </SettingsRow>
          {chain.map((id, index) => (
            <SettingsRow
              key={id}
              title={
                <span className="inline-flex items-center gap-2">
                  <span className="text-muted-foreground">{index + 1}.</span> {label(id)}
                  {instances.find((instance) => instance.instanceId === id)?.instance
                    .billingMode === "metered" ? (
                    <Badge variant="warning" size="sm">
                      按量计费
                    </Badge>
                  ) : null}
                </span>
              }
            >
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost-muted"
                  size="icon-xs"
                  aria-label={`上移 ${label(id)}`}
                  disabled={!canWriteSettings || index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUpIcon />
                </Button>
                <Button
                  variant="ghost-muted"
                  size="icon-xs"
                  aria-label={`下移 ${label(id)}`}
                  disabled={!canWriteSettings || index === chain.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDownIcon />
                </Button>
                <Button
                  variant="ghost-muted"
                  size="icon-xs"
                  aria-label={`移除 ${label(id)}`}
                  disabled={!canWriteSettings}
                  onClick={() => updateChain(chain.filter((_, i) => i !== index))}
                >
                  <XIcon />
                </Button>
              </div>
            </SettingsRow>
          ))}
          <SettingsRow
            title={chain.length === 0 ? "尚未设置备用通道" : "添加备用通道"}
            description="按顺序尝试，每轮每个通道最多一次；全部耗尽时保留原错误。"
          >
            <Select<ProviderInstanceId>
              value={null}
              items={available.map(({ instanceId, label, instance }) => ({
                value: instanceId,
                label: `${label}${instance.billingMode === "metered" ? " · 按量计费" : ""}`,
              }))}
              disabled={!canWriteSettings || available.length === 0}
              onValueChange={(id) => {
                if (id !== null) updateChain([...chain, id]);
              }}
            >
              <SelectTrigger aria-label="添加备用通道">
                <SelectValue placeholder="选择备用通道" />
              </SelectTrigger>
              <SelectPopup>
                {available.map(({ instanceId, label, instance }) => (
                  <SelectItem key={instanceId} value={instanceId}>
                    {label}
                    {instance.billingMode === "metered" ? " · 按量计费" : ""}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </SettingsRow>
        </>
      ) : null}
    </FoldedSettingsSection>
  );
}
