import * as THREE from 'three';
import * as S from './shaders.js';

export function pondR(a) {
  return 26 + 3.5 * Math.sin(3 * a + 0.5) + 2 * Math.sin(5 * a + 2) + 1.2 * Math.sin(7 * a + 1);
}
export const PATH_OFF = 5;
const WATER_Y = -0.08;
const SHADOW_WORLD = 64;

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(1927);
const R = (a, b) => a + (b - a) * rand();

export const U = {
  uTime: { value: 0 },
  uMoonDir: { value: new THREE.Vector3(0, 0.5, -1).normalize() },
  uMoonColor: { value: new THREE.Vector3(0.62, 0.68, 0.8) },
  uAmbient: { value: new THREE.Vector3(0.05, 0.065, 0.1) },
  uFogColor: { value: new THREE.Vector3(0.022, 0.032, 0.05) },
  uFogDensity: { value: 0.012 },
  uMist: { value: 0.5 },
  uShadowTex: { value: null },
  uShadowWorld: { value: SHADOW_WORLD },
  uCloud: { value: 0.6 },
  uFlow: { value: 0 },
  uWaves: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, -100, 0)) },
  uBoats: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 2.2, 0)) },
  uPixel: { value: 1 },
  uGrow: { value: 0 },
  uPearl: { value: 0 },
  uEmerald: { value: 0 },
  uFrag: { value: 0 },
  uBeam: { value: 0 },
  uWindow: { value: 1 },
  uGate: { value: new THREE.Vector2(0, 60) },
};

