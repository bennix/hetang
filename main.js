import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { World, U } from './world.js';
import { Soundscape } from './audio.js';
import { gradeShader } from './shaders.js';
import { CHAPTERS } from './text.js';

// ———————————————————— 渲染器 ————————————————————
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
document.getElementById('stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 1200);
const world = new World(scene);
const sound = new Soundscape();

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.6, 0.72);
composer.addPass(bloom);
const grade = new ShaderPass(gradeShader);
composer.addPass(grade);
composer.addPass(new OutputPass());

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 1 ? 68 : 50;
  camera.updateProjectionMatrix();
  U.uPixel.value = renderer.getPixelRatio() * innerHeight / 900;
}
addEventListener('resize', resize);
resize();

// ———————————————————— 章節的場景設定 ————————————————————
const RING = world.sRingEnd - world.sRingStart;
const ringS = f => world.sRingStart + RING * f;
const BASE = { moonEl: 0.45, cloud: 0.55, mist: 0.35, fog: 0.012, flow: 0, beam: 0.25, dream: 0, boats: 0, grow: 0, lamp: 0, window: 1,
  wind: 0.3, cicada: 0.25, frog: 0.2, cricket: 0.5, water: 0.2 };
const SHOTS = [
  { s: [0, world.sRingStart], moonEl: [0.1, 0.3], mist: 0.2, cicada: 0.15, cricket: 0.6, frog: 0.08, wind: 0.2, beam: 0.1 },
  { s: [world.sRingStart, ringS(0.12)], moonEl: 0.4, mist: 0.3, wind: 0.4, cicada: 0.3, cricket: 0.7 },
  { s: [ringS(0.12), ringS(0.24)], moonEl: 0.48, mist: 0.4, beam: 0.45, wind: 0.25, cicada: 0.12, cricket: 0.4, frog: 0.15 },
  { s: [ringS(0.24), ringS(0.36)], moonEl: 0.52, mist: 0.3, wind: 0.75, water: 0.5, frog: 0.25 },
  { s: [ringS(0.36), ringS(0.48)], moonEl: 0.36, cloud: 0.78, mist: 1.0, flow: 1, beam: 1, wind: 0.25, water: 0.6, cricket: 0.35, cicada: 0.1 },
  { s: [ringS(0.48), ringS(0.62)], moonEl: 0.42, mist: 0.6, fog: 0.017, beam: 0.8, lamp: 1, cicada: 1, frog: 1, cricket: 0.6, wind: 0.3 },
  { s: [ringS(0.62), ringS(0.72)], moonEl: 0.46, mist: 0.75, dream: 1, boats: 1, wind: 0.4, water: 0.6, cicada: 0.2, frog: 0.3 },
  { s: [ringS(0.72), ringS(0.8)], moonEl: 0.46, mist: 0.6, dream: 1, boats: 1, wind: 0.35, water: 0.7, cicada: 0.15, frog: 0.2 },
  { s: [ringS(0.8), ringS(0.88)], moonEl: 0.44, mist: 0.5, dream: [0.7, 0], boats: [0.8, 0], wind: 0.4, water: 0.4, frog: 0.25 },
  { s: [ringS(0.88), world.sTotal], moonEl: 0.5, mist: 0.3, window: [1, 1, 0], wind: 0.15, cicada: [0.2, 0.02], frog: [0.2, 0.02], cricket: [0.5, 0.05] },
];
const ease = t => t * t * (3 - 2 * t);
function param(ch, key, p) {
  const v = SHOTS[ch][key] ?? BASE[key];
  if (!Array.isArray(v)) return v;
  if (v.length === 2) return v[0] + (v[1] - v[0]) * ease(p);
  return p < 0.9 ? v[0] : v[2]; // 最後一刻才熄燈
}

// ———————————————————— 鏡頭 ————————————————————
const P = new THREE.Vector3(), D = new THREE.Vector3(), I = new THREE.Vector3();
const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3();
const wantPos = new THREE.Vector3(), wantTgt = new THREE.Vector3();
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const zh = world.doorZ, zg = world.gateZ;

