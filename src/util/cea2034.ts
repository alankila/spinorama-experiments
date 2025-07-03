/**
 * Porting spinorama's CEA2034 computation here from Pierre Aubert
 */

import type { SpinoramaData } from "./loaders-spin"
import { pressure2spl, spl2pressure } from "./spin-utils"

export type CEA2034 = {
    "On-Axis": Map<number, number>,
    "Listening Window": Map<number, number>,
    "Sound Power": Map<number, number>,
    "Early Reflections DI": Map<number, number>,
    "Sound Power DI": Map<number, number>,
    "Total Early Reflections": Map<number, number>,
}

export const cea2034Keys = ["On-Axis", "Listening Window", "Sound Power", "Early Reflections DI", "Sound Power DI", "Total Early Reflections"] as const

export type EarlyReflections = {
    "Floor Bounce": Map<number, number>,
    "Ceiling Bounce": Map<number, number>,
    "Front Wall Bounce": Map<number, number>,
    "Side Wall Bounce": Map<number, number>,
    "Rear Wall Bounce": Map<number, number>,

    "Total Horizontal Reflection": Map<number, number>,
    "Total Vertical Reflection": Map<number, number>,
    "Total Early Reflections": Map<number, number>,
}

/** 
 * Compute the area of the sphere between 4 lines at alpha and beta angles
 */
function computeAreaQ(alpha_d: number, beta_d: number) {
    const alpha = alpha_d * 2 * Math.PI / 360
    const beta = beta_d * 2 * Math.PI / 360
    const gamma = Math.acos(Math.cos(alpha) * Math.cos(beta))
    const a = Math.atan(Math.sin(beta) / Math.tan(alpha))
    const b = Math.atan(Math.sin(alpha) / Math.tan(beta))
    const c = Math.acos(-Math.cos(a) * Math.cos(b) + Math.sin(a) * Math.sin(b) * Math.cos(gamma))
    const s = 4 * c - 2 * Math.PI
    return s
}

/**
 * Compute the weigths from the CEA2034 standards
 */
function computeWeigths() {
    const angles = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(a => a * 10 + 5);
    angles.push(90);
    const weigth_angles = angles.map(i => computeAreaQ(i, i));
    const weigths = [weigth_angles[0]];
    for (let i = 1; i < weigth_angles.length; i ++) {
        weigths[i] = weigth_angles[i] - weigth_angles[i - 1];
    }
    weigths[9] *= 2.0
    return weigths
}

const std_weigths = computeWeigths()

export const sp_weigths = {
    "On-Axis": std_weigths[0],
    "180°": std_weigths[0],

    "10°": std_weigths[1],
    "170°": std_weigths[1],
    "-170°": std_weigths[1],
    "-10°": std_weigths[1],

    "20°": std_weigths[2],
    "160°": std_weigths[2],
    "-160°": std_weigths[2],
    "-20°": std_weigths[2],

    "30°": std_weigths[3],
    "150°": std_weigths[3],
    "-150°": std_weigths[3],
    "-30°": std_weigths[3],

    "40°": std_weigths[4],
    "140°": std_weigths[4],
    "-140°": std_weigths[4],
    "-40°": std_weigths[4],

    "50°": std_weigths[5],
    "130°": std_weigths[5],
    "-130°": std_weigths[5],
    "-50°": std_weigths[5],

    "60°": std_weigths[6],
    "120°": std_weigths[6],
    "-120°": std_weigths[6],
    "-60°": std_weigths[6],

    "70°": std_weigths[7],
    "110°": std_weigths[7],
    "-110°": std_weigths[7],
    "-70°": std_weigths[7],

    "80°": std_weigths[8],
    "100°": std_weigths[8],
    "-100°": std_weigths[8],
    "-80°": std_weigths[8],

    "90°": std_weigths[9],
    "-90°": std_weigths[9],
}

export type Spin = { [K in keyof typeof sp_weigths]: Map<number, number> };

export const spinKeys = [
    "On-Axis", "180°",  "10°", "170°", "-170°", "-10°",  "20°", "160°", "-160°", "-20°",  "30°", "150°", "-150°", "-30°",  "40°", "140°", "-140°", "-40°",  "50°", "130°", "-130°", "-50°",  "60°", "120°", "-120°", "-60°",  "70°", "110°", "-110°", "-70°",  "80°", "100°", "-100°", "-80°",  "90°", "-90°"
] as const;

/** 
 * Compute the spatial average of pressure with a function.
 */
