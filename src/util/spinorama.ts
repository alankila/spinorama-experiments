import { parse } from "papaparse";
import { type Spin } from "./cea2034";
import _metadata from "@/metadata.json"
import type { Biquads } from "./iir";
import { iter } from "but-unzip";

export const metadata = _metadata

export interface SpinoramaData<T> {
  freq: number[],
  datasets: T
}

export const spinKeys = [
    "On-Axis", "180°",  "10°", "170°", "-170°", "-10°",  "20°", "160°", "-160°", "-20°",  "30°", "150°", "-150°", "-30°",  "40°", "140°", "-140°", "-40°",  "50°", "130°", "-130°", "-50°",  "60°", "120°", "-120°", "-60°",  "70°", "110°", "-110°", "-70°",  "80°", "100°", "-100°", "-80°",  "90°", "-90°"
] as const;

/* Placeholder that shows a flat line */
export const emptySpinorama: SpinoramaData<Spin> = {
  freq: [20, 20000],
  // @ts-ignore the required Spin types are indeed missing here, but they get filled right below!
  datasets: {},
}
for (let k of spinKeys) {
  const map = new Map()
  for (let f of emptySpinorama.freq) {
    map.set(f, 0)
  }
  emptySpinorama.datasets[k] = map
}

function cloneSpinorama(data: SpinoramaData<Spin>): SpinoramaData<Spin> {
  const datasets = { ...data.datasets }
  spinKeys.forEach(k => datasets[k] = new Map(datasets[k]))
  return {
    freq: [...data.freq],
    datasets,
  }
}

async function unzip(data: Uint8Array) {
  const txtFiles: { [key: string]: string } = {}

  for (const entry of iter(data)) {
    const bytes = await entry.read();
    const txtData = new TextDecoder("utf-8").decode(bytes)
    txtFiles[entry.filename] = txtData
  }

  return txtFiles
}

export async function readSpinoramaData(url: string): Promise<SpinoramaData<Spin>[]> {
  const graphResult = await fetch(encodeURI(url))
  if (graphResult.status != 200) {
    throw new Error(`Unable to find data: ${url}: ${graphResult.status} ${graphResult.statusText}`)
  }
  const binaryData = await graphResult.arrayBuffer()
  const files = await unzip(new Uint8Array(binaryData))

  let spins: SpinoramaData<Spin>[];

  /* Klippel format -- this is among the most convenient for us */
  if ("SPL Horizontal.txt" in files && "SPL Vertical.txt" in files) {
    const horizSpin = readKlippel(files["SPL Horizontal.txt"])
    const vertSpin = readKlippel(files["SPL Vertical.txt"])
    spins = [horizSpin, vertSpin]
  } else if (Object.keys(files).filter(f => / _H 0.txt/.test(f))) {
    spins = readSplHvTxt(files)
  } else {
    throw new Error("Unknown file format");
  }

  for (let spin of spins) {
    /* Ensure frequencies appear in ascending order */
    spin.freq.sort((a, b) => a - b)

    /* Ensure that all datasets are in fact present */
    let refSpin = spins[0]

    for (let ds of spinKeys) {
      if ("" + spin.freq != "" + refSpin.freq) {
        throw new Error(`Inconsistent use of frequencies across datasets`)
      }
      if (!(ds in spin.datasets)) {
        throw new Error(`Missing a dataset: ${ds}`)
      }
      if (spin.datasets[ds].size !== refSpin.datasets[ds].size) {
        throw new Error(`Dataset length is not correct between horiz/vert spins: ${ds}`)
      }
    }

    setToMeanOnAxisLevel(spin)
  }

  return spins
}

function readSplHvTxt(files: { [key: string]: string }) {
  let horizSpin: SpinoramaData<Spin> = {
    freq: [],
    // @ts-ignore
    datasets: {},
  }
  let vertSpin: SpinoramaData<Spin> = {
    freq: [],
    // @ts-ignore
    datasets: {},
  }
  for (let dir of ["H", "V"]) {
    let spin = dir === "H" ? horizSpin : vertSpin
    for (let angle of spinKeys) {
      let name = ` _${dir} ${angle === 'On-Axis' ? 0 : angle.replace("°", "")}.txt`
      
      let data = Object.entries(files).find(f => f[0].endsWith(name))
      if (!data) {
        throw new Error(`Was not able to find measurement angle ${name} in GLL data`)
      }

      let map = new Map()
      for (let row of data[1].split(/\s*\n/)) {
        if (!row) {
          continue
        }
        let [freq, mag, _pha] = row.split(/\s+/).map(v => parseFloat(v))
        spin.freq.push(freq)
        map.set(freq, mag)
      }
      spin.datasets[angle] = map
    }
  }

  return [horizSpin, vertSpin]
}

