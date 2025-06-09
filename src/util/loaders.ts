import { parse as loaders } from "papaparse";
import { spinKeys, type Spin } from "./cea2034";
import _metadata from "@/metadata.json"
import { iter } from "but-unzip";
import { lin2db, setToMeanOnAxisLevel } from "./spin-utils";
// @ts-ignore
import * as fftjs from "fft-js"

export const metadata = _metadata

export interface SpinoramaData<T extends { [key: string]: Map<number, number> }> {
  freq: number[],
  datasets: T
}

const utf8Decoder = new TextDecoder("utf-8")

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

async function unzip(data: Uint8Array) {
  const txtFiles: { [key: string]: Uint8Array } = {}

  for (const entry of iter(data)) {
    const bytes = await entry.read();
    txtFiles[entry.filename] = bytes;
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

  let spins: Spin[];

  if ("SPL Horizontal.txt" in files && "SPL Vertical.txt" in files) {
    spins = readKlippel(files);
  } else if (Object.keys(files).find(f => f.endsWith("_H 0.txt"))) {
    spins = readSplHvTxt(files)
  } else if (Object.keys(files).find(f => f.endsWith("-M0-P0.txt"))) {
    spins = readGllHvTxt(files)
  } else if (Object.keys(files).find(f => f.endsWith("IR.mat"))) {
    spins = readPrinceton(files)
  } else {
    throw new Error("Unknown file format");
  }

  const spindatas = spins.map(spin => {
    if (!spin["On-Axis"]) {
      throw new Error(`Missing a dataset: On-Axis; found: ${Object.keys(spin)}`)
    }

    const freq = [...spin["On-Axis"].keys()]
    freq.sort((a, b) => a - b)

    for (let ds of spinKeys) {
      if (!spin[ds]) {
        throw new Error(`Missing a dataset: ${ds}; found: ${Object.keys(spin)}`)
      }
      let freq2 = [...spin[ds].keys()];
      freq2.sort((a, b) => a - b)
      if (JSON.stringify(freq) !== JSON.stringify(freq2)) {
        throw new Error(`Dataset frequencies are not same as in the spin in general on dataset: ${ds}`)
      }
    }

    return {
      freq,
      datasets: spin,
    }
  })

  /* Normalize to 0 dB level */
  setToMeanOnAxisLevel(...spindatas)

  if (JSON.stringify(spindatas[0].freq) !== JSON.stringify(spindatas[1].freq)) {
    throw new Error(`Inconsistent use of frequencies across datasets`)
  }

  console.log(spindatas[0].freq.length * spinKeys.length * 2, "datapoints loaded over", spindatas[0].freq.length, "frequencies covering range", spindatas[0].freq[0], "Hz -", spindatas[0].freq[spindatas[0].freq.length - 1], "Hz")

  console.timeEnd("load")
  return spindatas
}

function readSplHvTxt(files: { [key: string]: Uint8Array }) {
  // @ts-ignore
  let horizSpin: Spin = {}
  // @ts-ignore
  let vertSpin: Spin = {}
  for (let dir of ["H", "V"]) {
    let spin = dir === "H" ? horizSpin : vertSpin
    for (let angle of spinKeys) {
      let name = ` _${dir} ${angle === 'On-Axis' ? 0 : angle.replace("°", "")}.txt`
      
      let data = Object.entries(files).find(f => f[0].endsWith(name))
      if (!data) {
        throw new Error(`Was not able to find measurement angle ${name} in SPL HV data ${Object.keys(files)}`)
      }

      let map = new Map()
      for (let row of utf8Decoder.decode(data[1]).split(/\s*\n/)) {
        if (!row || row.startsWith("Freq")) {
          continue
        }
        let [freq, mag, _pha] = row.split(/\s+/).map(v => parseFloat(v))
        if (!freq) {
          throw new Error(`Unable to process row: ${row}`)
        }
        map.set(freq, mag)
      }
      spin[angle] = map
    }
  }

  return [horizSpin, vertSpin]
}

function readGllHvTxt(files: { [key: string]: Uint8Array }) {
  // @ts-ignore
  let horizSpin: Spin = {}
  // @ts-ignore
  let vertSpin: Spin = {}
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
      for (let row of utf8Decoder.decode(data[1]).split(/\s*\n/)) {
        if (!row || row.startsWith("Freq") || row.startsWith("Data") || row.startsWith("Display")) {
          continue
        }
        let [freq, mag, _pha] = row.split(/\s+/).map(v => parseFloat(v))
        if (!freq) {
          throw new Error(`Unable to process row ${row}`)
        }
        map.set(freq, mag)
      }
      spin[angle] = map
    }
  }

  return [horizSpin, vertSpin]
}

