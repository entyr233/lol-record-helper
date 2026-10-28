import { computed, ref, shallowRef } from "vue";
import {
  AramggError,
  fetchAramggOverview,
  type AramggAugment,
  type AramggChampion,
  type AramggOverview
} from "../api/aramgg";

const overview = shallowRef<AramggOverview | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
let inflight: Promise<void> | null = null;

const TEST_MODE = (import.meta as unknown as { env?: { MODE?: string } }).env?.MODE === "test";

/** 测试用：直接注入榜单数据，避免走网络 */
export function __setAramggOverviewForTest(value: AramggOverview | null): void {
  overview.value = value;
  error.value = null;
}

export function useAramgg() {
  const augmentMap = computed(() => {
    const map = new Map<number, AramggAugment>();
    for (const item of overview.value?.augments ?? []) map.set(item.id, item);
    return map;
  });
  const championMap = computed(() => {
    const map = new Map<number, AramggChampion>();
    for (const item of overview.value?.champions ?? []) map.set(item.id, item);
    return map;
  });

  function augmentOf(id: number | null | undefined): AramggAugment | null {
    if (id === null || id === undefined) return null;
    return augmentMap.value.get(Number(id)) ?? null;
  }

  function championOf(id: number | null | undefined): AramggChampion | null {
    if (id === null || id === undefined) return null;
    return championMap.value.get(Number(id)) ?? null;
  }

  async function ensure(force = false): Promise<void> {
    if (!force && (overview.value !== null || TEST_MODE)) return;
    if (inflight) return inflight;
    loading.value = true;
    error.value = null;
    inflight = fetchAramggOverview(force)
      .then((value) => {
        overview.value = value;
      })
      .catch((cause: unknown) => {
        error.value = cause instanceof AramggError ? cause.message : "ARAMGG 数据加载失败";
      })
      .finally(() => {
        loading.value = false;
        inflight = null;
      });
    return inflight;
  }

  return { overview, loading, error, augmentMap, championMap, augmentOf, championOf, ensure };
}
