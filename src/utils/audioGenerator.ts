// Generates genuine, playable voice note audio data URLs using standard PCM WAV encoding
// This guarantees that voice notes play REAL sound in the browser without any network dependency.

export function generateVoiceNoteWavUrl(type: 'intro' | 'explanation' | 'confirmation' | 'thankyou'): string {
  const sampleRate = 22050;
  const durations: Record<string, number> = {
    intro: 6,
    explanation: 14,
    confirmation: 8,
    thankyou: 5
  };
  const duration = durations[type] || 6;
  const numSamples = Math.floor(sampleRate * duration);

  // 16-bit Mono PCM WAV buffer
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  // Helper to write string ASCII
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF Header
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, 'WAVE');

  // fmt Subchunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, 1, true); // NumChannels (1 = Mono)
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * 2, true); // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
  view.setUint16(32, 2, true); // BlockAlign (NumChannels * BitsPerSample/8)
  view.setUint16(34, 16, true); // BitsPerSample (16 bits)

  // data Subchunk
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  // Generate pleasant warm harmonic tones resembling human voice modulation
  const baseFreqs: Record<string, number[]> = {
    intro: [220, 260, 293, 246, 220],
    explanation: [196, 220, 246, 220, 196, 246, 220, 196],
    confirmation: [261, 329, 392, 523],
    thankyou: [329, 392, 440, 392]
  };
  const melody = baseFreqs[type] || [220, 260, 220];

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const noteIdx = Math.floor((t / duration) * melody.length) % melody.length;
    const freq = melody[noteIdx];

    // Vocal-like harmonic blend (Fundamental + 2nd harmonic + subtle vibrato)
    const vibrato = 1 + 0.015 * Math.sin(2 * Math.PI * 5 * t);
    const wave =
      0.55 * Math.sin(2 * Math.PI * freq * vibrato * t) +
      0.30 * Math.sin(2 * Math.PI * freq * 2 * vibrato * t) +
      0.15 * Math.sin(2 * Math.PI * freq * 3 * vibrato * t);

    // Envelope (soft fade in and fade out)
    const attack = Math.min(1, (i / sampleRate) * 10);
    const release = Math.min(1, ((numSamples - i) / sampleRate) * 10);
    const envelope = attack * release * (0.8 + 0.2 * Math.sin(2 * Math.PI * 2 * t));

    const sample = Math.max(-1, Math.min(1, wave * envelope * 0.4));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}
