<script setup lang="ts">

import { computed, onMounted, onUnmounted, ref, useTemplateRef, watch } from "vue";
import { setToMeanOnAxisLevel, readSpinoramaData, normalizedToOnAxis, emptySpinorama, metadata, iirAppliedSpin as iirApplied } from "@/util/spinorama";
import { useRouter } from "vue-router";
import { compute_cea2034 as computeCea2034, estimated_inroom as estimateInRoom } from "@/util/cea2034";
import { renderCea2034Plot, renderContour, renderFreqPlot } from "@/util/graphs";
import { Biquads } from "@/util/iir";
import Graph from "@/components/Graph.vue";

const { speakerId, measurementId } = defineProps<{ speakerId: keyof typeof metadata, measurementId: string }>();
const router = useRouter();

const applyIir = ref(false);
const showNormalized = ref(false);

let horizontalContourOriginal = emptySpinorama;
let verticalContourOriginal = emptySpinorama;
let biquads: Biquads | undefined
try {
  const baseMeasurement = router.resolve("/").href + `measurements/${speakerId}/${measurementId}/`;
  horizontalContourOriginal = await readSpinoramaData(baseMeasurement + "SPL Horizontal.txt")
  setToMeanOnAxisLevel(horizontalContourOriginal);

  verticalContourOriginal = await readSpinoramaData(baseMeasurement + "SPL Vertical.txt")
  setToMeanOnAxisLevel(verticalContourOriginal);

  if ("" + horizontalContourOriginal.freq != "" + verticalContourOriginal.freq) {
    throw new Error("Frequency data mismatch between SPL Horizontal and Vertical!");
  }

  const baseEq = router.resolve("/").href + `eq/${speakerId}/iir-autoeq.txt`;
  const iirRequest = await fetch(baseEq)
  const apoConfig = await iirRequest.text()
  biquads = Biquads.fromApoConfig(apoConfig, 48000)
}
catch (error) {
  console.log(error);
  alert(`The file format for ${speakerId}/${measurementId} is not yet supported: ` + error);
}

/* Not affected by eq, so cached as-is */
const horizontalContour = computed(() => {
  if (showNormalized.value) {
    return normalizedToOnAxis(horizontalContourOriginal);
  } else if (biquads && applyIir.value) {
    return iirApplied(horizontalContourOriginal, biquads);
  } else {
    return horizontalContourOriginal;
  }
});

const verticalContour = computed(() => {
  if (showNormalized.value) {
    return normalizedToOnAxis(verticalContourOriginal);
  } else if (biquads && applyIir.value) {
    return iirApplied(verticalContourOriginal, biquads);
  } else {
    return verticalContourOriginal;
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
        Apply recommended auto-iir equalizer to the measurement
      </label>

      <label>
        <input type="checkbox" v-model="showNormalized">
        Normalize measurements to On-Axis response level
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
        <Graph :spin="cea2034" :render="renderFreqPlot" :datasets="['Front Wall Bounce', 'Side Wall Bounce', 'Rear Wall Bounce', 'Total Horizontal Reflection']" />
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
    </div>
  </div>
</template>

<style scoped>

div.measurement {
  display: grid;
  grid-template-areas: "title form" "content content";
  grid-template-columns: minmax(max-content, 1fr) 1fr;
  grid-template-rows: max-content 1fr;
  max-height: 100vh;
  gap: 1em;
}

h1 {
  grid-area: title;
  text-align: center;
  padding: 0.5em;
}

h1.title {
  font-weight: bold;
  align-self: center;
}

.form {
  grid-area: form;
  display: grid;
  gap: 0.25em;
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
}

.card {
  border: 1px solid black;
  border-radius: 1em;
  box-shadow: 0px 0.5em 1em rgba(0, 0, 0, 0.3);
  height: content;
}

.card svg {
  width: 100%;
}

</style>