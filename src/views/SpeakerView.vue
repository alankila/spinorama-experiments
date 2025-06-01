<script setup lang="ts">

import { computed, onMounted, onUnmounted, ref, useTemplateRef, watch } from "vue";
import { setToMeanOnAxisLevel, readSpinoramaData, normalizedToOnAxis, emptySpinorama, metadata, iirAppliedSpin } from "@/util/spinorama";
import { useRouter } from "vue-router";
import { compute_cea2034 as computeCea2034, estimated_inroom as estimateInRoom } from "@/util/cea2034";
import { renderCea2034Plot, renderContour, renderFreqPlot } from "@/util/graphs";
import { Biquads } from "@/util/iir";
import Graph from "@/components/Graph.vue";

const { speakerId, measurementId } = defineProps<{ speakerId: keyof typeof metadata, measurementId: string }>();
const router = useRouter();

const applyIir = ref(false);

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
const horizontalContourNormalized = normalizedToOnAxis(horizontalContourOriginal);
const verticalContourNormalized = normalizedToOnAxis(verticalContourOriginal);
const cea2034Normalized = computeCea2034(horizontalContourNormalized, verticalContourNormalized)

/* Dynamic bits affected by eq */
const horizontalContour = computed(() => biquads && applyIir.value ? iirAppliedSpin(horizontalContourOriginal, biquads) : horizontalContourOriginal)
const verticalContour = computed(() => biquads && applyIir.value ? iirAppliedSpin(verticalContourOriginal, biquads) : verticalContourOriginal)
const cea2034 = computed(() => computeCea2034(horizontalContour.value, verticalContour.value))
const pir = computed(() => estimateInRoom(cea2034.value))

const directivityAngles = ["60°", "50°", "40°", "30°", "20°", "10°", "On-Axis", "-10°", "-20°", "-30°", "-40°", "-50°", "-60°"] as const;

</script>

<template>
  <h1 class="title">{{ metadata[speakerId].brand }} {{ metadata[speakerId].model }}</h1>

  <div class="form">
    <label>
      <input type="checkbox" v-model="applyIir">
      Apply recommended auto-iir eq to the measurements
    </label>
  </div>

  <h1>CEA2034</h1>
  <Graph :spin="cea2034" :render="renderCea2034Plot" :datasets="[]"/>

  <h1>CEA2034 Normalized</h1>
  <Graph :spin="cea2034Normalized" :render="renderCea2034Plot" :datasets="[]"/>

  <h1>On axis</h1>
  <Graph :spin="cea2034" :render="renderCea2034Plot" :datasets="['On-Axis']" :regression="{ min: 100, max: 12000 }"/>

  <h1>Early reflections</h1>
  <Graph :spin="cea2034" :render="renderFreqPlot" :datasets="['Front Wall Bounce', 'Side Wall Bounce', 'Rear Wall Bounce', 'Floor Bounce', 'Ceiling Bounce', 'Total Early Reflections']"/>

  <h1>Estimated In-Room Response</h1>
  <Graph :spin="pir" :render="renderFreqPlot" :datasets="['Estimated In-Room']" :regression="{ min: 100, max: 12000 }"/>

  <h1>Horizontal reflections</h1>
  <Graph :spin="cea2034" :render="renderFreqPlot" :datasets="['Front Wall Bounce', 'Side Wall Bounce', 'Rear Wall Bounce', 'Total Horizontal Reflection']" />

  <h1>Vertical reflections</h1>
  <Graph :spin="cea2034" :render="renderFreqPlot" :datasets="['Front Wall Bounce', 'Side Wall Bounce', 'Rear Wall Bounce', 'Total Horizontal Reflection']" />

  <h1>Horizontal</h1>
  <Graph :spin="horizontalContour" :render="renderFreqPlot" :datasets="directivityAngles" />

  <h1>Vertical</h1>
  <Graph :spin="verticalContour" :render="renderFreqPlot" :datasets="directivityAngles" />

  <h1>Horizontal Normalized</h1>
  <Graph :spin="horizontalContourNormalized" :render="renderFreqPlot" :datasets="directivityAngles" />

  <h1>Vertical Normalized</h1>
  <Graph :spin="verticalContourNormalized" :render="renderFreqPlot" :datasets="directivityAngles" />

  <h1>Horizontal contour</h1>
  <Graph :spin="horizontalContour" :render="renderContour" :datasets="[]" />

  <h1>Vertical contour</h1>
  <Graph :spin="verticalContour" :render="renderContour" :datasets="[]" />

  <h1>Horizontal Contour Normalized</h1>
  <Graph :spin="horizontalContourNormalized" :render="renderContour" :datasets="[]" />

  <h1>Vertical Contour Normalized</h1>
  <Graph :spin="verticalContourNormalized" :render="renderContour" :datasets="[]" />
</template>

<style scoped>
h1 {
  text-align: center;
}
h1.title {
  font-weight: bold;
  margin-bottom: 1em;
}
.form {
  margin: 0 3em;
}
svg {
  background-color: white;
  color: black;
  width: 100%;
  padding: 1em;
}
</style>