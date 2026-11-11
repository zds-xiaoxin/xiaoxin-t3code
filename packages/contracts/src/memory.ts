import * as Schema from "effect/Schema";
import { ProjectId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";

export const MemoryScope = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("global") }),
  Schema.Struct({ kind: Schema.Literal("project"), projectId: ProjectId }),
]);
export type MemoryScope = typeof MemoryScope.Type;
export const MemoryText = TrimmedNonEmptyString.check(Schema.isMaxLength(500));
export const MemoryEntry = Schema.Struct({
  id: TrimmedNonEmptyString,
  text: MemoryText,
  scope: MemoryScope,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  source: Schema.Union([
    Schema.Struct({ kind: Schema.Literal("user") }),
    Schema.Struct({ kind: Schema.Literal("agent-proposed"), threadId: ThreadId }),
  ]),
});
export type MemoryEntry = typeof MemoryEntry.Type;
export const MemoryState = Schema.Struct({
  approved: Schema.Array(MemoryEntry).check(Schema.isMaxLength(1000)),
  pending: Schema.Array(MemoryEntry).check(Schema.isMaxLength(100)),
});
export type MemoryState = typeof MemoryState.Type;
export const UserMemoryMutation = Schema.Union([
  Schema.Struct({ type: Schema.Literal("add"), text: MemoryText, scope: MemoryScope }),
  Schema.Struct({
    type: Schema.Literal("edit"),
    id: TrimmedNonEmptyString,
    text: MemoryText,
    scope: MemoryScope,
  }),
  Schema.Struct({ type: Schema.Literal("delete"), id: TrimmedNonEmptyString }),
  Schema.Struct({
    type: Schema.Literal("approve"),
    id: TrimmedNonEmptyString,
    text: Schema.optionalKey(MemoryText),
    scope: Schema.optionalKey(MemoryScope),
  }),
  Schema.Struct({ type: Schema.Literal("reject"), id: TrimmedNonEmptyString }),
]);
export type UserMemoryMutation = typeof UserMemoryMutation.Type;
