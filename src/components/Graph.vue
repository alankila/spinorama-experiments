<script setup lang="ts" generic="T extends { [key: string]: Map<number, number> }">

import type { Domain, GraphType } from '@/util/graphs';
import type { SpinoramaData } from '@/util/spinorama';
import { onMounted, onUnmounted, ref, useTemplateRef, watchEffect } from 'vue';

const svg = useTemplateRef("svg")

const { render, spin, datasets, regression, domain } = defineProps<{
  render: GraphType<T>,
  spin: SpinoramaData<T>,
  datasets: readonly (keyof T & string)[],
  regression?: Domain,
  domain?: Domain,
}>()

const refreshCounter = ref(1);
let renderedWidth = -1;

/**
 * Refresh SVGs
 */
watchEffect(() => {
  if (svg.value && refreshCounter.value) {
    render(svg.value, spin, datasets, regression, domain)
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
  <svg class="bg-spinorama-bg text-spinorama-fg w-full" ref="svg"></svg>
</template>