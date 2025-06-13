import { processSpinoramaFile } from "../src/util/loaders"
import { readdirSync, readFileSync } from "fs"

async function listMeasurements(dir) {
    const files = readdirSync(dir, { recursive: true, encoding: "binary" })
    return files.filter(f => f.endsWith(".zip")).map(f => dir + "/" + f)
}

console.log("Initialized...")
let files = await listMeasurements("public/measurements")
console.log("Found", files.length, "zip files to read")

let count = 0
for (let file of files) {
    const data = readFileSync(file)
    try {
        const [horizSpin, vertSpin] = await processSpinoramaFile(new Uint8Array(data))
        count ++;
    }
    catch (error) {
        console.log("Unable to process", file, error)
    }
}

console.log("Read", count, "/", files.length)