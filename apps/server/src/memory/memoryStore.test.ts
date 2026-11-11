import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { MemoryState, ProjectId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as ServerConfig from "../config.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as ManagedPolicy from "../policy/ManagedPolicy.ts";
import * as SqlitePersistence from "../persistence/Sqlite.ts";

const decodeDiskMemory = Schema.decodeSync(
  Schema.fromJsonString(Schema.Struct({ memory: MemoryState })),
);

const storeLayer = ServerSettings.layer.pipe(
  Layer.provide(ServerSecretStore.layer),
  Layer.provide(ManagedPolicy.layerTest()),
  Layer.provideMerge(Layer.fresh(SqlitePersistence.layerMemory)),
  Layer.provideMerge(Layer.fresh(ServerConfig.layerTest(process.cwd(), { prefix: "t3-memory-" }))),
);

it.layer(Layer.mergeAll(NodeServices.layer, NodeCrypto.layer))(
  "memory settings persistence",
  (it) => {
    it.effect("durably serializes proposals and user CRUD without unapproved changes", () =>
      Effect.gen(function* () {
        const service = yield* ServerSettings.ServerSettingsService;
        const fs = yield* FileSystem.FileSystem;
        const config = yield* ServerConfig.ServerConfig;
        const disk = fs
          .readFileString(config.settingsPath)
          .pipe(Effect.map((raw) => decodeDiskMemory(raw).memory));
        const threadId = ThreadId.make("thread-test");
        const scope = { kind: "project", projectId: ProjectId.make("project-test") } as const;
        yield* Effect.forEach(
          ["One", "Two"],
          (text) => service.updateSettings({}, { type: "propose", text, scope, threadId }),
          { concurrency: "unbounded" },
        );
        let stored = yield* disk;
        assert.equal(stored.approved.length, 0);
        assert.equal(stored.pending.length, 2);
        const first = stored.pending[0]!;
        const second = stored.pending[1]!;
        yield* service.updateSettings({}, { type: "reject", id: first.id });
        assert.equal((yield* disk).approved.length, 0);
        yield* service.updateSettings(
          {},
          { type: "approve", id: second.id, text: "Reviewed fact" },
        );
        stored = yield* disk;
        assert.equal(stored.pending.length, 0);
        assert.equal(stored.approved[0]!.text, "Reviewed fact");
        assert.deepEqual(stored.approved[0]!.source, { kind: "agent-proposed", threadId });
        yield* service.updateSettings(
          {},
          { type: "edit", id: second.id, text: "Edited by user", scope: { kind: "global" } },
        );
        assert.equal((yield* disk).approved[0]!.text, "Edited by user");
        yield* service.updateSettings({}, { type: "delete", id: second.id });
        yield* service.updateSettings({}, { type: "add", text: "Direct user fact", scope });
        stored = yield* disk;
        assert.equal(stored.approved[0]!.text, "Direct user fact");
        assert.deepEqual(stored.approved[0]!.source, { kind: "user" });
        const missingApproval = yield* service
          .updateSettings({}, { type: "approve", id: "missing" })
          .pipe(Effect.flip);
        assert.equal(missingApproval._tag, "ServerSettingsError");
        assert.deepEqual(yield* disk, stored);
      }).pipe(Effect.provide(storeLayer)),
    );
  },
);
