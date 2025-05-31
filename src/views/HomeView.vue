<script setup lang="ts">

import { onMounted, useTemplateRef } from "vue";
import { parse } from "papaparse";
import * as d3 from "d3";

const svgCea2034 = useTemplateRef("svgCea2034")
const svgCea2034Normalized = useTemplateRef("svgCea2034Normalized")
const svgEarlyReflections = useTemplateRef("svgEarlyReflections")
const svgHorizontalReflections = useTemplateRef("svgHorizontalReflections")
const svgVerticalReflections = useTemplateRef("svgVerticalReflections")
const svgHorizontalContour = useTemplateRef("svgHorizontalContour")
const svgVerticalContour = useTemplateRef("svgVerticalContour")
const svgHorizontalContourNormalized = useTemplateRef("svgHorizontalContourNormalized")
const svgVerticalContourNormalized = useTemplateRef("svgVerticalContourNormalized")

interface SpinoramaData {
  title: string,
  datasets: string[],
  headers: string[],
  data: number[][],
}

interface SpinoramaDataset {
  dataset: string,
  headers: string[],
  data: number[][],
}

async function readSpinoramaData(url: string): Promise<SpinoramaData> {
  const graphResult = await fetch(url);
  const csv = (await graphResult.text()).replace(/\s+$/, "")

  let data = parse(csv, { delimiter: "\t" }).data as string[][]
  let title = data.shift() ?? ""
  let datasets = data.shift() ?? []
  let headers = data.shift() ?? []

  /* Spinorama's data format explanation. File is tab-separated CSV collection of data points.
   * Usually, multiple datasets are stored in each file. Format has 3 header rows, followed by the data rows.
   * 
   * The first row labels the dataset (1 column in CSV)
   * 
   * Second row indicates starts indexes of each datasets.
   * The cell is empty if that column belongs to the preceding dataset.
   * 
   * The third row labels the data rows, and is like a traditional CSV header.
   * 
   * Data rows are formatted in U.S. numeric format with thousands separator,
   * e.g. 1,234.56.
   */
  return {
    title: title![0],
    datasets,
    headers,
    data: data.map(da => da.map(n => parseFloat(n.replace(",", "")))),
  }
}

function getDataset(ds: SpinoramaData, dataset: string): SpinoramaDataset {
  let i = ds.datasets.indexOf(dataset);
  if (i == -1) {
    throw new Error("No such dataset: " + dataset);
  }

  let j = i + 1;
  while (!ds.datasets[j]) {
    j ++;
  }

  return {
    dataset: dataset,
    headers: ds.headers.slice(i, j),
    data: ds.data.map(d => d.slice(i, j)),
  };
}

function renderFreqPlot(svg: SVGSVGElement, dataset: SpinoramaData) {
  // Declare the chart dimensions and margins.
  const width = 2000;
  const height = 1000;
  const marginTop = 20;
  const marginRight = 30;
  const marginBottom = 30;
  const marginLeft = 40;

  /* Labels for all datasets + index to that dataset's data in each row */
  const datasets = dataset.datasets.filter(n => n);
  const datasetIndexes: { [key: string]: number } = {}
  for (let ds of datasets) {
    datasetIndexes[ds] = dataset.datasets.indexOf(ds);
  }

  /* x & y scales, color scale for graphs, and coordinates for labels */
  const x = d3.scaleLog([20, 20000], [marginLeft, width - marginRight]);
  const y = d3.scaleLinear([-45, 5], [height - marginBottom, marginTop]);
  const z = d3.scaleOrdinal(d3.schemeCategory10).domain(datasets);

  /* line constructor */
  const line = d3.line()
  .x(d => x(d[0]))
  .y(d => y(d[1]));

  const graph = d3.select(svg)
  .attr("viewBox", [0, 0, width, height]);

  /* x axis ticks */
  graph.append("g")
  .attr("transform", `translate(0, ${height - marginBottom})`)
  .attr("stroke", "black")
  .call(d3.axisBottom(x).ticks(width / 80).tickSizeOuter(0))
  .call(g => g.selectAll(".tick line").clone()
    .attr("stroke-opacity", d => d === 1 ? null : 0.2)
    .attr("y2", -height + marginTop + marginBottom))

  /* y axis ticks */
  graph.append("g")
  .attr("transform", `translate(${marginLeft},0)`)
  .attr("stroke", "black")
  .call(d3.axisLeft(y).ticks(height / 140))
  .call(g => g.selectAll(".tick line").clone()
    .attr("stroke-opacity", d => d === 1 ? null : 0.2)
    .attr("x2", width - marginLeft - marginRight))
  .call(g => g.append("text")
    .attr("x", (width - marginRight)/2)
    .attr("y", 12)
    .attr("text-anchor", "middle")
    .text(dataset.title))

  let serie = graph.append("g")
  .selectAll("g")
  .data(datasets)
  .join("g");

  serie.append("path")
  .attr("fill", "none")
  .attr("stroke-width", 1.5)
  .attr("stroke-linejoin", "round")
  .attr("stroke-linecap", "round")
  .attr("stroke", d => z(d))
  .attr("d", d => {
    const idx = datasetIndexes[d];
    return line(dataset.data.map(data => [data[idx], data[idx + 1]]));
  });

  serie.append("text")
  .attr("transform", d => `translate(${width - marginRight - 10}, ${height - marginBottom - 15 * datasets.length + 15 * datasets.indexOf(d) + 5})`)
  .attr("fill", z)
  .style("font", "bold 10px sans-serif")
  .attr("text-anchor", "end")
  .text(d => d);
}

