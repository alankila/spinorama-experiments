import * as d3 from "d3"
// @ts-ignore no types for this
import * as d3reg from "d3-regression"
import { cea2034Di, cea2034NonDi, type SpinoramaData } from "./spinorama"

/* Chart dimensions etc. */
const aspectRatio = 2
const marginTop = 8
const marginRight = 40
const marginBottom = 40
const marginLeft = 40

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

export function renderFreqPlot(svg: SVGSVGElement, dataset: SpinoramaData, datasets?: string[], regression?: { min: number, max: number }) {
  /* Labels for all datasets + index to that dataset's data in each row */
  datasets ||= dataset.datasets.filter(n => n)
  const datasetIndexes: { [key: string]: number } = {}
  for (let ds of datasets) {
    datasetIndexes[ds] = dataset.datasets.indexOf(ds)
  }

  const { graph, width, height } = prepareGraph(svg)

  /* x & y scales, color scale for graphs, and coordinates for labels */
  const x = d3.scaleLog([20, 20000], [marginLeft, width - marginRight])
  const y = d3.scaleLinear([-45, 5], [height - marginBottom, marginTop])
  const z = d3.scaleOrdinal(d3.schemeCategory10).domain(datasets)

  /* line constructor */
  const line = d3.line()
  .x(d => x(d[0]))
  .y(d => y(d[1]))

  if (regression) {
    const ds = datasets[0]
    const idx = dataset.datasets.indexOf(ds);
    const predictor = d3reg.regressionLinear()
    .x((data: number[]) => Math.log2(data[idx]))
    .y((data: number[]) => data[idx + 1])
    (dataset.data.filter(data => data[idx] >= regression.min && data[idx] <= regression.max));

    let coords = line([[10, predictor.predict(Math.log2(10))], [40000, predictor.predict(Math.log2(40000))]]);

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

    /* FIXME: these lines should be projected perpendicular to the regression normal. They could be slightly off if the line is very steep. */
    graph.append("path")
    .attr("clip-path", "url(#cut-graph)")
    .attr("stroke", "#484")
    .attr("stroke-width", "2")
    .attr("stroke-dasharray", "10,5")
    .attr("d", line([[300, predictor.predict(Math.log2(300)) - 3], [5000, predictor.predict(Math.log2(5000)) - 3]]))

    graph.append("path")
    .attr("clip-path", "url(#cut-graph)")
    .attr("stroke", "#484")
    .attr("stroke-width", "2")
    .attr("stroke-dasharray", "10,5")
    .attr("d", line([[300, predictor.predict(Math.log2(300)) + 3], [5000, predictor.predict(Math.log2(5000)) + 3]]))
  }

  /* x axis ticks */
  graph.append("g")
  .attr("transform", `translate(0, ${height - marginBottom})`)
  .call(d3.axisBottom(x).ticks(width / 60))
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
  .attr("stroke", d => z(d))
  .attr("d", d => {
    const idx = datasetIndexes[d]
    return line(dataset.data.map(data => [data[idx], data[idx + 1]]))
  })

  serie.append("text")
  .attr("transform", d => `translate(${width - marginRight - 10}, ${height - marginBottom - 15 * datasets.length + 15 * datasets.indexOf(d) + 5})`)
  .attr("fill", z)
  .style("font", "bold 10px sans-serif")
  .attr("text-anchor", "end")
  .text(d => d)

  return graph
}

export function renderCea2034Plot(svg: SVGSVGElement, dataset: SpinoramaData) {
  /* Labels for all datasets + index to that dataset's data in each row */
  const datasets = [...cea2034NonDi, ...cea2034Di]
  const datasetIndexes: { [key: string]: number } = {}
  for (let ds of datasets) {
    datasetIndexes[ds] = dataset.datasets.indexOf(ds)
  }

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
  .call(d3.axisBottom(x).ticks(width / 60))
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
  .attr("d", d => {
    const idx = datasetIndexes[d];
    return lineLeft(dataset.data.map(data => [data[idx], data[idx + 1]]))
  })

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
  .attr("d", d => {
    const idx = datasetIndexes[d];
    return lineRight(dataset.data.map(data => [data[idx], data[idx + 1]]))
  })

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

export function renderContour(svg: SVGSVGElement, ds: SpinoramaData) {
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
        throw new Error(`Unable to find dataset: ${name} in ${ds.datasets}`)
      }
      idxs.push(idx + 1)
    }
    for (let idx of idxs) {
      for (let row of ds.data) {
        data.push(row[idx] < -30 ? -30 : row[idx])
      }
    }
  }

  const color = d3.scaleSequential(d3.interpolateTurbo).domain([-33, 3]) as any
  const { graph, width, height } = prepareGraph(svg, color(-30))

  const contourNaturalHeight = width / dataW * dataH;

  /* x & y scales */
  const x = d3.scaleLog([20, 20000], [marginLeft, width - marginRight])
  const y = d3.scaleLinear([-180, 180], [height - marginBottom, marginTop])

  const path = d3.geoPath().projection(d3.geoIdentity().scale(width / dataW))
  const contours = d3.contours().size([dataW, dataH])
  
  graph.append("g")
  .attr("transform", `translate(${marginLeft},${marginTop}) scale(${(width - marginLeft - marginRight) / width}, ${(height - marginTop - marginBottom) / contourNaturalHeight})`)
  .attr("stroke-opacity", 0.3)
  .attr("stroke", "black")
  .selectAll()
  .data(color.ticks(12))
  .join("path")
  .attr("vector-effect", "non-scaling-stroke")
  .attr("d", (d: any) => path(contours.contour(data, d)))
  .attr("fill", color)

  /* x axis ticks */
  graph.append("g")
  .attr("transform", `translate(0, ${height - marginBottom})`)
  .call(d3.axisBottom(x).ticks(width / 60))
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
