import { spinKeys, type CEA2034, type Spin } from "./cea2034";
import { iter } from "but-unzip";
import { cloneSpinorama, pressure2spl, setToMeanOnAxisLevel } from "./spin-utils";
// @ts-ignore
import fftjs from "fft-js"

export interface SpinoramaData<T extends { [key: string]: Map<number, number> }> {
  /** Frequencies present on every dataset, in ascending order */
  freq: number[],
  /** Datasets available */
  datasets: T,
  /** Whether repairs had to be performed on the data like replicating or mirroring measurements to deal with missing data */
  isBusted: boolean,
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

/**
 * Some measurement types are able to provide us with e.g. CEA2034 directly, but lack the full spin.
 * These are e.g. REW measurement suites and web plot digitized speakers.
 * We might not get every measurement we'd like to display, so we get tons of partials, instead.
 * 
 * The only graph guaranteed to be present is On-Axis, though this is not asserted at type level.
 */
export async function readCEA2034(url: string): Promise<SpinoramaData<Partial<CEA2034>>> {
  const zipRequest = await fetch(url)
  if (zipRequest.status != 200) {
    throw new Error(`Unable to find data: ${url}: ${zipRequest.status} ${zipRequest.statusText}`)
  }
  const zipData = await zipRequest.arrayBuffer()
  const files = await unzip(new Uint8Array(zipData))

  const webplot = Object.entries(files).find(f => f[0].endsWith(".json"))
  let cea2034: Partial<CEA2034>;
  if (webplot) {
    cea2034 = readWebplotDigitizer(webplot[1])
  } else {
    throw new Error(`Unknown file format: didn't recognize any files: ${Object.keys(files)}`)
  }

  if (!cea2034["On-Axis"]) {
    throw new Error(`Missing a dataset: On-Axis; found: ${Object.keys(cea2034)}`)
  }
  const freq = [...cea2034["On-Axis"].keys()]
  freq.sort((a, b) => a - b)

  for (let ds of Object.entries(cea2034)) {
    let freq2 = [...ds[1].keys()];
    freq2.sort((a, b) => a - b)
    if (JSON.stringify(freq) !== JSON.stringify(freq2)) {
      throw new Error(`Dataset frequencies are not same as in the spin in general on dataset: ${ds[0]}`)
    }
  }

  return {
    freq,
    isBusted: false,
    datasets: cea2034,
  }
}

function readWebplotDigitizer(file: Uint8Array): Partial<CEA2034> {
  const webplot: {
    datasetColl: {
      data: {
        value: [number, number]
      }[],
      name: string,
    }[],
  } = JSON.parse(utf8Decoder.decode(file))

  const cea2034: Partial<CEA2034> = {}

  for (let ds of webplot.datasetColl) {
    if (ds.name === "On Axis") {
      cea2034["On-Axis"] = readWebplotData(ds.data)
    } else if (ds.name === "Early Reflections") {
      cea2034["Total Early Reflections"] = readWebplotData(ds.data)
    } else if (ds.name === "Sound Power" || ds.name == "Sound Power DI") {
      cea2034[ds.name] = readWebplotData(ds.data)
    } else if (ds.name === "First Reflections DI") {
      cea2034["Early Reflections DI"] = readWebplotData(ds.data)
    } else {
      console.log("Unrecognized measurement", ds.name);
    }
  }

  return cea2034
}

function readWebplotData(data: { value: [number, number] }[]) {
  return new Map(data.map(d => d.value));
}

/** Read measurements that are full spinorama spins. */
export async function readSpinoramaData(url: string): Promise<SpinoramaData<Spin>[]> {
  const zipRequest = await fetch(url)
  if (zipRequest.status != 200) {
    throw new Error(`Unable to find data: ${url}: ${zipRequest.status} ${zipRequest.statusText}`)
  }
  const zipData = await zipRequest.arrayBuffer()
  const files = await unzip(new Uint8Array(zipData))

  let spins: Spin[];
  if ("SPL Horizontal.txt" in files && "SPL Vertical.txt" in files) {
    spins = readKlippel(files);
  } else if (Object.keys(files).find(f => f.endsWith("_H 0.txt") || f.endsWith("0_H.txt"))) {
    spins = readSplHvTxt(files)
  } else if (Object.keys(files).find(f => f.endsWith("-M0-P0.txt"))) {
    spins = readGllHvTxt(files)
  } else if (Object.keys(files).find(f => f.endsWith("IR.mat"))) {
    spins = readPrinceton(files)
  } else {
    throw new Error(`Unknown file format: didn't recognize any files: ${Object.keys(files)}`);
  }

  const isBusted = performHackyRepairs(spins);

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
      isBusted,
      datasets: spin,
    }
  })

  /* Normalize to 0 dB level */
  setToMeanOnAxisLevel(...spindatas)

  if (JSON.stringify(spindatas[0].freq) !== JSON.stringify(spindatas[1].freq)) {
    throw new Error(`Inconsistent use of frequencies across datasets`)
  }

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
      let name1 = ` _${dir} ${angle === 'On-Axis' ? 0 : angle.replace("°", "")}.txt`
      let name2 = `${angle === 'On-Axis' ? 0 : angle.replace("°", "")}_${dir}.txt`
      
      let data = Object.entries(files).find(f => f[0].endsWith(name1) || f[0].endsWith(name2))
      if (!data) {
        continue
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
  let data = csv.split(/\s*\n/).map(d => d.replace(/"/g, "").split("\t"))
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

function performHackyRepairs(spins: Spin[]) {
  let isBusted = false

  /* If measurement data for other spin is missing, copy the other spin */
  if (!Object.keys(spins[0]).length) {
    spins[0] = cloneSpinorama({ freq: [], datasets: spins[1], isBusted: true }).datasets
    isBusted = true
  } else if (!Object.keys(spins[1]).length) {
    spins[1] = cloneSpinorama({ freq: [], datasets: spins[0], isBusted: true, }).datasets
    isBusted = true
  }

  /* Mirror any missing measurements from other side of the spin */
  for (let spin of spins) {
    for (let ds of spinKeys) {
      if (ds === "On-Axis" || ds === "180°") {
        continue
      }

      // @ts-ignore
      const invDs: keyof Spin = ds.startsWith("-") ? ds.substring(1) : "-" + ds
      if (!spin[ds] && spin[invDs]) {
        spin[ds] = new Map(spin[invDs])
        isBusted = true
      }
    }
  }

  /* If the files don't provide the > 90 degree angles, we copy the 90 degrees measurement. (Sigh.) */
  const posAngles = ["180°", "170°", "160°", "150°", "140°", "130°", "120°", "110°", "100°"] as const
  const negAngles = ["-170°", "-160°", "-150°", "-140°", "-130°", "-120°", "-110°", "-100°"] as const
  for (let spin of spins) {
    if (spin["90°"] && !posAngles.map(ds => spin[ds]).find(x => x)) {
      for (let ds of posAngles) {
        spin[ds] = new Map(spin["90°"])
      }
      isBusted = true
    }
    if (spin["-90°"] && !negAngles.map(ds => spin[ds]).find(x => x)) {
      for (let ds of negAngles) {
        spin[ds] = new Map(spin["-90°"])
      }
      if (!spin["180°"]) {
        spin["180°"] = new Map(spin["-90°"])
      }
      isBusted = true
    }
  }

  return isBusted
}

function readPrinceton(files: { [key: string]: Uint8Array }) {
  const hIr = Object.entries(files).filter(f => f[0].endsWith("_H_IR.mat")).map(f => f[1])[0]
  const vIr = Object.entries(files).filter(f => f[0].endsWith("_V_IR.mat")).map(f => f[1])[0]
  if (!hIr || !vIr) {
    throw new Error("Unable to find both _H_IR.mat and _V_IR.mat files")
  }

  return [readPrincetonOne(hIr), readPrincetonOne(vIr)]
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
    if (i + length > mat.length) {
      throw new Error(`Matrix ${name} exceeds file bounds`);
    }
    const endianSwapped = endianToNative(mat, i, i + length, sizes[precision], endian)
    const array = new types[precision](endianSwapped.buffer.slice(i, i + length))
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

  //console.log("File contains", measurements, "angles with resolution", fftLength)

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
    const data: number[] | number[][] = []
    let anyNonZero = false
    for (let m = 0; m < fftLength; m ++) {
      const v = ir[n + m * measurements]
      data[m] = v
      anyNonZero ||= v != 0
    }
    if (!anyNonZero) {
      continue
    }

    fftjs.fftInPlace(data);
    const result = <number[][]>data
    
    let map = new Map<number, number>()
    for (let freq = 20; freq < 20000; freq = freq * density) {
      /* Figure out which bins to average in the calculation of the resampled bin. These form a contiguous nonoverlapping sequence over the original FFT */
      const minIdx = fftLength * freq / sqrtDensity / sampleRate
      const maxIdx = fftLength * freq * sqrtDensity / sampleRate

      /* Resample FFT bins to reduce resolution. What I am doing here is computing the integral of linear interpolation of the FFT,
       * which I then divide by its span to yield average.
       * x axis integral for a line from (x1, y1) to (x2, y2) = (y2 + y1) / 2 * (x2 - x1) or the midpoint of y's times the x span.
       */
      let mag = 0;
      for (let idx = Math.floor(minIdx); idx < maxIdx && idx + 1 < fftLength / 2; idx ++) {
        const a = (result[idx][0] ** 2 + result[idx][1] ** 2) ** 0.5
        const b = (result[idx + 1][0] ** 2 + result[idx + 1][1] ** 2) ** 0.5

        /* spanStart, spanEnd belong to [0, 1] and represent the region between a and b that is integrated */
        const spanStart = idx < minIdx ? minIdx - idx : 0
        const spanEnd = idx + 1 > maxIdx ? maxIdx - idx : 1
        const weight = spanEnd - spanStart /* This is 1 except near ends */
        const fraction = (spanEnd + spanStart) / 2
        mag += (a * (1 - fraction) + b * fraction) * weight
      }
      /* The weight sum is maxIdx - minIdx by construction */
      mag /= maxIdx - minIdx

      map.set(freq, pressure2spl(mag))
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
function endianToNative(array: Uint8Array, start: number, end: number, elementSize: number, endian: number) {
  const u8 = new Uint8Array(2)
  const u16 = new Uint16Array(u8.buffer)
  u16[0] = 1
  const nativeEndian = u8[1] == 1 ? 1 : 0

  if (endian == nativeEndian || elementSize == 1) {
    /* nothing to do */
  } else if (elementSize == 2) {
    for (let i = start; i < end; i += 2) {
      [array[i+1], array[i]] = [array[i], array[i+1]]
    }
  } else if (elementSize == 4) {
    for (let i = start; i < end; i += 4) {
      [array[i+3], array[i+2], array[i+1], array[i]] = [array[i], array[i+1], array[i+2], array[i+3]]
    }
  } else if (elementSize == 8) {
    for (let i = start; i < end; i += 8) {
      [array[i+7], array[i+6], array[i+5], array[i+4], array[i+3], array[i+2], array[i+1], array[i]] = [array[i], array[i+1], array[i+2], array[i+3], array[i+4], array[i+5], array[i+6], array[i+7]]
    }
  } else {
    throw new Error(`Endian swap doesn't recognize element size ${elementSize}`)
  }
  return array
}