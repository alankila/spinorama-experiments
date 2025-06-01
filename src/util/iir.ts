import { Complex } from "complex.js";
import type { moveEmitHelpers } from "typescript";

class Biquad {
    private a1 = 0
    private a2 = 0
    private b0 = 1
    private b1 = 0
    private b2 = 0

    private set(a0: number, a1: number, a2: number, b0: number, b1: number, b2: number) {
        this.a1 = a1/a0
        this.a2 = a2/a0
        this.b0 = b0/a0
        this.b1 = b1/a0
        this.b2 = b2/a0
    }

    private setPreamp(gain: number) {
        this.set(1, 0, 0, 10 ** (gain / 20), 0, 0)
    }

    private setLP(center_frequency: number, sampling_frequency: number, quality: number) {
        let w0 = 2 * Math.PI * center_frequency / sampling_frequency
        let alpha = Math.sin(w0) / (2 * quality)
        let b0 = (1 - Math.cos(w0))/2
        let b1 =  1 - Math.cos(w0)
        let b2 = (1 - Math.cos(w0))/2
        let a0 =  1 + alpha
        let a1 = -2 * Math.cos(w0)
        let a2 =  1 - alpha
        this.set(a0, a1, a2, b0, b1, b2)
    }

    private setHP(center_frequency: number, sampling_frequency: number, quality: number) {
        let w0 = 2 * Math.PI * center_frequency / sampling_frequency
        let alpha = Math.sin(w0) / (2 * quality)
        let b0 =  (1 + Math.cos(w0))/2
        let b1 = -(1 + Math.cos(w0))
        let b2 =  (1 + Math.cos(w0))/2
        let a0 =   1 + alpha
        let a1 =  -2 * Math.cos(w0)
        let a2 =   1 - alpha
        this.set(a0, a1, a2, b0, b1, b2)
    }

    private setBP(center_frequency: number, sampling_frequency: number, quality: number) {
        let w0 = 2 * Math.PI * center_frequency / sampling_frequency
        let alpha = Math.sin(w0) / (2 * quality)
        let b0 = Math.sin(w0) / 2
        let b1 = 0
        let b2 = -Math.sin(w0) / 2
        let a0 =   1 + alpha
        let a1 =  -2 * Math.cos(w0)
        let a2 =   1 - alpha
        this.set(a0, a1, a2, b0, b1, b2)
    }

    private setNO(center_frequency: number, sampling_frequency: number, quality: number) {
        let w0 = 2 * Math.PI * center_frequency / sampling_frequency
        let alpha = Math.sin(w0) / (2 * quality)
        let b0 =  1
        let b1 = -2 * Math.cos(w0)
        let b2 =  1
        let a0 =  1 + alpha
        let a1 = -2 * Math.cos(w0)
        let a2 =  1 - alpha
        this.set(a0, a1, a2, b0, b1, b2)
    }

    private setAP(center_frequency: number, sampling_frequency: number, quality: number) {
        let w0 = 2 * Math.PI * center_frequency / sampling_frequency
        let alpha = Math.sin(w0) / (2 * quality)
        let b0 =  1 - alpha
        let b1 = -2 * Math.cos(w0)
        let b2 =  1 + alpha
        let a0 =  1 + alpha
        let a1 = -2 * Math.cos(w0)
        let a2 =  1 - alpha
        this.set(a0, a1, a2, b0, b1, b2)
    }

    private setPK(center_frequency: number, sampling_frequency: number, db_gain: number, quality: number) {
        let w0 = 2 * Math.PI * center_frequency / sampling_frequency
        let A = Math.pow(10, db_gain / 40)
        let alpha = Math.sin(w0) / (2 * quality)
        let b0 =  1 + alpha*A
        let b1 = -2 * Math.cos(w0)
        let b2 =  1 - alpha*A
        let a0 =  1 + alpha/A
        let a1 = -2 * Math.cos(w0)
        let a2 =  1 - alpha/A
        this.set(a0, a1, a2, b0, b1, b2)
    }

    private setLS(center_frequency: number, sampling_frequency: number, db_gain: number, quality: number) {
        let w0 = 2 * Math.PI * center_frequency / sampling_frequency
        let A = Math.pow(10, db_gain / 40)
        let alpha = Math.sin(w0) / (2 * quality)
        let b0 =   A*( (A+1) - (A-1)*Math.cos(w0) + 2*Math.sqrt(A)*alpha )
        let b1 = 2*A*( (A-1) - (A+1)*Math.cos(w0)                   )
        let b2 =   A*( (A+1) - (A-1)*Math.cos(w0) - 2*Math.sqrt(A)*alpha )
        let a0 =       (A+1) + (A-1)*Math.cos(w0) + 2*Math.sqrt(A)*alpha
        let a1 =  -2*( (A-1) + (A+1)*Math.cos(w0)                   )
        let a2 =       (A+1) + (A-1)*Math.cos(w0) - 2*Math.sqrt(A)*alpha
        this.set(a0, a1, a2, b0, b1, b2)
    }

