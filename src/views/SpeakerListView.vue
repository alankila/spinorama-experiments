<script setup lang="ts">

interface SpinoramaMetadata {
  [speakerId: string]: SpeakerData
}

interface SpeakerData {
  amount: string
  brand: string
  measurements: {
    [measurementId: string]: MeasurementData
  },
  model: string
  nearest: [
    [number, string]
  ],
  price: string
  shape: string
  type: string
}

interface MeasurementData {
  /* need these? */
  estimates: {}
  estimates_eq: {}

  format: string
  origin: string
  pref_rating: PrefRating
  pref_rating_eq: PrefRating
  quality: string
  review_published: string
  review?: string
  reviews?: {
    [reviewerId: string]: string
  }  
  scaled_pref_rating: {}
  specifications: {
    SPL: {
      peak: number
    }
    size: {
      depth: number
      width: number
      height: number
    }
    weight: number
  }
}

interface PrefRating {
  aad_on_axis: number
  lfq: number
  lfx_hz: number
  nbd_listening_window: number
  nbd_on_axis: number
  nbd_pred_in_room: number
  nbd_sound_power: number
  pref_score: number
  pref_score_wsub: number
  sm_pred_in_room: number
  sm_sound_power: number
}

const metadataResult = await fetch("metadata.json")
const metadata = await metadataResult.json() as SpinoramaMetadata;

</script>

<template>

  <div v-for="speakerId of Object.keys(metadata)">
    <div v-for="measurementId of Object.keys(metadata[speakerId].measurements)">
      <RouterLink :to="`view/${encodeURI(speakerId)}/${encodeURI(measurementId)}`">{{ speakerId }} ({{ measurementId }})</RouterLink>
    </div>
  </div>

</template>

