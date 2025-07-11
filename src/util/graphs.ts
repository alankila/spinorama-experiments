import * as d3 from "d3"
// @ts-ignore no types for this
import * as d3reg from "d3-regression"
import { type SpinoramaData } from "./loaders-spin"
import type { CEA2034, Spin } from "./cea2034"
import { MIDRANGE_MAX, MIDRANGE_MIN } from "./scores"

export const cea2034NonDi = ["On-Axis", "Listening Window", "Total Early Reflections", "Sound Power"] as const
export const cea2034Di = ["Sound Power DI", "Early Reflections DI"] as const

/* Chart dimensions etc. */
const aspectRatio = 2
const marginTop = 8
const marginRight = 40
const marginBottom = 40
const marginLeft = 60

export type GraphType<T extends { [key: string]: Map<number, number> }> = (svg: SVGSVGElement, spin: SpinoramaData<T>, datasets: readonly (keyof T & string)[], regression?: { min: number, max: number }, domain?: Domain) => void;

export interface Domain {
  min: number,
  max: number,
}

/** Prepare SVG for content */
function prepareGraph(svg: SVGSVGElement, fill?: string) {
  const width = svg.getBoundingClientRect().width
  const height = width / aspectRatio

  const graph = d3.select(svg)
  .attr("viewBox", [0, 0, width, height])

  graph.selectAll("*").remove()

  graph.append("clipPath")
  .attr("id", "cut-graph")
  .append("rect")
  .attr("x", marginLeft+1)
  .attr("y", marginTop+1)
  .attr("width", width - marginLeft - marginRight - 2)
  .attr("height", height - marginTop - marginBottom - 2)

  graph.append("rect")
  .attr("x", marginLeft)
  .attr("y", marginTop)
  .attr("width", width - marginLeft - marginRight)
  .attr("height", height - marginTop - marginBottom)
  .attr("stroke-width", 1)
  .attr("stroke", "black")
  .attr("fill", fill ?? "none")

  return { graph, width, height }
}

export function renderFreqPlot<T extends { [key: string]: Map<number, number> }>(svg: SVGSVGElement, spin: SpinoramaData<T>, datasets: readonly (keyof T & string)[], regression?: Domain, domain?: Domain) {
  const { graph, width, height } = prepareGraph(svg)

  /* x & y scales, color scale for graphs, and coordinates for labels */
  const x = d3.scaleLog([20, 20000], [marginLeft, width - marginRight])
  const y = d3.scaleLinear([domain?.min ?? -45, domain?.max ?? 5], [height - marginBottom, marginTop])
  const z = d3.scaleOrdinal(d3.schemeCategory10).domain(datasets)

  /* line constructor */
  const line = d3.line()
  .x(d => x(d[0]))
  .y(d => y(d[1]))

  if (regression) {
    /* regression is expecting just 1 dataset */
    for (let ds of datasets) {
      const predictor = d3reg.regressionLinear()
      .x((d: number[]) => Math.log(d[0]))
      .y((d: number[]) => d[1])
      ([...spin.datasets[ds].entries()].filter(data => data[0] >= regression.min && data[0] <= regression.max));

      let coords = line([[10, predictor.predict(Math.log(10))], [40000, predictor.predict(Math.log(40000))]]);

      graph.append("path")
      .attr("clip-path", "url(#cut-graph)")
      .attr("stroke", "#cec")
      .attr("stroke-width", y(-6) - y(0))
      .attr("d", coords);

      graph.append("path")
      .attr("clip-path", "url(#cut-graph)")
      .attr("stroke", "#ada")
      .attr("stroke-width", y(-3) - y(0))
      .attr("d", coords);

      graph.append("path")
      .attr("clip-path", "url(#cut-graph)")
      .attr("stroke", "black")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "3,3")
      .attr("d", coords);

      /* Compute scaling factor to ensure lines are placed correctly apart.
       * a is the line constant, but it has been computed for a logarithmic projection.
       * The real part needs to be e^e to produce an angle in this case. */
      const projectionToNormal = Math.cos(Math.atan2(predictor.a, Math.exp(Math.E)))
      graph.append("path")
      .attr("clip-path", "url(#cut-graph)")
      .attr("stroke", "#484")
      .attr("stroke-width", "2")
      .attr("stroke-dasharray", "10,5")
      .attr("d", line([[MIDRANGE_MIN, predictor.predict(Math.log(MIDRANGE_MIN)) - 3/projectionToNormal], [MIDRANGE_MAX, predictor.predict(Math.log(MIDRANGE_MAX)) - 3/projectionToNormal]]))

      graph.append("path")
      .attr("clip-path", "url(#cut-graph)")
      .attr("stroke", "#484")
      .attr("stroke-width", "2")
      .attr("stroke-dasharray", "10,5")
      .attr("d", line([[MIDRANGE_MIN, predictor.predict(Math.log(MIDRANGE_MIN)) + 3/projectionToNormal], [MIDRANGE_MAX, predictor.predict(Math.log(MIDRANGE_MAX)) + 3/projectionToNormal]]))
    }
  }

  /* x axis ticks */
  graph.append("g")
  .attr("transform", `translate(0, ${height - marginBottom})`)
  .call(d3.axisBottom(x).ticks(width / 80))
  .call(g => g.selectAll(".tick line").clone()
    .attr("stroke-opacity", d => d === 1 ? null : 0.2)
    .attr("y2", -height + marginTop + marginBottom))
  .call(g => g.selectAll(".tick text")
  .attr("font-size", 16))

  /* y axis ticks */
  graph.append("g")
  .attr("transform", `translate(${marginLeft},0)`)
  .call(d3.axisLeft(y).ticks(height / 140))
  .call(g => g.selectAll(".tick line").clone()
    .attr("stroke-opacity", d => d === 1 ? null : 0.2)
    .attr("x2", width - marginLeft - marginRight))
  .call(g => g.selectAll(".tick text")
  .attr("font-size", 16))
  
  let serie = graph.append("g")
  .selectAll("g")
  .data(datasets)
  .join("g")

  serie.append("path")
  .attr("clip-path", "url(#cut-graph)")
  .attr("fill", "none")
  .attr("stroke-width", 1.5)
  .attr("stroke-linejoin", "round")
  .attr("stroke-linecap", "round")
  .attr("stroke", z)
  .attr("d", d => {
    return line(spin.datasets[d])
  })

  serie.append("text")
  .attr("transform", d => `translate(${width - marginRight - 10}, ${height - marginBottom - 15 * datasets.length + 15 * datasets.indexOf(d) + 5})`)
  .attr("fill", z)
  .style("font", "bold 10px sans-serif")
  .attr("text-anchor", "end")
  .text(d => d)

  return graph
}

