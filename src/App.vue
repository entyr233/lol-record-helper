<template>
  <div class="lol-tft-app">
    <AppHeader />
    <main class="lol-tft-main">
      <router-view v-slot="{ Component, route }">
        <component :is="Component" :key="route.fullPath" />
      </router-view>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import AppHeader from "./components/AppHeader.vue";
import { ensureDdragonVersion } from "./api/staticData";

onMounted(() => {
  void ensureDdragonVersion();
});
</script>
