<template>
  <div class="lol-tft-app">
    <AppHeader />
    <section class="lol-tft-main" aria-label="战绩内容">
      <router-view v-slot="{ Component, route }">
        <component :is="Component" :key="route.fullPath" />
      </router-view>
    </section>
    <DevDataBar v-if="isDev" />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import AppHeader from "./components/AppHeader.vue";
import DevDataBar from "./components/DevDataBar.vue";
import { ensureDdragonVersion } from "./api/staticData";

const isDev = import.meta.env.DEV;

onMounted(() => {
  void ensureDdragonVersion();
});
</script>
