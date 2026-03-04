export type ChannelAmplitudes = {
  ch1: number;
  ch2: number;
  ch3: number;
  ch4: number;
};

export type StereoSample = {
  left: number;
  right: number;
};

function clamp1(x: number): number {
  if (x > 1) return 1;
  if (x < -1) return -1;
  return x;
}

export class Mixer {
  mixSoundChannels(
    nr50: number,
    nr51: number,
    amplitudes: ChannelAmplitudes,
  ): StereoSample {
    const leftVolume = (nr50 >> 4) & 0x7;
    const rightVolume = nr50 & 0x7;

    const leftGain = leftVolume / 7;
    const rightGain = rightVolume / 7;

    // NR51 sound panning
    // 0-3: CH1-CH4 to right
    // 4-7: CH1-CH4 to left
    const rightMask = nr51 & 0x0f;
    const leftMask = (nr51 >> 4) & 0x0f;

    let left = 0;
    let right = 0;

    // channel amplitude → mixer → stereo routing → master volume amplifier → output
    /*
    https://gbdev.io/pandocs/Audio_details.html
    The four analog channel outputs are then fed into the mixer, which selectively adds them (depending on NR51) into two analog outputs (Left and Right). Thus, the analog range of those outputs is 4× that of each channel, -4 to 4.
    */

    const ch1Amplitude = amplitudes.ch1;
    const ch2Amplitude = amplitudes.ch2;
    const ch3Amplitude = amplitudes.ch3;
    const ch4Amplitude = amplitudes.ch4;

    if ((leftMask & 0x1) !== 0) left += ch1Amplitude;
    if ((leftMask & 0x2) !== 0) left += ch2Amplitude;
    if ((leftMask & 0x4) !== 0) left += ch3Amplitude;
    if ((leftMask & 0x8) !== 0) left += ch4Amplitude;

    if ((rightMask & 0x1) !== 0) right += ch1Amplitude;
    if ((rightMask & 0x2) !== 0) right += ch2Amplitude;
    if ((rightMask & 0x4) !== 0) right += ch3Amplitude;
    if ((rightMask & 0x8) !== 0) right += ch4Amplitude;

    /* 
    normalization is not done by specification I think but test with different output values. The idea is that if all channels are active, the sum could be up to 4 times the max amplitude so the output literally gets louder which could cause clipping
    */
    left = (left / 4) * leftGain;
    right = (right / 4) * rightGain;

    // output stereo sample with left and right channels
    return {
      left: clamp1(left),
      right: clamp1(right),
    };
  }
}
