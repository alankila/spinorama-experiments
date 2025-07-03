import { SpinoramaData } from './../src/util/loaders-spin';
import { CEA2034, computeCea2034 } from "../src/util/cea2034"
import { processSpinoramaFile } from "../src/util/loaders-spin"
import { processCea2034File } from "../src/util/loaders-cea2034"
import { getScores, OurMetadata } from "../src/util/scores"
import { readdirSync, readFileSync } from "fs"
import theirMetadata from "../their-metadata.json"

const dir = "public/measurements"

async function listMeasurements(dir) {
    const files = readdirSync(dir, { recursive: true, encoding: "binary" })
    return files.filter(f => f.endsWith(".zip"))
}

let files = await listMeasurements(dir)

let count = 0
let bustedCount = 0
let ourMetadata: OurMetadata = {}
for (let file of files) {
    let exceptions: Error[] = []

    const [speakerId, measurementId] = file.replace(".zip", "").split("/", 2)
    const data = readFileSync(`${dir}/${file}`)
    let cea2034: SpinoramaData<CEA2034> | undefined
    try {
        const [horizSpin, vertSpin] = await processSpinoramaFile(new Uint8Array(data))
        if (horizSpin.isBusted || vertSpin.isBusted) {
            console.warn("Busted measurement", file)
        }

        cea2034 = computeCea2034(horizSpin, vertSpin)
    }
    catch (error) {
        exceptions.push(error)
    }

    try {
        cea2034 = await processCea2034File(new Uint8Array(data))
    }
    catch (error) {
        exceptions.push(error)
    }

    if (!cea2034) {
        console.log("Unable to process file", file, exceptions)
        continue
    }

    const scores = getScores(cea2034)
    if (!ourMetadata[speakerId]) {
        const theirs = <typeof theirMetadata[keyof typeof theirMetadata]>theirMetadata[speakerId]
        if (!theirs) {
            console.warn("No metadata for speaker", speakerId)
            continue
        }
        ourMetadata[speakerId] = {
            brand: theirs.brand,
            model: theirs.model,
            type: theirs.type,
            price: parseInt(theirs.price) || undefined,
            shape: theirs.shape,
            amount: ("amount" in theirs ? theirs.amount : "each"), /* this is just a guess */
            defaultMeasurement: theirs.default_measurement,
            measurements: {},
        }
    }

    ourMetadata[speakerId].measurements[measurementId] = {
        format: theirMetadata[speakerId].measurements[measurementId].format,
        scores,
    }

    count ++
    if (scores.isBusted) {
        bustedCount ++
    }

    console.log("No loader for", file)
}

for (let k of Object.values(ourMetadata)) {
    if (!(k.defaultMeasurement in k.measurements)) {
        console.warn("Default measurement doesn't exist in", k.brand, "/", k.model, "selecting random one")
        k.defaultMeasurement = Object.keys(k.measurements)[0]
    }
}

console.warn("Read", count, "/", files.length, "(", (100 * count / files.length).toFixed(1), "%),", bustedCount, "were busted (", (100 * bustedCount / files.length).toFixed(1), "%)")

console.log(JSON.stringify(ourMetadata, undefined, 2))