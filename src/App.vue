<template>
  <div class="lol-tft-app">
    <AppHeader />
    <main class="lol-tft-main">
      <router-view v-slot="{ Component, route }">
        <component :is="Component" :key="route.fullPath" />
      </router-view>
    </main>
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
