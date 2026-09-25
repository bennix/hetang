// 共用 GLSL 片段與各物件的著色器
export const POND_GLSL = /* glsl */`
float pondR(float a){
  return 26.0 + 3.5*sin(3.0*a+0.5) + 2.0*sin(5.0*a+2.0) + 1.2*sin(7.0*a+1.0);
}
`;

export const COMMON = /* glsl */`
uniform float uTime;
uniform vec3 uMoonDir;
uniform vec3 uMoonColor;
uniform vec3 uAmbient;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uMist;
uniform sampler2D uShadowTex;
uniform float uShadowWorld;
uniform float uCloud;
uniform float uFlow;

float hash12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),u.x), mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),u.x), u.y);
}
float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<5;i++){ v+=a*noise(p); p=p*2.03+vec2(1.7,9.2); a*=.5; } return v; }
float fbm3(vec2 p){ float v=0., a=.5; for(int i=0;i<3;i++){ v+=a*noise(p); p=p*2.03+vec2(1.7,9.2); a*=.5; } return v; }

float treeShadow(vec3 wp){
  vec2 uv = wp.xz/(2.0*uShadowWorld) + 0.5;
  return texture2D(uShadowTex, vec2(uv.x, 1.0-uv.y)).r;
}

// 月光如流水：一道緩緩流過的銀色光帶
float moonFlow(vec3 wp){
  if(uFlow <= 0.001) return 0.0;
  float band = wp.z*0.18 - wp.x*0.05 + uTime*1.4;
  return uFlow * (0.5+0.5*sin(band)) * smoothstep(0.3,0.7,noise(wp.xz*0.15+uTime*0.2));
}

vec3 applyFog(vec3 col, vec3 wp){
  float d = length(wp - cameraPosition);
  float f = 1.0 - exp(-pow(d*uFogDensity, 1.35));
  float h = exp(-max(wp.y+0.2, 0.0)*0.8) * uMist;
  float mn = fbm3(wp.xz*0.07 + vec2(uTime*0.035, uTime*0.02));
  float m = h * (0.35 + 0.9*mn) * (1.0 - exp(-d*0.06));
  f = clamp(f + m*0.55, 0.0, 1.0);
  return mix(col, uFogColor, f);
}

vec3 moonLight(vec3 n, vec3 wp, vec3 albedo, float spec, float shadow){
  vec3 v = normalize(cameraPosition - wp);
  float ndl = max(dot(n, uMoonDir), 0.0);
  vec3 h = normalize(uMoonDir + v);
  float s = pow(max(dot(n, h), 0.0), 36.0) * spec;
  float sky = 0.55 + 0.45*n.y;
  float light = shadow * (1.0 + moonFlow(wp));
  return albedo*(uMoonColor*ndl*light + uAmbient*sky) + uMoonColor*s*light;
}

// 夜空：漸層、淡淡的雲、月、月暈
vec3 skyColor(vec3 dir, float withStars){
  float y = dir.y;
  float mu = dot(dir, uMoonDir);
  vec3 zenith = vec3(0.004, 0.008, 0.022);
  vec3 horizon = uFogColor;
  vec3 col = mix(horizon, zenith, pow(smoothstep(-0.05, 0.75, y), 0.6));
  float ang = sqrt(max(2.0*(1.0-mu), 0.0));
  col += uMoonColor * (exp(-ang*3.0)*0.10 + exp(-ang*14.0)*0.22);

  // 星星
  if(withStars > 0.5 && y > 0.0){
    vec3 sd = dir*260.0;
    vec3 cell = floor(sd);
    float hs = hash12(cell.xy + cell.z*17.13);
    if(hs > 0.9965){
      vec3 c = cell + 0.5 + (vec3(hash12(cell.yz), hash12(cell.zx), hash12(cell.xy+3.1))-0.5)*0.6;
      float dd = length(sd - c);
      float tw = 0.6 + 0.4*sin(uTime*(1.5+hs*40.0) + hs*100.0);
      col += vec3(0.8,0.85,1.0) * smoothstep(0.35, 0.0, dd) * tw * smoothstep(0.0,0.25,y) * (1.0-exp(-ang*4.0)) * 1.4;
    }
  }

  // 雲
  float cloud = 0.0;
  if(y > -0.02){
    vec2 cp = dir.xz / (y + 0.12);
    float c = fbm(cp*0.9 + vec2(uTime*0.006, uTime*0.002));
    cloud = smoothstep(0.42, 0.85, c) * uCloud;
  }

  // 月亮
  float R = 0.034;
  float disk = smoothstep(R, R*0.9, ang);
  if(disk > 0.0){
    vec3 t1 = normalize(cross(uMoonDir, vec3(0.0,1.0,0.0)));
    vec3 t2 = cross(t1, uMoonDir);
    vec2 q = vec2(dot(dir,t1), dot(dir,t2)) / R;
    float maria = fbm(q*2.2 + 3.0);
    float limb = sqrt(max(1.0 - dot(q,q), 0.0));
    vec3 mc = vec3(1.0, 0.97, 0.9) * (0.72 + 0.28*limb) * (1.0 - 0.3*smoothstep(0.45,0.7,maria));
    col = mix(col, mc*9.0, disk * (1.0 - cloud*0.55));
  }
  vec3 cloudCol = mix(vec3(0.03,0.04,0.07), uMoonColor*0.55, exp(-ang*2.5)) + uMoonColor*exp(-ang*9.0)*0.8;
  col = mix(col, cloudCol, cloud*0.85);
  return col;
}
`;

