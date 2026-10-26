<template>
  <section class="panel">
    <header class="panel-title">
      <span class="panel-title-text">{{ title }}</span>
      <span class="panel-spacer"></span>
      <slot name="title-expand"></slot>
    </header>
    <div class="panel-content">
      <slot></slot>
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{ title: string }>();
</script>
