<template>
  <details class="personal-rank">
    <summary>本人的历史段位与胜点走势</summary>
    <p>当前查看：{{ playerName || "我的账号" }} · {{ areaName }}。请导入本人在掌盟打开“历史段位”页面时导出的 HAR 文件。</p>
    <p class="personal-rank-hint">文件在本地解析，不上传、不保存 Cookie。导入后先核对角色；只有点击刷新时才请求掌盟。</p>
    <label class="personal-rank-import">导入掌盟记录 <input type="file" accept=".har,application/json" @change="importFile" /></label>
    <p v-if="error" class="state-text state-text--error" role="alert">{{ error }}</p>
    <template v-if="sources.length">
      <label>记录角色
        <select v-model.number="selected" @change="changeSource">
          <option v-for="(entry, index) in sources" :key="index" :value="index">{{ entry.player || '记录 ' + (index + 1) + '（未识别昵称）' }}{{ entry.area ? ' · ' + entry.area : '' }}</option>
        </select>
      </label>
      <p class="personal-rank-source">来源：{{ source.player || "未捕获角色昵称，无法自动核对身份" }}{{ source.area ? ' · ' + source.area : '' }} · 采集时间 {{ source.capturedAt || "未提供" }}</p>
      <label><input v-model="confirmed" type="checkbox" />我确认所选记录来自本人当前大区的历史段位页</label>
      <template v-if="confirmed">
        <p><button type="button" class="link-button" :disabled="loading" @click="refresh">{{ loading ? "刷新中…" : "从掌盟刷新此记录" }}</button>
          <button v-if="loading" type="button" class="link-button" @click="cancel">取消等待</button>
          <span v-if="refreshed"> · 已在线刷新</span>
        </p>
        <p class="personal-rank-hint">以下是所选掌盟记录，不会自动随 WeGame 战绩更新。身份由你核对，尚未与 WeGame 账号自动关联。</p>
        <template v-if="history.trends.length">
          <label>走势模式 <select v-model.number="trendIndex"><option v-for="(trend, index) in history.trends" :key="index" :value="index">{{ trend.title }}</option></select></label>
          <p v-if="history.tip" class="personal-rank-hint">{{ history.tip }}</p>
          <svg v-if="chart.length" class="personal-rank-chart" viewBox="0 0 600 180" role="img" :aria-label="'所选记录的' + trend.title + '段位与胜点走势'">
            <line x1="30" y1="155" x2="570" y2="155" class="rank-chart-axis" />
            <polyline v-if="chart.length > 1" :points="chart.map(point => point.x + ',' + point.y).join(' ')" class="rank-chart-line" />
            <circle v-for="(point, index) in chart" :key="index" :cx="point.x" :cy="point.y" r="4" class="rank-chart-dot"><title>{{ point.time }} · {{ point.rank }} · {{ point.points }} 胜点</title></circle>
            <text x="30" y="175">{{ chart[0].time }}</text><text x="570" y="175" text-anchor="end">{{ chart[chart.length - 1].time }}</text>
          </svg>
          <p v-else>该模式没有近期走势记录。</p>
          <details v-if="trend.points.length"><summary>查看走势明细</summary>
            <div class="personal-rank-table"><table><thead><tr><th>时间</th><th>段位</th><th>胜点</th></tr></thead><tbody>
              <tr v-for="(point, index) in trend.points" :key="index"><td>{{ point.time }}</td><td>{{ point.rank }}</td><td>{{ point.points }}</td></tr>
            </tbody></table></div>
          </details>
        </template>
        <label v-if="modes.length">历史排位模式 <select v-model="mode"><option value="">全部</option><option v-for="entry in modes" :key="entry">{{ entry }}</option></select></label>
        <div v-if="seasons.length" class="personal-rank-table"><table><thead><tr><th>赛季／赛段</th><th>模式</th><th>段位</th><th>胜点</th><th>场次</th><th>胜率</th></tr></thead><tbody>
          <tr v-for="(entry, index) in seasons" :key="index"><td>{{ entry.season }}</td><td>{{ entry.mode }}</td><td>{{ entry.rank }}</td><td>{{ entry.points ?? "未提供" }}</td><td>{{ entry.games ?? "未提供" }}</td><td>{{ entry.winRate === null ? "未提供" : entry.winRate + '%' }}</td></tr>
        </tbody></table></div>
        <p v-else>该记录没有符合条件的历史赛季段位。</p>
      </template>
    </template>
  </details>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { fetchRankHistory, importRankHistoryHar, type RankSource } from "../api/rankHistory";
import { isAbortError, toErrorMessage } from "../api/errors";

defineProps<{ playerName: string; areaName: string }>();
const sources = ref<RankSource[]>([]);
const selected = ref(0);
const confirmed = ref(false);
const error = ref("");
const loading = ref(false);
const refreshed = ref(false);
const mode = ref("");
const trendIndex = ref(0);
let controller: AbortController | null = null;
const source = computed(() => sources.value[selected.value]);
const history = computed(() => source.value.history);
const trend = computed(() => history.value.trends[trendIndex.value] ?? { title: "", points: [] });
const modes = computed(() => [...new Set(history.value.seasons.map((entry) => entry.mode))]);
const seasons = computed(() => history.value.seasons.filter((entry) => !mode.value || entry.mode === mode.value));
const chart = computed(() => {
  const points = trend.value.points;
  if (!points.length) return [];
  const min = Math.min(...points.map((point) => point.value));
  const max = Math.max(...points.map((point) => point.value));
  return points.map((point, index) => ({ ...point, x: points.length === 1 ? 300 : 30 + index * 540 / (points.length - 1), y: max === min ? 90 : 145 - (point.value - min) * 120 / (max - min) }));
});

function cancel(): void {
  controller?.abort();
  controller = null;
  loading.value = false;
}

function changeSource(): void {
  cancel();
  confirmed.value = false;
  error.value = "";
  mode.value = "";
  trendIndex.value = 0;
  refreshed.value = false;
}

async function importFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  changeSource();
  try {
    const imported = importRankHistoryHar(await file.text());
    sources.value = imported;
    selected.value = 0;
  } catch (cause) {
    error.value = toErrorMessage(cause);
  } finally {
    input.value = "";
  }
}

async function refresh(): Promise<void> {
  if (!confirmed.value || loading.value) return;
  const selectedSource = source.value;
  const request = new AbortController();
  controller = request;
  loading.value = true;
  error.value = "";
  try {
    const result = await fetchRankHistory(selectedSource.scene, request.signal);
    if (controller !== request || source.value !== selectedSource) return;
    selectedSource.history = result;
    trendIndex.value = 0;
    refreshed.value = true;
  } catch (cause) {
    if (controller === request && !isAbortError(cause)) error.value = "刷新失败，仍显示已导入记录：" + toErrorMessage(cause);
  } finally {
    if (controller === request) { controller = null; loading.value = false; }
  }
}

onBeforeUnmount(cancel);
</script>
