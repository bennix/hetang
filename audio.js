// 全部以 Web Audio 即時合成，無外部音檔。
const MIDI = n => 440 * Math.pow(2, (n - 69) / 12);

export class Soundscape {
  constructor() {
    this.ctx = null;
    this.levels = { wind: 0, cicada: 0, frog: 0, water: 0 };
    this.muted = false;
  }

  start() {
    if (this.ctx) return;
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 4);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(4.5, 2.2);
    this.revGain = ctx.createGain(); this.revGain.gain.value = 0.55;
    this.reverb.connect(this.revGain).connect(this.master);

    this.noise = this.noiseBuffer(4);
    this.buildWind();
    this.buildCicadas();
    this.buildCrickets();
    this.frogTimer = 0;
    this.dripTimer = 0;
  }

  impulse(sec, decay) {
    const ctx = this.ctx, len = ctx.sampleRate * sec, b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }
  noiseBuffer(sec) {
    const ctx = this.ctx, len = ctx.sampleRate * sec, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) { // 粉紅噪聲
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0527;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18;
    }
    return b;
  }
  noiseSrc() {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise; s.loop = true;
    s.loopStart = Math.random() * 3; s.start(0, Math.random() * 3);
    return s;
  }
  out(node, wet = 0.3, pan = 0) {
    const p = this.ctx.createStereoPanner(); p.pan.value = pan;
    const dry = this.ctx.createGain(); dry.gain.value = 1 - wet * 0.5;
    const w = this.ctx.createGain(); w.gain.value = wet;
    node.connect(p); p.connect(dry).connect(this.master); p.connect(w).connect(this.reverb);
    return p;
  }

  buildWind() {
    const ctx = this.ctx, n = this.noiseSrc();
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500; f.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.value = 0;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lg = ctx.createGain(); lg.gain.value = 260; lfo.connect(lg).connect(f.frequency); lfo.start();
    n.connect(f).connect(g); this.out(g, 0.2);
    this.windGain = g; this.windFilter = f;
    // 葉子沙沙
    const n2 = this.noiseSrc();
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 2600; f2.Q.value = 0.8;
    const g2 = ctx.createGain(); g2.gain.value = 0;
    n2.connect(f2).connect(g2); this.out(g2, 0.35, 0.2);
    this.rustleGain = g2;
  }

  buildCicadas() {
    const ctx = this.ctx;
    this.cicadaGain = ctx.createGain(); this.cicadaGain.gain.value = 0;
    this.out(this.cicadaGain, 0.45);
    for (let i = 0; i < 3; i++) {
      const n = this.noiseSrc();
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 4200 + i * 700; f.Q.value = 12;
      const am = ctx.createGain(); am.gain.value = 0;
      const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 38 + i * 9;
      const lg = ctx.createGain(); lg.gain.value = 0.5; lfo.connect(lg).connect(am.gain); lfo.start();
      const swell = ctx.createGain(); swell.gain.value = 0.5;
      const sl = ctx.createOscillator(); sl.frequency.value = 0.05 + i * 0.03;
      const sg = ctx.createGain(); sg.gain.value = 0.5; sl.connect(sg).connect(swell.gain); sl.start();
      const p = ctx.createStereoPanner(); p.pan.value = [-0.7, 0.6, 0.1][i];
      n.connect(f).connect(am).connect(swell).connect(p).connect(this.cicadaGain);
    }
  }

  buildCrickets() {
    this.cricketGain = this.ctx.createGain(); this.cricketGain.gain.value = 0;
    this.out(this.cricketGain, 0.5);
    this.cricketTimer = 0;
  }
  chirp(t, pan) {
    const ctx = this.ctx;
    for (let k = 0; k < 3; k++) {
      const o = ctx.createOscillator(); o.frequency.value = 4400 + Math.random() * 300;
      const g = ctx.createGain(); g.gain.value = 0;
      const s = t + k * 0.055;
      g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(0.05, s + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.04);
      const p = ctx.createStereoPanner(); p.pan.value = pan;
      o.connect(g).connect(p).connect(this.cricketGain); o.start(s); o.stop(s + 0.06);
    }
  }

  croak(t, amp = 1) {
    const ctx = this.ctx;
    const pan = Math.random() * 1.6 - 0.8;
    const base = 110 + Math.random() * 120;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) {
      const s = t + k * (0.16 + Math.random() * 0.05);
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(base * 1.25, s); o.frequency.exponentialRampToValueAtTime(base, s + 0.12);
      const am = ctx.createOscillator(); am.type = 'square'; am.frequency.value = 55 + Math.random() * 20;
      const ag = ctx.createGain(); ag.gain.value = 0.5;
      const g = ctx.createGain(); g.gain.value = 0.5; am.connect(ag).connect(g.gain);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 2.5;
      const env = ctx.createGain(); env.gain.value = 0;
      env.gain.setValueAtTime(0, s); env.gain.linearRampToValueAtTime(0.16 * amp, s + 0.02); env.gain.exponentialRampToValueAtTime(0.0001, s + 0.14);
      o.connect(g).connect(f).connect(env);
      this.out(env, 0.45, pan);
      o.start(s); am.start(s); o.stop(s + 0.18); am.stop(s + 0.18);
    }
  }

  drip(t) {
    const ctx = this.ctx, o = ctx.createOscillator();
    const f0 = 900 + Math.random() * 900;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 2.2, t + 0.06);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.04, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(g); this.out(g, 0.7, Math.random() * 1.4 - 0.7); o.start(t); o.stop(t + 0.12);
  }

  // —— 旋律 ——
  // 音符：[midi, 拍數]；midi 為 0 表示休止
  play(notes, bpm, voice, opt = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    let t = ctx.currentTime + 0.1;
    const beat = 60 / bpm;
    for (const [m, d] of notes) {
      if (m) voice.call(this, t, MIDI(m + (opt.transpose || 0)), d * beat, opt);
      t += d * beat;
    }
    return t - ctx.currentTime;
  }

  hum(t, f, dur, o) { // 妻哼的眠歌：柔軟的鼻音
    const ctx = this.ctx;
    const a = ctx.createOscillator(); a.type = 'triangle'; a.frequency.value = f;
    const b = ctx.createOscillator(); b.type = 'sine'; b.frequency.value = f * 2.003;
    const vib = ctx.createOscillator(); vib.frequency.value = 5; const vg = ctx.createGain(); vg.gain.value = f * 0.006;
    vib.connect(vg); vg.connect(a.frequency); vg.connect(b.frequency);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const env = ctx.createGain(); env.gain.value = 0;
    const amp = (o.amp || 0.08);
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(amp, t + Math.min(0.25, dur * 0.4));
    env.gain.setValueAtTime(amp, t + dur * 0.7); env.gain.linearRampToValueAtTime(0, t + dur * 1.05);
    const bg = ctx.createGain(); bg.gain.value = 0.25;
    a.connect(lp); b.connect(bg).connect(lp); lp.connect(env); this.out(env, o.wet ?? 0.5, o.pan || 0);
    for (const n of [a, b, vib]) { n.start(t); n.stop(t + dur * 1.1); }
  }

  violin(t, f, dur, o) { // 梵婀玲
    const ctx = this.ctx;
    const oscs = [0, 4, -5].map(det => { const s = ctx.createOscillator(); s.type = 'sawtooth'; s.frequency.value = f; s.detune.value = det; return s; });
    const vib = ctx.createOscillator(); vib.frequency.value = 5.5; const vg = ctx.createGain(); vg.gain.value = 0;
    vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.009, t + Math.min(0.5, dur * 0.6));
    vib.connect(vg); oscs.forEach(s => vg.connect(s.frequency));
    const body1 = ctx.createBiquadFilter(); body1.type = 'peaking'; body1.frequency.value = 520; body1.gain.value = 8; body1.Q.value = 1.5;
    const body2 = ctx.createBiquadFilter(); body2.type = 'peaking'; body2.frequency.value = 2900; body2.gain.value = 6; body2.Q.value = 2;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3800;
    const env = ctx.createGain(); env.gain.value = 0;
    const amp = o.amp || 0.035;
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(amp, t + Math.min(0.18, dur * 0.3));
    env.gain.setValueAtTime(amp * 0.9, t + dur * 0.85); env.gain.linearRampToValueAtTime(0, t + dur + 0.15);
    oscs.forEach(s => s.connect(body1)); body1.connect(body2).connect(lp).connect(env);
    this.out(env, 0.6, o.pan || 0);
    for (const n of [...oscs, vib]) { n.start(t); n.stop(t + dur + 0.2); }
  }

  voiceAh(t, f, dur, o) { // 遠處高樓上渺茫的歌聲
    const ctx = this.ctx;
    const src = ctx.createOscillator(); src.type = 'sawtooth'; src.frequency.value = f;
    const vib = ctx.createOscillator(); vib.frequency.value = 5.2; const vg = ctx.createGain(); vg.gain.value = f * 0.012;
    vib.connect(vg).connect(src.frequency);
    const env = ctx.createGain(); env.gain.value = 0;
    const amp = o.amp || 0.03;
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(amp, t + 0.3);
    env.gain.setValueAtTime(amp, t + dur * 0.75); env.gain.linearRampToValueAtTime(0, t + dur * 1.1);
    const mix = ctx.createGain(); mix.gain.value = 1;
    for (const [ff, q, g] of [[800, 8, 1], [1150, 10, 0.5], [2900, 12, 0.15]]) {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = ff; bp.Q.value = q;
      const gg = ctx.createGain(); gg.gain.value = g * 3;
      src.connect(bp).connect(gg).connect(mix);
    }
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800; // 隔得遠
    mix.connect(lp).connect(env);
    this.out(env, 0.95, o.pan || 0.3);
    src.start(t); vib.start(t); src.stop(t + dur * 1.2); vib.stop(t + dur * 1.2);
  }

  pluck(t, f, dur, o) { // 船上的琵琶
    const ctx = this.ctx;
    const len = Math.round(ctx.sampleRate / f);
    const total = Math.round(ctx.sampleRate * Math.min(2.5, dur + 1.2));
    const b = ctx.createBuffer(1, total, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    for (let i = len; i < total; i++) d[i] = 0.496 * (d[i - len] + d[i - len + 1]);
    const s = ctx.createBufferSource(); s.buffer = b;
    const g = ctx.createGain(); g.gain.value = o.amp || 0.18;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
    s.connect(lp).connect(g); this.out(g, 0.5, o.pan || -0.2); s.start(t);
  }

  flute(t, f, dur, o) { // 簫
    const ctx = this.ctx;
    const s = ctx.createOscillator(); s.type = 'sine'; s.frequency.value = f;
    const vib = ctx.createOscillator(); vib.frequency.value = 4.6; const vg = ctx.createGain(); vg.gain.value = f * 0.007;
    vib.connect(vg).connect(s.frequency);
    const n = this.noiseSrc(); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 3;
    const ng = ctx.createGain(); ng.gain.value = 0.25;
    const env = ctx.createGain(); env.gain.value = 0;
    const amp = o.amp || 0.05;
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(amp, t + 0.12);
    env.gain.setValueAtTime(amp * 0.85, t + dur * 0.8); env.gain.linearRampToValueAtTime(0, t + dur + 0.1);
    s.connect(env); n.connect(bp).connect(ng).connect(env);
    this.out(env, 0.55, o.pan || 0.25);
    s.start(t); vib.start(t); s.stop(t + dur + 0.2); vib.stop(t + dur + 0.2); n.stop(t + dur + 0.2);
  }

  // 曲目
  lullaby() { // 五聲音階的眠歌
    return this.play([[64, 1], [67, 1], [69, 2], [67, 1], [64, 1], [62, 2], [60, 1], [62, 1], [64, 1.5], [62, 0.5], [60, 3], [0, 1],
      [64, 1], [67, 1], [69, 1.5], [72, 0.5], [69, 1], [67, 1], [64, 2], [62, 1], [64, 1], [62, 1], [60, 1], [57, 1], [60, 3]], 62, this.hum, { amp: 0.06, pan: 0.35, transpose: -5 });
  }
  violinPiece() { // 月下的小曲
    const T = 17;
    return this.play([[60 + T, 1], [65 + T, 1.5], [64 + T, 0.5], [65 + T, 1], [69 + T, 1], [72 + T, 1.5], [77 + T - 12, 0.5],
      [77 + T - 12, 1], [76 + T - 12, 0.5], [74 + T - 12, 0.5], [72 + T, 1], [69 + T, 1], [70 + T, 1.5], [67 + T, 0.5], [65 + T, 3],
      [0, 0.5], [67 + T, 0.5], [69 + T, 1], [70 + T, 0.5], [72 + T, 0.5], [74 + T - 12, 1.5], [72 + T, 0.5], [69 + T, 1], [65 + T, 1], [67 + T, 1], [64 + T, 1], [65 + T, 4]].map(([m, d]) => [m ? m - 17 : 0, d]), 58, this.violin, { amp: 0.03, transpose: 12 });
  }
  distantSong() {
    return this.play([[69, 2], [72, 1], [74, 2], [72, 1], [69, 3], [67, 1.5], [64, 1.5], [67, 3], [69, 4]], 50, this.voiceAh, { amp: 0.022, pan: 0.5, transpose: -12 });
  }
  boatSong() { // 江南小調
    const mel = [[69, 0.5], [72, 0.5], [74, 1], [76, 0.5], [74, 0.5], [72, 1], [69, 0.5], [67, 0.5], [69, 2],
      [72, 0.5], [74, 0.5], [76, 1], [79, 0.5], [76, 0.5], [74, 1], [72, 0.5], [74, 0.5], [76, 2],
      [79, 0.5], [76, 0.5], [74, 1], [72, 0.5], [69, 0.5], [67, 1], [69, 0.5], [72, 0.5], [69, 3]];
    this.play(mel, 76, this.flute, { amp: 0.045, pan: 0.3, transpose: -12 });
    const pl = [];
    for (const [m, d] of mel) { pl.push([m - 12, d * 0.5], [m ? m - 5 : 0, d * 0.5]); }
    return this.play(pl, 76, this.pluck, { amp: 0.12, pan: -0.3, transpose: 0 });
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.3);
  }

  update(dt, lv) {
    if (!this.ctx) return;
    const ctx = this.ctx, now = ctx.currentTime;
    this.windGain.gain.setTargetAtTime(0.25 * lv.wind, now, 0.8);
    this.rustleGain.gain.setTargetAtTime(0.05 * lv.wind, now, 0.8);
    this.cicadaGain.gain.setTargetAtTime(0.07 * lv.cicada, now, 0.8);
    this.cricketGain.gain.setTargetAtTime(0.8 * lv.cricket, now, 0.8);
    this.cricketTimer -= dt;
    if (this.cricketTimer < 0 && lv.cricket > 0.05) { this.chirp(now + 0.05, Math.random() * 1.6 - 0.8); this.cricketTimer = 0.4 + Math.random() * 1.2; }
    this.frogTimer -= dt;
    if (this.frogTimer < 0 && lv.frog > 0.05) { this.croak(now + 0.05, lv.frog); this.frogTimer = (1.5 + Math.random() * 4) / (0.3 + lv.frog); }
    this.dripTimer -= dt;
    if (this.dripTimer < 0 && lv.water > 0.05) { this.drip(now + 0.05); this.dripTimer = 2 + Math.random() * 6; }
  }
}
