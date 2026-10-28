import type { RequestOptions } from "./client";
import type { GetBattleDetailResponse, PlayerQueryParams } from "./types";

const TTL_MS = 15000;
const MAX_ENTRIES = 20;

interface PendingDetail {
  controller: AbortController;
  subscribers: number;
  promise: Promise<string>;
}

/** Only completed battle details are reused, never search/profile/report/list state. */
export function createDetailCache(load: (body: PlayerQueryParams & { game_id: string }, options: RequestOptions) => Promise<GetBattleDetailResponse>) {
  const cache = new Map<string, { expires: number; json: string }>();
  const pending = new Map<string, PendingDetail>();
  let generation = 0;

  return {
    clear() {
      generation += 1;
      cache.clear();
      // Existing subscribers keep their lifecycle; new requests must revalidate access.
      pending.clear();
    },
    get(playerParams: PlayerQueryParams, gameId: string, options: RequestOptions = {}): Promise<GetBattleDetailResponse> {
      const { signal, timeoutMs = 12000, retries = 1 } = options;
      if (signal?.aborted) return Promise.reject(new DOMException("aborted", "AbortError"));
      const body = { account_type: playerParams.account_type, area: playerParams.area, id: playerParams.id, from_src: playerParams.from_src, game_id: gameId };
      const key = JSON.stringify(body);
      const cached = cache.get(key);
      if (cached && cached.expires > Date.now()) return Promise.resolve(JSON.parse(cached.json));
      cache.delete(key);

      // Different timeout/retry policies must not inherit another caller's deadline.
      const pendingKey = JSON.stringify([key, timeoutMs, retries]);
      let entry = pending.get(pendingKey);
      if (!entry) {
        const controller = new AbortController();
        const version = generation;
        const created: PendingDetail = {
          controller,
          subscribers: 0,
          promise: load(body, { signal: controller.signal, timeoutMs, retries }).then((value) => {
            const json = JSON.stringify(value);
            if (!controller.signal.aborted && version === generation) {
              const now = Date.now();
              for (const [key, value] of cache) if (value.expires <= now) cache.delete(key);
              cache.delete(key);
              cache.set(key, { expires: now + TTL_MS, json });
              if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
            }
            return json;
          }).finally(() => {
            if (pending.get(pendingKey) === created) pending.delete(pendingKey);
          })
        };
        entry = created;
        pending.set(pendingKey, created);
      }
      const shared = entry;
      shared.subscribers += 1;
      return new Promise((resolve, reject) => {
        let settled = false;
        const detach = () => {
          settled = true;
          signal?.removeEventListener("abort", onAbort);
          shared.subscribers -= 1;
        };
        const onAbort = () => {
          detach();
          reject(new DOMException("aborted", "AbortError"));
          if (shared.subscribers === 0) {
            if (pending.get(pendingKey) === shared) pending.delete(pendingKey);
            shared.controller.abort();
          }
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        shared.promise.then((json) => {
          if (settled) return;
          detach();
          // Each subscriber/cache hit owns its data, so UI mutation cannot poison the cache.
          resolve(JSON.parse(json));
        }, (error: unknown) => {
          if (settled) return;
          detach();
          reject(error);
        });
      });
    }
  };
}
