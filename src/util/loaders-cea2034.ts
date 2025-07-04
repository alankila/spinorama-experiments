import { unzip, type ZipItem } from "but-unzip";
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

  let cea2034: CEA2034;
  if (files.find(f => f.filename.endsWith(".json"))) {
    cea2034 = await readWebplotDigitizer(files)
  } else if (files.find(f => f.filename.endsWith("On Axis.txt"))) {
    cea2034 = await readRewTextDump(files)
  } else {
    throw new Error(`Unknown file format: didn't recognize any files: ${files.map(f => f.filename)}`)
  }

  if (!cea2034["On-Axis"]) {
    throw new Error(`Missing a dataset: On-Axis; found: ${Object.keys(cea2034)}`)
  }

  let isBusted = false
  if (!cea2034["Total Early Reflections"]) {
    cea2034["Total Early Reflections"] = new Map()
    isBusted = true
  }
  /* Deal with missing DI datasets, these are rarely provided */
  if (!cea2034["Early Reflections DI"]) {
    cea2034["Early Reflections DI"] = new Map()
    isBusted = true
  }
  if (!cea2034["Sound Power DI"]) {
    cea2034["Sound Power DI"] = new Map()
    isBusted = true
  }

  for (let ds of cea2034Keys) {
    if (!cea2034[ds]) {
      throw new Error(`Missing a dataset: ${ds}; found: ${Object.keys(cea2034)}`)
    }
  }

  return {
    isBusted,
    datasets: cea2034,
  }
}

async function readWebplotDigitizer(files: ZipItem[]) {
  const file = await files.find(f => !f.filename.endsWith("info.json") && f.filename.endsWith(".json"))!.read()

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

async function readRewTextDump(files: ZipItem[]) {
  // @ts-ignore we will validate that the set is complete later
  const cea2034: CEA2034 = {}

  cea2034["On-Axis"] = await readRewFile(files, "On Axis.txt")
  cea2034["Listening Window"] = await readRewFile(files, "LW.txt")
  cea2034["Sound Power"] = await readRewFile(files, "SP.txt")
  try {
    cea2034["Total Early Reflections"] = await readRewFile(files, "ER.txt")
  }
  catch (error) {
    /* We can still calculate score even when we don't have this */
  }
  try {
    cea2034["Sound Power DI"] = await readRewFile(files, "DI.txt")
  }
  catch (error) {
    /* ignoring, DI files are not always provided */
  }
  try {
    cea2034["Early Reflections DI"] = await readRewFile(files, "ERDI.txt")
  }
  catch (error) {
    /* ignoring, DI files are not always provided */
  }

  return cea2034
}

async function readRewFile(files: ZipItem[], name: string) {
  const file = files.find(f => f.filename.endsWith(name))
  if (!file) {
    throw new Error(`Missing file ${name}`)
  }

  const result = new Map<number, number>()
  const data = utf8Decoder.decode(await file.read())
  for (let row of data.split(/\s*\n/)) {
    if (row.startsWith("*")) {
      continue
    }
    const data = row.split(/\t/).map(p => parseFloat(p))
    result.set(data[0], data[1])
  }
  return result
}