function mat(vs, fs, extra = {}, opts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: Object.assign({}, U, extra),
    vertexShader: S.COMMON + vs,
    fragmentShader: S.COMMON + fs,
    ...opts,
  });
}
function lit(color, o = {}) {
  return mat(S.litVS, S.litFS, {
    uColor: { value: new THREE.Color(...color) },
    uEmissive: { value: new THREE.Color(...(o.emissive || [0, 0, 0])) },
    uSpec: { value: o.spec ?? 0.1 },
    uOpacity: { value: 1 },
    uUseShadow: { value: o.shadow ?? 1 },
    uRim: { value: o.rim ?? 0 },
  }, { side: o.side ?? THREE.FrontSide });
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.trees = [];     // {x,z,h,r,type}
    this.willowStrands = []; // for shadows
    this.flowerPos = [];
    this.gapAngles = [-Math.PI / 2 - 0.42, -Math.PI / 2 + 0.05, -Math.PI / 2 + 0.5];
    this.junctionZ = pondR(Math.PI / 2) + PATH_OFF;
    this.gateZ = this.junctionZ + 12;
    this.doorZ = this.gateZ + 9;
    U.uGate.value.set(0, this.doorZ);

    this.buildSky();
    this.buildGround();
    this.buildWater();
    this.buildMountains();
    this.buildTrees();
    this.buildLotus();
    this.buildHouse();
    this.buildLamps();
    this.buildMist();
    this.buildFragrance();
    this.buildBeams();
    this.buildBoats();
    this.figure = this.buildFigure();
    this.buildTrack();
    this.shadowCanvas = document.createElement('canvas');
    this.shadowCanvas.width = this.shadowCanvas.height = 1024;
    this.shadowTex = new THREE.CanvasTexture(this.shadowCanvas);
    this.shadowTex.colorSpace = THREE.NoColorSpace;
    U.uShadowTex.value = this.shadowTex;
    this.lastShadowEl = -1;
  }

  add(o) { this.scene.add(o); return o; }

  buildSky() {
    const m = mat(S.skyVS, S.skyFS, {}, { side: THREE.BackSide, depthWrite: false });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), m);
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    this.add(sky);
  }

  buildGround() {
    const g = new THREE.PlaneGeometry(700, 700).rotateX(-Math.PI / 2);
    const fs = S.groundFS.replace('void main(){\n  float a', 'void main(){\n  float a0 = atan(vWP.z, vWP.x); if(length(vWP.xz) < pondR(a0)) discard;\n  float a');
    this.add(new THREE.Mesh(g, mat(S.groundVS, fs)));
  }

  buildWater() {
    const shape = new THREE.Shape();
    for (let i = 0; i <= 256; i++) {
      const a = (i / 256) * Math.PI * 2;
      const r = pondR(a) + 1.5;
      const x = r * Math.cos(a), y = -r * Math.sin(a);
      i ? shape.lineTo(x, y) : shape.moveTo(x, y);
    }
    const g = new THREE.ShapeGeometry(shape, 1).rotateX(-Math.PI / 2);
    this.water = this.add(new THREE.Mesh(g, mat(S.waterVS, S.waterFS)));
    this.water.position.y = WATER_Y;
  }

  buildMountains() {
    const layers = [[170, 14, 0.0], [210, 22, 0.35], [260, 34, 0.7]];
    layers.forEach(([rad, amp, layer], li) => {
      const N = 256, pos = [], uv = [], idx = [];
      const ph = li * 3.7;
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;
        let h = amp * (0.35 + 0.35 * Math.sin(a * 2 + ph) + 0.2 * Math.sin(a * 5.3 + ph * 2) + 0.1 * Math.sin(a * 13 + ph));
        h *= 0.55 + 0.45 * Math.max(0, -Math.sin(a) * 0.8 + 0.4); // 遠山在月下那一邊更顯
        h = Math.max(h, 2);
        const x = rad * Math.cos(a), z = rad * Math.sin(a);
        pos.push(x, -6, z, x, h, z);
        uv.push(i / N, 0, i / N, 1);
        if (i < N) { const b = i * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      const m = mat(S.mountainVS, S.mountainFS, { uLayer: { value: layer } }, { side: THREE.DoubleSide });
      const mesh = this.add(new THREE.Mesh(g, m));
      mesh.renderOrder = -5 + li;
    });
  }

  // —— 樹：楊柳與不知名的樹 ——
  buildTrees() {
    const nearGap = (a, w) => this.gapAngles.some(g => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < w);
    const nearHouse = (x, z) => Math.abs(x) < 12 && z > this.junctionZ - 3 && z < this.doorZ + 12;
    const nearBranch = (x, z) => Math.abs(x) < 3 && z > this.junctionZ - 2;

    // 楊柳：沿路的外側一圈，另有幾株倚在塘邊
    for (let a = 0; a < Math.PI * 2; a += R(0.13, 0.2)) {
      if (nearGap(a, 0.12)) continue;
      const d = pondR(a) + R(7.8, 10);
      const x = d * Math.cos(a), z = d * Math.sin(a);
      if (nearBranch(x, z)) continue;
      this.trees.push({ x, z, h: R(6, 8.5), r: R(2.4, 3.2), type: 'willow', a });
    }
    for (let i = 0; i < 12; i++) {
      const a = R(0, Math.PI * 2);
      if (nearGap(a, 0.2) || Math.abs(a - Math.PI / 2) < 0.25) continue;
      const d = pondR(a) + R(1.8, 2.4);
      this.trees.push({ x: d * Math.cos(a), z: d * Math.sin(a), h: R(5.5, 7), r: R(2.2, 2.8), type: 'willow', a, lean: 1 });
    }
    // 其他樹：由近而遠，高高低低
    for (let i = 0; i < 520; i++) {
      const a = R(0, Math.PI * 2);
      const d = pondR(a) + 12 + Math.pow(rand(), 1.4) * 48;
      const x = d * Math.cos(a), z = d * Math.sin(a);
      if (nearHouse(x, z) || nearBranch(x, z)) continue;
      if (nearGap(a, 0.08) && d < pondR(a) + 20) continue;
      if (this.trees.some(t => (t.x - x) ** 2 + (t.z - z) ** 2 < 14)) continue;
      const big = rand() < 0.35;
      this.trees.push({ x, z, h: big ? R(9, 14) : R(5, 9), r: big ? R(3, 4.5) : R(2, 3.2), type: rand() < 0.15 ? 'willow' : 'tree', a });
    }

    const trunkM = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    const trunks = [], blobs = [], anchors = [], strands = [];
    const pushCyl = (from, to, s) => {
      const dir = to.clone().sub(from); const len = dir.length();
      q.setFromUnitVectors(up, dir.normalize());
      trunks.push(new THREE.Matrix4().compose(from, q.clone(), new THREE.Vector3(s, len, s)));
    };
    for (const t of this.trees) {
      const base = new THREE.Vector3(t.x, 0, t.z);
      const toPond = new THREE.Vector3(-t.x, 0, -t.z).normalize();
      if (t.type === 'willow') {
        const lean = toPond.clone().multiplyScalar(t.lean ? 1.8 : R(0.3, 1.1));
        const top = base.clone().add(new THREE.Vector3(lean.x, t.h * 0.62, lean.z));
        pushCyl(base, top, R(1.1, 1.5));
        const C = top.clone().add(new THREE.Vector3(lean.x * 0.4, t.h * 0.3, lean.z * 0.4));
        for (let k = 0; k < 4; k++) {
          const e = C.clone().add(new THREE.Vector3(R(-1.6, 1.6), R(-0.3, 0.8), R(-1.6, 1.6)));
          pushCyl(top, e, 0.45);
        }
        for (let k = 0; k < 3; k++) {
          blobs.push({ p: C.clone().add(new THREE.Vector3(R(-1, 1), R(0, 0.6), R(-1, 1))), s: new THREE.Vector3(R(1.2, 1.7), R(0.6, 0.9), R(1.2, 1.7)) });
        }
        const n = Math.round(R(70, 95));
        for (let k = 0; k < n; k++) {
          const phi = R(0, Math.PI * 2), rho = Math.sqrt(rand());
          const ap = C.clone().add(new THREE.Vector3(Math.cos(phi) * t.r * rho, 1.2 * Math.sqrt(1 - rho * rho) * 0.8 - 0.3, Math.sin(phi) * t.r * rho));
          const len = Math.max(1.5, ap.y - R(0.6, 3.2));
          const spread = 0.3 + rho * 1.1;
          anchors.push(ap); strands.push([len, rand(), phi, spread]);
          if (k % 2 === 0) this.willowStrands.push({ ap, len, phi, spread });
        }
      } else {
        const top = base.clone().add(new THREE.Vector3(R(-0.3, 0.3), t.h * 0.55, R(-0.3, 0.3)));
        pushCyl(base, top, t.h > 9 ? 1.8 : 1.3);
        const nb = Math.round(R(3, 6));
        for (let k = 0; k < nb; k++) {
          const hh = t.h * R(0.6, 0.92);
          blobs.push({ p: new THREE.Vector3(t.x + R(-1, 1) * t.r * 0.5, hh, t.z + R(-1, 1) * t.r * 0.5), s: new THREE.Vector3(t.r * R(0.6, 0.85), t.r * R(0.45, 0.7), t.r * R(0.6, 0.85)) });
        }
      }
    }
    this.treeBlobs = blobs;

    // 樹幹
    const tg = new THREE.CylinderGeometry(0.09, 0.16, 1, 7, 1).translate(0, 0.5, 0);
    const tm = new THREE.InstancedMesh(tg, lit([0.03, 0.025, 0.02], { spec: 0.05 }), trunks.length);
    trunks.forEach((m, i) => tm.setMatrixAt(i, m));
    tm.frustumCulled = false;
    this.add(tm);

    // 樹冠（凹凸的團塊）
    const bg = new THREE.IcosahedronGeometry(1, 5);
    const p = bg.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = 1 + 0.1 * Math.sin(v.x * 4.1 + v.y * 2.3) * Math.cos(v.z * 3.7) + 0.05 * Math.sin(v.y * 9 + v.x * 7);
      v.multiplyScalar(n); p.setXYZ(i, v.x, v.y, v.z);
    }
    bg.computeVertexNormals();
    const bm = new THREE.InstancedMesh(bg, mat(S.litVS, S.canopyFS, {}, { side: THREE.DoubleSide }), blobs.length);
    blobs.forEach((b, i) => bm.setMatrixAt(i, trunkM.compose(b.p, q.setFromEuler(new THREE.Euler(R(0, 3), R(0, 3), 0)), b.s)));
    bm.frustumCulled = false;
    this.add(bm);

    // 楊柳絲
    const sg = new THREE.PlaneGeometry(1, 1, 1, 26).translate(0, 0.5, 0);
    sg.setAttribute('aStrand', new THREE.InstancedBufferAttribute(new Float32Array(strands.flat()), 4));
    const sm = new THREE.InstancedMesh(sg, mat(S.willowVS, S.willowFS, {}, { side: THREE.DoubleSide }), anchors.length);
    anchors.forEach((a, i) => sm.setMatrixAt(i, trunkM.makeTranslation(a.x, a.y, a.z)));
    sm.frustumCulled = false;
    this.add(sm);
  }

  // —— 荷葉、荷梗、荷花 ——
  buildLotus() {
    const inPond = (x, z, m) => Math.hypot(x, z) < pondR(Math.atan2(z, x)) - m;
    // 留一點水：一道彎曲的流水，和岸邊看月的一片
    const openWater = (x, z) => {
      const ch = Math.abs(z + 4 - Math.sin(x * 0.13) * 7 - x * 0.12) < 1.3 + 0.8 * Math.sin(x * 0.4);
      const view = Math.hypot(x - 2, z - 21) < 5.5;
      return ch || view;
    };
    const leaves = [], leafAttr = [], stems = [], stemAttr = [];
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
    const step = 0.92;
    for (let x = -34; x < 34; x += step) {
      for (let z = -34; z < 34; z += step) {
        const px = x + R(-0.4, 0.4), pz = z + R(-0.4, 0.4);
        if (!inPond(px, pz, 0.8) || openWater(px, pz)) continue;
        const layers = rand() < 0.4 ? 2 : 1;
        for (let l = 0; l < layers; l++) {
          const tall = l === 1 || rand() < 0.3;
          const h = tall ? R(0.35, 1.15) : WATER_Y + 0.05 + rand() * 0.02;
          const s = tall ? R(0.45, 0.8) : R(0.5, 0.85);
          const lx = px + (l ? R(-0.4, 0.4) : 0), lz = pz + (l ? R(-0.4, 0.4) : 0);
          M.compose(new THREE.Vector3(lx, h, lz), q.setFromAxisAngle(Y, R(0, 6.28)), new THREE.Vector3(s, 1, s));
          leaves.push(M.clone());
          const seed = rand();
          const flex = tall ? 0.3 + h * 0.6 : 0.05;
          const cup = tall ? R(0.04, 0.22) : R(0.0, 0.03);
          leafAttr.push(seed, cup, flex, 0);
          if (tall) {
            stems.push(new THREE.Matrix4().makeTranslation(lx, WATER_Y, lz));
            stemAttr.push(seed, flex, h - WATER_Y, 0);
          }
        }
      }
    }

    // 葉子幾何：極座標網格
    const rings = 7, segs = 30, pos = [0, 0, 0], idx = [];
    for (let r = 1; r <= rings; r++) {
      for (let s = 0; s < segs; s++) {
        const a = (s / segs) * Math.PI * 2, rr = r / rings;
        pos.push(Math.cos(a) * rr, 0, Math.sin(a) * rr);
      }
    }
    const vi = (r, s) => (r === 0 ? 0 : 1 + (r - 1) * segs + (s % segs));
    for (let s = 0; s < segs; s++) idx.push(0, vi(1, s + 1), vi(1, s));
    for (let r = 1; r < rings; r++) {
      for (let s = 0; s < segs; s++) {
        const a = vi(r, s), b = vi(r, s + 1), c = vi(r + 1, s), d = vi(r + 1, s + 1);
        idx.push(a, b, c, b, d, c);
      }
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    lg.setIndex(idx);
    lg.setAttribute('aLeaf', new THREE.InstancedBufferAttribute(new Float32Array(leafAttr), 4));
    const lm = new THREE.InstancedMesh(lg, mat(S.leafVS, S.leafFS, {}, { side: THREE.DoubleSide }), leaves.length);
    leaves.forEach((m, i) => lm.setMatrixAt(i, m));
    lm.frustumCulled = false;
    this.add(lm);

    // 荷花：散落各處，另在岸邊看月處聚一叢（西洲曲的鏡頭）
    const flowers = [], flowerAttr = [];
    const addFlower = (x, z, bud, tallFlag) => {
      const h = R(0.7, 1.35);
      const s = R(0.95, 1.3);
      const open = bud ? R(0.0, 0.25) : R(0.7, 1.0);
      const seed = rand();
      flowers.push(new THREE.Matrix4().compose(new THREE.Vector3(x, WATER_Y, z), q.setFromAxisAngle(Y, R(0, 6.28)), new THREE.Vector3(s, s, s)));
      flowerAttr.push(open, seed, h, tallFlag);
      stems.push(new THREE.Matrix4().makeTranslation(x, WATER_Y, z));
      stemAttr.push(seed, 0.55 * h, h, tallFlag);
      this.flowerPos.push(new THREE.Vector3(x, h, z));
    };
    for (let i = 0; i < 1400 && flowers.length < 260; i++) {
      const x = R(-32, 32), z = R(-32, 32);
      if (!inPond(x, z, 1.5) || openWater(x, z)) continue;
      addFlower(x, z, rand() < 0.4, 0);
    }
    this.clusterCenter = new THREE.Vector3(2, 0, 17.4);
    for (let i = 0; i < 26; i++) {
      const a = R(0, 6.28), r = Math.sqrt(rand()) * 3.2;
      addFlower(this.clusterCenter.x + Math.cos(a) * r, this.clusterCenter.z + Math.sin(a) * r, rand() < 0.3, 1);
    }

    // 花的幾何
    const fp = [], fa = [], fi = [];
    const nu = 5, nv = 8;
    const rings2 = [[6, 0.24, 0.1], [8, 0.3, 0.13], [10, 0.34, 0.15]];
    rings2.forEach(([n, L, W], ri) => {
      for (let k = 0; k < n; k++) {
        const az = (k / n) * Math.PI * 2 + ri * 0.4;
        const b = fp.length / 3;
        for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
          fp.push((i / (nu - 1)) * 2 - 1, j / (nv - 1), 0);
          fa.push(ri, az, L, W);
        }
        for (let j = 0; j < nv - 1; j++) for (let i = 0; i < nu - 1; i++) {
          const a = b + j * nu + i;
          fi.push(a, a + 1, a + nu, a + 1, a + nu + 1, a + nu);
        }
      }
    });
    const pod = new THREE.CylinderGeometry(0.065, 0.035, 0.07, 12).translate(0, 0.07, 0);
    const pb = fp.length / 3;
    const pp = pod.attributes.position;
    for (let i = 0; i < pp.count; i++) { fp.push(pp.getX(i), pp.getY(i), pp.getZ(i)); fa.push(3, 0, 0, 0); }
    for (let i = 0; i < pod.index.count; i++) fi.push(pb + pod.index.getX(i));
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
    fg.setAttribute('aPetal', new THREE.Float32BufferAttribute(fa, 4));
    fg.setIndex(fi);
    fg.setAttribute('aFlower', new THREE.InstancedBufferAttribute(new Float32Array(flowerAttr), 4));
    const fm = new THREE.InstancedMesh(fg, mat(S.flowerVS, S.flowerFS, {}, { side: THREE.DoubleSide }), flowers.length);
    flowers.forEach((m, i) => fm.setMatrixAt(i, m));
    fm.frustumCulled = false;
    this.add(fm);

    const sg = new THREE.CylinderGeometry(0.011, 0.016, 1, 5, 8, true).translate(0, 0.5, 0);
    sg.setAttribute('aStem', new THREE.InstancedBufferAttribute(new Float32Array(stemAttr), 4));
    const stm = new THREE.InstancedMesh(sg, mat(S.stemVS, S.stemFS), stems.length);
    stems.forEach((m, i) => stm.setMatrixAt(i, m));
    stm.frustumCulled = false;
    this.add(stm);
  }

  buildHouse() {
    const g = new THREE.Group();
    const wallM = lit([0.09, 0.088, 0.085], { spec: 0.02 });
    const tileM = lit([0.03, 0.032, 0.036], { spec: 0.3 });
    const woodM = lit([0.05, 0.03, 0.02], { spec: 0.1 });
    const box = (w, h, d, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); return b; };
    const zg = this.gateZ, zB = zg + 16;
    // 院牆
    box(7.8, 2.4, 0.3, -5.1, 1.2, zg, wallM); box(7.8, 2.4, 0.3, 5.1, 1.2, zg, wallM);
    box(0.3, 2.4, 16, -9, 1.2, zg + 8, wallM); box(0.3, 2.4, 16, 9, 1.2, zg + 8, wallM);
    box(18.3, 2.4, 0.3, 0, 1.2, zB, wallM);
    for (const [w, d, x, z] of [[7.9, 0.6, -5.1, zg], [7.9, 0.6, 5.1, zg], [0.6, 16.2, -9, zg + 8], [0.6, 16.2, 9, zg + 8], [18.5, 0.6, 0, zB]]) box(w, 0.12, d, x, 2.46, z, tileM);
    // 門樓
    box(0.35, 2.9, 0.4, -1.3, 1.45, zg, woodM); box(0.35, 2.9, 0.4, 1.3, 1.45, zg, woodM);
    box(3.4, 0.14, 1.0, 0, 2.95, zg, tileM);
    // 屋
    const zh = this.doorZ;
    box(12, 3.2, 5.6, 0, 1.6, zh + 2.8, wallM);
    const roofL = box(13, 0.18, 3.6, 0, 3.95, zh + 1.3, tileM); roofL.rotation.x = 0.5;
    const roofR = box(13, 0.18, 3.6, 0, 3.95, zh + 4.3, tileM); roofR.rotation.x = -0.5;
    box(13.2, 0.25, 0.3, 0, 4.72, zh + 2.8, tileM);
    // 屋簷下的柱與門
    for (const x of [-5.6, -2.2, 2.2, 5.6]) box(0.22, 3.2, 0.22, x, 1.6, zh - 0.05, woodM);
    this.door = box(1.6, 2.4, 0.1, 0, 1.2, zh - 0.02, woodM);
    // 窗：妻在屋裏拍着閏兒
    const wm = mat(S.litVS, S.windowFS);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.2), wm);
    win.position.set(3.8, 1.7, zh - 0.03); win.rotation.y = Math.PI;
    g.add(win);
    const win2 = win.clone(); win2.position.x = -3.8; g.add(win2);
    // 院中一株樹
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, 3, 7).translate(0, 1.5, 0), woodM);
    tr.position.set(-5.5, 0, zg + 4); g.add(tr);
    this.add(g);
    // 窗光在地上的暖色光暈
    this.windowGlow = this.makeGlow([new THREE.Vector3(3.8, 1.7, zh - 0.2), new THREE.Vector3(-3.8, 1.7, zh - 0.2)], [1, 0.62, 0.3], 7);
  }

  makeGlow(points, color, size) {
    const g = new THREE.BufferGeometry().setFromPoints(points);
    g.setAttribute('aGlow', new THREE.Float32BufferAttribute(points.map(() => 1), 1));
    const m = mat(S.glowVS, S.glowFS, {
      uGlowColor: { value: new THREE.Vector3(...color) }, uIntensity: { value: 1 }, uSize: { value: size },
    }, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const p = new THREE.Points(g, m);
    p.frustumCulled = false;
    return this.add(p);
  }

  buildLamps() {
    this.lampPos = [];
    const postM = lit([0.02, 0.02, 0.02]);
    const headM = lit([0.2, 0.15, 0.08], { emissive: [0.9, 0.6, 0.25] });
    for (const a of [0.35, 2.55]) {
      const d = pondR(a) + 19;
      const x = d * Math.cos(a), z = d * Math.sin(a);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 4.2, 6).translate(0, 2.1, 0), postM);
      post.position.set(x, 0, z); this.add(post);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.35, 0.3), headM);
      head.position.set(x, 4.3, z); this.add(head);
      this.lampPos.push(new THREE.Vector3(x, 4.3, z));
    }
    this.lampGlow = this.makeGlow(this.lampPos, [1.0, 0.7, 0.35], 5);
  }

  buildMist() {
    const N = 420, pos = [], at = [];
    for (let i = 0; i < N; i++) {
      const a = R(0, 6.28), r = Math.sqrt(rand()) * 34;
      pos.push(r * Math.cos(a), R(0.2, 1.6), r * Math.sin(a));
      at.push(R(4, 11), rand(), R(0.6, 1.4), 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aMist', new THREE.Float32BufferAttribute(at, 4));
    const p = new THREE.Points(g, mat(S.mistVS, S.mistFS, {}, { transparent: true, depthWrite: false }));
    p.frustumCulled = false;
    p.renderOrder = 5;
    this.add(p);
  }

  buildFragrance() {
    const pos = [], at = [];
    for (let i = 0; i < 700; i++) {
      const f = this.flowerPos[Math.floor(rand() * this.flowerPos.length)];
      pos.push(f.x + R(-0.2, 0.2), f.y + 0.1, f.z + R(-0.2, 0.2));
      at.push(rand(), rand(), R(0.6, 1.4), 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aFrag', new THREE.Float32BufferAttribute(at, 4));
    const p = new THREE.Points(g, mat(S.fragVS, S.fragFS, {}, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    p.frustumCulled = false;
    p.renderOrder = 6;
    this.add(p);
  }

  buildBeams() {
    this.beams = [];
    const m = mat(S.beamVS, S.beamFS, {}, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const geo = new THREE.PlaneGeometry(3.2, 40).translate(0, 20, 0);
    for (const a of this.gapAngles) {
      const d = pondR(a) + PATH_OFF + 1;
      const grp = new THREE.Group();
      grp.position.set(d * Math.cos(a), 0, d * Math.sin(a));
      const p1 = new THREE.Mesh(geo, m), p2 = new THREE.Mesh(geo, m);
      p2.rotation.y = Math.PI / 2;
      const inner = new THREE.Group(); inner.add(p1, p2); grp.add(inner);
      grp.children[0].frustumCulled = false;
      this.add(grp);
      this.beams.push(inner);
    }
  }

  // —— 采蓮的小船 ——
  buildBoats() {
    this.boats = [];
    const hullM = lit([0.09, 0.06, 0.04], { spec: 0.2, side: THREE.DoubleSide, shadow: 0 });
    const dressA = lit([0.3, 0.12, 0.15], { emissive: [0.015, 0.005, 0.008], rim: 0.25, shadow: 0 });
    const dressB = lit([0.12, 0.22, 0.17], { emissive: [0.005, 0.012, 0.009], rim: 0.25, shadow: 0 });
    const skinM = lit([0.33, 0.26, 0.21], { shadow: 0 });
    const hairM = lit([0.01, 0.01, 0.012], { spec: 0.4, shadow: 0 });
    const poleM = lit([0.12, 0.1, 0.06], { shadow: 0 });
    const lanternM = lit([0.4, 0.05, 0.03], { emissive: [1.6, 0.35, 0.12], shadow: 0 });
    const girl = (dress, sitting) => {
      const gg = new THREE.Group();
      const h = sitting ? 0.55 : 1.05;
      const skirt = new THREE.Mesh(new THREE.ConeGeometry(sitting ? 0.34 : 0.26, h, 14, 1, true).translate(0, h / 2, 0), dress);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.42, 10).translate(0, h + 0.18, 0), dress);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), skinM); head.position.y = h + 0.5;
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.105, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), hairM); hair.position.y = h + 0.51;
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), hairM); bun.position.set(-0.05, h + 0.63, 0);
      const sleeve = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 8, 1, true), dress); sleeve.position.set(0.12, h + 0.12, 0.1); sleeve.rotation.z = 0.5;
      gg.add(skirt, body, head, hair, bun, sleeve);
      return gg;
    };
    for (let k = 0; k < 3; k++) {
      const b = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), hullM);
      hull.scale.set(2.1, 0.38, 0.6); hull.position.y = 0.26;
      const bow = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 8), hullM);
      bow.rotation.z = -1.1; bow.position.set(2.1, 0.45, 0);
      const stand = girl(k % 2 ? dressB : dressA, false); stand.position.set(-1.1, 0.12, 0);
      const sit = girl(k % 2 ? dressA : dressB, true); sit.position.set(0.5, 0.12, 0); sit.rotation.y = Math.PI * 0.6;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 4.2, 5), poleM);
      pole.position.set(-1.5, 1.1, 0.25); pole.rotation.z = 0.45; pole.rotation.x = 0.15;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.3, 4).translate(0, 0.65, 0), poleM);
      post.position.set(1.6, 0.2, 0);
      const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), lanternM);
      lantern.scale.y = 1.25; lantern.position.set(1.6, 1.45, 0);
      b.add(hull, bow, stand, sit, pole, post, lantern);
      b.visible = false;
      this.add(b);
      this.boats.push({ g: b, pole, stand, r: [8, 14, 19][k], cx: [3, -4, 1][k], cz: [-3, 2, -1][k], ph: [0.3, 2.4, 4.4][k], sp: [0.07, -0.05, 0.04][k] });
    }
    this.lanternGlow = this.makeGlow(this.boats.map(() => new THREE.Vector3()), [1.0, 0.45, 0.2], 3.2);
  }

  // —— 我：披着大衫，背着手 ——
  buildFigure() {
    const g = new THREE.Group();
    const gownM = lit([0.035, 0.04, 0.045], { rim: 0.1, spec: 0.05 });
    const skinM = lit([0.3, 0.25, 0.21], { rim: 0.08 });
    const hairM = lit([0.01, 0.01, 0.01], { spec: 0.3 });
    const prof = [[0.001, 0], [0.27, 0.02], [0.25, 0.35], [0.21, 0.85], [0.19, 1.15], [0.22, 1.33], [0.2, 1.4], [0.08, 1.46], [0.06, 1.52], [0.001, 1.52]]
      .map(([r, y]) => new THREE.Vector2(r, y));
    const gown = new THREE.Mesh(new THREE.LatheGeometry(prof, 20), gownM);
    gown.scale.z = 0.72;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 12), skinM); head.position.y = 1.63;
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM); hair.position.y = 1.645;
    const arms = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 6, 12, Math.PI), gownM);
    arms.position.set(-0.12, 1.05, 0); arms.rotation.set(Math.PI / 2, 0, Math.PI / 2); // 背着手
    g.add(gown, head, hair, arms);
    this.inner = g;
    const o = new THREE.Group(); o.add(g);
    return this.add(o);
  }

  // 小路：家門 → 塘邊 → 繞塘一周 → 回到家門
  buildTrack() {
    const pts = [];
    for (let z = this.doorZ - 1.2; z > this.junctionZ; z -= 0.5) pts.push(new THREE.Vector3(-Math.sin(z * 0.25) * 0.6, 0, z));
    this.ringStart = pts.length;
    for (let i = 0; i <= 720; i++) {
      const a = Math.PI / 2 + (i / 720) * Math.PI * 2;
      const r = pondR(a) + PATH_OFF;
      pts.push(new THREE.Vector3(r * Math.cos(a), 0, r * Math.sin(a)));
    }
    this.ringEnd = pts.length - 1;
    for (let z = this.junctionZ + 0.5; z < this.doorZ - 1.2; z += 0.5) pts.push(new THREE.Vector3(-Math.sin(z * 0.25) * 0.6, 0, z));
    this.track = pts;
    this.trackLen = [0];
    for (let i = 1; i < pts.length; i++) this.trackLen.push(this.trackLen[i - 1] + pts[i].distanceTo(pts[i - 1]));
    this.sRingStart = this.trackLen[this.ringStart];
    this.sRingEnd = this.trackLen[this.ringEnd];
    this.sTotal = this.trackLen[pts.length - 1];
  }

  trackAt(s, out, dir) {
    s = THREE.MathUtils.clamp(s, 0, this.sTotal);
    let lo = 0, hi = this.trackLen.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.trackLen[m] < s) lo = m; else hi = m; }
    const t = (s - this.trackLen[lo]) / Math.max(1e-6, this.trackLen[hi] - this.trackLen[lo]);
    out.lerpVectors(this.track[lo], this.track[hi], t);
    if (dir) {
      const a = this.track[Math.max(0, lo - 3)], b = this.track[Math.min(this.track.length - 1, hi + 3)];
      dir.subVectors(b, a).setY(0).normalize();
    }
    return out;
  }

  // —— 月光透過樹，落在地上、荷上的影子 ——
  updateShadows(moonDir) {
    const el = Math.asin(moonDir.y);
    if (Math.abs(el - this.lastShadowEl) < 0.012) return;
    this.lastShadowEl = el;
    const c = this.shadowCanvas, ctx = c.getContext('2d');
    const W = c.width, k = W / (2 * SHADOW_WORLD);
    const ox = -moonDir.x / moonDir.y, oz = -moonDir.z / moonDir.y;
    const P = (x, y, z) => [(x + ox * y + SHADOW_WORLD) * k, (z + oz * y + SHADOW_WORLD) * k];
    ctx.filter = 'none';
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, W);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    const r2 = rng(7);
    for (const b of this.treeBlobs) {
      const [x, y] = P(b.p.x, b.p.y, b.p.z);
      if (x < -50 || y < -50 || x > W + 50 || y > W + 50) continue;
      // 峭楞楞如鬼：參差的鋸齒輪廓
      ctx.beginPath();
      const n = 18;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rr = (0.7 + 0.5 * r2()) * k;
        const px = x + Math.cos(a) * b.s.x * rr, py = y + Math.sin(a) * b.s.z * rr * (1 + 0.4 * Math.abs(oz));
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.fill();
    }
    // 彎彎的楊柳的稀疏的倩影
    ctx.strokeStyle = 'rgba(0,0,0,0.38)';
    ctx.lineWidth = 1.4;
    for (const s of this.willowStrands) {
      ctx.beginPath();
      for (let i = 0; i <= 8; i++) {
        const v = i / 8;
        const out = s.spread * (1 - (1 - v) ** 2);
        const [x, y] = P(s.ap.x + Math.cos(s.phi) * out, s.ap.y - s.len * v, s.ap.z + Math.sin(s.phi) * out);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    // 樹幹
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 2.5;
    for (const t of this.trees) {
      const [x0, y0] = P(t.x, 0, t.z), [x1, y1] = P(t.x, t.h * 0.6, t.z);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
    // 柔化
    const tmp = document.createElement('canvas'); tmp.width = tmp.height = W;
    const tctx = tmp.getContext('2d');
    tctx.filter = 'blur(2px)';
    tctx.drawImage(c, 0, 0);
    ctx.drawImage(tmp, 0, 0);
    this.shadowTex.needsUpdate = true;
  }

  update(t, dt, st) {
    U.uTime.value = t;
    this.updateShadows(U.uMoonDir.value);
    const md = U.uMoonDir.value;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), md);
    for (const b of this.beams) b.quaternion.copy(q);

    // 船
    const lg = this.lanternGlow.geometry.attributes.position;
    const la = this.lanternGlow.geometry.attributes.aGlow;
    this.boats.forEach((b, i) => {
      const amt = st.boats;
      b.g.visible = amt > 0.01;
      const a = b.ph + t * b.sp;
      const x = b.cx + Math.cos(a) * b.r, z = b.cz + Math.sin(a) * b.r;
      const tx = -Math.sin(a) * Math.sign(b.sp), tz = Math.cos(a) * Math.sign(b.sp);
      b.g.position.set(x, WATER_Y - 0.12 + 0.03 * Math.sin(t * 1.3 + i) - (1 - amt) * 1.2, z);
      b.g.rotation.set(0.03 * Math.sin(t * 0.9 + i), Math.atan2(-tz, tx), 0.025 * Math.sin(t * 1.1 + i * 2));
      b.pole.rotation.z = 0.45 + 0.15 * Math.sin(t * 0.8 + i);
      U.uBoats.value[i].set(x, z, 2.6, amt);
      b.g.children[6].getWorldPosition(this._v || (this._v = new THREE.Vector3()));
      lg.setXYZ(i, this._v.x, this._v.y, this._v.z);
      la.setX(i, amt * (0.85 + 0.15 * Math.sin(t * 7 + i * 3)));
      b.world = b.g.position;
      b.dir = new THREE.Vector3(tx, 0, tz);
    });
    lg.needsUpdate = true; la.needsUpdate = true;

    // 路燈：沒精打彩的，是渴睡人的眼
    const la2 = this.lampGlow.geometry.attributes.aGlow;
    for (let i = 0; i < 2; i++) {
      const ph = (t * 0.13 + i * 0.47) % 1;
      const blink = ph > 0.86 ? 0.25 + 0.75 * Math.abs(Math.cos((ph - 0.86) / 0.14 * Math.PI)) : 1;
      la2.setX(i, (0.45 + st.lamp * 1.2) * blink);
    }
    la2.needsUpdate = true;
    this.windowGlow.material.uniforms.uIntensity.value = U.uWindow.value * 0.8;
  }
}
