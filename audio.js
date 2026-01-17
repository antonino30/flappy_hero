// audio.js
const AudioEngine = (() => {
  let ctx = null;
  let master = null;
  let isMuted = false;

  let beatTimer = null;
  let bpm = 90;
  let targetBpm = 90;

  function ensure() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.18;
    master.connect(ctx.destination);
  }

  function setMuted(m) {
    isMuted = m;
    if (master) master.gain.value = isMuted ? 0 : 0.18;
  }

  function click(freq = 660, dur = 0.06) {
    if (isMuted) return;
    ensure();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.value = 0.0001;
    o.connect(g);
    g.connect(master);

    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.6, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur);
  }

  function startBeat() {
    stopBeat();
    ensure();
    bpm = 90;
    targetBpm = 90;

    const tick = () => {
      // kick + hat
      click(140, 0.05);
      setTimeout(() => click(860, 0.03), 70);

      const interval = (60_000 / bpm);
      beatTimer = setTimeout(tick, interval);

      bpm += (targetBpm - bpm) * 0.08;
    };

    tick();
  }

  function stopBeat() {
    if (beatTimer) clearTimeout(beatTimer);
    beatTimer = null;
  }

  function setIntensity(x01) {
    targetBpm = 90 + x01 * 80; // 90..170
  }

  return {
    setMuted,
    startBeat,
    stopBeat,
    setIntensity,
    sfxJump: () => click(740, 0.05),
    sfxHit: () => click(220, 0.12),
    sfxPower: () => click(520, 0.08),
  };
})();
