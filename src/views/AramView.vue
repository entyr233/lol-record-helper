<template>
  <div class="page page--summary aram-page">
    <div class="aram-header">
      <div class="aram-heading">
        <p class="page-title">海克斯数据</p>
        <p v-if="overview" class="aram-meta">
          ARAMGG · 补丁 {{ overview.gamePatch }} · 数据版本 {{ overview.dataVersion }}
          <template v-if="statsDate"> · 统计 {{ statsDate }}</template>
        </p>
        <p v-else-if="loading" class="aram-meta">ARAMGG 榜单加载中…</p>
        <p v-else-if="error" class="aram-meta aram-meta--error">{{ error }}</p>
      </div>
      <button type="button" class="summary-refresh" :disabled="loading" @click="refresh">
        {{ loading ? "刷新中…" : "刷新数据" }}
      </button>
    </div>

    <Panel title="ARAMGG 数据源" class="aram-source">
      <div class="aram-source-body">
        <p class="aram-source-text">
          榜单数据来自 ARAMGG（免 API Key）；填写 API Key 后可查看单英雄推荐强化/出装，每次 2 credits、缓存 12 小时。Key 只保存在本机，不会上传。
        </p>
        <p v-if="hasKey && !editingKey" class="aram-source-key">
          已配置：<code>{{ maskedKey }}</code>
          <span v-if="keySessionOnly" class="aram-key-session-tag">仅本次会话</span>
          <button type="button" class="link-button" @click="editingKey = true">更换</button>
          <button type="button" class="link-button" @click="removeKey">清除</button>
          <a href="https://data.dtodo.cn/developer.html" target="_blank" rel="noopener noreferrer">开发者后台 ↗</a>
        </p>
        <form v-else class="aram-source-form" @submit.prevent="saveKey">
          <input
            v-model.trim="keyDraft"
            type="password"
            autocomplete="off"
            spellcheck="false"
            placeholder="hx_live_…"
            aria-label="ARAMGG API Key"
          />
          <label class="aram-key-session">
            <input v-model="keySessionOnly" type="checkbox" />
            仅本次会话保存
          </label>
          <button type="submit" class="summary-refresh" :disabled="!keyDraft">保存</button>
          <button v-if="hasKey" type="button" class="summary-refresh" @click="editingKey = false">取消</button>
          <a href="https://data.dtodo.cn/developer.html" target="_blank" rel="noopener noreferrer">申请 API Key ↗</a>
        </form>
      </div>
    </Panel>

    <div class="aram-controls">
      <div class="mode-filter aram-filter">
        <button
          type="button"
          class="mode-filter-tab"
          :class="{ 'mode-filter-tab--cur': tab === 'augments' }"
          @click="tab = 'augments'"
        >
          强化榜
        </button>
        <button
          type="button"
          class="mode-filter-tab"
          :class="{ 'mode-filter-tab--cur': tab === 'champions' }"
          @click="tab = 'champions'"
        >
          英雄榜
        </button>
        <select v-if="tab === 'augments'" v-model="rarityFilter" class="mode-filter-select" aria-label="强化品质">
          <option value="all">全部品质</option>
          <option value="prismatic">棱彩</option>
          <option value="gold">黄金</option>
          <option value="silver">白银</option>
        </select>
      </div>
      <div class="aram-controls-right">
        <input
          v-model.trim="query"
          type="search"
          class="aram-search"
          :placeholder="tab === 'augments' ? '搜索强化' : '搜索英雄'"
          aria-label="搜索"
        />
        <span class="summary-updated">{{ rows.length }} 条</span>
      </div>
    </div>

    <div class="aram-layout">
      <Panel :title="tab === 'augments' ? '强化榜' : '英雄榜'" class="aram-list-panel">
        <template #title-expand>
          <span class="aram-columns-hint">胜率 / 选取率 / 强度</span>
        </template>
        <div class="aram-table" role="group" :aria-label="tab === 'augments' ? '强化榜单' : '英雄榜单'">
          <button
            v-for="(item, index) in rows"
            :key="item.id"
            type="button"
            class="aram-row"
            :class="{ 'aram-row--cur': item.id === selectedId }"
            @click="select(item.id)"
          >
            <span class="aram-rank">{{ index + 1 }}</span>
            <img
              v-if="item.iconUrl"
              class="aram-icon"
              :src="item.iconUrl"
              :alt="item.name"
              loading="lazy"
              referrerpolicy="no-referrer"
            />
            <span v-else class="aram-icon aram-icon--empty" aria-hidden="true" />
            <span class="aram-name">
              <b>{{ item.name }}</b>
              <small v-if="tab === 'augments'">{{ rarityOf(item as AramggAugment) }}</small>
              <small v-else>{{ (item as AramggChampion).title || (item as AramggChampion).roles.join(" / ") }}</small>
            </span>
            <span class="aram-value">{{ pct(item.stats?.winRate) }}</span>
            <span class="aram-value">{{ pct(item.stats?.pickRate) }}</span>
            <span class="aram-tier" :title="item.stats?.tier ? '强度 ' + item.stats.tier + '（1 最强）' : ''">{{ item.stats?.tier ?? "--" }}</span>
          </button>
          <p v-if="!rows.length" class="state-text">{{ overview ? "没有匹配结果" : "暂无数据" }}</p>
        </div>
      </Panel>

      <Panel :title="detailTitle" class="aram-detail-panel">
        <section v-if="tab === 'augments' && selectedAugment" aria-label="强化详情">
          <header class="aram-detail-head">
            <img
              v-if="selectedAugment.iconUrl"
              class="aram-detail-icon"
              :src="selectedAugment.iconUrl"
              :alt="selectedAugment.name"
              referrerpolicy="no-referrer"
            />
            <div>
              <p class="aram-detail-title">{{ selectedAugment.name }}</p>
              <p class="aram-detail-sub">
                {{ rarityOf(selectedAugment) }} · 胜率 {{ pct(selectedAugment.stats?.winRate) }} · 选取率
                {{ pct(selectedAugment.stats?.pickRate) }}
                <template v-if="selectedAugment.stats?.games"> · {{ selectedAugment.stats.games }} 场</template>
              </p>
            </div>
          </header>
          <p v-if="selectedAugment.description" class="aram-detail-text">{{ selectedAugment.description }}</p>
          <template v-if="selectedAugment.topChampions.length">
            <p class="aram-section-label">该强化胜率最高的英雄</p>
            <div class="aram-chips">
              <span v-for="champ in selectedAugment.topChampions.slice(0, 8)" :key="champ.id" class="aram-chip" :title="champ.name">
                <img v-if="champ.iconUrl" :src="champ.iconUrl" :alt="champ.name" loading="lazy" referrerpolicy="no-referrer" />
                <span>{{ champ.name }}</span>
              </span>
            </div>
          </template>
        </section>

        <section v-else-if="tab === 'champions' && selectedChampionId !== null" aria-label="英雄详情">
          <header class="aram-detail-head">
            <div>
              <p class="aram-detail-title">{{ selectedChampion?.name || "英雄 " + selectedChampionId }}</p>
              <p class="aram-detail-sub">{{ selectedChampion?.title || "" }} · 海克斯大乱斗推荐</p>
            </div>
          </header>
          <p v-if="detailLoading" class="state-text">加载推荐数据…</p>
          <p v-else-if="detailError" class="state-text state-text--error">
            {{ detailError }}
            <a v-if="!hasKey" href="https://data.dtodo.cn/developer.html" target="_blank" rel="noopener noreferrer">去申请 API Key</a>
          </p>
          <template v-else-if="detail">
            <p class="aram-section-label">推荐海克斯</p>
            <div class="aram-aug-list">
              <span v-for="aug in detail.augments.slice(0, 9)" :key="aug.id" class="aram-aug" :title="aug.description || aug.name">
                <img v-if="aug.iconUrl" :src="aug.iconUrl" :alt="aug.name" loading="lazy" referrerpolicy="no-referrer" />
                <span class="aram-aug-name">{{ aug.name }}</span>
                <small>{{ pct(aug.stats?.winRate) }}</small>
              </span>
            </div>
            <template v-if="detail.builds.length">
              <p class="aram-section-label">推荐出装 · {{ detail.builds[0].tags.join(" / ") || "主流" }}</p>
              <div class="aram-build-row">
                <span class="aram-build-label">核心</span>
                <span v-for="item in detail.builds[0].coreItems" :key="item.id" class="aram-item" :title="item.name || String(item.id)">
                  <img :src="item.iconUrl || itemIcon(item.id)" :alt="item.name || String(item.id)" loading="lazy" referrerpolicy="no-referrer" />
                </span>
                <template v-if="detail.builds[0].startingItems.length">
                  <span class="aram-build-label">出门</span>
                  <span v-for="item in detail.builds[0].startingItems" :key="'s' + item.id" class="aram-item" :title="item.name || String(item.id)">
                    <img :src="item.iconUrl || itemIcon(item.id)" :alt="item.name || String(item.id)" loading="lazy" referrerpolicy="no-referrer" />
                  </span>
                </template>
              </div>
              <div v-if="detail.builds[0].skillOrders.length" class="aram-build-row">
                <span class="aram-build-label">加点</span>
                <span class="aram-skills">{{ detail.builds[0].skillOrders[0].skillKeys.join(" ") }}</span>
              </div>
            </template>
          </template>
        </section>

        <p v-else class="state-text">{{ tab === "augments" ? "选择左侧强化查看详情" : "选择左侧英雄查看推荐搭配" }}</p>
      </Panel>
    </div>

    <p class="aram-note">
      数据来源：<a href="https://aramgg.com/" target="_blank" rel="noopener noreferrer">ARAMGG</a>
      （腾讯国服公开统计，仅供参考）；API Key 仅保存在本机 localStorage。
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import Panel from "../components/Panel.vue";
import {
  AramggError,
  clearAramggApiKey,
  fetchAramggChampionDetail,
  getAramggApiKey,
  hasAramggApiKey,
  isAramggApiKeySessionOnly,
  setAramggApiKey,
  type AramggAugment,
  type AramggChampion,
  type AramggChampionDetail
} from "../api/aramgg";
import { useAramgg } from "../composables/useAramgg";

