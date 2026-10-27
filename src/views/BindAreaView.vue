<template>
  <div class="page page--landing">
    <p class="page-title">{{ lastArea && hasLogin() ? "英雄联盟战绩查询" : "请先选择区服" }}</p>
    <p class="landing-sub">选择大区后查看自己的战绩，或直接进入常看玩家</p>

    <div class="landing-actions">
      <button type="button" class="landing-primary" :disabled="!lastArea" @click="goSelf">查看我的战绩</button>
      <span v-if="!lastArea" class="landing-hint">先在顶部选择大区</span>
    </div>

    <div v-if="favorites.length" class="landing-section">
      <p class="landing-label">收藏玩家</p>
      <div class="landing-chips">
        <button v-for="f in favorites" :key="f.id" type="button" class="landing-chip landing-chip--fav" @click="openFavorite(f)">
          <span class="landing-chip-name">{{ f.name }}</span>
          <span class="landing-chip-area">{{ getAreaName(f.area) }}</span>
        </button>
      </div>
    </div>

    <div v-if="recentSearches.length" class="landing-section">
      <p class="landing-label">最近搜索</p>
      <div class="landing-chips">
        <button v-for="name in recentSearches" :key="name" type="button" class="landing-chip" @click="searchName(name)">{{ name }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { readStorage } from "../utils/storage";
import { getAreaName } from "../const/areas";
import { getSelfUinFromCookie, hasLoginState } from "../utils/weGameLogin";

const router = useRouter();
const lastArea = ref(readStorage<string>("last-area", ""));
const favorites = ref<Array<{ name: string; area: number; id: string; level?: number }>>([]);
const recentSearches = ref<string[]>([]);
try {
  favorites.value = JSON.parse(localStorage.getItem("lol-tft-favorites") ?? "[]") as typeof favorites.value;
  recentSearches.value = JSON.parse(localStorage.getItem("lol-tft-search-history") ?? "[]") as string[];
} catch { /* ignore */ }


function hasLogin(): boolean {
  return Boolean(getSelfUinFromCookie()) && hasLoginState();
}

function goSelf(): void {
  const cookieUin = getSelfUinFromCookie();
  if (lastArea.value && cookieUin) {
    void router.push({ name: "summary", params: { area: lastArea.value, accountType: "1", id: cookieUin } });
    return;
  }
  void router.push({ name: "area", params: { area: lastArea.value || "1" } });
}

function openFavorite(f: { name: string; area: number; id: string }): void {
  void router.push({ name: "summary", params: { area: String(f.area), accountType: "2", id: f.id } });
}

function searchName(name: string): void {
  void router.push({ name: "search", params: { nickname: name } });
}
</script>
