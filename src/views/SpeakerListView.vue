<script setup lang="ts">

import { metadata } from '@/util/spinorama';

function tonalityScore(speaker: typeof metadata[keyof typeof metadata]) {
  // @ts-ignore
  const measurement = speaker.measurements[speaker.default_measurement]?.pref_rating
  if (!measurement) {
    return undefined
  }
  return (12.69 - 2.49 * measurement.nbd_on_axis - 2.99 * measurement.nbd_pred_in_room - 4.31 * Math.log10(measurement.lfx_hz) + 2.32 * measurement.sm_pred_in_room).toFixed(1)
}

function bassExtension(speaker: typeof metadata[keyof typeof metadata]) {
  // @ts-ignore
  const measurement = speaker.measurements[speaker.default_measurement]?.pref_rating
  return measurement?.lfx_hz
}

function flatness(speaker: typeof metadata[keyof typeof metadata]) {
  // @ts-ignore
  const measurement = speaker.measurements[speaker.default_measurement]?.estimates
  return measurement?.ref_band?.toFixed(1)
}

function format(speaker: typeof metadata[keyof typeof metadata]) {
  // @ts-ignore
  return speaker.measurements[speaker.default_measurement]?.format;
}

</script>

<template>
  <div class="grid grid-cols-[max-content_1fr] grid-rows-[max-content_1fr] max-h-lvh">
    <h1 class="font-bold self-center py-4 px-8">Unofficial spinorama<br/>(experimental version)</h1>

    <div class="grid self-center">
      xx
    </div>

    <div class="bg-spinorama-bg-darker col-span-2 grid gap-4 overflow-y-scroll p-4 justify-center border-t auto-fit-cols">
      <div class="pb-4 rounded-lg shadow grid items-center justify-items-center grid-rows-1 auto-rows-max gap-2 bg-spinorama-bg" v-for="[speakerId, speaker] of Object.entries(metadata)">
        <div><img loading="lazy" class="max-w-[400px] max-h-600px" :src="`pictures/${encodeURI(speakerId)}.webp`"/></div>
        <div class="font-bold">
          {{speaker.brand}} {{speaker.model}}
        </div>
        <div>
          Price: <span class="font-bold">${{speaker.price}}</span><br/>
          Tonality: <span class="font-bold">{{ tonalityScore(speaker) }}</span><br/>
          Bass extension: <span class="font-bold">{{ bassExtension(speaker) }}&#x202f;Hz</span><br/>
          Flatness: <span class="font-bold">&pm;{{ flatness(speaker) }}&#x202f;dB</span></br>
        </div>
        <div class="border-t pt-2 w-full text-center">
          <RouterLink :to="`view/${encodeURI(speakerId)}/${encodeURI(speaker.default_measurement)}`">
            {{ speaker.default_measurement }}
          </RouterLink>
          <span :class="['klippel', 'spl_hv_txt', 'gll_hv_txt'].indexOf(format(speaker)) !== -1 ? 'text-green-700' : 'text-red-700'"> ({{ format(speaker) }})</span>
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