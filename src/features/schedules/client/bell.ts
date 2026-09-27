export function playBellSound(context?: AudioContext) {
  const audio = context || new window.AudioContext();
  void audio.resume();
  const start = audio.currentTime + 0.03;
  const notes = [880, 660, 880];

  notes.forEach((frequency, index) => {
    const noteStart = start + index * 0.42;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, noteStart);
    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(0.22, noteStart + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.34);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(noteStart);
    oscillator.stop(noteStart + 0.36);
  });

  return audio;
}

export function playBellPreview(soundUrl = '') {
  if (soundUrl) {
    const audio = new Audio(soundUrl);
    void audio.play().catch(() => playDefaultPreview());
    return;
  }
  playDefaultPreview();
}

function playDefaultPreview() {
  const context = playBellSound();
  window.setTimeout(() => void context.close(), 1800);
}
