import { describe, it, expect } from "vitest";
import { APU } from "../apu/apu";
import { CH1, CH2, CH3, GLOBAL, WAVE_RAM } from "../apu/apuRegisters";

describe("APU", () => {
  it("(not power dependent) NR52 power off clears NR10-NR51 shadow registers", () => {
    const apu = new APU();

    apu.writeRegister(GLOBAL.NR52, 0x80);
    apu.writeRegister(CH1.NR10, 0x12);
    apu.writeRegister(GLOBAL.NR50, 0x77);

    expect(apu._debugReadRegister(CH1.NR10)).toBe(0x12);
    expect(apu._debugReadRegister(GLOBAL.NR50)).toBe(0x77);

    apu.writeRegister(GLOBAL.NR52, 0x00);

    expect(apu._debugReadRegister(CH1.NR10)).toBe(0x00);
    expect(apu._debugReadRegister(GLOBAL.NR50)).toBe(0x00);
  });

  it("(not power dependent) Wave RAM remains accessible across NR52 power off", () => {
    const apu = new APU();

    apu.writeWaveRam(WAVE_RAM.START, 0x12);
    expect(apu.readWaveRam(WAVE_RAM.START)).toBe(0x12);

    apu.writeRegister(GLOBAL.NR52, 0x80);
    apu.writeRegister(GLOBAL.NR52, 0x00);

    expect(apu.readWaveRam(WAVE_RAM.START)).toBe(0x12);
  });

  it("FF27-FF2F is not handled by APU register API", () => {
    const apu = new APU();

    expect(apu.readRegister(0xff27)).toBe(0xff);
    apu.writeRegister(0xff27, 0x12);
    expect(apu.readRegister(0xff27)).toBe(0xff);
  });
});