function readKlippel(files: { [name: string]: Uint8Array }) {
  return [readKlippelOne(utf8Decoder.decode(files["SPL Horizontal.txt"])), readKlippelOne(utf8Decoder.decode(files["SPL Vertical.txt"]))]
}

function readKlippelOne(csv: string) {
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
  // @ts-ignore
  const output: Spin = {}
  for (let ds of spinKeys) {
    output[ds] = new Map();
  }

  for (let i = 0; i < datasets.length; i += 2) {
    if (datasets[i+1]) {
      throw new Error(`Unexpected dataset name at index ${i+1}`);
    }

    let d = <keyof Spin>datasets[i]
    if (spinKeys.indexOf(d) === -1) {
      throw new Error(`Unsupported dataset: ${d}`)
    }
  }

  /* Validate that all frequencies are used consistently, and create Map containers from the data */
  let count = 0;
  for (let row of data) {
    let freq = parseFloat(row[0].replace(",", ""))
    for (let i = 0; i < row.length; i += 2) {
      if (!row[0]) {
        continue
      }
      if (freq !== parseFloat(row[i].replace(",", ""))) {
        throw new Error(`Inconsistent frequency data: ${freq} vs ${row[i]}`)
      }

      // @ts-ignore this has been proven to be valid before
      let map = output[datasets[i]];
      map.set(freq, parseFloat(row[i + 1].replace(",", "")))
    }

    count ++;
  }

  return output
}

function readPrinceton(files: { [key: string]: Uint8Array }) {
  const hIr = Object.entries(files).filter(f => f[0].endsWith("_H_IR.mat")).map(f => f[1])[0]
  const vIr = Object.entries(files).filter(f => f[0].endsWith("_V_IR.mat")).map(f => f[1])[0]
  if (!hIr || !vIr) {
    throw new Error("Unable to find both _H_IR.mat and _V_IR.mat files")
  }

  const spins = [readPrincetonOne(hIr), readPrincetonOne(vIr)]

  /* Some speakers are spherically symmetric, in which case they only measure it along in one axis. Quick hack to make that case work is to copy the spin. */
  if (!Object.keys(spins[0]).length) {
    // @ts-ignore
    spins[0] = Object.fromEntries(Object.entries(spins[1]).map(kv => [kv[0], new Map(kv[1])]))
  } else if (!Object.keys(spins[1]).length) {
    // @ts-ignore
    spins[1] = Object.fromEntries(Object.entries(spins[0]).map(kv => [kv[0], new Map(kv[1])]))
  }

  /* Repair one problem type: often, horizontal measurements are for one side only. Mirrored. */
  for (let spin of spins) {
    for (let ds of spinKeys) {
      if (ds === "On-Axis" || ds === "180°") {
        continue
      }

      // @ts-ignore
      const invDs: keyof Spin = ds.startsWith("-") ? ds.substring(1) : "-" + ds
      if (!spin[ds] && spin[invDs]) {
        spin[ds] = new Map(spin[invDs])
      }
    }
  }

  return spins
}