function shot(ch, p, t) {
  const pos = wantPos, tgt = wantTgt;
  const e = ease(p);
  switch (ch) {
    case 0: { // 院子裏：看着我推門出去，鏡頭隨之升起，望見荷塘與月
      pos.lerpVectors(V(5.5, 2.4, zh - 5.5), V(3.5, 7.5, zg - 3), e);
      const a = V(0, 1.4, zh - 1), b = V(0, 5, -30);
      tgt.lerpVectors(a, b, ease(Math.min(1, p * 1.3)));
      tgt.lerp(P.clone().setY(1.2), 0.35 * (1 - e));
      break;
    }
    case 1: // 小路：跟在身後
      pos.copy(P).addScaledVector(D, -4.2).addScaledVector(I, -1.4).add(V(0, 1.9, 0));
      tgt.copy(P).addScaledVector(D, 3).addScaledVector(I, 0.8).add(V(0, 1.2, 0));
      break;
    case 2: // 獨處：鏡頭漸漸升高，只剩一個小小的人
      pos.copy(P).addScaledVector(D, -(5 + 12 * e)).addScaledVector(I, -(3 + 9 * e)).add(V(0, 2.5 + 17 * e, 0));
      tgt.copy(P).add(V(0, 1, 0)).lerp(V(0, 0, 0), e * 0.35);
      break;
    case 3: { // 葉與花：低低地掠過葉面
      const E = P.clone().addScaledVector(I, 5);
      pos.copy(E).addScaledVector(I, 20 * e).addScaledVector(D, 2 * Math.sin(p * 3)).setY(1.35 + 0.25 * Math.sin(t * 0.3));
      tgt.copy(pos).addScaledVector(I, 6).addScaledVector(D, 2).setY(0.45);
      break;
    }
    case 4: // 月光：隔塘望月
      pos.lerpVectors(V(4, 1.5, 22), V(-3, 2.4, 13), e);
      tgt.set(-1 + 2 * e, 9.5, -30);
      break;
    case 5: // 樹與蟬：沿路仰望樹梢、遠山、路燈
      pos.copy(P).addScaledVector(D, -4).addScaledVector(I, 9).add(V(0, 1.6, 0));
      tgt.copy(P).addScaledVector(I, -14).addScaledVector(D, 6).add(V(0, 4 + 2.5 * e, 0));
      break;
    case 6: { // 采蓮：自高處看一塘的小船
      const a = 1.2 + p * 0.9;
      pos.set(Math.cos(a) * 30, 10 - 3 * e, Math.sin(a) * 30);
      tgt.set(0, 0, 0);
      break;
    }
    case 7: { // 采蓮賦：隨一隻船
      const b = world.boats[0];
      if (b.world) {
        const side = V(-b.dir.z, 0, b.dir.x);
        pos.copy(b.world).addScaledVector(b.dir, -5 + 3 * e).addScaledVector(side, 4.5).add(V(0, 2.7, 0));
        tgt.copy(b.world).addScaledVector(b.dir, 1.5).add(V(0, 0.9, 0));
      }
      break;
    }
    case 8: { // 西洲曲：蓮花過人頭
      const c = world.clusterCenter;
      pos.copy(c).add(V(0.4 - 0.8 * e, 0.85, 3.6));
      tgt.copy(c).add(V(0, 2.4 + 1.2 * e, -4));
      break;
    }
    case 9: // 歸：跟着回到門前
      if (p < 0.72) {
        pos.copy(P).addScaledVector(D, -4.5).add(V(1.2, 2, 0));
        tgt.copy(P).addScaledVector(D, 4).add(V(0, 1.3, 0));
      } else {
        pos.set(2.5, 2.2, zg + 2);
        tgt.set(0, 1.5, zh);
      }
      break;
  }
}

// ———————————————————— 敘事 UI ————————————————————
const $ = s => document.querySelector(s);
const textEl = $('#text'), titleEl = $('#chapter-title'), dotsEl = $('#dots');
let chars = [], keywords = [], revealRate = 0.2;

