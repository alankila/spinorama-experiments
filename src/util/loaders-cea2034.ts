import { unzip } from "but-unzip";
import { cea2034Keys, type CEA2034 } from "./cea2034";
import type { SpinoramaData } from "./loaders-spin";

const utf8Decoder = new TextDecoder("utf-8")

/**
 * Some measurement types are able to provide us with e.g. CEA2034 directly, but lack the full spin.
 * These are e.g. REW measurement suites and web plot digitized speakers.
 * We might not get every measurement we'd like to display, so we get tons of partials, instead.
 * 
 * The only graph guaranteed to be present is On-Axis, though this is not asserted at type level.
 */
export async function processCea2034File(zipData: Uint8Array): Promise<SpinoramaData<CEA2034>> {
  const files = unzip(zipData)

  const webplot = files.find(f => f.filename.endsWith("wpd.json"))
  let cea2034: CEA2034;
  if (webplot) {
    cea2034 = readWebplotDigitizer(await webplot.read())
  } else {
    throw new Error(`Unknown file format: didn't recognize any files: ${files.map(f => f.filename)}`)
  }

  if (!cea2034["On-Axis"]) {
    throw new Error(`Missing a dataset: On-Axis; found: ${Object.keys(cea2034)}`)
  }
  const freq = [...cea2034["On-Axis"].keys()]
  freq.sort((a, b) => a - b)

  for (let ds of cea2034Keys) {
    if (!cea2034[ds]) {
      throw new Error(`Missing a dataset: ${ds}; found: ${Object.keys(cea2034)}`)
    }

    let freq2 = [...cea2034[ds].keys()];
    freq2.sort((a, b) => a - b)
    if (JSON.stringify(freq) !== JSON.stringify(freq2)) {
      throw new Error(`Dataset frequencies are not same as in the spin in general on dataset: ${ds}`)
    }
  }

  return {
    freq,
    isBusted: false,
    datasets: cea2034,
  }
}

function readWebplotDigitizer(file: Uint8Array): CEA2034 {
  const webplot: {
    datasetColl: {
      data: {
        value: [number, number]
      }[],
      name: string,
    }[],
  } = JSON.parse(utf8Decoder.decode(file))

  // @ts-ignore we will validate that the set is complete later
  const cea2034: CEA2034 = {}

  for (let ds of webplot.datasetColl) {
    if (ds.name.toLowerCase() === "on axis" || ds.name === "OA" || ds.name === "ON") {
      cea2034["On-Axis"] = readWebplotData(ds.data)
    } else if (ds.name.toLowerCase() === "listening window" || ds.name === "LW") {
      cea2034["Listening Window"] = readWebplotData(ds.data)
    } else if (ds.name.toLowerCase() === "early reflections" || ds.name === "ER") {
      cea2034["Total Early Reflections"] = readWebplotData(ds.data)
    } else if (ds.name.toLowerCase() === "sound power" || ds.name == "SP") {
      cea2034["Sound Power"] = readWebplotData(ds.data)
    } else if (ds.name.toLowerCase() === "sound power di" || ds.name == "SPD") {
      cea2034["Sound Power DI"] = readWebplotData(ds.data)
    } else if (ds.name.toLowerCase() === "first reflections di" || ds.name.toLowerCase() === "early reflections di" || ds.name === "ERD") {
      cea2034["Early Reflections DI"] = readWebplotData(ds.data)
    } else {
      console.warn("Unrecognized measurement", ds.name);
    }
  }

  return cea2034
}

function readWebplotData(data: { value: [number, number] }[]) {
  return new Map(data.map(d => d.value));
}
