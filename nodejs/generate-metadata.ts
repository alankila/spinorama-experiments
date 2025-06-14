import { compute_cea2034 } from "../src/util/cea2034"
import { processSpinoramaFile } from "../src/util/loaders"
import { getScores, OurMetadata, type Scores } from "../src/util/scores"
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
    const data = readFileSync(`${dir}/${file}`)
    try {
        const [horizSpin, vertSpin] = await processSpinoramaFile(new Uint8Array(data))
        if (horizSpin.isBusted || vertSpin.isBusted) {
            console.warn("Busted measurement", file)
        }

        const cea2034 = compute_cea2034(horizSpin, vertSpin)
        const scores = getScores(cea2034)
        const [speakerId, measurementId] = file.replace(".zip", "").split("/", 2)

        if (!ourMetadata[speakerId]) {
            ourMetadata[speakerId] = {
                brand: theirMetadata[speakerId].brand,
                model: theirMetadata[speakerId].model,
                type: theirMetadata[speakerId].type,
                price: parseInt(theirMetadata[speakerId].price) || undefined,
                shape: theirMetadata[speakerId].shape,
                amount: theirMetadata[speakerId].amount ?? "each", /* this is just a guess */
                defaultMeasurement: theirMetadata[speakerId].default_measurement,
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
    }
    catch (error) {
        console.warn("Unable to process", file, error)
    }
}

for (let k of Object.values(ourMetadata)) {
    if (!(k.defaultMeasurement in k.measurements)) {
        console.warn("Default measurement doesn't exist in", k.brand, "/", k.model, "selecting random one")
        k.defaultMeasurement = Object.keys(k.measurements)[0]
    }
}

console.warn("Read", count, "/", files.length, "(", (100 * count / files.length).toFixed(1), "%),", bustedCount, "were busted (", (100 * bustedCount / files.length).toFixed(1), "%)")

console.log(JSON.stringify(ourMetadata, undefined, 2))