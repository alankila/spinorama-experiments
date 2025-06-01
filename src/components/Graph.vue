<script setup lang="ts" generic="T extends { [key: string]: Map<number, number> }">

import type { GraphType } from '@/util/graphs';
import type { SpinoramaData } from '@/util/spinorama';
import { onMounted, onUnmounted, useTemplateRef, watchEffect } from 'vue';

const svg = useTemplateRef("svg")

const { render, spin, datasets, regression } = defineProps<{
  render: GraphType<T>,
  spin: SpinoramaData<T>,
  datasets: readonly (keyof T & string)[],
  regression?: { min: number, max: number },
}>()

/**
 * Refresh SVGs
 */
function refresh() {
  watchEffect(() => svg.value && render(svg.value, spin, datasets, regression));
}

onMounted(refresh);

onMounted(() => {
  window.addEventListener("resize", refresh)
})
onUnmounted(() => {
  window.removeEventListener("resize", refresh);
})

</script>

<template>
  <svg ref="svg"></svg>
</template>

<style scoped>
svg {
  background-color: white;
  color: black;
}
</style>