function spatialAverage<T extends { [key: string]: Map<number, number> }>(spins: SpinoramaData<T>[], datasetFilter: (spin: SpinoramaData<T>, name: keyof T) => boolean, spatially_weighted: boolean) {
    const result = new Map<number, [number, number]>()
    for (let x of spins[0].freq) {
        result.set(x, [0, 0])
    }
    
    /* Average the spins provided as argument. */
    let isBusted = false
    for (let spin of spins) {
        for (let entry of Object.entries(spin.datasets)) {
            if (!datasetFilter(spin, entry[0])) {
                continue
            }

            isBusted ||= spin.isBusted

            for (let data of entry[1].entries()) {
                let res = result.get(data[0])
                if (!res) {
                    throw new Error(`Something wrong, unexpected frequency ${res}`)
                }

                // @ts-ignore 
                const weight = spatially_weighted ? sp_weigths[entry[0]] ?? (() => { throw new Error(`Expected to find dataset ${entry[0]}`) })() : 1;
                res[0] += spl2pressure(data[1]) ** 2 * weight
                res[1] += weight
            }
        }
    }

    return {
        freq: spins[0].freq,
        isBusted,
        datasets: {
            Average: new Map([...result].map(r => {
                let [freq, data] = r
                let pressure = (data[0] / data[1]) ** 0.5
                return [freq, pressure2spl(pressure)]
            })),
        },
    }
}

/**
 * Sound Power
 * 
 * The sound power is the weighted rms average of all 70 measurements,
 * with individual measurements weighted according to the portion of the
 * spherical surface that they represent. Calculation of the sound power
 * curve begins with a conversion from SPL to pressure, a scalar magnitude.
 * The individual measures of sound pressure are then weighted according
 * to the values shown in Appendix C and an energy average (rms) is
 * calculated using the weighted values. The final average is converted
 * to SPL.
 * 
 * @param horizSpin 
 * @param vertSpin 
 */
function computeSoundPower(horizSpin: SpinoramaData<Spin>, vertSpin: SpinoramaData<Spin>) {
    return spatialAverage([horizSpin, vertSpin], (spin: SpinoramaData<Spin>, name: string) => {
        return !(spin == vertSpin && (name == 'On Axis' || name == '180°'))
    }, true)
}

/** Compute the Listening Window (LW) from the SPL horizontal and vertical */
function computeListeningWindow(horizSpin: SpinoramaData<Spin>, vertSpin: SpinoramaData<Spin>) {
    return spatialAverage([horizSpin, vertSpin], (spin: SpinoramaData<Spin>, name: string) => {
        return (spin == horizSpin && ["10°", "20°", "30°", "-10°", "-20°", "-30°"].indexOf(name) !== -1)
        || (spin == vertSpin && ["On Axis", "10°", "-10°"].indexOf(name) !== -1)
    }, false);
}

/**
 * Compute the Estimated In-Room Response (PIR) from the SPL horizontal and vertical
 * The Estimated In-Room Response shall be calculated using the directivity
 * data acquired in Section 5 or Section 6.
 * It shall be comprised of a weighted average of
 *     12 % Listening Window,
 *     44 % Early Reflections,
 * and 44 % Sound Power.
 * The sound pressure levels shall be converted to squared pressure values
 * prior to the weighting and summation. After the weightings have been
 * applied and the squared pressure values summed they shall be converted
 * back to sound pressure levels.
 *
 * @param cea2034 
 * @returns Estimated in-room response
 */
export function estimatedInRoom(cea2034: SpinoramaData<CEA2034>) {
    let lw = cea2034.datasets["Listening Window"]
    let er = cea2034.datasets["Total Early Reflections"]
    let sp = cea2034.datasets["Sound Power"]

    let data = new Map<number, number>()
    for (let f of cea2034.freq) {
        let sum = 0.12 * spl2pressure(lw.get(f) ?? 0) ** 2
        + 0.44 * spl2pressure(er.get(f) ?? 0) ** 2
        + 0.44 * spl2pressure(sp.get(f) ?? 0) ** 2
        data.set(f, pressure2spl(sum ** 0.5))
    }
    return {
        freq: cea2034.freq,
        isBusted: cea2034.isBusted,
        datasets: {
            "Estimated In-Room": data,
        },
    };
}

/** 
 * Compute the Early Reflections from the SPL horizontal and vertical
 */