function renderChapter(ch) {
  const c = CHAPTERS[ch];
  textEl.innerHTML = '';
  chars = []; keywords = [];
  titleEl.textContent = c.name;
  for (const [kind, raw] of c.parts) {
    const para = document.createElement('p');
    para.className = kind === 'v' ? 'verse' : 'prose';
    const re = /\{([^|}]+)\|([^}]+)\}|([^{]+)/g;
    let m;
    while ((m = re.exec(raw))) {
      let host = para;
      let str = m[3];
      if (m[1]) {
        const k = document.createElement('span');
        k.className = 'kw'; k.dataset.key = m[2];
        k.addEventListener('click', e => { e.stopPropagation(); trigger(m[2], true); });
        para.appendChild(k); host = k; str = m[1];
        keywords.push({ at: chars.length + Math.floor(m[1].length / 2), key: m[2], fired: false });
      }
      for (const ch of str) {
        const s = document.createElement('span');
        s.className = 'ch'; s.textContent = ch;
        host.appendChild(s); chars.push(s);
      }
    }
    textEl.appendChild(para);
  }
  const dur = chapterDuration(ch);
  revealRate = (dur * 0.78) / chars.length;
  [...dotsEl.children].forEach((d, i) => d.classList.toggle('on', i === ch));
}
function chapterDuration(ch) {
  const n = CHAPTERS[ch].parts.reduce((a, [, s]) => a + s.replace(/\{([^|}]+)\|[^}]+\}/g, '$1').length, 0);
  return THREE.MathUtils.clamp(n * 0.2 + 6, 24, 62);
}
CHAPTERS.forEach((c, i) => {
  const b = document.createElement('button');
  b.innerHTML = `<i></i><span>${c.name}</span>`;
  b.addEventListener('click', e => { e.stopPropagation(); goto(i); });
  dotsEl.appendChild(b);
});

// ———————————————————— 字詞觸發的景致 ————————————————————
const pulse = { flow: 0, beam: 0, pearl: 0, frag: 0, dark: 0, mist: 0, lamp: 0, grow: 0, emerald: 0, lullaby: 0 };
let waveIdx = 0;
function wave(x, z, amp = 1) {
  U.uWaves.value[waveIdx].set(x, z, U.uTime.value, amp);
  waveIdx = (waveIdx + 1) % U.uWaves.value.length;
}
const busy = {};
function once(k, sec, fn) { // 同一段音樂不重疊
  const now = performance.now() / 1000;
  if (busy[k] && busy[k] > now) return;
  const d = fn(); busy[k] = now + (d || sec);
}
function trigger(key, manual) {
  const hint = $('#hint'); if (manual && hint) hint.remove();
  switch (key) {
    case 'moon': pulse.flow = 1; pulse.beam = 1; break;
    case 'lullaby': pulse.lullaby = 1; once('lullaby', 20, () => sound.lullaby()); break;
    case 'dark': pulse.dark = 1; break;
    case 'fragrance': pulse.frag = 1; break;
    case 'pearl': pulse.pearl = 1; break;
    case 'song': once('song', 16, () => sound.distantSong()); pulse.frag = Math.max(pulse.frag, 0.6); break;
    case 'wave': {
      const o = camPos.clone().addScaledVector(camTgt.clone().sub(camPos).setY(0).normalize(), 3);
      wave(o.x, o.z, 1.2); pulse.emerald = 1;
      setTimeout(() => wave(o.x + 3, o.z - 2, 0.6), 700);
      break;
    }
    case 'mist': pulse.mist = 1; break;
    case 'violin': once('violin', 25, () => sound.violinPiece()); pulse.flow = 1; break;
    case 'lamp': pulse.lamp = 1; break;
    case 'cicada': cicadaBoost = 1; break;
    case 'frog': frogBoost = 1; for (let i = 0; i < 3; i++) setTimeout(() => { const a = Math.random() * 6.28, r = Math.random() * 18; wave(Math.cos(a) * r, Math.sin(a) * r, 0.35); if (sound.ctx) sound.croak(sound.ctx.currentTime, 1.2); }, i * 450); break;
    case 'boats': pulse.flow = 0.5; break;
    case 'boatsong': once('boatsong', 20, () => sound.boatSong()); break;
    case 'lotus': pulse.grow = 1; break;
    case 'sleep': break;
  }
}
let cicadaBoost = 0, frogBoost = 0;

