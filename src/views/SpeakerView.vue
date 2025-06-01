<script setup lang="ts">

import { onMounted, onUnmounted, useTemplateRef } from "vue";
import { setToMeanOnAxisLevel, readSpinoramaData, normalizedToOnAxis, emptySpinorama, metadata } from "@/util/spinorama";
import { useRouter } from "vue-router";
import { compute_cea2034, estimated_inroom } from "@/util/cea2034";
import { renderCea2034Plot, renderContour, renderFreqPlot } from "@/util/graphs";

const { speakerId, measurementId } = defineProps<{ speakerId: keyof typeof metadata, measurementId: string }>();
const router = useRouter();
const base = router.resolve("/").href + `measurements/${speakerId}/${measurementId}/`;

const svgCea2034 = useTemplateRef("svgCea2034")
const svgCea2034Normalized = useTemplateRef("svgCea2034Normalized")
const svgOnAxis = useTemplateRef("svgOnAxis")
const svgEarlyReflections = useTemplateRef("svgEarlyReflections")
const svgPir = useTemplateRef("svgPir")
const svgHorizontalReflections = useTemplateRef("svgHorizontalReflections")
const svgVerticalReflections = useTemplateRef("svgVerticalReflections")
const svgHorizontal = useTemplateRef("svgHorizontal")
const svgVertical = useTemplateRef("svgVertical")
const svgHorizontalNormalized = useTemplateRef("svgHorizontalNormalized")
const svgVerticalNormalized = useTemplateRef("svgVerticalNormalized")
const svgHorizontalContour = useTemplateRef("svgHorizontalContour")
const svgVerticalContour = useTemplateRef("svgVerticalContour")
const svgHorizontalContourNormalized = useTemplateRef("svgHorizontalContourNormalized")
const svgVerticalContourNormalized = useTemplateRef("svgVerticalContourNormalized")

let horizontalContour = emptySpinorama;
let verticalContour = emptySpinorama;
try {
  horizontalContour = await readSpinoramaData(base + "SPL Horizontal.txt")
  setToMeanOnAxisLevel(horizontalContour);

  verticalContour = await readSpinoramaData(base + "SPL Vertical.txt")
  setToMeanOnAxisLevel(verticalContour);

  if ("" + horizontalContour.freq != "" + verticalContour.freq) {
    throw new Error("Frequency data mismatch between SPL Horizontal and Vertical!");
  }
}
catch (error) {
  alert(`The file format for ${speakerId}/${measurementId} is not yet supported: ` + error);
}

const horizontalContourNormalized = normalizedToOnAxis(horizontalContour);
const verticalContourNormalized = normalizedToOnAxis(verticalContour);

const cea2034 = compute_cea2034(horizontalContour, verticalContour)
const cea2034Normalized = compute_cea2034(horizontalContourNormalized, verticalContourNormalized);
const pir = estimated_inroom(cea2034)

/**
 * Refresh SVGs
 */
function render() {
  svgCea2034.value && renderCea2034Plot(svgCea2034.value, cea2034)
  svgCea2034Normalized.value && renderCea2034Plot(svgCea2034Normalized.value, cea2034Normalized)
  svgOnAxis.value && renderFreqPlot(svgOnAxis.value, cea2034, ["On-Axis"], {
    min: 100,
    max: 12000,
  })

  svgEarlyReflections.value && renderFreqPlot(svgEarlyReflections.value, cea2034, ["Front Wall Bounce", "Side Wall Bounce", "Rear Wall Bounce", "Floor Bounce", "Ceiling Bounce", "Total Early Reflections"])

  svgPir.value && renderFreqPlot(svgPir.value, pir, ["Estimated In-Room"], {
    min: 100, max: 12000,
  })

  svgHorizontalReflections.value && renderFreqPlot(svgHorizontalReflections.value, cea2034, ["Front Wall Bounce", "Side Wall Bounce", "Rear Wall Bounce", "Total Horizontal Reflection"])
  svgVerticalReflections.value && renderFreqPlot(svgVerticalReflections.value, cea2034, ["Floor Bounce", "Ceiling Bounce", "Total Vertical Reflection"])

  svgHorizontalContour.value && renderContour(svgHorizontalContour.value, horizontalContour)
  svgHorizontalContourNormalized.value && renderContour(svgHorizontalContourNormalized.value, horizontalContourNormalized)

  const directivityAngles = ["60°", "50°", "40°", "30°", "20°", "10°", "On-Axis", "-10°", "-20°", "-30°", "-40°", "-50°", "-60°"] as const;
  svgHorizontal.value && renderFreqPlot(svgHorizontal.value, horizontalContour, directivityAngles)
  svgHorizontalNormalized.value && renderFreqPlot(svgHorizontalNormalized.value, horizontalContourNormalized, directivityAngles)

  svgVerticalContour.value && renderContour(svgVerticalContour.value, verticalContour)
  svgVerticalContourNormalized.value && renderContour(svgVerticalContourNormalized.value, verticalContourNormalized)

  svgVertical.value && renderFreqPlot(svgVertical.value, verticalContour, directivityAngles)
  svgVerticalNormalized.value && renderFreqPlot(svgVerticalNormalized.value, verticalContourNormalized, directivityAngles)
}

onMounted(render);

onMounted(() => {
  window.addEventListener("resize", render)
})
onUnmounted(() => {
  window.removeEventListener("resize", render);
})

</script>

<template>
  <h1 class="title">{{ metadata[speakerId].brand }} {{ metadata[speakerId].model }}</h1>

  <h1>CEA2034</h1>
  <svg ref="svgCea2034"></svg>

  <h1>CEA2034 Normalized</h1>
  <svg ref="svgCea2034Normalized"></svg>

  <h1>On axis</h1>
  <svg ref="svgOnAxis"></svg>

  <h1>Early reflections</h1>
  <svg ref="svgEarlyReflections"></svg>

  <h1>Estimated In-Room Response</h1>
  <svg ref="svgPir"></svg>

  <h1>Horizontal reflections</h1>
  <svg ref="svgHorizontalReflections"></svg>

  <h1>Vertical reflections</h1>
  <svg ref="svgVerticalReflections"></svg>

  <h1>Horizontal</h1>
  <svg ref="svgHorizontal"></svg>

  <h1>Vertical</h1>
  <svg ref="svgVertical"></svg>

  <h1>Horizontal Normalized</h1>
  <svg ref="svgHorizontalNormalized"></svg>

  <h1>Vertical Normalized</h1>
  <svg ref="svgVerticalNormalized"></svg>

  <h1>Horizontal contour</h1>
  <svg ref="svgHorizontalContour"></svg>

  <h1>Vertical contour</h1>
  <svg ref="svgVerticalContour"></svg>

  <h1>Horizontal Contour Normalized</h1>
  <svg ref="svgHorizontalContourNormalized"></svg>

  <h1>Vertical Contour Normalized</h1>
  <svg ref="svgVerticalContourNormalized"></svg>
</template>

<style scoped>
h1 {
  text-align: center;
}
h1.title {
  font-weight: bold;
  margin-bottom: 1em;
}
svg {
  background-color: white;
  color: black;
  width: 100%;
  padding: 1em;
}
</style>