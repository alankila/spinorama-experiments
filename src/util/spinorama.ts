import { parse } from "papaparse";
import _metadata from "../metadata.json";

export const metadata = _metadata;
export const cea2034NonDi = ["On-Axis", "Listening Window", "Total Early Reflections", "Sound Power"];
export const cea2034Di = ["Sound Power DI", "Early Reflections DI"];

export interface SpinoramaData {
  title: string,
  datasets: string[],
  headers: string[],
  data: number[][],
}

/* Lame, fix this */
export function cloneSpinorama(data: SpinoramaData): SpinoramaData {
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

/** Produce normalized CEA2034 normalized to "on axis" */
export async function normalizeCea2034(cea2034Normalized: SpinoramaData) {
  let nonDiIndex = cea2034NonDi.map(d => cea2034Normalized.datasets.indexOf(d))
  for (let data of cea2034Normalized.data) {
    const norm = data[nonDiIndex[0] + 1];
    for (let i of nonDiIndex) {
      data[i + 1] -= norm;
    }
  }
}


/**
 * Subtract fixed 86 dB offset from every data point
 *
 * @param freq 
 */
export function preprocessFrequencyData(freq: SpinoramaData) {
  for (let data of freq.data) {
    for (let i = 0; i < data.length; i += 2) {
      data[i + 1] -= 86
    }
  }
}

export function normalizeFrequencyData(freq: SpinoramaData, dataset: string) {
  const idx = freq.datasets.indexOf(dataset)
  for (let data of freq.data) {
    const value = data[idx + 1]
    for (let i = 0; i < data.length; i += 2) {
      data[i + 1] -= value
    }
  }
}