type MatTypes = Float64Array | Float32Array | Int32Array | Int16Array | Uint16Array | Uint8Array

function readPrincetonOne(mat: Uint8Array) {
  const types = [Float64Array, Float32Array, Int32Array, Int16Array, Uint16Array, Uint8Array] as const;
  const sizes = [8, 4, 4, 2, 2, 1] as const

  let matrices: { [name: string]: {
    mrows: number,
    ncols: number,
    array: MatTypes,
  } } = {}

  let i = 0;
  while (i < mat.length) {
    let type = readIntBE(mat, i)
    let mrows = readIntBE(mat, i+4)
    let ncols = readIntBE(mat, i+8)
    let imagf = readIntBE(mat, i+12)
    let namelen = readIntBE(mat, i+16)
    i += 20

    const endian = Math.floor(type / 1000) % 10
    if (endian > 1) {
      throw new Error(`Matlab V4 matrices MOPT = ${type}: should have M=0 or M=1`)
    }
    if ((Math.floor(type / 100) % 10) !== 0) {
      throw new Error(`Matlab V4 matrices MOPT = ${type}: should have O=0`)
    }
    const precision = Math.floor(type / 10) % 10
    if (precision > 5) {
      throw new Error(`Precision must be a number from 0 to 5: ${precision}`)
    }
    if ((type % 10) !== 0) {
      throw new Error(`Matlab V4 matrices MOPT = ${type}: should have T=0`)
    }
    
    if (!mrows || !ncols) {
      throw new Error(`Matrix size has dimension 0: ${ncols}x${mrows}`)
    }
    if (imagf) {
      throw new Error("Unexpected imaginary number data")
    }
    if (!namelen) {
      throw new Error("Must have namelen")
    }

    let name = readText(mat, i, namelen)
    i += namelen

    const length = mrows * ncols * sizes[precision];
    const array = new types[precision](endianToNative(mat.slice(i, i + length), sizes[precision], endian).buffer)
    matrices[name.replace(/_[HV]$/, "")] = {
      mrows,
      ncols,
      array
    }
    i += length
  }

  if (!matrices["fs"]) {
    throw new Error(`Sampling rate not indicated in file ${Object.keys(matrices)}`)
  }
  const sampleRate = matrices["fs"].array[0]

  if (!matrices["IR"]) {
    throw new Error(`Impulse Response data ${Object.keys(matrices)}`)
  }

  /* Number of measurements */
  const measurements = matrices["IR"].mrows
  const fftLength = matrices["IR"].ncols
  /* Sample the FFT for 24 points per octave. */
  const density = 2 ** (1/24)
  const sqrtDensity = density ** 0.5

  // @ts-ignore
  const spin: Spin = {}

  console.log("File contains", measurements, "angles with resolution", fftLength)

  for (let n = 0; n < measurements; n ++) {
    let angle = Math.round(n * 360 / measurements)
    if ((angle % 10) != 0) {
      continue
    }
    if (angle > 180) {
      angle -= 360
    }
    // @ts-ignore proven correct by logic above
    const measurementName: keyof Spin = angle === 0 ? "On-Axis" : angle + "°"

    const ir = matrices["IR"].array
    let data: number[] = []
    for (let m = 0; m < fftLength; m ++) {
      data[m] = ir[n + m * measurements]
    }
    if (!data.find(x => x)) {
      continue
    }
 
    const result = fftjs.fft(data);
    
    let map = new Map<number, number>()
    let fftIdx = 0
    for (let freq = 20; freq < Math.min(20000, sampleRate / 2); freq = freq * density) {
      /* Figure out which bins to average in the calculation.
       * We are guaranteed to have at least 1 thanks to <= */

      const minIdx = fftLength * freq / sqrtDensity / sampleRate
      const maxIdx = fftLength * freq * sqrtDensity / sampleRate

      let mag = 0;
      let count = 0
      /* Resample FFT bins to reduce resolution. What I am doing here is computing the integral of linear interpolation of the FFT.
       * I take advantage of the property of linear interpolation, where middle point between two ends * span is the correct value of the integral. */
      let j = minIdx;
      while (j < maxIdx) {
        const idx = Math.floor(j)
        const a = (result[idx][0] ** 2 + result[idx][1] ** 2) ** 0.5
        const b = (result[idx + 1][0] ** 2 + result[idx + 1][1] ** 2) ** 0.5

        /* Special case: we have a tiny sub-bin sample, both belong to interval [idx, idx+1]. Output is the average. */
        if (idx < minIdx && idx + 1 > maxIdx) {
          const p = (minIdx + maxIdx) / 2
          const fraction = p - Math.floor(p)
          /* technically, this interval should be weighted by maxIdx - minIdx, but since this will be the only sample, we don't care. */
          mag = a * (1 - fraction) + b * fraction
          count = 1
          break
        } else if (idx < minIdx) {
          /* start of range; integral is the midpoint value between minIdx and idx + 1 with that span */
          const p = (minIdx + (idx + 1)) / 2
          const fraction = p - Math.floor(p)
          const w = idx + 1 - minIdx
          mag += (a * (1 - fraction) + b * fraction) * w
          count += w
          j = idx + 1
        } else if (idx + 1 > maxIdx) {
          /* end of range; integral is the midpoint value between idx and maxIdx with that span */
          const p = (idx + maxIdx) / 2
          const fraction = p - Math.floor(p)
          const w = maxIdx - idx
          mag += (a * (1 - fraction) + b * fraction) * w
          count += w
          j = maxIdx
        } else {
          /* Most common case where integral continues to further points. Value is taken at midpoint between idx and idx + 1 */
          mag += (a + b) / 2
          count += 1
          j = idx + 1
        }
      }
      mag /= count

      map.set(freq, 105 + Math.log10(mag) * 20)
    }
    spin[measurementName] = map
  }

  return spin
}