// —— 通用受月光照明的物件 ——
export const litVS = /* glsl */`
varying vec3 vWP; varying vec3 vN; varying vec2 vUv;
void main(){
  vec4 p = vec4(position,1.0);
  vec3 n = normal;
  #ifdef USE_INSTANCING
    p = instanceMatrix * p; n = mat3(instanceMatrix) * n;
  #endif
  vec4 wp = modelMatrix * p;
  vWP = wp.xyz; vN = normalize(mat3(modelMatrix) * n); vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const litFS = /* glsl */`
uniform vec3 uColor; uniform vec3 uEmissive; uniform float uSpec; uniform float uOpacity; uniform float uUseShadow; uniform float uRim;
varying vec3 vWP; varying vec3 vN; varying vec2 vUv;
void main(){
  vec3 n = normalize(vN); if(!gl_FrontFacing) n = -n;
  float sh = mix(1.0, treeShadow(vWP), uUseShadow);
  vec3 c = moonLight(n, vWP, uColor, uSpec, sh) + uEmissive;
  vec3 v = normalize(cameraPosition - vWP);
  c += uMoonColor * pow(1.0 - max(dot(n, v), 0.0), 3.0) * uRim;
  c = applyFog(c, vWP);
  gl_FragColor = vec4(c, uOpacity);
}`;

// —— 夜空 ——
export const skyVS = /* glsl */`
varying vec3 vDir;
void main(){
  vDir = normalize(position);
  vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
export const skyFS = /* glsl */`
uniform float uStarBoost;
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  vec3 c = skyColor(d, 1.0);
  c += step(0.0, d.y) * 0.0;
  gl_FragColor = vec4(c, 1.0);
}`;

// —— 遠山 ——
export const mountainVS = /* glsl */`
varying vec3 vWP; varying float vH;
void main(){ vec4 wp = modelMatrix*vec4(position,1.0); vWP = wp.xyz; vH = uv.y; gl_Position = projectionMatrix*viewMatrix*wp; }`;
export const mountainFS = /* glsl */`
uniform float uLayer;
varying vec3 vWP; varying float vH;
void main(){
  vec3 c = mix(uFogColor*0.7, uFogColor*0.92, uLayer);
  c = mix(c, uFogColor, smoothstep(0.7, 0.0, vH)*0.6);
  gl_FragColor = vec4(c, 1.0);
}`;

// —— 地面（含小煤屑路） ——
export const groundVS = /* glsl */`
varying vec3 vWP; varying vec3 vN;
void main(){ vec4 wp = modelMatrix*vec4(position,1.0); vWP = wp.xyz; vN = normal; gl_Position = projectionMatrix*viewMatrix*wp; }`;
export const groundFS = /* glsl */`
${POND_GLSL}
uniform vec2 uGate;
varying vec3 vWP; varying vec3 vN;
void main(){
  float a = atan(vWP.z, vWP.x);
  float r = length(vWP.xz);
  float d = r - pondR(a);
  // 小路：環塘一圈 + 通往家門的一段
  float ring = 1.0 - smoothstep(0.85, 1.25, abs(d - 5.0) + (noise(vWP.xz*1.3)-0.5)*0.35);
  float branch = (1.0 - smoothstep(0.8, 1.2, abs(vWP.x + sin(vWP.z*0.25)*0.6))) * step(0.0, vWP.z) * smoothstep(uGate.y+0.5, uGate.y-0.5, vWP.z) * step(4.5, d);
  float path = max(ring, branch);

  float g = fbm(vWP.xz*0.35);
  vec3 grass = mix(vec3(0.020,0.035,0.022), vec3(0.045,0.07,0.04), g);
  grass = mix(grass, vec3(0.05,0.045,0.035), smoothstep(1.0,-0.4,d)); // 塘岸泥土
  float cinder = hash12(floor(vWP.xz*28.0));
  vec3 pathC = vec3(0.055,0.052,0.05) * (0.7 + 0.6*cinder);
  vec3 alb = mix(grass, pathC, path);
  vec3 n = normalize(vN);
  vec3 c = moonLight(n, vWP, alb, path*0.6, treeShadow(vWP));
  // 煤屑在月下偶爾閃一點微光
  float sp = step(0.993, hash12(floor(vWP.xz*40.0)+floor(uTime*0.5)*0.0)) * path;
  c += uMoonColor * sp * 0.35 * treeShadow(vWP) * (0.5+0.5*sin(uTime*3.0+cinder*50.0));
  c = applyFog(c, vWP);
  gl_FragColor = vec4(c, 1.0);
}`;

// —— 水面 ——
export const waterVS = /* glsl */`
varying vec3 vWP;
void main(){ vec4 wp = modelMatrix*vec4(position,1.0); vWP = wp.xyz; gl_Position = projectionMatrix*viewMatrix*wp; }`;
export const waterFS = /* glsl */`
uniform vec4 uWaves[6];
varying vec3 vWP;
float hgt(vec2 p){
  float t = uTime;
  float h = noise(p*0.9 + vec2(t*0.25, t*0.12))*0.5 + noise(p*2.3 - vec2(t*0.3, -t*0.2))*0.25 + noise(p*5.1 + t*0.5)*0.1;
  for(int i=0;i<6;i++){
    vec4 w = uWaves[i];
    float age = t - w.z;
    if(age < 0.0 || age > 10.0) continue;
    float dd = distance(p, w.xy);
    float fr = age*6.0;
    h += sin((dd - fr)*3.0) * exp(-pow((dd-fr)/2.5, 2.0)) * w.w * exp(-age*0.35) * 0.6;
  }
  return h;
}
void main(){
  vec2 p = vWP.xz;
  float e = 0.05;
  float h0 = hgt(p);
  vec3 n = normalize(vec3(-(hgt(p+vec2(e,0))-h0)/e*0.06, 1.0, -(hgt(p+vec2(0,e))-h0)/e*0.06));
  vec3 v = normalize(cameraPosition - vWP);
  vec3 r = reflect(-v, n);
  r.y = abs(r.y);
  vec3 refl = skyColor(r, 0.0);
  // 樹影倒映在塘邊
  float treeLine = smoothstep(0.03, 0.22, r.y + (noise(vec2(atan(r.z,r.x)*18.0, 0.0))-0.5)*0.08);
  refl *= mix(0.08, 1.0, treeLine);
  float fres = 0.04 + 0.96*pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 deep = vec3(0.004, 0.009, 0.012);
  float sh = treeShadow(vWP);
  vec3 c = mix(deep, refl, clamp(fres*1.4, 0.0, 1.0)) * mix(0.35, 1.0, sh);
  c += uMoonColor * moonFlow(vWP) * 0.05;
  c = applyFog(c, vWP);
  gl_FragColor = vec4(c, 1.0);
}`;

// —— 荷葉、荷梗、荷花 共用的擺動 ——
export const PLANT_GLSL = /* glsl */`
uniform vec4 uWaves[6];
uniform vec4 uBoats[4];
float waveAt(vec2 xz, out float front){
  float sum = 0.0; front = 0.0;
  for(int i=0;i<6;i++){
    vec4 w = uWaves[i];
    float age = uTime - w.z;
    if(age < 0.0 || age > 8.0) continue;
    float d = distance(xz, w.xy);
    float fr = age*26.0;
    float e = exp(-pow((d-fr)/3.2, 2.0)) * w.w * exp(-age*0.28);
    sum += e; front = max(front, e);
  }
  return sum;
}
vec3 plantOffset(vec3 base, float seed, float flex, out float front){
  float t = uTime;
  float gust = noise(base.xz*0.05 + vec2(t*0.12, t*0.07));
  vec3 off = vec3(0.0);
  off.x += (gust*0.22 + sin(t*1.2 + seed*6.28 + base.x*0.2)*0.05) * flex;
  off.z += (gust*0.10 + cos(t*1.0 + seed*4.0)*0.04) * flex;
  off.y += sin(t*0.8 + seed*10.0)*0.015;
  float wv = waveAt(base.xz, front);
  off.y += wv*0.22*(0.4 + flex);
  off.x += wv*0.18*flex;
  for(int i=0;i<4;i++){
    vec4 b = uBoats[i];
    if(b.w < 0.01) continue;
    vec2 dd = base.xz - b.xy;
    float dl = length(dd);
    float k = (1.0 - smoothstep(b.z*0.5, b.z, dl)) * b.w;
    off.xz += dd/(dl+1e-3) * k * 1.3;
    off.y -= k*0.35*flex;
  }
  return off;
}
`;

export const leafVS = /* glsl */`
${PLANT_GLSL}
attribute vec4 aLeaf; // seed, cup, flex, 0
varying vec3 vWP; varying vec3 vN; varying vec2 vLp; varying float vFront; varying float vSeed;
void main(){
  vec3 lp = position;
  float r = length(lp.xz);
  float ang = atan(lp.z, lp.x);
  float seed = aLeaf.x;
  float cup = aLeaf.y;
  float ruff = (sin(ang*6.0 + seed*20.0)*0.035 + sin(ang*11.0 + seed*7.0)*0.015) * (0.3 + aLeaf.z);
  lp.y = cup*r*r + ruff*r*r;
  vec3 n = normalize(vec3(-2.0*cup*lp.x, 1.0, -2.0*cup*lp.z));
  mat4 m = modelMatrix * instanceMatrix;
  vec4 wp = m * vec4(lp, 1.0);
  vec3 base = (m * vec4(0.0,0.0,0.0,1.0)).xyz;
  float front;
  vec3 off = plantOffset(base, seed, aLeaf.z, front);
  float t = uTime;
  off.y += sin(t*2.1 + seed*12.0 + ang*2.0) * 0.03 * r * (0.3 + aLeaf.z);
  off.y += front * r * sin(ang + seed*6.0) * 0.25;
  wp.xyz += off;
  vWP = wp.xyz; vN = normalize(mat3(m) * n); vLp = position.xz; vFront = front; vSeed = seed;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const leafFS = /* glsl */`
uniform float uEmerald;
varying vec3 vWP; varying vec3 vN; varying vec2 vLp; varying float vFront; varying float vSeed;
void main(){
  vec3 n = normalize(vN);
  bool back = !gl_FrontFacing;
  if(back) n = -n;
  float r = length(vLp);
  float ang = atan(vLp.y, vLp.x);
  float veins = smoothstep(0.93, 1.0, abs(cos(ang*11.0 + vSeed*3.0))) * smoothstep(0.08, 0.3, r);
  float g = fbm(vLp*3.0 + vSeed*10.0);
  vec3 top = mix(vec3(0.022,0.060,0.030), vec3(0.045,0.095,0.045), g);
  top = mix(top, vec3(0.09,0.14,0.08), veins*0.5);
  top *= 0.8 + 0.4*smoothstep(0.0, 0.2, r);              // 葉心略暗
  top = mix(top, top*1.4 + vec3(0.02,0.03,0.02), smoothstep(0.85, 1.0, r)); // 葉緣
  vec3 under = vec3(0.10,0.13,0.07);
  vec3 alb = back ? under : top;
  if(back) n = normalize(n + vec3(0.0, 1.2, 0.0)); // 背面透光，不至於漆黑
  float sh = treeShadow(vWP);
  vec3 c = moonLight(n, vWP, alb, back ? 0.03 : 0.18, sh);
  // 蠟質葉面上的一層乳白色光（牛乳中洗過）
  vec3 v = normalize(cameraPosition - vWP);
  float fr = pow(1.0 - max(dot(n, v), 0.0), 2.5);
  c += uMoonColor * fr * 0.025 * sh * (back ? 0.3 : 1.0);
  // 凝碧的波痕
  c += vec3(0.05, 0.34, 0.20) * vFront * (0.6 + uEmerald);
  c = applyFog(c, vWP);
  gl_FragColor = vec4(c, 1.0);
}`;

export const stemVS = /* glsl */`
${PLANT_GLSL}
attribute vec4 aStem; // seed, flex, height, isFlower
uniform float uGrow;
varying vec3 vWP; varying vec3 vN;
void main(){
  float h = aStem.z * mix(1.0, 1.0 + 1.6*uGrow, aStem.w);
  vec3 lp = vec3(position.x, position.y*h, position.z);
  vec4 wp = modelMatrix * instanceMatrix * vec4(lp, 1.0);
  vec3 base = (modelMatrix * instanceMatrix * vec4(0.0,0.0,0.0,1.0)).xyz;
  float front;
  vec3 top = base + vec3(0.0, h, 0.0);
  vec3 off = plantOffset(top, aStem.x, aStem.y, front);
  float k = position.y;
  wp.xyz += off * k*k * (3.0 - 2.0*k);
  vWP = wp.xyz; vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
export const stemFS = /* glsl */`
varying vec3 vWP; varying vec3 vN;
void main(){
  vec3 n = normalize(vN);
  vec3 c = moonLight(n, vWP, vec3(0.05,0.08,0.04), 0.1, treeShadow(vWP));
  c = applyFog(c, vWP);
  gl_FragColor = vec4(c, 1.0);
}`;

export const flowerVS = /* glsl */`
${PLANT_GLSL}
attribute vec4 aPetal;  // ring, azimuth, length, width
attribute vec4 aFlower; // open, seed, height, isTall
uniform float uGrow;
varying vec3 vWP; varying float vV; varying float vRing; varying float vU; varying float vSeed;
void main(){
  float ring = aPetal.x;
  float open = aFlower.x;
  vec3 lp;
  if(ring > 2.5){
    lp = position; // 蓮蓬
  } else {
    float u = position.x, v = position.y;
    float L = aPetal.z, W = aPetal.w;
    float tilt = mix(0.12 + ring*0.05, 0.45 + ring*0.38, open);
    float curl = mix(-0.55, 0.25 + ring*0.1, open);
    float a = tilt + curl*v*0.5;
    float along = L*v;
    float width = W * sin(3.14159*pow(v, 0.75)) * (1.0 - 0.15*v);
    vec3 axis = vec3(0.0, cos(a), sin(a));
    vec3 nrm  = vec3(0.0, -sin(a), cos(a));
    lp = axis*along + vec3(u*width, 0.0, 0.0) - nrm*(u*u)*width*0.55;
    float az = aPetal.y;
    lp = vec3(lp.x*cos(az) + lp.z*sin(az), lp.y, -lp.x*sin(az) + lp.z*cos(az));
    lp.y += 0.02*ring;
    vU = u;
  }
  float h = aFlower.z * mix(1.0, 1.0 + 1.6*uGrow, aFlower.w);
  mat4 m = modelMatrix * instanceMatrix;
  vec4 wp = m * vec4(lp, 1.0);
  vec3 base = (m * vec4(0.0,0.0,0.0,1.0)).xyz;
  float front;
  vec3 top = base + vec3(0.0, h, 0.0);
  vec3 off = plantOffset(top, aFlower.y, 0.55*h, front);
  wp.xyz += vec3(0.0, h, 0.0) + off;
  // 花瓣也有一絲的顫動
  wp.xyz += vec3(sin(uTime*3.0 + aFlower.y*30.0 + aPetal.y), 0.0, cos(uTime*2.7 + aPetal.y*2.0)) * 0.006 * position.y;
  vWP = wp.xyz; vV = position.y; vRing = ring; vSeed = aFlower.y;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
export const flowerFS = /* glsl */`
uniform float uPearl;
varying vec3 vWP; varying float vV; varying float vRing; varying float vU; varying float vSeed;
void main(){
  vec3 n = normalize(cross(dFdx(vWP), dFdy(vWP)));
  vec3 v = normalize(cameraPosition - vWP);
  if(dot(n, v) < 0.0) n = -n;
  vec3 alb;
  vec3 emi;
  if(vRing > 2.5){
    alb = vec3(0.55, 0.50, 0.18);
    emi = vec3(0.05, 0.045, 0.01);
  } else {
    vec3 white = vec3(0.92, 0.92, 0.88);
    vec3 pink = vec3(0.95, 0.62, 0.72);
    alb = mix(white, pink, smoothstep(0.55, 1.0, vV) * 0.35);
    alb *= 0.85 + 0.15*smoothstep(1.0, 0.0, abs(vU)); // 瓣脈
    float pulse = 0.5 + 0.5*sin(uTime*2.0 + vSeed*40.0);
    emi = alb * (0.11 + uPearl*(0.9 + 0.8*pulse));
  }
  float sh = treeShadow(vWP);
  vec3 c = moonLight(n, vWP, alb, 0.3, sh);
  // 背光處透出月光（花瓣半透明）
  c += alb * uMoonColor * max(dot(-v, uMoonDir), 0.0) * 0.4 * sh;
  c += emi;
  c = applyFog(c, vWP);
  gl_FragColor = vec4(c, 1.0);
}`;

// —— 楊柳絲 ——
export const willowVS = /* glsl */`
attribute vec4 aStrand; // len, seed, outward angle, spread
varying vec3 vWP; varying float vV; varying float vX;
void main(){
  float v = position.y;           // 0 at anchor → 1 at tip
  float len = aStrand.x;
  float seed = aStrand.y;
  float oa = aStrand.z;
  vec3 out2 = vec3(cos(oa), 0.0, sin(oa));
  // 先向外彎出，再垂下
  vec3 p = out2 * aStrand.w * (1.0 - pow(1.0 - v, 2.0)) - vec3(0.0, len*v, 0.0);
  float t = uTime;
  float gust = noise(vec2(t*0.2 + seed, seed*3.0));
  vec3 sway = vec3(sin(t*1.1 + seed*6.0), 0.0, cos(t*0.9 + seed*4.0)) * (0.25 + gust*0.5) * v*v;
  p += sway;
  vec4 anchor = modelMatrix * instanceMatrix * vec4(0.0,0.0,0.0,1.0);
  vec3 wp = anchor.xyz + p;
  // 圍繞垂直軸對向鏡頭的絲帶
  vec3 toCam = cameraPosition - wp; toCam.y = 0.0;
  vec3 side = normalize(cross(vec3(0.0,1.0,0.0), normalize(toCam + 1e-4)));
  wp += side * position.x * 0.07;
  vWP = wp; vV = v; vX = position.x;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
export const willowFS = /* glsl */`
varying vec3 vWP; varying float vV; varying float vX;
void main(){
  // 細葉互生
  float leaf = fract(vV*64.0);
  float side = (mod(floor(vV*64.0), 2.0) < 0.5) ? 1.0 : -1.0;
  float shape = abs(vX*2.0 - side*0.45*sin(leaf*3.14159));
  if(shape > 0.5*sin(leaf*3.14159) + 0.12) discard;
  vec3 alb = mix(vec3(0.05,0.09,0.05), vec3(0.09,0.14,0.07), vV);
  vec3 n = normalize(vec3(0.0, 0.6, 0.0) + normalize(cameraPosition - vWP));
  vec3 c = moonLight(n, vWP, alb, 0.3, 1.0);
  c = applyFog(c, vWP);
  gl_FragColor = vec4(c, 1.0);
}`;

// —— 其他樹的樹冠 ——
export const canopyFS = /* glsl */`
varying vec3 vWP; varying vec3 vN; varying vec2 vUv;
void main(){
  vec3 n = normalize(vN);
  vec3 vv = normalize(cameraPosition - vWP);
  float edge = 1.0 - abs(dot(n, vv));
  float lace = fbm3(vWP.xy*1.7 + vWP.zy*1.3);
  if(lace < edge*1.05 - 0.25) discard;
  float cl = fbm(vWP.xz*0.9 + vWP.y*0.7);
  float holes = smoothstep(0.35, 0.65, cl);
  vec3 alb = mix(vec3(0.008,0.015,0.011), vec3(0.025,0.04,0.026), holes);
  vec3 c = moonLight(n, vWP, alb, 0.15, 1.0);
  vec3 v = normalize(cameraPosition - vWP);
  c += uMoonColor * pow(1.0 - max(dot(n, v), 0.0), 4.0) * 0.06 * holes;
  c = applyFog(c, vWP);
  gl_FragColor = vec4(c, 1.0);
}`;

// —— 霧、香、光束（粒子與加法混合） ——
export const mistVS = /* glsl */`
attribute vec4 aMist; // size, seed, speed, 0
uniform float uPixel;
varying float vSeed; varying float vFade;
void main(){
  vec3 p = position;
  float t = uTime*aMist.z;
  p.x += sin(t*0.1 + aMist.y*6.0)*3.0 + t*0.3;
  p.z += cos(t*0.08 + aMist.y*4.0)*2.0;
  p.x = mod(p.x + 45.0, 90.0) - 45.0;
  p.y += sin(t*0.3 + aMist.y*10.0)*0.25;
  vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aMist.x * uPixel * 300.0 / max(-mv.z, 1.0);
  vSeed = aMist.y;
  vFade = smoothstep(1.0, 6.0, -mv.z) * (1.0 - smoothstep(60.0, 110.0, -mv.z));
}`;
export const mistFS = /* glsl */`
varying float vSeed; varying float vFade;
void main(){
  vec2 q = gl_PointCoord - 0.5;
  float d = length(q);
  float n = fbm3(q*3.0 + vSeed*20.0 + uTime*0.03);
  float a = smoothstep(0.5, 0.0, d) * (0.4 + n) * uMist * vFade * 0.07;
  gl_FragColor = vec4(mix(uFogColor, uMoonColor*0.25, 0.5), a);
}`;

export const fragVS = /* glsl */`
attribute vec4 aFrag; // seed, phase, speed, 0
uniform float uPixel; uniform float uFrag;
varying float vA;
void main(){
  float life = fract(uTime*aFrag.z*0.08 + aFrag.y);
  vec3 p = position;
  float s = aFrag.x*6.28;
  p += vec3(sin(life*6.0 + s)*0.8 + life*5.0, life*5.0, cos(life*5.0 + s)*0.8 + life*3.0);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min((1.0 + 2.0*sin(life*3.14)) * uPixel * 18.0 / max(-mv.z, 1.0), 6.0*uPixel);
  vA = sin(life*3.14159) * uFrag;
}`;
export const fragFS = /* glsl */`
varying float vA;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vec3(0.9, 0.95, 0.85), a*vA*0.35);
}`;

export const beamVS = /* glsl */`
varying vec2 vUv; varying vec3 vWP;
void main(){ vUv = uv; vec4 wp = modelMatrix*vec4(position,1.0); vWP = wp.xyz; gl_Position = projectionMatrix*viewMatrix*wp; }`;
export const beamFS = /* glsl */`
uniform float uBeam;
varying vec2 vUv; varying vec3 vWP;
void main(){
  float edge = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x);
  float len = smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.5, vUv.y);
  float n = fbm3(vec2(vUv.x*4.0, vUv.y*2.0 - uTime*0.05));
  float a = edge * len * (0.5 + n) * uBeam * 0.08;
  gl_FragColor = vec4(uMoonColor, a);
}`;

// —— 燈光、燈籠的光暈 ——
export const glowVS = /* glsl */`
attribute float aGlow;
uniform float uPixel; uniform float uSize;
varying float vI;
void main(){
  vec4 mv = viewMatrix * modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * uPixel * 300.0 / max(-mv.z, 1.0);
  vI = aGlow;
}`;
export const glowFS = /* glsl */`
uniform vec3 uGlowColor; uniform float uIntensity;
varying float vI;
void main(){
  float d = length(gl_PointCoord - 0.5)*2.0;
  float a = exp(-d*d*6.0) + exp(-d*18.0)*2.0;
  a *= smoothstep(1.0, 0.8, d);
  gl_FragColor = vec4(uGlowColor * a * uIntensity * vI, 1.0);
}`;

// —— 窗紙 ——
export const windowFS = /* glsl */`
uniform float uWindow;
varying vec3 vWP; varying vec3 vN; varying vec2 vUv;
void main(){
  vec2 g = fract(vUv*vec2(4.0, 5.0));
  float lat = step(0.1, g.x)*step(g.x, 0.9)*step(0.1, g.y)*step(g.y, 0.9);
  float flick = 0.92 + 0.08*noise(vec2(uTime*3.0, 0.0));
  vec3 paper = vec3(1.0, 0.62, 0.28) * 1.6 * uWindow * flick;
  vec3 c = mix(vec3(0.02,0.015,0.01), paper, lat*0.9 + 0.1);
  c += vec3(0.01,0.012,0.02);
  c = applyFog(c, vWP);
  gl_FragColor = vec4(c, 1.0);
}`;

// —— 調色（夢境般的采蓮暖色、暗角、顆粒、淡出） ——
export const gradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uDream: { value: 0 }, uFade: { value: 0 } },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
  uniform sampler2D tDiffuse; uniform float uTime, uDream, uFade;
  varying vec2 vUv;
  float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
  void main(){
    vec3 c = texture2D(tDiffuse, vUv).rgb;
    float l = dot(c, vec3(0.299,0.587,0.114));
    // 冷調銀灰
    c = mix(c, vec3(l)*vec3(0.85,0.95,1.15), 0.25);
    // 采蓮的舊夢：暖金
    vec3 warm = vec3(l)*vec3(1.5,1.1,0.65) + c*vec3(0.5,0.3,0.15);
    c = mix(c, warm, uDream*0.75);
    vec2 q = vUv - 0.5;
    c *= 1.0 - dot(q,q)*(1.2 + uDream*0.8);
    c += (h(vUv*vec2(1731.0, 977.0) + fract(uTime)*10.0) - 0.5) * 0.012;
    c *= 1.0 - uFade;
    gl_FragColor = vec4(max(c, 0.0), 1.0);
  }`,
};