function renderContour(svg: SVGSVGElement, ds: SpinoramaData) {
  /* Preprocess the dataset. */
  let datasets = [
    "180°", "170°", "160°", "150°", "140°", "130°", "120°", "110°", "100°", "90°", "80°", "70°", "60°", "50°", "40°", "30°", "20°", "10°", "On-Axis",
    "-10°", "-20°", "-30°", "-40°", "-50°", "-60°", "-70°", "-80°", "-90°", "-100°", "-110°", "-120°", "-130°", "-140°", "-150°", "-160°", "-170°", "180°"
  ];

  let dataW = ds.data.length;
  let dataH = datasets.length;
  let data = []
  {
    let idxs = []
    for (let name of datasets) {
      let idx = ds.datasets.indexOf(name)
      if (idx == -1) {
        throw new Error("Unable to find dataset: " + name)
      }
      idxs.push(idx + 1)
    }
    for (let idx of idxs) {
      for (let row of ds.data) {
        data.push(row[idx])
      }
    }
  }

  const width = 2000;

  const marginTop = 20;
  const marginRight = 30;
  const marginBottom = 30;
  const marginLeft = 40;
  const height = (width - marginLeft - marginBottom) / dataW * dataH + marginTop + marginBottom;

  /* x & y scales */
  const x = d3.scaleLog([20, 20000], [marginLeft, width - marginRight]);
  const y = d3.scaleLinear([-180, 180], [height - marginBottom, marginTop]);

  const path = d3.geoPath().projection(d3.geoIdentity().scale((width - marginLeft - marginBottom) / dataW));
  const contours = d3.contours().size([dataW, dataH]);
  const color = d3.scaleSequential(d3.interpolateTurbo).domain([-45, 5]) as any;
  
  const graph = d3.select(svg)
  .attr("viewBox", [0, 0, width, height]);

  graph.append("g")
  .attr("transform", `translate(${marginLeft},${marginTop})`)
  .attr("stroke-opacity", 0.2)
  .attr("stroke", "black")
  .selectAll()
  .data(color.ticks(32))
  .join("path")
  .attr("d", (d: any) => path(contours.contour(data, d)))
  .attr("fill", color);

  /* x axis ticks */
  graph.append("g")
  .attr("transform", `translate(0, ${height - marginBottom})`)
  .attr("stroke", "black")
  .call(d3.axisBottom(x).ticks(width / 80).tickSizeOuter(0))
  .call(g => g.selectAll(".tick line").clone()
    .attr("stroke-opacity", d => d === 1 ? null : 0.2)
    .attr("y2", -height + marginTop + marginBottom))

  /* y axis ticks */
  graph.append("g")
  .attr("transform", `translate(${marginLeft},0)`)
  .attr("stroke", "black")
  .call(d3.axisLeft(y).ticks(height / 40))
  .call(g => g.selectAll(".tick line").clone()
    .attr("stroke-opacity", d => d === 1 ? null : 0.2)
    .attr("x2", width - marginLeft - marginRight))
  .call(g => g.append("text")
    .attr("x", (width - marginRight)/2)
    .attr("y", 12)
    .attr("text-anchor", "middle")
    .text(ds.title))

}

const base = "public/datas/measurements/Genelec 8351B/asr-vertical/";

