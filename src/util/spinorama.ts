import { parse } from "papaparse";

export const cea2034NonDi = ["On Axis", "Listening Window", "Early Reflections", "Sound Power"];
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
    title: title[0],
    datasets,
    headers,
    data: data.map(da => da.map(n => parseFloat(n.replace(",", "")))),
  }
}

/**
 * Subtract 86 dB offset from freq data and remove DI offset
 * 
 * @param cea2034 
 */
export function preprocessCea2034(cea2034: SpinoramaData) {
  let nonDiIndex = cea2034NonDi.map(d => cea2034.datasets.indexOf(d))
  let diOffset = cea2034.datasets.indexOf("DI offset")
  let diIndex = cea2034Di.map(d => cea2034.datasets.indexOf(d))
  for (let data of cea2034.data) {
    for (let i of nonDiIndex) {
      data[i + 1] -= 86;
    }
    for (let i of diIndex) {
      data[i + 1] -= data[diOffset + 1];
    }
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