function readIntBE(mat: Uint8Array, pos: number) {
  if (pos < 0 || pos > mat.length - 4) {
    throw new Error(`Read past end of file: ${pos}/${mat.length}`)
  }
  return (mat[pos] << 24) | (mat[pos+1] << 16) | (mat[pos+2] << 8) | (mat[pos+3])
}

function readText(mat: Uint8Array, pos: number, len: number)  {
  if (pos < 0 || pos > mat.length - len) {
    throw new Error(`Read past end of file: ${pos}/${mat.length}`)
  }
  return String.fromCodePoint(...mat.slice(pos, pos + len - 1)).replace("\x00", "")
} 

/**
 * In-place endianness swap, done as needed
 */
function endianToNative(array: Uint8Array, elementSize: number, endian: number) {
  const u8 = new Uint8Array(2)
  const u16 = new Uint16Array(u8.buffer)
  u16[0] = 1
  const nativeEndian = u8[1] == 1 ? 1 : 0

  if (endian == nativeEndian) {
    return array
  } else if (elementSize === 1) {
    return array
  } else if (elementSize == 2) {
    for (let i = 0; i < array.length; i += 2) {
      [array[i+1], array[i]] = [array[i], array[i+1]]
    }
    return array
  } else if (elementSize == 4) {
    for (let i = 0; i < array.length; i += 4) {
      [array[i+3], array[i+2], array[i+1], array[i]] = [array[i], array[i+1], array[i+2], array[i+3]]
    }
    return array
  } else if (elementSize == 8) {
    for (let i = 0; i < array.length; i += 8) {
      [array[i+7], array[i+6], array[i+5], array[i+4], array[i+3], array[i+2], array[i+1], array[i]] = [array[i], array[i+1], array[i+2], array[i+3], array[i+4], array[i+5], array[i+6], array[i+7]]
    }
    return array
  } else {
    throw new Error(`Endian swap doesn't recognize element size ${elementSize}`)
  }
}