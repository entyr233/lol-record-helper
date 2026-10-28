<template>
  <div class="page aram-page">
    <div class="aram-head">
      <div>
        <p class="page-title">海克斯大乱斗数据</p>
        <p v-if="overview" class="aram-meta">
          数据来源 ARAMGG · 补丁 {{ overview.gamePatch }} · 数据版本 {{ overview.dataVersion }}
          <template v-if="statsDate"> · 统计日期 {{ statsDate }}</template>
        </p>
        <p v-else-if="loading" class="aram-meta">ARAMGG 榜单加载中…</p>
        <p v-else-if="error" class="aram-meta aram-meta--error">{{ error }}</p>
      </div>
      <button type="button" class="summary-refresh" :disabled="loading" @click="refresh">
        {{ loading ? "刷新中…" : "刷新数据" }}
      </button>
    </div>

    <details class="aram-key-box" :open="!hasKey">
      <summary>ARAMGG API Key（仅保存在本机，用于单英雄推荐强化/出装）</summary>
      <div class="aram-key-row">
        <input
          v-model.trim="keyDraft"
          type="password"
          autocomplete="off"
          spellcheck="false"
          placeholder="hx_live_…"
          aria-label="ARAMGG API Key"
        />
        <button type="button" :disabled="!keyDraft" @click="saveKey">保存</button>
        <button v-if="hasKey" type="button" @click="removeKey">清除</button>
      </div>
      <p class="aram-key-hint">
        在
        <a href="https://data.dtodo.cn/developer.html" target="_blank" rel="noopener noreferrer">ARAMGG 开发者后台</a>
        用 GitHub 登录后申请；榜单数据免费，单英雄详情每次消耗 2 credits（结果会缓存 12 小时）。
      </p>
    </details>

    <div class="aram-toolbar">
      <div class="aram-tabs" role="tablist" aria-label="数据类型">
        <button type="button" role="tab" :aria-selected="tab === 'augments'" :class="{ 'aram-tab--cur': tab === 'augments' }" @click="tab = 'augments'">强化榜</button>
        <button type="button" role="tab" :aria-selected="tab === 'champions'" :class="{ 'aram-tab--cur': tab === 'champions' }" @click="tab = 'champions'">英雄榜</button>
      </div>
      <select v-if="tab === 'augments'" v-model="rarityFilter" class="aram-select" aria-label="强化品质">
        <option value="all">全部品质</option>
        <option value="prismatic">棱彩</option>
        <option value="gold">黄金</option>
        <option value="silver">白银</option>
      </select>
      <input v-model.trim="query" type="search" class="aram-search" :placeholder="tab === 'augments' ? '搜索强化名称' : '搜索英雄名称'" aria-label="搜索" />
    </div>

    <ol v-if="tab === 'augments'" class="aram-list" aria-label="海克斯强化胜率榜">
      <li v-for="(item, index) in augmentRows" :key="item.id">
        <button type="button" class="aram-row" @click="selectedAugmentId = item.id">
          <span class="aram-rank">{{ index + 1 }}</span>
          <img v-if="item.iconUrl" class="aram-icon" :src="item.iconUrl" :alt="item.name" loading="lazy" referrerpolicy="no-referrer" />
          <span v-else class="aram-icon aram-icon--empty" aria-hidden="true" />
          <span class="aram-main">
            <b>{{ item.name }}</b>
            <small>{{ rarityOf(item) }}<template v-if="item.stats?.tier"> · 强度 {{ item.stats.tier }}</template></small>
          </span>
          <span class="aram-stat"><b>{{ pct(item.stats?.winRate) }}</b><small>胜率</small></span>
          <span class="aram-stat"><b>{{ pct(item.stats?.pickRate) }}</b><small>选取率</small></span>
        </button>
      </li>
      <li v-if="!augmentRows.length" class="aram-empty">{{ overview ? "没有匹配的强化" : "暂无数据" }}</li>
    </ol>

    <ol v-else class="aram-list" aria-label="海克斯大乱斗英雄榜">
      <li v-for="(item, index) in championRows" :key="item.id">
        <button type="button" class="aram-row" :class="{ 'aram-row--cur': item.id === selectedChampionId }" @click="selectChampion(item.id)">
          <span class="aram-rank">{{ index + 1 }}</span>
          <img class="aram-icon" :src="item.iconUrl" :alt="item.name" loading="lazy" referrerpolicy="no-referrer" />
          <span class="aram-main">
            <b>{{ item.name }}</b>
            <small>{{ item.title || item.roles.join(" / ") }}<template v-if="item.stats?.tier"> · 强度 {{ item.stats.tier }}</template></small>
          </span>
          <span class="aram-stat"><b>{{ pct(item.stats?.winRate) }}</b><small>胜率</small></span>
          <span class="aram-stat"><b>{{ pct(item.stats?.pickRate) }}</b><small>选取率</small></span>
        </button>
      </li>
      <li v-if="!championRows.length" class="aram-empty">{{ overview ? "没有匹配的英雄" : "暂无数据" }}</li>
    </ol>

    <section v-if="tab === 'augments' && selectedAugment" class="aram-detail" aria-label="强化详情">
      <header class="aram-detail-head">
        <img v-if="selectedAugment.iconUrl" class="aram-icon" :src="selectedAugment.iconUrl" :alt="selectedAugment.name" referrerpolicy="no-referrer" />
        <div>
          <p class="aram-detail-title">{{ selectedAugment.name }}</p>
          <p class="aram-detail-sub">
            {{ rarityOf(selectedAugment) }} · 胜率 {{ pct(selectedAugment.stats?.winRate) }} · 选取率 {{ pct(selectedAugment.stats?.pickRate) }}
            <template v-if="selectedAugment.stats?.games"> · {{ selectedAugment.stats.games }} 场</template>
          </p>
        </div>
        <button type="button" class="aram-close" @click="selectedAugmentId = null">关闭</button>
      </header>
      <p v-if="selectedAugment.description" class="aram-detail-text">{{ selectedAugment.description }}</p>
      <div v-if="selectedAugment.topChampions.length" class="aram-top-champions">
        <p class="aram-detail-label">该强化胜率最高的英雄</p>
        <span v-for="champ in selectedAugment.topChampions.slice(0, 6)" :key="champ.id" class="aram-top-chip" :title="champ.name">
          <img v-if="champ.iconUrl" :src="champ.iconUrl" :alt="champ.name" loading="lazy" referrerpolicy="no-referrer" />
          <span>{{ champ.name }}</span>
        </span>
      </div>
    </section>

    <section v-if="tab === 'champions' && selectedChampionId !== null" class="aram-detail" aria-label="英雄详情">
      <header class="aram-detail-head">
        <div>
          <p class="aram-detail-title">{{ selectedChampion?.name || "英雄 " + selectedChampionId }} · 推荐搭配</p>
          <p class="aram-detail-sub">按官方推荐顺序 / 胜率展示；数据来自 ARAMGG 开发者接口</p>
        </div>
        <button type="button" class="aram-close" @click="selectedChampionId = null">关闭</button>
      </header>
      <p v-if="detailLoading" class="aram-detail-text">加载推荐数据…</p>
      <p v-else-if="detailError" class="aram-detail-text aram-meta--error">
        {{ detailError }}
        <a v-if="!hasKey" href="https://data.dtodo.cn/developer.html" target="_blank" rel="noopener noreferrer">去申请 API Key ↗</a>
      </p>
      <template v-else-if="detail">
        <div class="aram-detail-label">推荐海克斯</div>
        <div class="aram-aug-grid">
          <span v-for="aug in detail.augments.slice(0, 9)" :key="aug.id" class="aram-aug-chip" :title="aug.description || aug.name">
            <img v-if="aug.iconUrl" :src="aug.iconUrl" :alt="aug.name" loading="lazy" referrerpolicy="no-referrer" />
            <span class="aram-aug-name">{{ aug.name }}</span>
            <small>{{ pct(aug.stats?.winRate) }}<template v-if="aug.stats?.pickRate !== null && aug.stats?.pickRate !== undefined"> · 选取 {{ pct(aug.stats?.pickRate) }}</template></small>
          </span>
        </div>
        <template v-if="detail.builds.length">
          <div class="aram-detail-label">推荐出装（{{ detail.builds[0].tags.join(" / ") || "主流" }}）</div>
          <div class="aram-build">
            <span class="aram-build-label">核心装</span>
            <span v-for="item in detail.builds[0].coreItems" :key="item.id" class="aram-item" :title="item.name || String(item.id)">
              <img :src="item.iconUrl || itemIcon(item.id)" :alt="item.name || String(item.id)" loading="lazy" referrerpolicy="no-referrer" />
            </span>
            <span v-if="detail.builds[0].startingItems.length" class="aram-build-label">出门装</span>
            <span v-for="item in detail.builds[0].startingItems" :key="'s' + item.id" class="aram-item" :title="item.name || String(item.id)">
              <img :src="item.iconUrl || itemIcon(item.id)" :alt="item.name || String(item.id)" loading="lazy" referrerpolicy="no-referrer" />
            </span>
          </div>
          <div v-if="detail.builds[0].skillOrders.length" class="aram-build">
            <span class="aram-build-label">技能加点</span>
            <span class="aram-skill-order">{{ detail.builds[0].skillOrders[0].skillKeys.join(" ") }}</span>
          </div>
        </template>
      </template>
    </section>

    <p class="aram-note">
      数据来源：<a href="https://aramgg.com/" target="_blank" rel="noopener noreferrer">ARAMGG</a>
      （腾讯国服公开统计，仅供参考）；API Key 只保存在本机 localStorage，不会上传。
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  AramggError,
  clearAramggApiKey,
  fetchAramggChampionDetail,
  getAramggApiKey,
  hasAramggApiKey,
  setAramggApiKey,
  type AramggAugment,
  type AramggChampion,
  type AramggChampionDetail
} from "../api/aramgg";
import { useAramgg } from "../composables/useAramgg";

