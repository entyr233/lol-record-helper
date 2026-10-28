<template>
  <div class="page page--landing">
    <p class="page-title">{{ lastArea && hasLogin() ? "英雄联盟战绩查询" : "请先选择区服" }}</p>
    <p class="landing-sub">选择大区后查看自己的战绩，或直接进入常看玩家</p>

    <div class="landing-actions">
      <button type="button" class="landing-primary" :disabled="!lastArea" @click="goSelf">查看我的战绩</button>
      <span v-if="!lastArea" class="landing-hint">先在顶部选择大区</span>
    </div>

    <div v-if="favorites.length || recentNames.length" class="landing-section">
      <p class="landing-label">常看玩家</p>
      <div class="landing-chips">
        <button v-for="f in favorites" :key="favoriteKey(f)" type="button" class="landing-chip landing-chip--fav" @click="openFavorite(f)">
          <span class="landing-chip-star">★</span>
          <span class="landing-chip-name">{{ f.name }}</span>
          <span class="landing-chip-area">{{ getAreaName(f.area) }}</span>
        </button>
        <button v-for="name in recentNames" :key="name" type="button" class="landing-chip" @click="searchName(name)">{{ name }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { readStorage } from "../utils/storage";
import { getAreaName } from "../const/areas";
import { favoriteKey, useFavorites } from "../composables/useFavorites";
import type { FavoriteEntry } from "../composables/useFavorites";
import { getSelfUinFromCookie, hasLoginState } from "../utils/weGameLogin";
import { useSearchHistory } from "../composables/useSearchHistory";

const router = useRouter();
const lastArea = ref(readStorage<string>("last-area", ""));
const { favorites } = useFavorites();
const { historyNames: recentSearches } = useSearchHistory();

/** 常看玩家 = 收藏（带 ★）+ 不在收藏里的最近搜索名字 */
const recentNames = computed(() => {
  const favoriteNames = new Set(favorites.value.map((entry) => entry.name));
  return recentSearches.value.filter((name) => !favoriteNames.has(name));
});


function hasLogin(): boolean {
  return Boolean(getSelfUinFromCookie()) && hasLoginState();
}

function goSelf(): void {
  if (!lastArea.value) return;
  const cookieUin = getSelfUinFromCookie();
  if (lastArea.value && cookieUin) {
    void router.push({ name: "summary", params: { area: lastArea.value, accountType: "1", id: cookieUin } });
    return;
  }
  void router.push({ name: "area", params: { area: lastArea.value } });
}

function openFavorite(f: FavoriteEntry): void {
  void router.push({ name: "summary", params: { area: String(f.area), accountType: f.accountType || "2", id: f.id } });
}

function searchName(name: string): void {
  void router.push({ name: "search", params: { nickname: name } });
}
</script>