function readKlippel(csv: string) {
  let data = parse<string[]>(csv, { delimiter: "\t" }).data
  let title = data.shift() ?? ""
  let datasets = data.shift() ?? []
  let headers = data.shift() ?? []
  console.log("Processing dataset", title, "with shape", headers)

  /* Klippel files are tab-separated CSV collection of datasets with at least 2 points per set,
   * stored in adjacent columns.
   *
   * Format has 3 header rows, followed by the data rows. The first row labels the dataset (1 column in CSV)
   * Second row indicates starts indexes of each datasets. The cell is empty if that column belongs to the preceding dataset.
   * The third row labels the data rows, and is like a traditional CSV header.
   * 
   * Data rows are formatted in U.S. numeric format with thousands separator,
   * e.g. 1,234.56. We assume data can be interpreted as (Hz, SPL) pairs, for each 10 degree angle.
   */
  const output: SpinoramaData<Spin> = {
    freq: [],
    // @ts-ignore filling in datasets below
    datasets: {},
  }
  for (let ds of spinKeys) {
    output.datasets[ds] = new Map();
  }

  for (let i = 0; i < datasets.length; i += 2) {
    if (datasets[i+1]) {
      throw new Error(`Unexpected dataset name at index ${i+1}`);
    }

    /* Note: this assertion is hypothetical; we validate it now. */
    let d = datasets[i] as keyof Spin;
    if (spinKeys.indexOf(d) === -1) {
      throw new Error(`Unsupported dataset: ${d}`)
    }
  }

  /* Validate that all frequencies are used consistently, and create Map containers from the data */
  let count = 0;
  for (let row of data) {
    let freq = parseFloat(row[0].replace(",", ""))
    output.freq.push(freq)
    for (let i = 0; i < row.length; i += 2) {
      if (freq !== parseFloat(row[i].replace(",", ""))) {
        throw new Error(`Inconsistent frequency data: ${freq} vs ${row[i]}`)
      }

      // @ts-ignore this has been proven to be valid before
      let map = output.datasets[datasets[i]];
      map.set(freq, parseFloat(row[i + 1].replace(",", "")))
    }

    count ++;
  }

  return output
}

/**
 * Normalize magnitudes so that On-Axis is 0 and all other measurements are also shifted relative to it.
 *
 * @param spin 
 */
function setToMeanOnAxisLevel(spin: SpinoramaData<Spin>) {
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
 * Return IIR filtered version of spinorama measurement, corresponding to equalized version of the measurement
 * 
 * @param spin 
 * @param biquads 
 * @returns spin with IIR applied
 */
export function iirAppliedSpin(spin: SpinoramaData<Spin>, biquads: Biquads) {
  spin = cloneSpinorama(spin)

  let val = new Map<number, number>()
  for (let k of spin.freq) {
    let xfer = biquads.transfer(k)
    val.set(k, Math.log(xfer[0]) / Math.log(10) * 20)
  }

  for (let data of Object.values(spin.datasets)) {
    data.forEach((v, k) => data.set(k, v + (val.get(k) ?? 0)))
  }

  setToMeanOnAxisLevel(spin)

  return spin
}

/**
 * Subtracts the series from On-Axis suite from all other measurements, then set On-Axis itself to 0
 * 
 * @param spin 
 * @returns new spin with relative levels to On-Axis measurement
 */
export function normalizedToOnAxis(spin: SpinoramaData<Spin>) {
  spin = cloneSpinorama(spin)

  let onAxis = spin.datasets["On-Axis"]
  for (let data of Object.values(spin.datasets)) {
    if (data === onAxis) {
      continue
    }
    data.forEach((v, k) => data.set(k, v - (onAxis.get(k) ?? 0)))
  }

  onAxis.forEach((_, k) => onAxis.set(k, 0))
  return spin
}
