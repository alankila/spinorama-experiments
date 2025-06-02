<script setup lang="ts">

import { computed, ref } from "vue";
import { readSpinoramaData, normalizedToOnAxis, emptySpinorama, metadata, iirAppliedSpin, iirToSpin, type SpinoramaData } from "@/util/spinorama";
import { useRouter } from "vue-router";
import { compute_cea2034 as computeCea2034, estimated_inroom as estimateInRoom } from "@/util/cea2034";
import { renderCea2034Plot, renderContour, renderFreqPlot } from "@/util/graphs";
import { Biquads } from "@/util/iir";
import Graph from "@/components/Graph.vue";

const { speakerId, measurementId } = defineProps<{ speakerId: keyof typeof metadata, measurementId: string }>();
const router = useRouter();

const applyIir = ref(false);
const showNormalized = ref(false);

let horizSpin = emptySpinorama;
let vertSpin = emptySpinorama;
let biquads: Biquads | undefined
let iirSpin: SpinoramaData<{ [key: string]: Map<number, number> }> | undefined;

try {
  const baseMeasurement = router.resolve("/").href + `measurements/${speakerId}/${measurementId}.zip`;
  [horizSpin, vertSpin] = await readSpinoramaData(baseMeasurement)

  const baseEq = router.resolve("/").href + `eq/${speakerId}/iir-autoeq.txt`;
  const iirRequest = await fetch(baseEq)
  const apoConfig = await iirRequest.text()
  biquads = Biquads.fromApoConfig(apoConfig, 48000)
  iirSpin = iirToSpin(horizSpin.freq, biquads)
}
catch (error) {
  console.log(error);
  alert(`The file format for ${speakerId}/${measurementId} is not yet supported: ` + error);
}

/* Not affected by eq, so cached as-is */
const horizontalContour = computed(() => {
  if (showNormalized.value) {
    return normalizedToOnAxis(horizSpin);
  } else if (biquads && applyIir.value) {
    return iirAppliedSpin(horizSpin, biquads);
  } else {
    return horizSpin;
  }
});

const verticalContour = computed(() => {
  if (showNormalized.value) {
    return normalizedToOnAxis(vertSpin);
  } else if (biquads && applyIir.value) {
    return iirAppliedSpin(vertSpin, biquads);
  } else {
    return vertSpin;
  }
});

const cea2034 = computed(() => computeCea2034(horizontalContour.value, verticalContour.value))
const pir = computed(() => estimateInRoom(cea2034.value))

const directivityAngles = ["60°", "50°", "40°", "30°", "20°", "10°", "On-Axis", "-10°", "-20°", "-30°", "-40°", "-50°", "-60°"] as const;

</script>

<template>
  <div class="measurement">
    <h1 class="title">{{ metadata[speakerId].brand }} {{ metadata[speakerId].model }}</h1>

    <div class="form">
      <label>
        <input type="checkbox" v-model="applyIir">
        Apply autoeq parametric equalizer to the measurements
      </label>

      <label>
        <input type="checkbox" v-model="showNormalized">
        Normalize measurements to produce flat On-Axis response level
      </label>
    </div>

    <div class="card-container">
      <div class="card">
        <h1>CEA2034</h1>
        <Graph :spin="cea2034" :render="renderCea2034Plot" :datasets="[]" />
      </div>

      <div class="card">
        <h1>On axis</h1>
        <Graph :spin="cea2034" :render="renderFreqPlot" :datasets="['On-Axis']" :regression="{ min: 100, max: 12000 }" />
      </div>

      <div class="card">
        <h1>Early reflections</h1>
        <Graph :spin="cea2034" :render="renderFreqPlot" :datasets="['Front Wall Bounce', 'Side Wall Bounce', 'Rear Wall Bounce', 'Floor Bounce', 'Ceiling Bounce', 'Total Early Reflections']" />
      </div>

      <div class="card">
        <h1>Estimated In-Room Response</h1>
        <Graph :spin="pir" :render="renderFreqPlot" :datasets="['Estimated In-Room']"
          :regression="{ min: 100, max: 12000 }" />
      </div>

      <div class="card">
        <h1>Horizontal reflections</h1>
        <Graph :spin="cea2034" :render="renderFreqPlot" :datasets="['Front Wall Bounce', 'Side Wall Bounce', 'Rear Wall Bounce', 'Total Horizontal Reflection']" />
      </div>

      <div class="card">
        <h1>Vertical reflections</h1>
        <Graph :spin="cea2034" :render="renderFreqPlot" :datasets="['Floor Bounce', 'Ceiling Bounce', 'Total Vertical Reflection']" />
      </div>

      <div class="card">
        <h1>Horizontal</h1>
        <Graph :spin="horizontalContour" :render="renderFreqPlot" :datasets="directivityAngles" />
      </div>

      <div class="card">
        <h1>Vertical</h1>
        <Graph :spin="verticalContour" :render="renderFreqPlot" :datasets="directivityAngles" />
      </div>

      <div class="card">
        <h1>Horizontal contour</h1>
        <Graph :spin="horizontalContour" :render="renderContour" :datasets="[]" />
      </div>

      <div class="card">
        <h1>Vertical contour</h1>
        <Graph :spin="verticalContour" :render="renderContour" :datasets="[]" />
      </div>

      <div class="card" v-if="iirSpin">
        <h1>AutoEQ IIR filters</h1>
        <Graph :spin="iirSpin" :render="renderFreqPlot" :datasets="Object.keys(iirSpin.datasets)" :domain="{ min: -10, max: 10 }" />
      </div>
    </div>
  </div>
</template>

<style scoped>

div.measurement {
  display: grid;
  grid-template-areas: "title form" "content content";
  grid-template-columns: max-content 1fr;
  grid-template-rows: max-content 1fr;
  max-height: 100vh;
}

h1 {
  grid-area: title;
  padding: 0.5em 1em;
  margin: 0;
}

h1.title {
  font-weight: bold;
  align-self: center;
}

.form {
  grid-area: form;
  display: grid;
  gap: 0.5em;
  align-self: center;
}

.card-container {
  grid-area: content;
  border-top: 1px solid black;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1200px));
  gap: 1em;
  overflow-y: scroll;
  padding: 1em;
  justify-content: center;
  background-color: #ddd;
}

.card {
  background-color: white;
  border: 1px solid black;
  border-radius: 1em;
  box-shadow: 0px 0.5em 1em rgba(0, 0, 0, 0.3);
  height: content;
  padding: 0.5em;
}

.card svg {
  width: 100%;
}

</style>