describe.skip("channel 2", () => {
  // https://gbdev.io/pandocs/Audio_Registers.html#ff14--nr14-channel-1-period-high--control
  it("CH2 length expiry disables CH2 after a length tick", () => {
    const apu = new APU(1048576);
    // encender y habilitar el DAC
    apu.writeRegister(GLOBAL.NR52, 0x80);
    apu.writeRegister(CH2.NR22, 0xf1);

    // Ajustar el contador de longitud a 1 (64 - (NR21 & 0x3F) => 1 cuando el valor es 63)
    apu.writeRegister(CH2.NR21, 0x3f);

    // Disparar con la longitud habilitada
    apu.writeRegister(CH2.NR24, 0xc0);
    expect(apu.readRegister(GLOBAL.NR52) & 0x02).toBe(0x02);

    // Después del reset al encender, el próximo tick del secuenciador de frames es el paso 0 (reloj de longitud)
    apu.step(8192);

    expect(apu.readRegister(GLOBAL.NR52) & 0x02).toBe(0x00);
  });

  it("CH2 DC amplitude reflects envelope volume over time", () => {
    const apu = new APU(1048576);
    apu.setAPUSettings({ enabled: true });

    const stepFrames = (n: number) => {
      apu.step(4 * n);
    };

    apu.writeRegister(GLOBAL.NR52, 0x80);

    // enrutar CH2 a izquierda y derecha, volumen maestro al máximo
    apu.writeRegister(GLOBAL.NR51, 0x22);
    apu.writeRegister(GLOBAL.NR50, 0x77);

    // Usar una frecuencia muy alta para que timerPeriod = 4 ciclos (avance rápido del duty)
    apu.writeRegister(CH2.NR23, 0xff);

    // NR22: inicial=0, incrementa, periodo=1 (DAC habilitado)
    apu.writeRegister(CH2.NR22, 0x09);

    // Modo duty 2 para que dutyStep=0 empiece en alto
    apu.writeRegister(CH2.NR21, 0x80);
    // Disparar + ajustar los bits altos de frecuencia a 7 (freq11=2047 => timerPeriod=4 ciclos)
    apu.writeRegister(CH2.NR24, 0x87);

    const sampleLeftPeakOverDutyCycle = (): number => {
      let peak = -Infinity; // las muestras pueden ser negativas
      for (let i = 0; i < 8; i++) {
        stepFrames(1);
        const s = apu.consumeSamples(1);
        peak = Math.max(peak, s[0]);
      }
      return peak;
    };

    const l0 = sampleLeftPeakOverDutyCycle();

    // La envolvente se actualiza en el paso 7 del secuenciador de frames => 8 ticks => 8*8192 ciclos
    apu.step(8192 * 8);

    // APU.step() genera frames de audio en un FIFO interno; drenar cualquier frame
    // encolado previo al cambio de envolvente para que las siguientes lecturas reflejen el nuevo volumen.
    apu.consumeSamples(20000);

    const l1 = sampleLeftPeakOverDutyCycle();

    expect(l1).toBeGreaterThan(l0);
  });

  it("NR51 panning routes CH2 DC output to left vs right", () => {
    const apu = new APU(1048576);
    apu.setAPUSettings({ enabled: true });

    const stepFrames = (n: number) => {
      apu.step(4 * n);
    };

    apu.writeRegister(GLOBAL.NR52, 0x80);
    apu.writeRegister(GLOBAL.NR50, 0x77);

    // Usar una frecuencia muy alta para que timerPeriod = 4 ciclos (avance rápido del duty)
    apu.writeRegister(CH2.NR23, 0xff);

    // Darle a CH2 un nivel DC estable no-cero: inicial=15, decae, periodo=0 (DAC habilitado)
    apu.writeRegister(CH2.NR22, 0xf0);

    // CH2 -> solo IZQUIERDA (bit 5)
    apu.writeRegister(GLOBAL.NR51, 0x20);

    // Disparar + ajustar los bits altos de frecuencia a 7 (freq11=2047 => timerPeriod=4 ciclos)
    apu.writeRegister(CH2.NR24, 0x87);

    let sawLeftHigh = false;
    let sawRightHigh = false;
    for (let i = 0; i < 8; i++) {
      stepFrames(1);
      const s = apu.consumeSamples(1);
      if (s[0] > 0) sawLeftHigh = true;
      if (s[1] > 0) sawRightHigh = true;
    }
    expect(sawLeftHigh).toBe(true);
    expect(sawRightHigh).toBe(false);

    // CH2 -> solo DERECHA (bit 1)
    apu.writeRegister(GLOBAL.NR51, 0x02);
    sawLeftHigh = false;
    sawRightHigh = false;
    for (let i = 0; i < 8; i++) {
      stepFrames(1);
      const s = apu.consumeSamples(1);
      if (s[0] > 0) sawLeftHigh = true;
      if (s[1] > 0) sawRightHigh = true;
    }
    expect(sawLeftHigh).toBe(false);
    expect(sawRightHigh).toBe(true);
  });

  it("CH2 DAC off disables channel immediately on NR22 write", () => {
    const apu = new APU(1048576);
    apu.setAPUSettings({ enabled: true });

    const stepFrames = (n: number) => {
      apu.step(4 * n);
    };

    apu.writeRegister(GLOBAL.NR52, 0x80);

    apu.writeRegister(GLOBAL.NR51, 0x22);
    apu.writeRegister(GLOBAL.NR50, 0x77);

    apu.writeRegister(CH2.NR21, 0x80);
    apu.writeRegister(CH2.NR23, 0xff);
    apu.writeRegister(CH2.NR22, 0xf0);
    apu.writeRegister(CH2.NR24, 0x87);

    expect(apu.readRegister(GLOBAL.NR52) & 0x02).toBe(0x02);

    apu.writeRegister(CH2.NR22, 0x00);
    expect(apu.readRegister(GLOBAL.NR52) & 0x02).toBe(0x00);

    stepFrames(8);
    const s = apu.consumeSamples(8);
    expect(s.every((x) => x === 0)).toBe(true);
  });

  it("CH2 duty mode 0 outputs 1 high sample out of each 8 samples", () => {
    const apu = new APU(1048576);
    apu.setAPUSettings({ enabled: true });

    const stepFrames = (n: number) => {
      apu.step(4 * n);
    };

    apu.writeRegister(GLOBAL.NR52, 0x80);

    // CH2 -> solo IZQUIERDA, volumen maestro al máximo
    apu.writeRegister(GLOBAL.NR51, 0x20);
    apu.writeRegister(GLOBAL.NR50, 0x77);

    // Modo duty 0, la longitud no es relevante aquí
    apu.writeRegister(CH2.NR21, 0x00);

    // Usar una frecuencia muy alta para que timerPeriod = 4 ciclos (avance rápido del duty)
    apu.writeRegister(CH2.NR23, 0xff);

    // Volumen constante no-cero, DAC habilitado
    apu.writeRegister(CH2.NR22, 0xf0);
    // Disparar + ajustar los bits altos de frecuencia a 7 (freq11=2047 => timerPeriod=4 ciclos)
    apu.writeRegister(CH2.NR24, 0x87);

    const leftSamples: number[] = [];
    for (let i = 0; i < 8; i++) {
      stepFrames(1);
      leftSamples.push(apu.consumeSamples(1)[0]);
    }

    const highs = leftSamples.filter((x) => x > 0).length;
    expect(highs).toBe(1);
  });
});