const { overview, loading, error, ensure, championOf } = useAramgg();

const tab = ref<"augments" | "champions">("augments");
const rarityFilter = ref<"all" | "prismatic" | "gold" | "silver">("all");
const query = ref("");
const selectedAugmentId = ref<number | null>(null);
const selectedChampionId = ref<number | null>(null);
const detail = ref<AramggChampionDetail | null>(null);
const detailLoading = ref(false);
const detailError = ref<string | null>(null);

const hasKey = ref(hasAramggApiKey());
const keyDraft = ref(getAramggApiKey());

onMounted(() => {
  void ensure();
});

function refresh(): void {
  void ensure(true);
}

function pct(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? (value * 100).toFixed(1) + "%" : "--";
}

function rarityOf(item: AramggAugment): string {
  if (item.rarityDisplayName) return item.rarityDisplayName;
  return item.rarity === 2 ? "棱彩" : item.rarity === 1 ? "黄金" : item.rarity === 0 ? "白银" : "未知品质";
}

const statsDate = computed(() => {
  const first = overview.value?.augments.find((item) => item.stats?.date);
  return first?.stats?.date ?? "";
});

const augmentRows = computed(() => {
  let list = [...(overview.value?.augments ?? [])];
  if (rarityFilter.value !== "all") list = list.filter((item) => item.rarityName === rarityFilter.value);
  if (query.value) list = list.filter((item) => item.name.includes(query.value));
  return list.sort(
    (a, b) =>
      (b.stats?.winRate ?? -1) - (a.stats?.winRate ?? -1) ||
      (a.stats?.tier ?? 99) - (b.stats?.tier ?? 99) ||
      a.name.localeCompare(b.name, "zh-CN")
  );
});

