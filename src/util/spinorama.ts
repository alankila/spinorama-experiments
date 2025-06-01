import { parse } from "papaparse";
import { sp_weigths } from "./cea2034";
import _metadata from "@/metadata.json"

export const metadata = _metadata

export const cea2034NonDi = ["On-Axis", "Listening Window", "Total Early Reflections", "Sound Power"]
export const cea2034Di = ["Sound Power DI", "Early Reflections DI"]

export interface SpinoramaDualAxisSpin {
  freq: number[],
  datasets: {
    [key: string]: Map<number, number>
  },
}

export interface SpinoramaCEA2034 {
  freq: number[],
  datasets: {
    "On-Axis": Map<number, number>,
    "Listening Window": Map<number, number>,
    "Sound Power": Map<number, number>,
    "Early Reflections DI": Map<number, number>,
    "Sound Power DI": Map<number, number>,
    "Front Wall Bounce": Map<number, number>,
    "Side Wall Bounce": Map<number, number>,
    "Rear Wall Bounce": Map<number, number>
    "Floor Bounce": Map<number, number>,
    "Ceiling Bounce": Map<number, number>,
    "Total Horizontal Reflection": Map<number, number>,
    "Total Vertical Reflection": Map<number, number>,
    "Total Early Reflections": Map<number, number>,
  },
}

/* Placeholder that shows a flat line */
export const emptySpinorama: SpinoramaDualAxisSpin = {
  freq: [20, 20000],
  datasets: {
    "180°": new Map(),
  },
}
for (let k of Object.keys(sp_weigths)) {
  const map = new Map()
  for (let f of emptySpinorama.freq) {
    map.set(f, 0)
  }
  emptySpinorama.datasets[k] = map
}

function cloneSpinorama(data: SpinoramaDualAxisSpin): SpinoramaDualAxisSpin {
  return {
    freq: [...data.freq],
    datasets: Object.fromEntries(Object.entries(data.datasets).map(p => [p[0], new Map([...p[1].entries()])]))
  }
}

export async function readSpinoramaData(url: string): Promise<SpinoramaDualAxisSpin> {
  const graphResult = await fetch(encodeURI(url))
  if (graphResult.status != 200) {
    throw new Error(`Unable to find data: ${url}: ${graphResult.status} ${graphResult.statusText}`)
  }
  const csv = (await graphResult.text()).replace(/\s+$/, "")
  if (!csv.startsWith('"')) {
    throw new Error(`Bogus result for url: ${url}: ${csv}`)
  }

  let data = parse(csv, { delimiter: "\t" }).data as string[][]
  let title = data.shift() ?? ""
  let datasets = data.shift() ?? []
  let headers = data.shift() ?? []
  console.log("Processing dataset", title, "with shape", headers)

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
  const output: SpinoramaDualAxisSpin = {
    freq: [],
    datasets: {},
  }

  for (let d of datasets) {
    if (d) {
      if (!(d in sp_weigths)) {
        throw new Error(`Unsupported dataset in ${url}: ${d}`)
      }
      output.datasets[d] = new Map()
    }
  }

  /* Validate that all frequencies are used consistently and create the datasets with uniform indexing */
  let count = 0;
  for (let row of data) {
    let freq = parseFloat(row[0].replace(",", ""))
    output.freq.push(freq)
    for (let i = 0; i < row.length; i += 2) {
      if (freq !== parseFloat(row[i].replace(",", ""))) {
        throw new Error(`Inconsistent frequency data: ${freq} vs ${row[i]}`)
      }
      output.datasets[datasets[i]].set(freq, parseFloat(row[i + 1].replace(",", "")))
    }

    count ++;
  }

  /* Ensure that all datasets are equally long, so no rows were truncated */
  for (let ds of Object.keys(output.datasets)) {
    const cmpCount = output.datasets[ds].size
    if (cmpCount !== count) {
      throw new Error(`Dataset length is not correct, expected ${count} but had ${cmpCount} in ${ds}`)
    }
  }

  /* Ensure that all datasets are in fact present */
  for (let ds of Object.keys(sp_weigths)) {
    if (!output.datasets[ds]) {
      throw new Error(`Missing a dataset: ${ds}`)
    }
  }  

  /* Ensure frequencies appear in ascending order */
  output.freq.sort((a, b) => a - b)

  return output
}

/**
 * Normalize magnitudes so that On-Axis is 0 and all other measurements are also shifted relative to it.
 *
 * @param spin 
 */
export function setToMeanOnAxisLevel(spin: SpinoramaDualAxisSpin) {
  let ds = spin.datasets["On-Axis"]

  let avg = 0;
  let count = 0;
  for (let data of ds.entries()) {
    if (data[0] >= 300 && data[0] <= 3000) {
      avg += data[1]
      count ++;
    }
  }

  let mean = avg / count;
  for (let data of Object.values(spin.datasets)) {
    data.forEach((v, k) => data.set(k, v - mean))
  }
}

/**
 * Subtracted the series from On-Axis suite from all other measurements, then set On-Axis itself to 0
 * 
 * @param spin 
 * @returns new spin with relative levels to On-Axis measurement
 */
export function normalizedToOnAxis(spin: SpinoramaDualAxisSpin) {
  spin = cloneSpinorama(spin)

  let onAxis = spin.datasets["On-Axis"]
  for (let data of Object.values(spin.datasets)) {
    if (data === onAxis) {
      continue
    }
    data.forEach((v, k) => data.set(k, v - (onAxis.get(k) ?? 0)))
  }

  onAxis.forEach((v, k) => onAxis.set(k, 0))
  return spin
}