export function computeEarlyReflections(horizSpin: SpinoramaData<Spin>, vertSpin: SpinoramaData<Spin>): SpinoramaData<EarlyReflections> {
    const floorBounce = spatialAverage([vertSpin], (_, name: string) => ["-20°", "-30°", "-40°"].indexOf(name) !== -1, false)
    const ceilingBounce = spatialAverage([vertSpin], (_, name: string) => ["40°", "50°", "60°"].indexOf(name) !== -1, false)
    const frontWallBounce = spatialAverage([horizSpin], (_, name: string) => ["On Axis", "10°", "20°", "30°", "-10°", "-20°", "-30°"].indexOf(name) !== -1, false)
    const sideWallBounce = spatialAverage([horizSpin], (_, name: string) => ["-40°", "-50°", "-60°", "-70°", "-80°", "40°", "50°", "60°", "70°", "80°"].indexOf(name) !== -1, false)
    const rearWallBounce = spatialAverage([horizSpin], (_, name: string) => ["-170°", "-160°", "-150°", "-140°", "-130°", "-120°", "-110°", "-100°", "-90°", "90°", "100°", "110°", "120°", "130°", "140°", "150°", "160°", "170°", "180°"].indexOf(name) !== -1, false)

    const totalHorizontalReflection = spatialAverage([frontWallBounce, sideWallBounce, rearWallBounce], () => true, false)
    const totalVerticalReflection = spatialAverage([ceilingBounce, floorBounce], () => true, false)
    const totalEarlyReflection = spatialAverage([floorBounce, ceilingBounce, frontWallBounce, sideWallBounce, rearWallBounce], () => true, false)

    return {
        freq: floorBounce.freq,
        isBusted: floorBounce.isBusted || ceilingBounce.isBusted || frontWallBounce.isBusted || sideWallBounce.isBusted || rearWallBounce.isBusted || totalHorizontalReflection.isBusted || totalVerticalReflection.isBusted || totalEarlyReflection.isBusted,
        datasets: {
            "Floor Bounce": floorBounce.datasets.Average,
            "Ceiling Bounce": ceilingBounce.datasets.Average,
            "Front Wall Bounce": frontWallBounce.datasets.Average,
            "Side Wall Bounce": sideWallBounce.datasets.Average,
            "Rear Wall Bounce": rearWallBounce.datasets.Average,

            "Total Horizontal Reflection": totalHorizontalReflection.datasets.Average,
            "Total Vertical Reflection": totalVerticalReflection.datasets.Average,
            "Total Early Reflections": totalEarlyReflection.datasets.Average,
        }
    }
}

/**
 * Compute On Axis depending of which kind of data we have.
 */
function computeOnAxis(horizSpin: SpinoramaData<Spin>, vertSpin: SpinoramaData<Spin>) {
    return spatialAverage([horizSpin, vertSpin], (_, name) => name === "On-Axis", false)
}

/**
 * Compute all the graphs from CEA2034 from the SPL horizontal and vertical
 *
 * @param horizSpin 
 * @param vertSpin 
 * @returns 
 */
export function computeCea2034(horizSpin: SpinoramaData<Spin>, vertSpin: SpinoramaData<Spin>): SpinoramaData<CEA2034> {
    const onaxis = computeOnAxis(horizSpin, vertSpin)
    const lw = computeListeningWindow(horizSpin, vertSpin)
    const sp = computeSoundPower(horizSpin, vertSpin)
    const er = computeEarlyReflections(horizSpin, vertSpin)

    const erdi = new Map<number, number>();
    for (let f of horizSpin.freq) {
        erdi.set(f, (lw.datasets.Average.get(f) ?? 0) - (er.datasets["Total Early Reflections"].get(f) ?? 0))
    }

    /*
     * Sound Power Directivity Index (SPDI)
     * For the purposes of this standard the Sound Power Directivity Index is defined
     * as the difference between the listening window curve and the sound power curve.
     * An SPDI of 0 dB indicates omnidirectional radiation. The larger the SPDI, the
     * more directional the loudspeaker is in the direction of the reference axis.
     */
    const spdi = new Map<number, number>()
    for (let f of horizSpin.freq) {
        spdi.set(f, (lw.datasets.Average.get(f) ?? 0) - (sp.datasets.Average.get(f) ?? 0))
    }

    return {
        freq: horizSpin.freq,
        isBusted: onaxis.isBusted || lw.isBusted || sp.isBusted || er.isBusted,
        datasets: {
            "On-Axis": onaxis.datasets.Average,
            "Listening Window": lw.datasets.Average,
            "Sound Power": sp.datasets.Average,
            "Early Reflections DI": erdi,
            "Sound Power DI": spdi,
            "Total Early Reflections": er.datasets["Total Early Reflections"]
        }
    }
}