// ———————————————————— 播放狀態 ————————————————————
let chapter = 0, chTime = 0, playing = false, started = false, fading = 0, pendingChapter = -1, ended = false;
const cur = { ...BASE };

function goto(i, instant) {
  if (i < 0 || i >= CHAPTERS.length) return;
  if (instant) { applyChapter(i); return; }
  pendingChapter = i; fading = 1;
}
function applyChapter(i) {
  chapter = i; chTime = 0; ended = false;
  $('#end').classList.remove('show');
  renderChapter(i);
  const s = SHOTS[i];
  world.trackAt(s.s[0], P, D);
  shot(i, 0, U.uTime.value);
  camPos.copy(wantPos); camTgt.copy(wantTgt);
  for (const k in BASE) cur[k] = param(i, k, 0);
  pulse.grow = 0;
}

// ———————————————————— 主循環 ————————————————————
const clock = new THREE.Clock();
let t = 0, fadeLevel = 1;
const mouse = new THREE.Vector2(), mouseS = new THREE.Vector2();
addEventListener('pointermove', e => mouse.set(e.clientX / innerWidth * 2 - 1, e.clientY / innerHeight * 2 - 1));
const figPos = new THREE.Vector3(), lastFig = new THREE.Vector3();
let stride = 0;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  t += dt;

  // 章節切換：先暗下去，再亮起來
  if (pendingChapter >= 0) {
    fadeLevel = Math.min(1, fadeLevel + dt * 2.2);
    if (fadeLevel >= 1) { applyChapter(pendingChapter); pendingChapter = -1; }
  } else {
    fadeLevel = Math.max(ended ? 1 : 0, fadeLevel + (ended ? dt * 0.25 : -dt * 0.9));
  }

  const dur = chapterDuration(chapter);
  if (playing && pendingChapter < 0 && !ended) {
    chTime += dt;
    if (chTime > dur) {
      if (chapter < CHAPTERS.length - 1) goto(chapter + 1);
      else { ended = true; setTimeout(() => $('#end').classList.add('show'), 2500); }
    }
  }
  const p = Math.min(chTime / dur, 1);

  // 文字漸現，並在讀到關鍵字時喚出景致
  if (started) {
    const n = Math.floor(chTime / revealRate);
    for (let i = 0; i < chars.length; i++) chars[i].classList.toggle('on', i <= n);
    for (const k of keywords) if (!k.fired && n >= k.at) { k.fired = true; trigger(k.key); }
  }

  // 我沿着小路踱着
  const S = SHOTS[chapter];
  const walkP = chapter === 9 ? Math.min(1, p / 0.8) : p;
  world.trackAt(S.s[0] + (S.s[1] - S.s[0]) * walkP, figPos, D);
  P.copy(figPos);
  I.set(-P.x, 0, -P.z).normalize();
  stride += lastFig.distanceTo(figPos); lastFig.copy(figPos);
  const fig = world.figure;
  fig.position.copy(figPos);
  fig.position.y = Math.abs(Math.sin(stride * 2.6)) * 0.035;
  fig.rotation.y = Math.atan2(D.x, D.z) - Math.PI / 2 + Math.PI / 2;
  world.inner.rotation.set(0, -Math.PI / 2 * 0, Math.sin(stride * 2.6) * 0.025);
  world.inner.rotation.y = -Math.PI / 2;
  fig.visible = !(chapter === 9 && p > 0.86);

  // 鏡頭
  shot(chapter, p, t);
  const k = 1 - Math.exp(-dt * 1.6);
  camPos.lerp(wantPos, k); camTgt.lerp(wantTgt, k);
  mouseS.lerp(mouse, 1 - Math.exp(-dt * 2));
  camera.position.copy(camPos);
  camera.position.y += Math.sin(t * 0.5) * 0.04;
  camera.lookAt(camTgt);
  camera.rotateY(-mouseS.x * 0.09);
  camera.rotateX(-mouseS.y * 0.05);

  // 場景參數
  const kp = 1 - Math.exp(-dt * 0.9);
  for (const key in BASE) cur[key] += (param(chapter, key, p) - cur[key]) * kp;
  for (const key in pulse) pulse[key] = Math.max(0, pulse[key] - dt * (key === 'grow' ? 0.035 : key === 'dark' ? 0.22 : 0.16));
  cicadaBoost = Math.max(0, cicadaBoost - dt * 0.1);
  frogBoost = Math.max(0, frogBoost - dt * 0.1);

  const el = cur.moonEl, az = 0.22;
  U.uMoonDir.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
  const dark = Math.sin(Math.min(pulse.dark, 1) * Math.PI) ** 0.6; // 先暗後明
  const bright = (0.55 + 0.45 * Math.min(1, el / 0.35)) * (1 - 0.8 * dark);
  U.uMoonColor.value.set(0.62, 0.68, 0.8).multiplyScalar(bright);
  U.uCloud.value = cur.cloud + dark * 0.5;
  U.uMist.value = cur.mist + pulse.mist * 0.8;
  U.uFogDensity.value = cur.fog;
  U.uFlow.value = cur.flow * 0.9 + pulse.flow * 0.9;
  U.uBeam.value = cur.beam + pulse.beam * 0.8;
  U.uPearl.value = pulse.pearl * 0.7;
  U.uFrag.value = 0.12 + pulse.frag;
  U.uEmerald.value = pulse.emerald;
  U.uGrow.value = chapter === 8 ? Math.min(1, pulse.grow * 1.3) : Math.max(0, U.uGrow.value - dt * 0.3);
  U.uWindow.value = cur.window * (1 + pulse.lullaby * 0.4);
  grade.uniforms.uDream.value = cur.dream;
  grade.uniforms.uTime.value = t;
  grade.uniforms.uFade.value = ease(fadeLevel);
  bloom.strength = 0.45 + cur.dream * 0.3;

  world.update(t, dt, { boats: cur.boats, lamp: cur.lamp + pulse.lamp });
  sound.update(dt, {
    wind: cur.wind, cicada: Math.min(1.4, cur.cicada + cicadaBoost), frog: Math.min(1.5, cur.frog + frogBoost),
    cricket: cur.cricket, water: cur.water,
  });

  composer.render(dt);
}

