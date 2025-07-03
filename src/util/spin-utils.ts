import { spinKeys, type Spin } from "./cea2034";
import type { Biquads } from "./iir";
import type { SpinoramaData } from "./loaders-spin";


/**
 * Convert linear gain factor to dB
 * 
 * @param mag 
 * @returns 
 */
export function lin2db(mag: number) {
  return mag > 0 ? Math.log10(mag) * 20 : -144
}

/** Convert SPL to pressure */
export function spl2pressure(spl: number) {
    return 10 ** ((spl - 105.0) / 20)
}

/** Convert pressure to SPL */
export function pressure2spl(pressure: number) {
    return 105.0 + 20.0 * Math.log10(pressure);
}


/**
 * Normalize magnitudes so that On-Axis is 0 and all other measurements are also shifted relative to it.
 * One measurement set involves a separate horizontal and vertical spin.
 * We thus have two on-axis measurements, and we average them both.
 *
 * @param spin 
 */
export function setToMeanOnAxisLevel(...spins: SpinoramaData<Spin>[]) {
  let ds = spins.map(s => s.datasets["On-Axis"])

  let avg = 0;
  let count = 0;
  for (let s of ds.values()) {
    for (let data of s.entries()) {
      if (data[0] >= 300 && data[0] <= 3000) {
        avg += data[1]
        count ++;
      }
    }
  }
  let mean = avg / count;

  for (let spin of spins) {
    for (let data of Object.values(spin.datasets)) {
      data.forEach((v, k) => data.set(k, v - mean))
    }
  }
}

export function cloneSpinorama(data: SpinoramaData<Spin>): SpinoramaData<Spin> {
  const datasets = { ...data.datasets }
  spinKeys.filter(k => datasets[k]).forEach(k => datasets[k] = new Map(datasets[k]))
  return {
    isBusted: data.isBusted,
    freq: [...data.freq],
    datasets,
  }
}

/**
 * Return IIR filtered version of spinorama measurement, corresponding to equalized version of the measurement
 * 
 * @param spin 
 * @param biquads 
 * @returns spin with IIR applied
 */
export function iirAppliedSpin(spin: SpinoramaData<Spin>, biquads: Biquads) {
  spin = cloneSpinorama(spin)

  const iir = iirToSpin(spin.freq, biquads).datasets["Overall"]
  for (let data of Object.values(spin.datasets)) {
    data.forEach((v, k) => data.set(k, v + (iir.get(k) ?? 0)))
  }

  setToMeanOnAxisLevel(spin)
  return spin
}

/**
 * Return measurement set for IIR, in keys Overall, Filter 1, Filter 2, Filter 3, ...
 * 
 * @param freq 
 * @param biquads 
 */
export function iirToSpin(freq: number[], biquads: Biquads) {
  let map = new Map<number, number>()
  for (let k of freq) {
    let [mag, _ang] = biquads.transfer(k)
    map.set(k, lin2db(mag))
  }

  let spin: SpinoramaData<{ [key: string]: Map<number,number> }> = {
    isBusted: false,
    freq: [...freq],
    datasets: { Overall: map },
  }

  for (let i = 0; i < biquads.biquadCount; i ++) {
    let map = new Map<number, number>()
    for (let k of freq) {
      let [mag, _ang] = biquads.applyBiquad(k, i)
      map.set(k, lin2db(mag))
    }
    spin.datasets[`Filter ${i+1}`] = map
  }
  return spin
}

/**
 * Subtracts the series from On-Axis suite from all other measurements, then set On-Axis itself to 0
 * 
 * @param spin 
 * @returns new spin with relative levels to On-Axis measurement
 */
export function normalizedToOnAxis(spin: SpinoramaData<Spin>) {
  spin = cloneSpinorama(spin)

  let onAxis = spin.datasets["On-Axis"]
  for (let data of Object.values(spin.datasets)) {
    if (data === onAxis) {
      continue
    }
    data.forEach((v, k) => data.set(k, v - (onAxis.get(k) ?? 0)))
  }
  onAxis.forEach((_, k) => onAxis.set(k, 0))
  return spin
}