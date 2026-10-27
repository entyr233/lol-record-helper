import { onScopeDispose, ref, type Ref } from "vue";
import { lolBattleApi } from "../api/client";
import { isAbortError } from "../api/errors";
import type { BattleSummary, RqOptions } from "../api/types";

const PAGE_SIZE = 10;

export interface BattleListState {
  battles: Ref<BattleSummary[]>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
  hasMore: Ref<boolean>;
  selectedGameId: Ref<string | null>;
  loadMore: () => Promise<void>;
  select: (gameId: string) => void;
}

/**
 * 对局列表分页。
 * 关键修复：offset 用「服务端已消费条数」而不是「去重后的本地长度」，
 * 否则服务端返回重复 game_id 时会跳页/漏页。
 */
export function useBattleList(rqOptions: () => RqOptions): BattleListState {
  const battles = ref<BattleSummary[]>([]);
  const loading = ref(false);
  const error = ref<Error | null>(null);
  const hasMore = ref(true);
  const selectedGameId = ref<string | null>(null);
  const seen = new Set<string>();
  let serverOffset = 0;
  let inflight = false;
  let disposed = false;
  let controller: AbortController | null = null;

  onScopeDispose(() => {
    disposed = true;
    controller?.abort();
    loading.value = false;
  });

  async function loadMore(): Promise<void> {
    if (disposed || inflight) return;
    if (!hasMore.value) return;
    inflight = true;
    loading.value = true;
    error.value = null;
    const currentController = new AbortController();
    controller = currentController;
    try {
      const page = await lolBattleApi.getBattleList(rqOptions(), { count: PAGE_SIZE, offset: serverOffset }, { signal: currentController.signal });
      // A transport/mock may still settle after abort; disposed scopes must stay unchanged.
      if (disposed || currentController.signal.aborted) return;
      serverOffset += page.length;
      if (page.length < PAGE_SIZE) hasMore.value = false;
      for (const item of page) {
        if (seen.has(item.game_id)) continue;
        seen.add(item.game_id);
        battles.value.push(item);
      }
      if (selectedGameId.value === null && battles.value.length > 0) {
        selectedGameId.value = battles.value[0].game_id;
      }
      if (page.length === 0) hasMore.value = false;
    } catch (err) {
      if (!disposed && !currentController.signal.aborted && !isAbortError(err)) error.value = err as Error;
    } finally {
      inflight = false;
      controller = null;
      if (!disposed) loading.value = false;
    }
  }

  function select(gameId: string): void {
    selectedGameId.value = gameId;
  }

  return { battles, loading, error, hasMore, selectedGameId, loadMore, select };
}
