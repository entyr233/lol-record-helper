import { computed, ref, type Ref } from "vue";
import { lolBattleApi } from "../api/client";
import type { BattleSummary, RqOptions } from "../api/types";

export const PAGE_SIZE = 10;

export interface BattleListState {
  battles: Ref<BattleSummary[]>;
  page: Ref<number>;
  hasPrev: Ref<boolean>;
  hasNext: Ref<boolean>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
  selectedGameId: Ref<string | null>;
  goToPage: (n: number) => Promise<void>;
  select: (gameId: string) => void;
}

/**
 * 对局列表：翻页制（上一页/下一页），每页 PAGE_SIZE 条。
 * offset 按页号计算；服务端返回不足一页即视为没有下一页。
 */
export function useBattleList(rqOptions: () => RqOptions): BattleListState {
  const battles = ref<BattleSummary[]>([]);
  const page = ref(1);
  const hasNext = ref(true);
  const loading = ref(false);
  const error = ref<Error | null>(null);
  const selectedGameId = ref<string | null>(null);
  let inflight = false;

  const hasPrev = computed(() => page.value > 1);

  async function goToPage(n: number): Promise<void> {
    if (inflight) return;
    if (n < 1) return;
    if (n > page.value && !hasNext.value) return;
    inflight = true;
    loading.value = true;
    error.value = null;
    try {
      const pageData = await lolBattleApi.getBattleList(rqOptions(), { count: PAGE_SIZE, offset: (n - 1) * PAGE_SIZE });
      hasNext.value = pageData.length >= PAGE_SIZE;
      const seen = new Set<string>();
      const fresh: BattleSummary[] = [];
      for (const item of pageData) {
        if (!seen.has(item.game_id)) {
          seen.add(item.game_id);
          fresh.push(item);
        }
      }
      battles.value = fresh;
      page.value = n;
      if (!fresh.some((item) => item.game_id === selectedGameId.value) && fresh.length > 0) {
        selectedGameId.value = fresh[0].game_id;
      }
    } catch (err) {
      error.value = err as Error;
    } finally {
      inflight = false;
      loading.value = false;
    }
  }

  function select(gameId: string): void {
    selectedGameId.value = gameId;
  }

  return { battles, page, hasPrev, hasNext, loading, error, selectedGameId, goToPage, select };
}
