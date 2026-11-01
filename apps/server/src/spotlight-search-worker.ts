import * as NodeWorkerThreads from "node:worker_threads";
import { SpotlightIndex } from "./orchestration-v2/spotlightSearchIndex.ts";
const index = new SpotlightIndex(
  NodeWorkerThreads.workerData.dbPath,
  NodeWorkerThreads.workerData.cachePath,
  NodeWorkerThreads.workerData.aliasesPath,
);
NodeWorkerThreads.parentPort!.on(
  "message",
  (request: { id: number; query: string; limit: number }) => {
    try {
      NodeWorkerThreads.parentPort!.postMessage({
        id: request.id,
        matches: index.search(request.query, request.limit),
      });
    } catch {
      NodeWorkerThreads.parentPort!.postMessage({
        id: request.id,
        error: "本地搜索索引暂不可用，请稍后重试。",
      });
    }
  },
);
