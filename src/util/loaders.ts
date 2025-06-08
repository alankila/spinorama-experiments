import { parse as loaders } from "papaparse";
import { spinKeys, type Spin } from "./cea2034";
import _metadata from "@/metadata.json"
import type { Biquads } from "./iir";
import { iter } from "but-unzip";

export const metadata = _metadata

export interface SpinoramaData<T> {
  freq: number[],
  datasets: T
}

/* Placeholder horizontal and vertical spin that shows a flat line */
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
    txtFiles[entry.filename] = txtData.trimEnd()
  }

  return txtFiles
}

export async function readSpinoramaData(url: string): Promise<SpinoramaData<Spin>[]> {
  console.time("load")

  const graphResult = await fetch(encodeURI(url))
  if (graphResult.status != 200) {
    throw new Error(`Unable to find data: ${url}: ${graphResult.status} ${graphResult.statusText}`)
  }
  const binaryData = await graphResult.arrayBuffer()
  const files = await unzip(new Uint8Array(binaryData))

  let spins: SpinoramaData<Spin>[];

  if ("SPL Horizontal.txt" in files && "SPL Vertical.txt" in files) {
    const horizSpin = readKlippel(files["SPL Horizontal.txt"])
    const vertSpin = readKlippel(files["SPL Vertical.txt"])
    spins = [horizSpin, vertSpin]
  } else if (Object.keys(files).find(f => f.endsWith("_H 0.txt"))) {
    spins = readSplHvTxt(files)
  } else if (Object.keys(files).find(f => f.endsWith("-M0-P0.txt"))) {
    spins = readGllHvTxt(files)
  } else {
    throw new Error("Unknown file format");
  }

  for (let spin of spins) {
    spin.freq = [...spin.datasets["On-Axis"].keys()]
    if (spin.freq.length < 20) {
      throw new Error("Too few frequencies discovered!");
    }

    /* Ensure frequencies appear in ascending order */
    spin.freq.sort((a, b) => a - b)

    for (let ds of spinKeys) {
      if (!(ds in spin.datasets)) {
        throw new Error(`Missing a dataset: ${ds}`)
      }
      let freq = [...spin.datasets[ds].keys()];
      freq.sort((a, b) => a - b)
      if (JSON.stringify(freq) !== JSON.stringify(spin.freq)) {
        throw new Error(`Dataset frequencies are not same as in the spin in general on dataset: ${ds}`)
      }
    }

    /* Normalize to 0 dB level */
    setToMeanOnAxisLevel(...spins)
  }

  if (JSON.stringify(spins[0].freq) !== JSON.stringify(spins[1].freq)) {
    throw new Error(`Inconsistent use of frequencies across datasets`)
  }

  console.log(spins[0].freq.length * spinKeys.length * 2, "datapoints loaded over", spins[0].freq.length, "frequencies covering range", spins[0].freq[0], "Hz -", spins[0].freq[spins[0].freq.length - 1], "Hz")

  console.timeEnd("load")
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
        throw new Error(`Was not able to find measurement angle ${name} in SPL HV data ${Object.keys(files)}`)
      }

      let map = new Map()
      for (let row of data[1].split(/\s*\n/)) {
        if (row.startsWith("Freq")) {
          continue
        }
        let [freq, mag, _pha] = row.split(/\s+/).map(v => parseFloat(v))
        if (!freq) {
          throw new Error(`Unable to process row ${row}`)
        }
        map.set(freq, mag)
      }
      spin.datasets[angle] = map
    }
  }

  return [horizSpin, vertSpin]
}

