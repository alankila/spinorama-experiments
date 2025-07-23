import { estimatedInRoom, type CEA2034 } from "./cea2034";
import type { SpinoramaData } from "./loaders-spin";

export interface OurMetadata {
    [speakerId: string]: Speaker,
}

export interface Speaker {
    brand: string,
    model: string,
    type: string,
    price?: number,
    shape: string,
    amount: string,
    defaultMeasurement: string,
    measurements: {
        [key: string]: {
            format: string,
            scores: Scores,
        }
    },
}

export interface Scores {
    lfxHz: number,
    nbdOnAxis: number,
    nbdPredInRoom: number,
    smPredInRoom: number,
    tonality: number,
    tonalityNoLfxLimit: number,
    flatness: number,
    isBusted: boolean,
}

const NBD_MIN_HZ = 100 /* NBD functions start at 100 Hz even if measurement covers below */
const NBD_MAX_HZ = 12000 /* NBD functions end at 12000 Hz */
const LFX_MIN_HZ = 14.5 /* considered to be "ideal subwoofer" */
const SM_MIN_HZ = 100 /* Smoothness is evaluated from 100 Hz forwards */
const SM_MAX_HZ = 16000 /* Smoothness is evaluated up to 16000 Hz */

export const MIDRANGE_MIN = 300
export const MIDRANGE_MAX = 5000

export const PIR_MIN_HZ = 100
export const PIR_MAX_HZ = 12000

function mean(values: number[]) {
    let avg = 0
    for (let i = 0; i < values.length; i ++) {
        avg += (values[i] - avg) / (i + 1)
    }
    return avg
}

function sum(values: number[]) {
    return values.reduce((a, b) => a + b, 0)
}

function meanOverRange<T extends { [key: string]: Map<number, number> }>(spin: SpinoramaData<T>, name: keyof T, minFreq: number, maxFreq: number) {
    return mean([...spin.datasets[name]].filter(x => x[0] >= minFreq && x[1] < maxFreq).map(x => x[1]))
}

/**
 * compute 1/N octave band
 * N: >=2 when N increases, bands are narrower
 *
 * https://courses.physics.illinois.edu/phys406/sp2017/Lab_Handouts/Octave_Bands.pdf
 */
function octave(count: number) {
    const reference = 1290.0
    const p = Math.pow(2, 1 / count)
    const p_band = Math.pow(2, 1 / (2 * count))
    const o_iter = Math.floor((count * 10 + 1) / 2)

    let center = []
    for (let i = -o_iter; i <= o_iter; i ++) {
        center.push(reference * Math.pow(p, i))
    }

    return center.map(c => [c / p_band, c, c * p_band])
}

export function getScores(cea2034: SpinoramaData<CEA2034>): Scores {
    const lfxHz = computeLfxHz(cea2034) || LFX_MIN_HZ
    const pir = estimatedInRoom(cea2034) || 0
    const nbdOnAxis = nbd(cea2034, "On-Axis") || 0
    const nbdPredInRoom = nbd(pir, "Estimated In-Room") || 0
    const smPredInRoom = sm(pir, "Estimated In-Room") || 1
    const midrangeMean = meanOverRange(cea2034, "On-Axis", MIDRANGE_MIN, MIDRANGE_MAX) || 0
    const flatness = [...cea2034.datasets["On-Axis"]].filter(p => p[0] >= MIDRANGE_MIN && p[0] <= MIDRANGE_MAX).map(p => Math.abs(p[1] - midrangeMean)).reduce((a, b) => a > b ? a : b, 0) || 0

    return {
        lfxHz,
        nbdOnAxis,
        nbdPredInRoom,
        smPredInRoom,
        flatness,
        tonality: 12.69 - 2.49 * nbdOnAxis - 2.99 * nbdPredInRoom - 4.31 * Math.log10(lfxHz) + 2.32 * smPredInRoom,
        tonalityNoLfxLimit: 12.69 - 2.49 * nbdOnAxis - 2.99 * nbdPredInRoom - 4.31 * Math.log10(LFX_MIN_HZ) + 2.32 * smPredInRoom,
        isBusted: cea2034.isBusted,
    }
}