export function renderCea2034Plot(svg: SVGSVGElement, spin: SpinoramaData<CEA2034>) {
  /* Labels for all datasets + index to that dataset's data in each row */
  const datasets = [...cea2034NonDi, ...cea2034Di]

  const { graph, width, height } = prepareGraph(svg)

  /* x & y scales, color scale for graphs, and coordinates for labels */
  const x = d3.scaleLog([20, 20000], [marginLeft, width - marginRight])
  const yLeft = d3.scaleLinear([-45, 5], [height - marginBottom, marginTop])
  const yRight = d3.scaleLinear([-5, 15], [yLeft(-45), yLeft(-25)])
  const z = d3.scaleOrdinal(d3.schemeCategory10).domain(datasets)

  /* line constructors */
  const lineLeft = d3.line()
  .x(d => x(d[0]))
  .y(d => yLeft(d[1]))
  const lineRight = d3.line()
  .x(d => x(d[0]))
  .y(d => yRight(d[1]))

  /* x axis ticks */
  graph.append("g")
  .attr("transform", `translate(0, ${height - marginBottom})`)
  .call(d3.axisBottom(x).ticks(width / 80))
  .call(g => g.selectAll(".tick line").clone()
    .attr("stroke-opacity", d => d === 1 ? null : 0.2)
    .attr("y2", -height + marginTop + marginBottom))
  .call(g => g.selectAll(".tick text")
  .attr("font-size", 16))

  /* y axis ticks */
  graph.append("g")
  .attr("transform", `translate(${marginLeft},0)`)
  .call(d3.axisLeft(yLeft).ticks(height / 140))
  .call(g => g.selectAll(".tick line").clone()
    .attr("stroke-opacity", d => d === 1 ? null : 0.2)
    .attr("x2", width - marginLeft - marginRight))
  .call(g => g.selectAll(".tick text")
  .attr("font-size", 16))

  graph.append("g")
  .attr("transform", `translate(${width - marginRight},0)`)
  .call(d3.axisRight(yRight).ticks(height / 200))
  .call(g => g.selectAll(".tick text")
  .attr("font-size", 16))

  let serieLeft = graph.append("g")
  .selectAll("g")
  .data(cea2034NonDi)
  .join("g")

  serieLeft.append("path")
  .attr("clip-path", "url(#cut-graph)")
  .attr("fill", "none")
  .attr("stroke-width", 1.5)
  .attr("stroke-linejoin", "round")
  .attr("stroke-linecap", "round")
  .attr("stroke", z)
  .attr("d", d => lineLeft(spin.datasets[d]))

  let serieRight = graph.append("g")
  .selectAll("g")
  .data(cea2034Di)
  .join("g")

  serieRight.append("path")
  .attr("clip-path", "url(#cut-graph)")
  .attr("fill", "none")
  .attr("stroke-width", 1.5)
  .attr("stroke-linejoin", "round")
  .attr("stroke-linecap", "round")
  .attr("stroke", z)
  .attr("d", d => lineRight(spin.datasets[d]))

  graph.append("g")
  .selectAll("g")
  .data(datasets)
  .join("g")
  .append("text")
  .attr("transform", d => `translate(${width - marginRight - 10}, ${height - marginBottom - 15 * datasets.length + 15 * datasets.indexOf(d) + 5})`)
  .attr("fill", z)
  .style("font", "bold 10px sans-serif")
  .attr("text-anchor", "end")
  .text(d => d)
}