const championRows = computed(() => {
  let list = [...(overview.value?.champions ?? [])];
  if (query.value) list = list.filter((item) => item.name.includes(query.value) || (item.title ?? "").includes(query.value));
  return list.sort((a, b) => (b.stats?.winRate ?? -1) - (a.stats?.winRate ?? -1));
});

const selectedAugment = computed<AramggAugment | null>(() => {
  if (selectedAugmentId.value === null) return null;
  return overview.value?.augments.find((item) => item.id === selectedAugmentId.value) ?? null;
});

const selectedChampion = computed<AramggChampion | null>(() => championOf(selectedChampionId.value));

function itemIcon(id: number): string {
  return "https://cdn.dtodo.cn/hextech/item-icons/" + id + ".png";
}

async function selectChampion(id: number): Promise<void> {
  selectedChampionId.value = id;
  detail.value = null;
  detailError.value = null;
  if (!hasKey.value) {
    detailError.value = "未配置 ARAMGG API Key，无法读取该英雄的推荐强化/出装。";
    return;
  }
  detailLoading.value = true;
  try {
    detail.value = await fetchAramggChampionDetail(id);
  } catch (cause) {
    detailError.value = cause instanceof AramggError ? cause.message : "读取英雄推荐失败";
  } finally {
    detailLoading.value = false;
  }
}

function saveKey(): void {
  setAramggApiKey(keyDraft.value);
  hasKey.value = hasAramggApiKey();
  keyDraft.value = getAramggApiKey();
  if (hasKey.value && selectedChampionId.value !== null) void selectChampion(selectedChampionId.value);
}

function removeKey(): void {
  clearAramggApiKey();
  hasKey.value = false;
  keyDraft.value = "";
  detail.value = null;
  detailError.value = hasKey.value ? null : "API Key 已清除，单英雄推荐不可用。";
}
</script>

