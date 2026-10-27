<template>
  <details v-if="!loaded || seasons.length || trend.length || error" class="rank-history" open>
    <summary>历史段位查询 <span>赛季记录与近期走势（wegame 数据，无需掌盟）</span></summary>
    <div class="rank-history-content">
      <p v-if="loading" class="state-text">加载中…</p>
      <p v-else-if="error" class="state-text state-text--error">{{ toErrorMessage(error) }}</p>
      <template v-else>
        <div v-if="trend.length" class="rank-trend">
          <span class="rank-trend-title">近期走势</span>
          <span v-for="(point, index) in trend" :key="point.gameId" class="rank-trend-chip"
            :title="point.point !== '' ? point.point + ' LP' : ''">
            <span class="rank-trend-index">{{ index + 1 }}</span>{{ point.label }}
          </span>
        </div>
        <table v-if="seasons.length" class="rank-table">
          <thead>
            <tr><th>赛季</th><th>单双排</th><th>胜点</th><th>灵活组排</th><th>胜点</th><th>战绩</th><th>胜率</th></tr>
          </thead>
          <tbody>
            <tr v-for="row in seasons" :key="row.sid" :class="{ 'rank-table--current': row === seasons[0] }">
              <td>{{ row.label }}</td>
              <td>{{ row.solo }}</td>
              <td>{{ row.soloPoint }}</td>
              <td>{{ row.flex }}</td>
              <td>{{ row.flexPoint }}</td>
              <td>{{ row.wins }}胜{{ row.losses }}负</td>
              <td>{{ row.winRate }}%</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="state-text">
          暂无赛季记录
          <span class="rank-diag">（诊断：report={{ diagReport }}，走势样本={{ trendSample }}）</span>
        </p>
      </template>
    </div>
  </details>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useAsyncData } from "../composables/useAsyncData";
import { toRqOptions } from "../composables/useUserInfo";
import { fetchRankHistory } from "../api/rankHistory";
import { toErrorMessage } from "../api/errors";

const props = defineProps<{ area: string; accountType: string; id: string }>();

const task = useAsyncData(async (signal) => {
  const rq = toRqOptions({ area: props.area, accountType: props.accountType, id: props.id });
  return fetchRankHistory(rq, signal);
});

onMounted(() => {
  void task.run();
});

const history = computed(() => task.data.value);
const diagReport = computed(() => {
  const value = history.value;
  if (!value) return "未返回";
  return "report 键=[" + (value.reportKeys?.join(",") ?? "?") + "]";
});
const trendSample = computed(() => history.value?.trend?.length ?? 0);

const seasons = computed(() => history.value?.seasons ?? []);
const trend = computed(() => history.value?.trend ?? []);
const loading = task.loading;
const error = task.error;
const loaded = computed(() => task.data.value !== null || task.error.value !== null);
</script>