export function renderContour(svg: SVGSVGElement, spin: SpinoramaData<Spin>) {
  /* Preprocess the dataset. */
  let datasets = [
    "180°", "170°", "160°", "150°", "140°", "130°", "120°", "110°", "100°", "90°", "80°", "70°", "60°", "50°", "40°", "30°", "20°", "10°", "On-Axis",
    "-10°", "-20°", "-30°", "-40°", "-50°", "-60°", "-70°", "-80°", "-90°", "-100°", "-110°", "-120°", "-130°", "-140°", "-150°", "-160°", "-170°", "180°"
  ] as const;

  let dataH = datasets.length;
  let data = []

  const frequenciesOnDataset = [...spin.datasets["On-Axis"].keys()].sort((a, b) => a - b)
  const minFreq = frequenciesOnDataset.find(f => f > 20) ?? frequenciesOnDataset[0]
  const maxFreq = frequenciesOnDataset.find(f => f > 20000) ?? frequenciesOnDataset[frequenciesOnDataset.length - 1]
  let dataW = frequenciesOnDataset.filter(f => f >= minFreq && f <= maxFreq).length
  for (let name of datasets) {
    for (let freq of frequenciesOnDataset) {
      if (freq < minFreq || freq > maxFreq) {
        continue
      }
      let v = spin.datasets[name].get(freq) ?? 0;
      data.push(Math.max(v, -30))
    }
  }

  /* 36 colors; 12 ticks is appropriate */
  const color = d3.scaleSequential(d3.interpolateTurbo).domain([-33, 3])
  const { graph, width, height } = prepareGraph(svg, color(-30))

  /* x & y scales */
  const x = d3.scaleLog([minFreq, maxFreq], [marginLeft, width - marginRight])
  const y = d3.scaleLinear([-180, 180], [height - marginBottom, marginTop])

  const path = d3.geoPath()
  const contours = d3.contours().size([dataW, dataH])
  
  graph.append("g")
  .attr("transform", `translate(${marginLeft},${marginTop}) scale(${(width - marginLeft - marginRight) / dataW}, ${(height - marginTop - marginBottom) / dataH})`)
  .attr("stroke-opacity", 0.3)
  .attr("stroke", "black")
  .selectAll()
  .data(d3.ticks(...color.domain(), 12))
  .join("path")
  .attr("vector-effect", "non-scaling-stroke")
  .attr("d", d => path(contours.contour(data, d)))
  .attr("fill", color)

  /* x axis ticks */
  graph.append("g")
  .attr("transform", `translate(0, ${height - marginBottom})`)
  .call(d3.axisBottom(x).ticks(width / 80))
  .call(g => g.selectAll(".tick line").clone()
    .attr("stroke-opacity", d => d === 1 ? null : 0.2)
    .attr("y2", -height + marginTop + marginBottom))
  .call(g => g.selectAll(".tick text")
  .attr("font-size", 16))

  /* y axis ticks */
  graph.append("g")
  .attr("transform", `translate(${marginLeft},0)`)
  .call(d3.axisLeft(y).ticks(height / 40))
  .call(g => g.selectAll(".tick line").clone()
    .attr("stroke-opacity", d => d === 1 ? null : 0.2)
    .attr("x2", width - marginLeft - marginRight))
  .call(g => g.selectAll(".tick text")
  .attr("font-size", 16))
}
