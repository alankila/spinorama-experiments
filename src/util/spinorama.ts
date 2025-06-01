import { parse } from "papaparse";
import _metadata from "../metadata.json";
import { sp_weigths } from "./cea2034";

export const metadata = _metadata;
export const cea2034NonDi = ["On-Axis", "Listening Window", "Total Early Reflections", "Sound Power"];
export const cea2034Di = ["Sound Power DI", "Early Reflections DI"];

export interface SpinoramaData {
  title: string,
  datasets: string[],
  headers: string[],
  data: number[][],
}

/* Placeholder that shows a flat line */
export const emptySpinorama: SpinoramaData = {
  title: "Empty dataset",
  datasets: [],
  headers: [],
  data: [[], []],
}
for (let k of Object.keys(sp_weigths)) {
  emptySpinorama.datasets.push(k)
  emptySpinorama.datasets.push("")

  emptySpinorama.headers.push("Hz")
  emptySpinorama.headers.push("dB")

  emptySpinorama.data[0].push(20);
  emptySpinorama.data[0].push(0);
  emptySpinorama.data[1].push(20000);
  emptySpinorama.data[1].push(0);
}

function cloneSpinorama(data: SpinoramaData): SpinoramaData {
  /* Lame, fix this */
  return JSON.parse(JSON.stringify(data));
}

export async function readSpinoramaData(url: string): Promise<SpinoramaData> {
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
    title: title[0],
    datasets,
    headers,
    data: data.map(da => da.map(n => parseFloat(n.replace(",", "")))),
  }
}

/**
 * Normalize frequency response to 0 level mean
 *
 * @param spin 
 */
export function setToMeanOnAxisLevel(spin: SpinoramaData) {
  let idx = spin.datasets.indexOf("On-Axis")

  let avg = 0;
  let count = 0;
  for (let data of spin.data) {
    if (data[idx] >= 300 && data[idx] <= 3000) {
      avg += data[idx + 1]
      count ++;
    }
  }

  let mean = avg / count;
  for (let data of spin.data) {
    for (let i = 0; i < data.length; i += 2) {
      data[i + 1] -= mean
    }
  }
}

export function normalizedToOnAxis(spin: SpinoramaData) {
  spin = cloneSpinorama(spin)
  const idx = spin.datasets.indexOf("On-Axis")
  for (let data of spin.data) {
    const value = data[idx + 1]
    for (let i = 0; i < data.length; i += 2) {
      data[i + 1] -= value
    }
  }
  return spin
}