function readGllHvTxt(files: { [key: string]: string }) {
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
      let m = dir === "H" ? 0 : 90
      if (angle.startsWith("-")) {
        m += 180
      }
      let p = Math.abs(angle === "On-Axis" ? 0 : Math.abs(parseFloat(angle.replace("°", ""))))
      let name = `-M${m}-P${p}.txt`;      
      let data = Object.entries(files).find(f => f[0].endsWith(name))
      if (!data) {
        throw new Error(`Was not able to find measurement angle ${name} in GLL HV data`)
      }

      let map = new Map()
      for (let row of data[1].split(/\s*\n/)) {
        if (!row || row.startsWith("Freq") || row.startsWith("Data") || row.startsWith("Display")) {
          continue
        }
        let [freq, mag, _pha] = row.split(/\s+/).map(v => parseFloat(v))
        if (!freq) {
          throw new Error(`Unable to process row ${row}`)
        }
        map.set(freq, mag)
      }
      spin.datasets[angle] = map
    }
  }

  return [horizSpin, vertSpin]
}

function readKlippel(csv: string) {
  let data = loaders<string[]>(csv, { delimiter: "\t" }).data
  let _title = data.shift() ?? ""
  let datasets = data.shift() ?? []
  let _headers = data.shift() ?? []

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
 * Convert linear gain factor to dB
 * 
 * @param mag 
 * @returns 
 */
function lin2db(mag: number) {
  return mag > 0 ? Math.log(mag) / Math.log(10) * 20 : -144
}

/**
 * Normalize magnitudes so that On-Axis is 0 and all other measurements are also shifted relative to it.
 * One measurement set involves a separate horizontal and vertical spin.
 * We thus have two on-axis measurements, and we average them both.
 *
 * @param spin 
 */
function setToMeanOnAxisLevel(...spins: SpinoramaData<Spin>[]) {
  let ds = spins.map(s => s.datasets["On-Axis"])

  let avg = 0;
  let count = 0;
  for (let s of ds.values()) {
    for (let data of s.entries()) {
      if (data[0] >= 300 && data[0] <= 3000) {
        avg += data[1]
        count ++;
      }
    }
  }
  let mean = avg / count;

  for (let spin of spins) {
    for (let data of Object.values(spin.datasets)) {
      data.forEach((v, k) => data.set(k, v - mean))
    }
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
  console.time("copy + iir + normalize")
  spin = cloneSpinorama(spin)

  let val = new Map<number, number>()
  for (let k of spin.freq) {
    let [mag, _ang] = biquads.transfer(k)
    val.set(k, lin2db(mag))
  }

  for (let data of Object.values(spin.datasets)) {
    data.forEach((v, k) => data.set(k, v + (val.get(k) ?? 0)))
  }

  setToMeanOnAxisLevel(spin)

  console.timeEnd("copy + iir + normalize")
  return spin
}

/**
 * Return measurement set for IIR, in keys Overall, Filter 1, Filter 2, Filter 3, ...
 * 
 * @param freq 
 * @param biquads 
 */
export function iirToSpin(freq: number[], biquads: Biquads) {
  console.time("iir graph")

  let map = new Map<number, number>()
  for (let k of freq) {
    let [mag, _ang] = biquads.transfer(k)
    map.set(k, lin2db(mag))
  }

  let spin: SpinoramaData<{ [key: string]: Map<number,number> }> = {
    freq: [...freq],
    datasets: { Overall: map },
  }

  for (let i = 0; i < biquads.biquadCount; i ++) {
    let map = new Map<number, number>()
    for (let k of freq) {
      let [mag, _ang] = biquads.applyBiquad(k, i)
      map.set(k, lin2db(mag))
    }
    spin.datasets[`Filter ${i+1}`] = map
  }

  console.timeEnd("iir graph")
  return spin
}

/**
 * Subtracts the series from On-Axis suite from all other measurements, then set On-Axis itself to 0
 * 
 * @param spin 
 * @returns new spin with relative levels to On-Axis measurement
 */
export function normalizedToOnAxis(spin: SpinoramaData<Spin>) {
  console.time("copy + normalize")

  spin = cloneSpinorama(spin)

  let onAxis = spin.datasets["On-Axis"]
  for (let data of Object.values(spin.datasets)) {
    if (data === onAxis) {
      continue
    }
    data.forEach((v, k) => data.set(k, v - (onAxis.get(k) ?? 0)))
  }
  onAxis.forEach((_, k) => onAxis.set(k, 0))

  console.timeEnd("copy + normalize")
  return spin
}
