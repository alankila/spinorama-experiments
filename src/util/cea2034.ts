/**
 * Porting spinorama's CEA2034 computation here from Pierre Aubert
 */

import type { SpinoramaData } from "./spinorama"

/**
 * Combine multiple datasets into single dataset
 * 
 * @param aoa 
 * @returns 
 */
function merge(aoa: number[][][]): number[][] {
    let result: number[][] = []
    for (let data of aoa) {
        for (let i = 0; i < data.length; i ++) {
            result[i] ||= [];
            for (let el of data[i]) {
                result[i].push(el)
            }
        }
    }

    return result
}

/** 
 * Compute the area of the sphere between 4 lines at alpha and beta angles
 */
function compute_area_q(alpha_d: number, beta_d: number) {
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
function compute_weigths() {
    const angles = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(a => a * 10 + 5);
    angles.push(90);
    const weigth_angles = angles.map(i => compute_area_q(i, i));
    const weigths = [weigth_angles[0]];
    for (let i = 1; i < weigth_angles.length; i ++) {
        weigths[i] = weigth_angles[i] - weigth_angles[i - 1];
    }
    weigths[9] *= 2.0
    return weigths
}

const std_weigths = compute_weigths()

const sp_weigths: { [key: string]: number } = {
    "On-Axis": std_weigths[0],
    "180°": std_weigths[0],
    "-180°": std_weigths[0],

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

/** Convert SPL to pressure */
function spl2pressure(spl: number) {
    return 10 ** ((spl - 105.0) / 20)
}

/** Convert pressure to SPL */
function pressure2spl(pressure: number) {
    return 105.0 + 20.0 * Math.log10(pressure);
}

/** 
 * Compute the spatial average of pressure with a function.
 * Provide list of dataset names to average and whether spatial weighting factors should be applied.
 */
function spatial_average(spins: SpinoramaData[], datasetFilter: (spin: SpinoramaData, name: string) => boolean, spatially_weighted: boolean): SpinoramaData {
    const result: { [key: number]: [number, number] } = {}
    
    /* Average the spins provided as argument. */
    for (let spin of spins) {
        let datasets = spin.datasets.filter(d => d && datasetFilter(spin, d));
        let datasetIdx = datasets.map(ds => spin.datasets.indexOf(ds));

        for (let row of spin.data) {
            for (let i = 0; i < datasets.length; i ++) {
                let frequency = row[datasetIdx[i]];
                result[frequency] ||= [0, 0];
                const weight = spatially_weighted ? sp_weigths[datasets[i]] ?? 1 : 1;
                //console.log("ds", datasets[i], i, datasetIdx[i], weight, row[datasetIdx[i] + 1])
                result[frequency][0] += spl2pressure(row[datasetIdx[i] + 1]) ** 2 * weight
                result[frequency][1] += weight
            }
        }
    }

    return {
        title: "Spatial average, weighting: " + spatially_weighted,
        datasets: ["Average", ""],
        headers: [
            "Frequency / Hz",
            "SPL / dB",
        ],
        data: Object.entries(result).map(r => {
            let [freq, data] = r
            let pressure = (data[0] / data[1]) ** 0.5
            return [parseFloat(freq), pressure2spl(pressure)]
        }).sort((a, b) => a[0] - b[0]),
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
function sound_power(horizSpin: SpinoramaData, vertSpin: SpinoramaData) {
    return spatial_average([horizSpin, vertSpin], (spin: SpinoramaData, name: string) => {
        return !(spin == vertSpin && (name == 'On Axis' || name == '180°'))
    }, true)
}

/** Compute the Listening Window (LW) from the SPL horizontal and vertical */
function listening_window(horizSpin: SpinoramaData, vertSpin: SpinoramaData) {
    return spatial_average([horizSpin, vertSpin], (spin: SpinoramaData, name: string) => {
        return (spin == horizSpin && ["10°", "20°", "30°", "-10°", "-20°", "-30°"].indexOf(name) !== -1)
        || (spin == vertSpin && ["On Axis", "10°", "-10°"].indexOf(name) !== -1)
    }, false);
}

function total_early_reflections(spins: SpinoramaData[]): SpinoramaData {
    const ter = spatial_average(spins, () => true, false)
    return {
        title: "Total Early Reflections",
        datasets: ["Total Early Reflections", ""],
        headers: ter.headers,
        data: ter.data,
    }
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
export function estimated_inroom(cea2034: SpinoramaData): SpinoramaData {
    let lwIdx = cea2034.datasets.indexOf("Listening Window")
    let erIdx = cea2034.datasets.indexOf("Total Early Reflections")
    let spIdx = cea2034.datasets.indexOf("Sound Power")

    let data = cea2034.data.map(d => {
        let sum = 0.12 * spl2pressure(d[lwIdx + 1]) ** 2
        + 0.44 * spl2pressure(d[erIdx + 1]) ** 2
        + 0.44 * spl2pressure(d[spIdx + 1]) ** 2
        return [d[lwIdx], pressure2spl(sum ** 0.5)]
    })

    return {
        title: "Estimated In-Room",
        datasets: ["Estimated In-Room", ""],
        headers: ["Hz", "dB"],
        data,
    };
}

/** 
 * Compute the Early Reflections from the SPL horizontal and vertical
 */
function early_reflections(horizSpin: SpinoramaData, vertSpin: SpinoramaData): SpinoramaData {
    const floor_bounce = spatial_average([vertSpin], (_, name: string) => ["-20°", "-30°", "-40°"].indexOf(name) !== -1, false)
    const ceiling_bounce = spatial_average([vertSpin], (_, name: string) => ["40°", "50°", "60°"].indexOf(name) !== -1, false)
    const front_wall_bounce = spatial_average([horizSpin], (_, name: string) => ["On Axis", "10°", "20°", "30°", "-10°", "-20°", "-30°"].indexOf(name) !== -1, false)
    const side_wall_bounce = spatial_average([horizSpin], (_, name: string) => ["-40°", "-50°", "-60°", "-70°", "-80°", "40°", "50°", "60°", "70°", "80°"].indexOf(name) !== -1, false)
    const rear_wall_bounce = spatial_average([horizSpin], (_, name: string) => ["-170°", "-160°", "-150°", "-140°", "-130°", "-120°", "-110°", "-100°", "-90°", "90°", "100°", "110°", "120°", "130°", "140°", "150°", "160°", "170°", "180°"].indexOf(name) !== -1, false)

    const horizontal_reflections = total_early_reflections([
        front_wall_bounce,
        side_wall_bounce,
        rear_wall_bounce,
    ])

    const vertical_reflections = total_early_reflections([
        ceiling_bounce,
        floor_bounce,
    ])

    const total_early_reflection = total_early_reflections([
        floor_bounce,
        ceiling_bounce,
        front_wall_bounce,
        side_wall_bounce,
        rear_wall_bounce,
    ])

    return {
        title: "Early Reflections",
        datasets: ["Floor Bounce", "", "Ceiling Bounce", "", "Total Vertical Reflection", "", "Front Wall Bounce", "", "Side Wall Bounce", "", "Rear Wall Bounce", "", "Total Horizontal Reflection", "", "Total Early Reflections", ""],
        headers: [...floor_bounce.headers, ...ceiling_bounce.headers, ...vertical_reflections.headers, ...front_wall_bounce.headers, ...side_wall_bounce.headers, ...rear_wall_bounce.headers, ...horizontal_reflections.headers, ...total_early_reflection.headers],
        data: merge([floor_bounce.data, ceiling_bounce.data, vertical_reflections.data, front_wall_bounce.data, side_wall_bounce.data, rear_wall_bounce.data, horizontal_reflections.data, total_early_reflection.data]),
    }
}

/**
 * Compute On Axis depending of which kind of data we have.
 * Likely best to average the horizontal and vertical measurements?
 */
function compute_onaxis(horizSpin: SpinoramaData, vertSpin: SpinoramaData) {
    return spatial_average([horizSpin, vertSpin], (_, name) => name === "On-Axis", false)
}

/**
 * Compute all the graphs from CEA2034 from the SPL horizontal and vertical
 *
 * @param horizSpin 
 * @param vertSpin 
 * @returns 
 */
export function compute_cea2034(horizSpin: SpinoramaData, vertSpin: SpinoramaData) {
    const onaxis = compute_onaxis(horizSpin, vertSpin)
    const lw = listening_window(horizSpin, vertSpin)
    const sp = sound_power(horizSpin, vertSpin)
    const er = early_reflections(horizSpin, vertSpin)
    let terIdx = er.datasets.indexOf("Total Early Reflections")

    const erdi: SpinoramaData = {
        title: "Early Reflections DI",
        datasets: ["Early Reflections DI", ""],
        headers: ["Hz", "dB"],
        data: merge([lw.data, er.data]).map((p: any) => [p[0], p[1] - p[2 + terIdx + 1]]),
    }

    /*
     * Sound Power Directivity Index (SPDI)
     * For the purposes of this standard the Sound Power Directivity Index is defined
     * as the difference between the listening window curve and the sound power curve.
     * An SPDI of 0 dB indicates omnidirectional radiation. The larger the SPDI, the
     * more directional the loudspeaker is in the direction of the reference axis.
     */
    const spdi: SpinoramaData = {
        title: "Sound Power DI",
        datasets: ["Sound Power DI", ""],
        headers: ["Hz", "dB"],
        data: merge([lw.data, sp.data]).map((p: any) => [p[0], p[1] - p[3]]),
    }

    return {
        title: "CEA2034",
        datasets: ["On-Axis", "", "Listening Window", "", ...er.datasets, "Sound Power", "", "Early Reflections DI", "", "Sound Power DI", ""],
        headers: [...onaxis.headers, ...lw.headers, ...er.headers, ...sp.headers, ...erdi.headers, ...spdi.headers],
        data: merge([onaxis.data, lw.data, er.data, sp.data, erdi.data, spdi.data]),
    }
}