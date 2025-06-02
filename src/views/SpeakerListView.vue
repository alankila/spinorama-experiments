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

  <div class="speakers">
    <div class="card" v-for="[speakerId, speaker] of Object.entries(metadata)">
      <div><img loading="lazy" :src="`pictures/${encodeURI(speakerId)}.webp`"/></div>
      <div class="bold">
        {{speaker.brand}} {{speaker.model}}
      </div>
      <div>
        Price: <span class="bold">{{speaker.price}}</span> $<br/>
        Tonality: <span class="bold">{{ tonalityScore(speaker) }}</span><br/>
        Bass extension: <span class="bold">{{ bassExtension(speaker) }}</span> Hz<br/>
        Flatness: <span class="bold">&pm;{{ flatness(speaker) }}</span> dB</br>
      </div>
      <div class="link">
        <RouterLink :to="`view/${encodeURI(speakerId)}/${encodeURI(speaker.default_measurement)}`">
          {{ speaker.default_measurement }}
        </RouterLink>
        <span :class="['klippel', 'spl_hv_txt', 'gll_hv_txt'].indexOf(format(speaker)) !== -1 ? 'ok' : 'error'">({{ format(speaker) }})</span>
      </div>
    </div>
  </div>
</template>

<style scoped>

.speakers {
  display: grid;
  grid-template-columns: repeat(auto-fit, 400px);
  gap: 1em;
}

.card {
  padding: 0 0 1em 0;
  border-radius: 0.5em;
  box-shadow: 0px 0.5em 1em rgba(0, 0, 0, 0.3);
  display: grid;
  align-items: center;
  justify-items: center;
  grid-template-rows: 1fr;
  grid-auto-rows: max-content;
  gap: 0.5em;
  overflow: hidden;
}

.card img {
  max-width: 400px;
  max-height: 600px;
}

.card .link {
  border-top: 1px solid #ccc;
  padding-top: 0.5em;
  width: 100%;
  text-align: center;
}

.card .bold {
  font-weight: bold;
}

.ok {
  color: green;
}
.error {
  color: red;
}

</style>