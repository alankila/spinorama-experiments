import { compute_cea2034 } from "../src/util/cea2034"
import { processSpinoramaFile } from "../src/util/loaders"
import { getScores, type Scores } from "../src/util/scores";
import { readdirSync, readFileSync } from "fs"

async function listMeasurements(dir) {
    const files = readdirSync(dir, { recursive: true, encoding: "binary" })
    return files.filter(f => f.endsWith(".zip")).map(f => dir + "/" + f)
}

console.log("Initialized...")
let files = await listMeasurements("public/measurements")
console.log("Found", files.length, "zip files to read")

let count = 0
let result: { [key: string]: Scores } = {}
for (let file of files) {
    const data = readFileSync(file)
    try {
        const [horizSpin, vertSpin] = await processSpinoramaFile(new Uint8Array(data))
        if (horizSpin.isBusted || vertSpin.isBusted) {
            console.log("Busted measurement")
        }

        const cea2034 = compute_cea2034(horizSpin, vertSpin)
        const tonality = getScores(cea2034)
        result[file.replace(".zip", "")] = tonality
        count ++;
    }
    catch (error) {
        console.log("Unable to process", file, error)
    }
}

console.log("Read", count, "/", files.length)
console.log(result)