<template>
  <svg class="star-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      d="M12 3.1l2.8 5.6 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3.1Z"
      :fill="filled ? 'currentColor' : 'none'"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linejoin="round"
    />
  </svg>
</template>

<script setup lang="ts">
defineProps<{ filled?: boolean }>();
</script>