    private setHS(center_frequency: number, sampling_frequency: number, db_gain: number, quality: number) {
        let w0 = 2 * Math.PI * center_frequency / sampling_frequency
        let A = Math.pow(10, db_gain / 40)
        let alpha = Math.sin(w0) / (2 * quality)
        let b0 =    A*( (A+1) + (A-1)*Math.cos(w0) + 2*Math.sqrt(A)*alpha )
        let b1 = -2*A*( (A-1) + (A+1)*Math.cos(w0)                   )
        let b2 =    A*( (A+1) + (A-1)*Math.cos(w0) - 2*Math.sqrt(A)*alpha )
        let a0 =        (A+1) - (A-1)*Math.cos(w0) + 2*Math.sqrt(A)*alpha
        let a1 =    2*( (A-1) - (A+1)*Math.cos(w0)                   )
        let a2 =        (A+1) - (A-1)*Math.cos(w0) - 2*Math.sqrt(A)*alpha
        this.set(a0, a1, a2, b0, b1, b2)
    }

    public transfer(z: Complex) {
        let nom = new Complex(this.b0).add(new Complex(this.b1).div(z)).add(new Complex(this.b2).div(z.mul(z)))
        let den = new Complex(1).add(new Complex(this.a1).div(z)).add(new Complex(this.a2).div(z.mul(z)))
        return nom.div(den)
    }

    public static construct(type: string, freq: number, sampling_rate: number, q: number, gain: number) {
        const b = new Biquad()
        if (type === "Preamp") {
            b.setPreamp(gain)
        } else if (type === "APQ" || type === "AP") {
            b.setAP(freq, sampling_rate, q)
        } else if (type === "LPQ" || type === "LP") {
            b.setLP(freq, sampling_rate, q)
        } else if (type === "BPQ" || type === "BP") {
            b.setBP(freq, sampling_rate, q)
        } else if (type === "HPQ" || type === "HP") {
            b.setHP(freq, sampling_rate, q)
        } else if (type === "NOQ" || type === "NO") {
            b.setNO(freq, sampling_rate, q)
        } else if (type === "HSQ" || type === "HS") {
            b.setHS(freq, sampling_rate, gain, q)
        } else if (type === "LSQ" || type === "LS") {
            b.setLS(freq, sampling_rate, gain, q)
        } else if (type === "PK") {
            b.setPK(freq, sampling_rate, gain, q)
        } else {
            throw new Error(`Unable to construct a filter of type: ${type}`)
        }
        return b;
    }
}

export class Biquads {
    constructor(private readonly biquads: Biquad[], private readonly samplingRate: number) {}

    /**
     * Return [mag, angle] representation of the effect the filter has on given frequency
     * 
     * @param frequency 
     * @returns 
     */
    transfer(frequency: number) {
        const angle = frequency / this.samplingRate * 2 * Math.PI;
        const w0 = new Complex(Math.cos(angle), Math.sin(angle))
        let transfer = new Complex(1, 0)
        for (let biquad of this.biquads) {
            transfer = transfer.mul(biquad.transfer(w0))
        }
        return [transfer.abs(), transfer.arg()]
    }

    public static fromApoConfig(apoConfig: string, samplingRate: number) {
        const biquad: Biquad[] = [];
        const filters = apoConfig.split(/\s*\n/).filter(r => /^Filter\s+\d+:\s+ON\s+|^Preamp:\s+/.exec(r))

        for (let line of filters) {
            const row = line.split(/\s+/)
            if (row[0] === "Preamp:" && row[2] === "dB") {                
                biquad.push(Biquad.construct("Preamp", 0, 0, 0, parseFloat(row[1])));
            } else if (row[0] === "Filter") {
                let type = row[3]
                let freq = 0
                let q = Math.sqrt(2)/2
                let gain = 0

                let i = 4
                while (i < row.length) {
                    if (row[i] == "Fc" && row[i + 2] === "Hz") {
                        freq = parseFloat(row[i + 1])
                        i += 3
                    } else if (row[i] == "Q") {
                        q = parseFloat(row[i + 1])
                        i += 2
                    } else if (row[i] === "Gain" && row[i + 2] === "dB") {
                        gain = parseFloat(row[i + 1])
                        i += 3
                    } else {
                        throw new Error(`Unhandled eq row: ${line} at ${row[i]}`);
                    }
                }

                biquad.push(Biquad.construct(type, freq, samplingRate, q, gain))
            } else {
                throw new Error(`Unhandled eq row: ${line}`);
            }
        }

        return new Biquads(biquad, samplingRate)
    }
}