// ———————————————————— 操作 ————————————————————
function setPlaying(v) {
  playing = v;
  $('#play').textContent = v ? '❙❙' : '▶';
}
$('#start').addEventListener('click', () => {
  started = true;
  sound.start();
  document.body.classList.add('started');
  goto(0, true);
  fadeLevel = 1;
  setPlaying(true);
});
$('#play').addEventListener('click', e => { e.stopPropagation(); setPlaying(!playing); });
$('#mute').addEventListener('click', e => {
  e.stopPropagation();
  sound.setMuted(!sound.muted);
  $('#mute').classList.toggle('off', sound.muted);
});
$('#toggle-text').addEventListener('click', e => { e.stopPropagation(); document.body.classList.toggle('notext'); });
$('#again').addEventListener('click', () => goto(0));
addEventListener('keydown', e => {
  if (!started) return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goto(chapter + 1);
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goto(chapter - 1);
  else if (e.key === ' ') { e.preventDefault(); setPlaying(!playing); }
  else if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('notext');
});
let wheelLock = 0;
addEventListener('wheel', e => {
  if (!started || performance.now() < wheelLock || Math.abs(e.deltaY) < 30) return;
  wheelLock = performance.now() + 1200;
  goto(chapter + (e.deltaY > 0 ? 1 : -1));
}, { passive: true });

// 片頭：荷塘靜靜地在後面
applyChapter(4);
chTime = 8;
renderChapter(0);
fadeLevel = 0.2;
frame();
window.__hetang = { world, U, goto: i => goto(i, true), setT: v => { chTime = v; }, trigger, get state() { return { chapter, chTime, p: chTime / chapterDuration(chapter) }; } };
