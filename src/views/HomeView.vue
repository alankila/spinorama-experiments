<script setup lang="ts">

import { onMounted, useTemplateRef } from "vue";
import { parse } from "papaparse";
import * as d3 from "d3";

const svg = useTemplateRef("svg")
const svg2 = useTemplateRef("svg2")

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

  /* If you want to find the data (and headers) for a dataset,
   * you must calculate the appropriate indexes and take out those specific values.
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
  const y = d3.scaleLinear([0, 100], [height - marginBottom, marginTop]);
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
  .call(d3.axisLeft(y).ticks(height / 40))
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
    "-10°", "-20°", "-30°", "-40°", "-50°", "-60°", "-70°", "-80°", "-90°", "-100°", "-110°", "-120°", "-130°", "-140°", "-150°", "-160°", "-170°",
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
  const y = d3.scaleLinear([-170, 180], [height - marginBottom, marginTop]);

  const path = d3.geoPath().projection(d3.geoIdentity().scale((width - marginLeft - marginBottom) / dataW));
  const contours = d3.contours().size([dataW, dataH]);
  const color = d3.scaleSequential(d3.interpolateTurbo).domain([0, 96]) as any;
  
  const graph = d3.select(svg)
  .attr("viewBox", [0, 0, width, height]);

  graph.append("g")
  .attr("transform", `translate(${marginLeft},${marginTop})`)
  //.attr("stroke-opacity", 0.1)
  //.attr("stroke", "black")
  .selectAll()
  .data(color.ticks(96))
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
  .call(d3.axisLeft(y).ticks(height / 30))
  .call(g => g.selectAll(".tick line").clone()
    .attr("stroke-opacity", d => d === 1 ? null : 0.2)
    .attr("x2", width - marginLeft - marginRight))
  .call(g => g.append("text")
    .attr("x", (width - marginRight)/2)
    .attr("y", 12)
    .attr("text-anchor", "middle")
    .text(ds.title))

}

const cea2034 = await readSpinoramaData("public/datas/measurements/Genelec 8351B/asr-vertical/CEA2034.txt")
onMounted(() => svg.value && renderFreqPlot(svg.value, cea2034));

const vertDir = await readSpinoramaData("public/datas/measurements/Genelec 8351B/asr-vertical/SPL Vertical.txt")
onMounted(() => svg2.value && renderContour(svg2.value, vertDir))

</script>

<template>
  <h1>CEA2034</h1>
  <svg ref="svg"></svg>

  <h1>Vertical contour</h1>
  <svg ref="svg2"></svg>
</template>

<style scoped>
svg {
  background-color: white;
  color: black;
}
</style>