<template>
  <div class="histogram" :class="{ highlight }">
    <div class="histogram-track" :title="titleText">
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
  }>(),
  { color: "#cccccc", text: "", highlight: false }
);

const percent = computed(() => barPercent(props.value, props.max));
const titleText = computed(() => String(props.value ?? ""));
</script>
