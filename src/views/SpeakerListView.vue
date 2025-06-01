<script setup lang="ts">

import { metadata } from '@/util/spinorama';

</script>

<template>

  <div v-for="[speakerId, speaker] of Object.entries(metadata)">
    <div v-for="measurementId of Object.keys(speaker.measurements)">
      <RouterLink :to="`view/${encodeURI(speakerId)}/${encodeURI(measurementId)}`">{{ speakerId }} ({{ measurementId }})</RouterLink>
    </div>
  </div>

</template>

