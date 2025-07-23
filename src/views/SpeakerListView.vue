<script setup lang="ts">

import ourMetadata from "@/our-metadata.json"
import { useAppState } from "@/util/app-state";
import type { Speaker } from "@/util/scores";
import { onUnmounted, ref, watchEffect, type Ref } from 'vue'

/**
 * Delay execution of a function by configured delay. New calls reset the delay.
 * 
 * @param func  
 * @param delay 
 */
function debounce<T extends (...args: any) => void>(func: T, delay = 300) {
  let timer: any;

  onUnmounted(() => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  })

  return (...args: Parameters<T>) => {
    if (timer) {
      clearTimeout(timer)
    }
    timer = setTimeout(() => func(...args), delay)
  }
}

const { speakerListSearch } = useAppState();

let filteredMetadata: Ref<[string, Speaker][]> = ref([])

function tonality(speaker: Speaker) {
  return speaker.measurements[speaker.defaultMeasurement].scores
}

function format(speaker: Speaker) {
  return speaker.measurements[speaker.defaultMeasurement].format
}

const filterMetadata = debounce((lcSearch: string) => {
  filteredMetadata.value = Object.entries(ourMetadata).filter(entry => {
    let result = true
    if (result && lcSearch) {
      result &&= `${entry[1].brand} ${entry[1].model}`.toLowerCase().indexOf(lcSearch) !== -1
    }
    return result
  })
});

watchEffect(() => {
  const lcSearch = speakerListSearch.value.toLowerCase()
  filterMetadata(lcSearch)
})

</script>

<template>
  <div class="grid grid-cols-[max-content_1fr] grid-rows-[max-content_1fr] max-h-lvh">
    <h1 class="font-bold self-center p-4">Unofficial spinorama<br/>(experimental version)</h1>

    <div class="grid self-center p-4">
      <input type="text" class="border p-2" v-model="speakerListSearch" placeholder="Brand or model..."/>
    </div>

    <div class="bg-spinorama-bg-darker col-span-2 grid gap-4 overflow-y-scroll p-4 justify-center border-t auto-fit-cols">
      <div class="pb-4 rounded-lg shadow grid items-center justify-items-center grid-rows-1 auto-rows-max gap-2 bg-spinorama-bg" v-for="[speakerId, speaker] of filteredMetadata">
        <div><img loading="lazy" class="max-w-[400px] max-h-600px" :src="`pictures/${encodeURI(speakerId)}.webp`"/></div>
        <div class="font-bold">
          {{speaker.brand}} {{speaker.model}}
        </div>
        <div>
          Price: <span class="font-bold">${{speaker.price ?? "–"}}</span><br/>
          Tonality: <span class="font-bold">{{ tonality(speaker).tonality.toFixed(1) }}</span><br/>
          Bass extension: <span class="font-bold">{{ tonality(speaker).lfxHz.toFixed(1) }}&#x202f;Hz</span><br/>
          Flatness: <span class="font-bold">&pm;{{ tonality(speaker).flatness.toFixed(1) }}&#x202f;dB</span></br>
        </div>
        <div class="border-t pt-2 w-full text-center">
          <RouterLink :to="`view/${encodeURI(speakerId)}/${encodeURI(speaker.defaultMeasurement)}`">
            {{ speaker.defaultMeasurement }}
          </RouterLink>
          <span :class="tonality(speaker).isBusted ? 'text-red-700' : 'text-green-700'"> ({{ format(speaker) }})</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>

.auto-fit-cols {
  grid-template-columns: repeat(auto-fit, minmax(320px, 400px));
}

</style>