const cea2034 = await readSpinoramaData(base + "CEA2034.txt")
onMounted(() => {
  let nonDiIndex = ["On Axis", "Listening Window", "Early Reflections", "Sound Power"].map(d => cea2034.datasets.indexOf(d));
  for (let data of cea2034.data) {
    for (let i of nonDiIndex) {
      data[i + 1] -= 86;
    }
  }
  /* FIXME! DI is on different scale. We need to render CEA2034 separately */
  svgCea2034.value && renderFreqPlot(svgCea2034.value, cea2034);

  const cea2034Normalized: SpinoramaData = JSON.parse(JSON.stringify(cea2034))
  for (let data of cea2034Normalized.data) {
    const norm = data[nonDiIndex[0] + 1];
    for (let i of nonDiIndex) {
      data[i + 1] -= norm;
    }
  }
  svgCea2034Normalized.value && renderFreqPlot(svgCea2034Normalized.value, cea2034Normalized)
});

const earlyReflections = await readSpinoramaData(base + "Early Reflections.txt");
onMounted(() => {
  for (let data of earlyReflections.data) {
    for (let i = 0; i < data.length; i += 2) {
      data[i + 1] -= 86;
    }
  }
  svgEarlyReflections.value && renderFreqPlot(svgEarlyReflections.value, earlyReflections)
});

const horizontalReflections = await readSpinoramaData(base + "Horizontal Reflections.txt");
onMounted(() => {
  for (let data of horizontalReflections.data) {
    for (let i = 0; i < data.length; i += 2) {
      data[i + 1] -= 86;
    }
  }
  svgHorizontalReflections.value && renderFreqPlot(svgHorizontalReflections.value, earlyReflections)
});

const verticalReflections = await readSpinoramaData(base + "Vertical Reflections.txt");
onMounted(() => {
  for (let data of verticalReflections.data) {
    for (let i = 0; i < data.length; i += 2) {
      data[i + 1] -= 86;
    }
  }
  svgVerticalReflections.value && renderFreqPlot(svgVerticalReflections.value, verticalReflections)
});

const hortDir = await readSpinoramaData(base + "SPL Horizontal.txt")
onMounted(() => {
  for (let data of hortDir.data) {
    for (let i = 0; i < data.length; i += 2) {
      data[i + 1] -= 86;
    }
  }
  svgHorizontalContour.value && renderContour(svgHorizontalContour.value, hortDir);

  const hortDirNormalized: SpinoramaData = JSON.parse(JSON.stringify(hortDir))
  const idx = hortDirNormalized.datasets.indexOf("On-Axis");
  for (let data of hortDirNormalized.data) {
    for (let i = 0; i < data.length; i += 2) {
      data[i + 1] -= data[idx + 1];
    }
  }
  svgHorizontalContourNormalized.value && renderContour(svgHorizontalContourNormalized.value, hortDirNormalized);
})

const vertDir = await readSpinoramaData(base + "SPL Vertical.txt")
onMounted(() => {
  for (let data of vertDir.data) {
    for (let i = 0; i < data.length; i += 2) {
      data[i + 1] -= 86;
    }
  }
  svgVerticalContour.value && renderContour(svgVerticalContour.value, vertDir)

  const vertDirNormalized: SpinoramaData = JSON.parse(JSON.stringify(vertDir))
  const idx = vertDirNormalized.datasets.indexOf("On-Axis");
  for (let data of vertDirNormalized.data) {
    for (let i = 0; i < data.length; i += 2) {
      data[i + 1] -= data[idx + 1];
    }
  }
  svgVerticalContourNormalized.value && renderContour(svgVerticalContourNormalized.value, vertDirNormalized)
})

</script>

<template>
  <h1>CEA2034</h1>
  <svg ref="svgCea2034"></svg>

  <h1>CEA2034 Normalized</h1>
  <svg ref="svgCea2034Normalized"></svg>

  <h1>Early reflections</h1>
  <svg ref="svgEarlyReflections"></svg>

  <h1>Horizontal reflections</h1>
  <svg ref="svgHorizontalReflections"></svg>

  <h1>Vertical reflections</h1>
  <svg ref="svgVerticalReflections"></svg>

  <h1>Horizontal contour</h1>
  <svg ref="svgHorizontalContour"></svg>

  <h1>Vertical contour</h1>
  <svg ref="svgVerticalContour"></svg>

  <h1>Horizontal contour normalized</h1>
  <svg ref="svgHorizontalContourNormalized"></svg>

  <h1>Vertical contour normalized</h1>
  <svg ref="svgVerticalContourNormalized"></svg>
</template>

<style scoped>
svg {
  background-color: white;
  color: black;
}
</style>