function calculateLeftChannelAmplitude(samples: Float32Array): number {
  const numFrames = Math.floor(samples.length / 2);
  if (numFrames <= 0) return 0;

  let meanValue = 0;
  for (let i = 0; i < numFrames; i++) {
    meanValue += samples[i * 2] ?? 0;
  }
  meanValue /= numFrames;

  let squaredDeviationsSum = 0;
  for (let i = 0; i < numFrames; i++) {
    const deviation = (samples[i * 2] ?? 0) - meanValue;
    squaredDeviationsSum += deviation * deviation;
  }

  return Math.sqrt(squaredDeviationsSum / numFrames);
}

describe.skip("CH3 wave", () => {
  it("produces non-zero output when enabled and routed", () => {
    const apu = new APU();
    apu.setAPUSettings({ enabled: true });

    // encender
    apu.writeRegister(GLOBAL.NR52, 0x80);

    // Enrutar CH3 a izquierda/derecha y ajustar el volumen maestro al máximo
    apu.writeRegister(GLOBAL.NR50, 0x77);
    apu.writeRegister(GLOBAL.NR51, 0x44);

    // Cargar una onda en rampa repetitiva
    for (let i = 0; i < 16; i++) {
      apu.writeWaveRam(WAVE_RAM.START + i, (i << 4) | i);
    }

    // DAC encendido + volumen 100%
    apu.writeRegister(CH3.NR30, 0x80);
    apu.writeRegister(CH3.NR32, 0x20);

    // Ajustar una frecuencia más o menos audible y disparar
    apu.writeRegister(CH3.NR33, 0xaa);
    apu.writeRegister(CH3.NR34, 0x80);

    // Avanzar suficientes ciclos para generar un bloque de muestras
    apu.step(4194304 / 10);

    const out = apu.consumeSamples(2048);
    expect(calculateLeftChannelAmplitude(out)).toBeGreaterThan(0.01);
  });

  it("volume code 100% vs 50% yields about 2:1 amplitude", () => {
    const setupAndRender = (nr32: number): number => {
      const apu = new APU();
      apu.setAPUSettings({ enabled: true });
      apu.writeRegister(GLOBAL.NR52, 0x80);

      apu.writeRegister(GLOBAL.NR50, 0x77);
      apu.writeRegister(GLOBAL.NR51, 0x44);

      for (let i = 0; i < 16; i++) {
        apu.writeWaveRam(WAVE_RAM.START + i, (i << 4) | i);
      }

      apu.writeRegister(CH3.NR30, 0x80);
      apu.writeRegister(CH3.NR32, nr32);

      apu.writeRegister(CH3.NR33, 0xaa);
      apu.writeRegister(CH3.NR34, 0x80);

      apu.step(4194304 / 10);
      const out = apu.consumeSamples(4096);
      return calculateLeftChannelAmplitude(out);
    };

    const full = setupAndRender(0x20); // code 01
    const half = setupAndRender(0x40); // code 10

    expect(full).toBeGreaterThan(0.01);
    expect(half).toBeGreaterThan(0.01);

    const ratio = full / half;
    expect(ratio).toBeGreaterThan(1.6);
    expect(ratio).toBeLessThan(2.4);
  });
});
