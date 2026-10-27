<template>
  <details v-if="showSelf" class="rank-history" open>
    <summary>历史段位查询 <span>掌盟赛季记录与近期走势（链接粘贴一次，自动记住）</span></summary>
    <div class="rank-history-content">
      <p class="rank-help">
        掌盟 App → 我的 → 历史段位 → 分享复制链接 → 粘贴到这里。链接里的访问凭证与本玩家绑定，长期有效；换查询对象时再粘贴对应玩家的链接。
      </p>
      <form class="rank-link-form" @submit.prevent="queryLink">
        <input v-model="link" type="url" required placeholder="粘贴掌盟段位页链接（含 scene=...）" />
        <button type="submit" class="mlol-btn" :disabled="loading">{{ loading ? "查询中…" : "查询" }}</button>
      </form>
      <p v-if="error" class="state-text state-text--error">{{ toErrorMessage(error) }}</p>
      <template v-if="seasons.length || trend.length">
        <p class="state-text rank-player">{{ roleName }}</p>
        <div v-for="group in trend" :key="group.title" class="rank-trend">
          <span class="rank-trend-title">{{ group.title }}</span>
          <span v-for="(point, index) in group.points" :key="index" class="rank-trend-chip">{{ point.label }}</span>
        </div>
        <table class="rank-table">
          <thead><tr><th>赛季</th><th>队列</th><th>段位</th><th>胜点</th><th>战绩</th><th>胜率</th></tr></thead>
          <tbody>
            <template v-for="season in seasons" :key="season.title">
              <tr v-for="(q, qi) in season.queues" :key="season.title + qi">
                <td v-if="qi === 0">{{ season.title }}</td>
                <td v-else />
                <td>{{ q.title }}</td>
                <td>{{ q.fullRank }}</td>
                <td>{{ q.points }}</td>
                <td>{{ q.wins }}胜{{ q.losses }}负</td>
                <td>{{ q.winRate }}%</td>
              </tr>
            </template>
          </tbody>
        </table>
      </template>
    </div>
  </details>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { getSelfUinFromCookie } from "../utils/weGameLogin";
import { fetchMlolRankHistory, type MlolSeasonRow, type MlolTrendGroup } from "../api/rankHistory";
import { fetchMlolIdentity } from "../api/mlolSource";
import { toErrorMessage } from "../api/errors";

const props = defineProps<{ area: string; accountType: string; id: string }>();

const link = ref("");
const error = ref<Error | null>(null);
const loading = ref(false);
const roleName = ref("");
const seasons = ref<MlolSeasonRow[]>([]);
const trend = ref<MlolTrendGroup[]>([]);

const SCENE_KEY = "lol-tft-scene:" + props.accountType + ":" + props.id;
const showSelf = computed(() => props.accountType === "1" && props.id === (getSelfUinFromCookie() || ""));

function loadCached(): void {
  try {
    const saved = localStorage.getItem(SCENE_KEY);
    if (!saved) return;
    const cached = JSON.parse(saved) as { roleName?: string; seasons?: MlolSeasonRow[]; trend?: MlolTrendGroup[] };
    roleName.value = cached.roleName ?? "";
    seasons.value = cached.seasons ?? [];
    trend.value = cached.trend ?? [];
  } catch { /* ignore */ }
}

function persist(): void {
  try {
    localStorage.setItem(SCENE_KEY, JSON.stringify({ roleName: roleName.value, seasons: seasons.value, trend: trend.value }));
  } catch { /* ignore */ }
}

async function resolveScene(scene: string): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const identity = await fetchMlolIdentity(scene);
    roleName.value = identity.roleName;
    const rank = await fetchMlolRankHistory(identity.scene);
    seasons.value = rank.seasons;
    trend.value = rank.trend;
    persist();
  } catch (err) {
    error.value = err as Error;
  } finally {
    loading.value = false;
  }
}

function queryLink(): void {
  const scene = (link.value.match(/[?&]scene=([A-Za-z0-9_-]+)/) ?? [])[1] ?? "";
  if (!scene) {
    error.value = new Error("链接里没有找到 scene 凭证，请确认粘贴的是掌盟段位页的分享链接");
    return;
  }
  void resolveScene(scene);
}

onMounted(loadCached);
watch(() => [props.accountType, props.id], loadCached);
</script>
