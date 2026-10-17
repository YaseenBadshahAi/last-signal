/* LAST SIGNAL — procedural WebAudio SFX (no assets needed) */
window.SFX = (function () {
  let ctx = null, master = null;
  const volumes = { master: 0.5, sfx: 0.8 };

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = volumes.master;
      master.connect(ctx.destination);
      return true;
    } catch (e) { return false; }
  }

  function tone(freq, dur, type, gain, slideTo) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime((gain || 0.2) * volumes.sfx, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, gain, lowpass) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lowpass || 1200;
    const g = ctx.createGain(); g.gain.value = (gain || 0.25) * volumes.sfx;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    shoot(kind) {
      if (kind === 'rifle') { noise(0.11, 0.32, 900); tone(160, 0.1, 'square', 0.16, 55); }
      else { noise(0.08, 0.22, 1400); tone(220, 0.08, 'square', 0.12, 80); }
    },
    enemyShoot(dist) {
      const g = Math.max(0.02, 0.2 - dist * 0.004);
      noise(0.08, g, 700); tone(140, 0.09, 'square', g * 0.6, 60);
    },
    hit() { tone(950, 0.06, 'square', 0.14, 620); },
    kill() { tone(520, 0.09, 'square', 0.16, 300); tone(340, 0.14, 'square', 0.14, 180); },
    hurt() { noise(0.12, 0.2, 500); tone(110, 0.14, 'sawtooth', 0.14, 60); },
    pickup() { tone(660, 0.07, 'sine', 0.16); setTimeout(() => tone(990, 0.09, 'sine', 0.16), 70); },
    reload() { tone(300, 0.05, 'square', 0.1); setTimeout(() => tone(420, 0.05, 'square', 0.1), 120); },
    heal() { tone(440, 0.12, 'sine', 0.14, 660); setTimeout(() => tone(660, 0.14, 'sine', 0.14, 880), 130); },
    zoneWarn() { tone(392, 0.28, 'sine', 0.2); setTimeout(() => tone(392, 0.28, 'sine', 0.2), 340); },
    zoneTick() { tone(196, 0.2, 'sine', 0.12, 150); },
    uiClick() { tone(700, 0.05, 'sine', 0.12); },
    win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'sine', 0.18), i * 140)); },
    lose() { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.26, 'sine', 0.16), i * 160)); },
  };
})();
