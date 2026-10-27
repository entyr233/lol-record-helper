import { ref, type Ref } from "vue";
import { lolBattleApi } from "../api/client";
import type { BattleOverview, OverviewBattle, RqOptions } from "../api/types";

export interface BattleListState {
  battles: Ref<OverviewBattle[]>;
  overview: Ref<BattleOverview | null>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
  selectedGameId: Ref<string | null>;
  load: () => Promise<void>;
  select: (gameId: string) => void;
}

/**
 * 对局列表：改用现任的 GetBattleOverview（一次拿最近对局总览 + 赛季段位 + 维度百分位）。
 * 旧的 GetBattleList 分页接口已不在现任前端使用，且对我们报"登录信息过期"。
 */
export function useBattleList(rqOptions: () => RqOptions): BattleListState {
  const battles = ref<OverviewBattle[]>([]);
  const overview = ref<BattleOverview | null>(null);
  const loading = ref(false);
  const error = ref<Error | null>(null);
  const selectedGameId = ref<string | null>(null);
  let inflight = false;

  async function load(): Promise<void> {
    if (inflight) return;
    inflight = true;
    loading.value = true;
    error.value = null;
    try {
      const data = await lolBattleApi.getBattleOverview(rqOptions());
      overview.value = data;
      battles.value = data.battles ?? [];
      if (selectedGameId.value === null && battles.value.length > 0) {
        selectedGameId.value = String(battles.value[0].game_id);
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

  return { battles, overview, loading, error, selectedGameId, load, select };
}