const { overview, loading, error, ensure } = useAramgg();

const tab = ref<"augments" | "champions">("augments");
const rarityFilter = ref<"all" | "prismatic" | "gold" | "silver">("all");
const query = ref("");
const selectedAugmentId = ref<number | null>(null);
const selectedChampionId = ref<number | null>(null);
const detail = ref<AramggChampionDetail | null>(null);
const detailLoading = ref(false);
const detailError = ref<string | null>(null);

const hasKey = ref(hasAramggApiKey());
const editingKey = ref(false);
const keySessionOnly = ref(isAramggApiKeySessionOnly());
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

const maskedKey = computed(() => {
  const key = hasKey.value ? getAramggApiKey() : "";
  return key.length > 10 ? key.slice(0, 6) + "…" + key.slice(-4) : key;
});

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

const rows = computed<Array<AramggAugment | AramggChampion>>(() => (tab.value === "augments" ? augmentRows.value : championRows.value));

const selectedId = computed<number | null>(() => (tab.value === "augments" ? selectedAugmentId.value : selectedChampionId.value));

const detailTitle = computed(() => (tab.value === "augments" ? "强化详情" : "英雄推荐"));

const selectedAugment = computed<AramggAugment | null>(() => {
  if (selectedAugmentId.value === null) return null;
  return overview.value?.augments.find((item) => item.id === selectedAugmentId.value) ?? null;
});

const selectedChampion = computed<AramggChampion | null>(() => {
  if (selectedChampionId.value === null) return null;
  return overview.value?.champions.find((item) => item.id === selectedChampionId.value) ?? null;
});

function itemIcon(id: number): string {
  return "https://cdn.dtodo.cn/hextech/item-icons/" + id + ".png";
}

function select(id: number): void {
  if (tab.value === "augments") {
    selectedAugmentId.value = id;
    return;
  }
  void selectChampion(id);
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
  setAramggApiKey(keyDraft.value, keySessionOnly.value);
  hasKey.value = hasAramggApiKey();
  keyDraft.value = getAramggApiKey();
  editingKey.value = false;
  if (hasKey.value && selectedChampionId.value !== null) void selectChampion(selectedChampionId.value);
}

function removeKey(): void {
  clearAramggApiKey();
  hasKey.value = false;
  keySessionOnly.value = false;
  keyDraft.value = "";
  editingKey.value = true;
  detail.value = null;
  detailError.value = null;
}
</script>