function computeLfxHz(cea2034: SpinoramaData<CEA2034>) {
    /* Establish limit for where -6 dB level is relative to mean level in listening window */
    let lwRef = meanOverRange(cea2034, "Listening Window", 300, 10000) - 6

    /* Walk frequencies down to 300 Hz, then choose first point where response drops below lwRef */
    const sp = cea2034.datasets["Sound Power"];
    const freqs = [...sp.keys()].sort((a, b) => a - b)
    for (let i = freqs.length - 2; i >= 0; i --) {
        let freq = freqs[i]
        if (freq > 300) {
            continue
        }

        if ((sp.get(freq) ?? 0) < lwRef) {
            /* Estimate the average between the two datapoints for where -6 dB is crossed */
            return (freq + freqs[i + 1]) / 2
        }
    }

    /* Return the 1st frequency as the limit if we didn't hit such freq, or at least 14.5 so we don't overshoot our "ideal sub" figure if measurement goes below 14.5 Hz */
    return Math.max(freqs[0], LFX_MIN_HZ)
}

/**
 * nbd Narrow Band
 *
 * The narrowband deviation is defined by:
 * 
 *    NBD(dB)=⎜ ∑ y -y ⎟÷N  ⎛
 * 
 * where ⎜ OctaveBandn ⎟ is the average amplitude value
 * within the 1/2-octave band n, yb is the amplitude
 * value of band b, and N is the total number of 1/2­ octave bands
 * between 100 Hz-12 kHz. The mean absolute deviation within each
 * 1/2-octave band is based a sample of 10 equally log-spaced data points.
 */
function nbd<T extends { [key: string]: Map<number, number> }>(spin: SpinoramaData<T>, name: keyof T) {
    const min = Math.min(...spin.datasets[name].keys())
    const bandMinFreq = Math.max(NBD_MIN_HZ, min)
    const bands = octave(2).filter(p => p[1] >= bandMinFreq && p[1] <= NBD_MAX_HZ).map(b => {
        let avg = 0
        let count = 0
        let result: number[] = []
        for (const [freq, mag] of spin.datasets[name]) {
            if (freq < b[0] || freq >= b[2]) {
                continue
            }
            avg += mag
            count ++
            result.push(mag)
        }
        avg /= count
        /* mean average difference: subtract value from mean, take absolute, and average */
        return mean(result.map(mag => Math.abs(mag - avg)));
    })
    return mean(bands.map(b => Math.abs(b)))
}

/**
 * sm Smoothness
 *
 * For each of the 7 frequency response curves, the overall smoothness (SM) and
 * slope (SL) of the curve was determined by estimating the line that best fits
 * the frequency curve over the range of 100 Hz-16 kHz. This was done using a
 * regression based on least square error. SM is the Pearson correlation
 * coefficient of determination (r2) that describes the goodness of fit of the
 * regression line defined by:
 * ⎛ SM =⎜ n(∑XY)-(∑X)(∑Y) ⎟ / ⎜ (n∑X2-(∑X)2)(n∑Y2-(∑Y)2)⎟
 *
 * where n is number of data points used to estimate the regression curve and
 * X and Y represent the measured versus estimated amplitude values of the
 * regression line. A natural log transformation is applied to the measured
 * frequency values (Hz) so that they are linearly spaced (see equation 5).
 * Smoothness (SM) values can range from 0 to 1, with larger values representing
 * smoother frequency response curves.
 */
function sm<T extends { [key: string]: Map<number, number> }>(spin: SpinoramaData<T>, name: keyof T) {
    const ds = [...spin.datasets[name]].filter(x => x[0] >= SM_MIN_HZ && x[0] <= SM_MAX_HZ).map(x => [Math.log(x[0]), x[1]]);

    /*
     * https://en.wikipedia.org/wiki/Pearson_correlation_coefficient
     *
     * The single-pass formula r_xy = nom / dem
     * with nom = n * sum(x * y) - sum(x) * sum(y)
     * and  den = sqrt(n * sum(x²) - sum(x) ** 2) * sqrt(n * sum( y ** 2) - sum(y) ** 2)
     */
    const nom = ds.length * sum(ds.map(xy => xy[0] * xy[1])) - sum(ds.map(xy => xy[0])) * sum(ds.map(xy => xy[1]))
    const den = (ds.length * sum(ds.map(xy => xy[0] ** 2)) - sum(ds.map(xy => xy[0])) ** 2) ** 0.5 * (ds.length * sum(ds.map(xy => xy[1] ** 2)) - sum(ds.map(xy => xy[1])) ** 2) ** 0.5
    const rxy = nom / den
    return rxy ** 2
}