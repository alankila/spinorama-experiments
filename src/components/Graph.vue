<script setup lang="ts" generic="T extends { [key: string]: Map<number, number> }">

import * as d3 from "d3"
import type { Domain, GraphType } from '@/util/graphs'
import type { SpinoramaData } from '@/util/loaders-spin'
import { onMounted, onUnmounted, ref, useTemplateRef, watchEffect } from 'vue'

const svg = useTemplateRef("svg")

/**
 * Component props with TypeScript definitions
 */
const { render, spin, datasets, regression, domain } = defineProps<{
  /**
   * The rendering function for the graph
   */
  render: GraphType<T>,
  /**
   * The spinorama data to visualize
   */
  spin: SpinoramaData<T>,
  /**
   * Array of dataset keys to render
   */
  datasets: readonly (keyof T & string)[],

  /**
   * Optional regression domain parameters
   */
  regression?: Domain,

  /**
   * Optional domain parameters for y-axis scaling
   */
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

  const graph = d3.select(svg.value)
  graph.selectAll(".busted").remove()

  if (spin.isBusted) {
    graph.append("g")
    .attr("class", "busted")
    .append("text")
    .attr("fill", "#800")
    .attr("transform", `translate(0, 20)`)
    .text("Busted!")
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