<style scoped>
.aram-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 24px;
}
.aram-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.aram-meta {
  margin: 6px 0 0;
  color: #6c7683;
  font-size: 12px;
}
.aram-meta--error {
  color: #e07070;
}
.aram-key-box {
  border: 1px solid #2f3844;
  border-radius: 6px;
  padding: 8px 12px;
  background: #ffffff05;
}
.aram-key-box > summary {
  color: #b59758;
  cursor: pointer;
  font-size: 12px;
}
.aram-key-row {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  flex-wrap: wrap;
}
.aram-key-row input,
.aram-search {
  flex: 1 1 220px;
  min-width: 0;
  padding: 5px 10px;
  color: #ddd;
  background: #1c232d;
  border: 1px solid #2f3844;
  border-radius: 4px;
  font: inherit;
}
.aram-key-row button {
  padding: 5px 12px;
  color: #d8bd7e;
  background: #242c37;
  border: 1px solid #4c463d;
  border-radius: 4px;
  cursor: pointer;
}
.aram-key-hint {
  margin: 8px 0 0;
  color: #6c7683;
  font-size: 11px;
  line-height: 1.6;
}
.aram-key-hint a,
.aram-note a {
  color: #d8bd7e;
}
.aram-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.aram-tabs {
  display: flex;
  gap: 6px;
}
.aram-tabs button {
  padding: 5px 14px;
  color: #9aa4b2;
  background: #242c37;
  border: 1px solid #2f3844;
  border-radius: 14px;
  cursor: pointer;
}
.aram-tabs .aram-tab--cur {
  color: #e6c37a;
  border-color: #b59758;
  background: #b5975833;
}
.aram-select {
  padding: 5px 10px;
  color: #c6cfda;
  background: #1c232d;
  border: 1px solid #2f3844;
  border-radius: 4px;
}
.aram-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 420px;
  overflow: auto;
  border: 1px solid #202831;
  border-radius: 6px;
  background: #161a20;
}
.aram-list li {
  border-bottom: 1px solid #202831;
}
.aram-list li:last-child {
  border-bottom: 0;
}
.aram-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  color: inherit;
  background: transparent;
  border: 0;
  text-align: left;
  cursor: pointer;
}
.aram-row:hover,
.aram-row--cur {
  background: #ffffff0d;
}
.aram-rank {
  width: 26px;
  color: #56606c;
  font-size: 12px;
  flex: none;
}
.aram-icon {
  width: 30px;
  height: 30px;
  border-radius: 4px;
  flex: none;
  object-fit: cover;
  background: #202831;
}
.aram-icon--empty {
  display: inline-block;
}
.aram-main {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1 1 auto;
  min-width: 0;
}
.aram-main b {
  color: #e8edf2;
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.aram-main small {
  color: #6c7683;
  font-size: 11px;
}
.aram-stat {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  flex: none;
  width: 60px;
}
.aram-stat b {
  color: #e6c37a;
  font-size: 13px;
}
.aram-stat small {
  color: #56606c;
  font-size: 10px;
}
.aram-empty {
  color: #8f99a6;
  padding: 14px;
  font-size: 12px;
}
.aram-detail {
  border: 1px solid #2f3844;
  border-radius: 6px;
  background: #ffffff05;
  padding: 12px 14px;
}
.aram-detail-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.aram-detail-title {
  margin: 0;
  color: #e8edf2;
  font-size: 14px;
  font-weight: 600;
}
.aram-detail-sub {
  margin: 3px 0 0;
  color: #8f99a6;
  font-size: 11px;
}
.aram-close {
  margin-left: auto;
  color: #8f99a6;
  background: transparent;
  border: 1px solid #2f3844;
  border-radius: 4px;
  padding: 2px 8px;
  cursor: pointer;
}
.aram-detail-text {
  margin: 8px 0 0;
  color: #cfd6df;
  font-size: 12px;
  line-height: 1.6;
}
.aram-detail-label {
  margin: 10px 0 6px;
  color: #56606c;
  font-size: 11px;
}
.aram-top-champions {
  margin-top: 8px;
}
.aram-top-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 0 8px 6px 0;
  padding: 2px 8px 2px 2px;
  color: #cfd6df;
  background: #1c232d;
  border: 1px solid #2f3844;
  border-radius: 12px;
  font-size: 11px;
}
.aram-top-chip img {
  width: 18px;
  height: 18px;
  border-radius: 50%;
}
.aram-aug-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 6px;
}
.aram-aug-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: #1c232d;
  border: 1px solid #2f3844;
  border-radius: 4px;
  font-size: 11px;
}
.aram-aug-chip img {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  flex: none;
}
.aram-aug-name {
  flex: 1 1 auto;
  color: #e8edf2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.aram-aug-chip small {
  color: #e6c37a;
  flex: none;
}
.aram-build {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}
.aram-build-label {
  color: #56606c;
  font-size: 11px;
}
.aram-item img {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  display: block;
}
.aram-skill-order {
  color: #cfd6df;
  font-family: Consolas, Monaco, monospace;
  font-size: 12px;
}
.aram-note {
  margin: 8px 0 0;
  color: #56606c;
  font-size: 11px;
}
</style>
