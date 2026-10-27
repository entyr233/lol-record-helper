<template>
  <span class="game-icon" :class="'game-icon--' + kind">
    <img
      class="game-icon-img"
      :src="src"
      :title="failed ? '图标加载失败' : title"
      :alt="title || kind"
      loading="lazy"
      decoding="async"
      @error="handleError"
    />
  </span>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  championIconUrl,
  getChampionSpells,
  getItemName,
  getRuneInfo,
  itemIconUrl,
  summonSpellIconUrl,
  userIconFallbackUrl,
  userIconUrl
} from "../api/staticData";

export type IconKind = "champion" | "user" | "item" | "rune" | "summon-spell" | "champion-spell" | "url";

const props = defineProps<{
  kind: IconKind;
  id: number | string;
  championId?: number;
  /** kind="url" 时直接作为图标地址 */
  src?: string;
  /** 悬停提示（海克斯强化的中文名等） */
  title?: string;
}>();

const FALLBACK_ICON =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#20262e"/></svg>');

const failed = ref(false);
const userIconFailed = ref(false);
const spellIcon = ref<string | null>(null);
const spellTitle = ref<string | null>(null);

const baseSrc = computed(() => {
  switch (props.kind) {
    case "url":
      return props.src || FALLBACK_ICON;
    case "champion":
      return championIconUrl(props.id);
    case "user":
      return userIconFailed.value ? userIconFallbackUrl(props.id) : userIconUrl(props.id);
    case "item":
      return itemIconUrl(props.id);
    case "rune":
      return getRuneInfo(props.id)?.icon ?? FALLBACK_ICON;
    case "summon-spell":
      return summonSpellIconUrl(props.id);
    default:
      return FALLBACK_ICON;
  }
});

const src = computed(() => (failed.value ? FALLBACK_ICON : spellIcon.value || baseSrc.value));

const title = computed(() => {
  // 明确传入的 title 优先（例如海克斯强化名称、装备自定义说明）
  if (props.title) return props.title;
  if (spellTitle.value) return spellTitle.value;
  if (props.kind === "rune") return getRuneInfo(props.id)?.name ?? "";
  if (props.kind === "item") return getItemName(props.id) ?? "";
  return "";
});

watch(
  [() => props.kind, () => props.id, () => props.championId],
  async () => {
    failed.value = false;
    spellIcon.value = null;
    spellTitle.value = null;
    if (props.kind !== "champion-spell" || !props.championId) return;
    try {
      const spells = await getChampionSpells(props.championId);
      const target = spells.find((item) => item.spellKey === String(props.id));
      if (target) {
        spellIcon.value = target.abilityIconPath;
        spellTitle.value = "【" + target.name + "】\n" + target.description;
      }
    } catch {
      /* 图标加载失败不影响列表渲染 */
    }
  },
  { immediate: true }
);

function handleError(): void {
  if (spellIcon.value) {
    spellIcon.value = null;
    return;
  }
  if (props.kind === "user" && !userIconFailed.value) {
    userIconFailed.value = true;
    return;
  }
  failed.value = true;
}
</script>
