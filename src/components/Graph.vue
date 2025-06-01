<script setup lang="ts" generic="T extends { [key: string]: Map<number, number> }">

import type { GraphType } from '@/util/graphs';
import type { SpinoramaData } from '@/util/spinorama';
import { onMounted, onUnmounted, ref, useTemplateRef, watchEffect } from 'vue';

const svg = useTemplateRef("svg")

const { render, spin, datasets, regression } = defineProps<{
  render: GraphType<T>,
  spin: SpinoramaData<T>,
  datasets: readonly (keyof T & string)[],
  regression?: { min: number, max: number },
}>()

const refreshCounter = ref(1);
let renderedWidth = -1;

/**
 * Refresh SVGs
 */
watchEffect(() => {
  if (svg.value && refreshCounter.value) {
    render(svg.value, spin, datasets, regression)
    renderedWidth = refreshCounter.value
  }
});

{
  function refresh() {
    refreshCounter.value += 1
  }

  onMounted(() => {
    window.addEventListener("resize", ev => refreshCounter.value += renderedWidth != svg.value?.getBoundingClientRect().width ? 1 : 0)
  })
  onUnmounted(() => {
    window.removeEventListener("resize", refresh);
  })
}

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