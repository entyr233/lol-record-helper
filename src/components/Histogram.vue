<template>
  <div class="histogram" :class="{ highlight }" :title="title || undefined">
    <div class="histogram-track" :title="trackTitle">
      <div class="histogram-fill" :style="{ width: percent, backgroundColor: color }"></div>
    </div>
    <span v-if="text" class="histogram-text">{{ text }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { barPercent } from "../utils/format";

const props = withDefaults(
  defineProps<{
    value: number | null | undefined;
    max: number | null | undefined;
    color?: string;
    text?: string;
    highlight?: boolean;
    /** 悬浮说明（例如「对英雄总伤害」）；不传时保持只显示数值 */
    title?: string;
  }>(),
  { color: "#cccccc", text: "", highlight: false, title: "" }
);

const percent = computed(() => barPercent(props.value, props.max));
const titleText = computed(() => String(props.value ?? ""));
/** 有悬浮说明时带上数值，否则沿用旧提示（柱条自身也有 title，避免盖掉外层说明） */
const trackTitle = computed(() => (props.title ? props.title + " " + titleText.value : titleText.value));
</script>
