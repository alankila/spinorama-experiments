<script setup lang="ts">

import { computed, ref, watchEffect } from "vue";
import { readSpinoramaData, normalizedToOnAxis, emptySpinorama, metadata, iirAppliedSpin, iirToSpin, type SpinoramaData } from "@/util/loaders";
import { useRouter } from "vue-router";
import { compute_cea2034 as computeCea2034, estimated_inroom as estimateInRoom } from "@/util/cea2034";
import { renderCea2034Plot, renderContour, renderFreqPlot } from "@/util/graphs";
import { Biquads } from "@/util/iir";
import Graph from "@/components/Graph.vue";
import { getScores } from "@/util/scores";

const { speakerId, measurementId } = defineProps<{ speakerId: keyof typeof metadata, measurementId: string }>();
const router = useRouter();

const applyIir = ref(false);
const showNormalized = ref(false);

const shownMeasurementId = ref(measurementId)
const measurements = Object.keys(metadata[speakerId].measurements)

let biquads: Biquads | undefined
let iirSpin: SpinoramaData<{ [key: string]: Map<number, number> }> | undefined;
try {
  const baseEq = router.resolve("/").href + `eq/${speakerId}/iir-autoeq.txt`;
  const iirRequest = await fetch(baseEq)
  const apoConfig = await iirRequest.text()
  biquads = Biquads.fromApoConfig(apoConfig, 48000)
  let freq = 20
  let freqs: number[] = []
  while (freq < 20000) {
    freqs.push(freq)
    freq *= 1.03 /* 3 % increment = ~23 per octave */
  }
  iirSpin = iirToSpin(freqs, biquads)
}
catch (error) {
  console.log("Unable to read equalization data", error)
}

/* Danger: recall that all reactive properties must be accessed before first await */
let horizSpin = ref(emptySpinorama);
let vertSpin = ref(emptySpinorama);
watchEffect(async () => {
  const measurementId = shownMeasurementId.value

  try {
    const baseMeasurement = router.resolve("/").href + `measurements/${speakerId}/${measurementId}.zip`;
    [horizSpin.value, vertSpin.value] = await readSpinoramaData(baseMeasurement)
  }
  catch (error) {
    console.log(error);
    alert(`The file format for ${speakerId}/${measurementId} is not yet supported: ` + error);
  }
})


/* Not affected by eq, so cached as-is */
const horizontalContour = computed(() => {
  if (showNormalized.value) {
    return normalizedToOnAxis(horizSpin.value);
  } else if (biquads && applyIir.value) {
    return iirAppliedSpin(horizSpin.value, biquads);
  } else {
    return horizSpin.value;
  }
});

const verticalContour = computed(() => {
  if (showNormalized.value) {
    return normalizedToOnAxis(vertSpin.value);
  } else if (biquads && applyIir.value) {
    return iirAppliedSpin(vertSpin.value, biquads);
  } else {
    return vertSpin.value;
  }
});

const cea2034 = computed(() => computeCea2034(horizontalContour.value, verticalContour.value))
const pir = computed(() => estimateInRoom(cea2034.value))
const scores = computed(() => getScores(cea2034.value))

const directivityAngles = ["60°", "50°", "40°", "30°", "20°", "10°", "On-Axis", "-10°", "-20°", "-30°", "-40°", "-50°", "-60°"] as const;

</script>

<template>
  <div class="grid grid-cols-[max-content_1fr] grid-rows-[max-content_1fr] max-h-lvh">
    <h1 class="text-3xl font-bold self-center p-4">{{ metadata[speakerId].brand }} {{ metadata[speakerId].model }}</h1>

    <div class="grid grid-flow-col auto-cols-max items-start gap-8 p-4">
      <div class="grid">
        <span class="font-bold">Normalization options:</span>
        <label>
          <input type="checkbox" v-model="applyIir">
          Use recommended AutoEQ
        </label>
        <br/>
        <label>
          <input type="checkbox" v-model="showNormalized">
          Set On-Axis to flat
        </label>
      </div>

      <label>
        <span class="font-bold">Measurement name:</span><br/>
        <select class="row-span-2 p-2 border" v-model="shownMeasurementId" v-if="measurements.length > 1">
          <option v-for="m of measurements" :value="m">{{ m }}</option>
        </select>
        <span v-else>{{ shownMeasurementId }}</span>
      </label>

      <div class="grid grid-cols-[max-content_max-content_max-content_max-content] gap-x-2">
        <div class="justify-self-end">Tonality (speaker only):</div><div class="font-bold">{{ scores.tonality.toFixed(2) }}</div>
        <div class="justify-self-end">Tonality (with sub):</div><div class="font-bold">{{ scores.tonalityNoLfxLimit.toFixed(2) }}</div>

        <div class="justify-self-end">On-Axis NBD:</div><div class="font-bold">{{ scores.nbdOnAxis.toFixed(3) }} dB</div>
        <div class="justify-self-end">LFX:</div><div class="font-bold">{{ scores.lfxHz.toFixed(1) }} Hz</div>
        <div class="justify-self-end">In-room NBD:</div><div class="font-bold">{{ scores.nbdPredInRoom.toFixed(3) }} dB</div>
        <div class="justify-self-end">In-room SM:</div><div class="font-bold">{{ scores.smPredInRoom.toFixed(3) }}</div>
      </div>

    </div>

    <div class="bg-spinorama-bg-darker col-span-2 grid gap-4 overflow-y-scroll p-4 justify-center border-t auto-fit-cols">
      <div class="card">
        <h1>CEA2034</h1>
        <Graph :spin="cea2034" :render="renderCea2034Plot" :datasets="[]" />
      </div>

      <div class="card">
        <h1>On axis</h1>
        <Graph :spin="cea2034" :render="renderFreqPlot" :datasets="['On-Axis']"
          :regression="{ min: 100, max: 12000 }" />
      </div>

      <div class="card">
        <h1>Early reflections</h1>
        <Graph :spin="cea2034" :render="renderFreqPlot"
          :datasets="['Front Wall Bounce', 'Side Wall Bounce', 'Rear Wall Bounce', 'Floor Bounce', 'Ceiling Bounce', 'Total Early Reflections']" />
      </div>

      <div class="card">
        <h1>Estimated In-Room Response</h1>
        <Graph :spin="pir" :render="renderFreqPlot" :datasets="['Estimated In-Room']"
          :regression="{ min: 100, max: 12000 }" />
      </div>

      <div class="card">
        <h1>Horizontal reflections</h1>
        <Graph :spin="cea2034" :render="renderFreqPlot"
          :datasets="['Front Wall Bounce', 'Side Wall Bounce', 'Rear Wall Bounce', 'Total Horizontal Reflection']" />
      </div>

      <div class="card">
        <h1>Vertical reflections</h1>
        <Graph :spin="cea2034" :render="renderFreqPlot"
          :datasets="['Floor Bounce', 'Ceiling Bounce', 'Total Vertical Reflection']" />
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
        <Graph :spin="iirSpin" :render="renderFreqPlot" :datasets="Object.keys(iirSpin.datasets)"
          :domain="{ min: -10, max: 10 }" />
      </div>
    </div>
  </div>
</template>

<style scoped>
@reference "@/assets/main.css";

.auto-fit-cols {
  grid-template-columns: repeat(auto-fit, minmax(320px, 1200px));
}

.card {
  @apply bg-spinorama-bg border rounded-lg shadow p-1;
}

.card h1 {
  @apply font-bold text-2xl text-center mt-2;
}

</style>