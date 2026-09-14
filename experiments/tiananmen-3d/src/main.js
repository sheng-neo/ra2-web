// 渲染 · 相机控制 · 交互 · 动画
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { CSM } from 'three/addons/csm/CSM.js';
import { scene, mat, quality } from './lib.js';
import { layers, explodeOffsets } from './gate.js';
import { isSmall, flag, sky, stars, sun, sunDir, clock, setTime, refreshEnvironment, tickEnv, csmHook } from './env.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);
const pixelRatio = () => Math.min(devicePixelRatio || 1, 2);

// ---- 渲染器 ----
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(pixelRatio());
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.5;
$('stage').appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 1, 2200);
camera.position.set(90, 50, 320);

// 后期：辉光（夜景灯光）+ 输出色彩
const HIGH = quality === 'high';
const MSAA = new URLSearchParams(location.search).get('msaa');
const composerTarget = new THREE.WebGLRenderTarget(innerWidth * pixelRatio(), innerHeight * pixelRatio(), { type: THREE.HalfFloatType, samples: MSAA != null ? Number(MSAA) : (HIGH ? 4 : 0) });
const composer = new EffectComposer(renderer, composerTarget);
composer.addPass(new RenderPass(scene, camera));
let gtao = null;
if (HIGH) {
  gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
  gtao.output = GTAOPass.OUTPUT.Default;
  gtao.blendIntensity = 0.85;
  gtao.updateGtaoMaterial({ radius: 1.3, distanceExponent: 1.0, thickness: 1.0, scale: 1.0, samples: 12, distanceFallOff: 1.0, screenSpaceRadius: false });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, radiusExponent: 1, rings: 2, samples: 12 });
  composer.addPass(gtao);
}
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth * pixelRatio(), innerHeight * pixelRatio()), 0.0, 0.4, 1.6);
composer.addPass(bloom);
composer.addPass(new OutputPass());
composer.setSize(innerWidth, innerHeight);

// ---- 级联阴影（CSM）：三级阴影贴图随相机分布，远近都清晰 ----
let csm = null;
if (HIGH) {
  csm = new CSM({ camera, parent: scene, cascades: 3, maxFar: 620, mode: 'practical', shadowMapSize: 2048, shadowBias: -0.00025, lightMargin: 320, lightFar: 3000, lightIntensity: 3.0 });
  csm.fade = true;
  for (const l of csm.lights) { l.shadow.normalBias = 0.2; l.shadow.bias = -0.0004; }
  csmHook.lights = csm.lights;
  sun.castShadow = false;
  const seen = new Set();
  scene.traverse((o) => {
    if (!o.isMesh && !o.isInstancedMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m && m.isMeshStandardMaterial && !seen.has(m)) { seen.add(m); csm.setupMaterial(m); }
    }
  });
}

// ---- 视场角随窗口比例自适应 ----
//  预设机位按 16:10 构图。更宽的窗口：锁定水平视场角（避免边缘拉伸）；更窄的窗口：保持垂直视场角、机位后退。
const DESIGN_ASPECT = 1.6;
let baseFov = 42;
function fovFor(base, aspect) {
  if (aspect >= DESIGN_ASPECT) {
    return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(base / 2)) * DESIGN_ASPECT / aspect));
  }
  return base;
}
function dollyFor(aspect) { return aspect < DESIGN_ASPECT ? Math.pow(DESIGN_ASPECT / aspect, 0.85) : 1; }
function applyFov() {
  const f = fovFor(baseFov, camera.aspect);
  if (Math.abs(camera.fov - f) > 1e-3) { camera.fov = f; camera.updateProjectionMatrix(); }
}

// ---- 轨道控制 ----
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 14;
controls.maxDistance = 700;
controls.maxPolarAngle = Math.PI / 2 - 0.03;
controls.target.set(0, 16, 0);
controls.autoRotateSpeed = 0.6;
controls.addEventListener('start', () => {
  stopTour(); cameraTween = null;
  if (baseFov !== 42) fovTween = { t0: performance.now(), dur: 700, from: baseFov, to: 42 };
});

// ---- 机位预设 ----
const VIEWS = {
  // 正面机位在国旗杆（z≈154）以北，旗杆不遮挡
  front: { pos: [0, 26, 138], target: [0, 15, 0] },
  square: { pos: [24, 12, 330], target: [0, 20, 0] },
  east: { pos: [230, 44, 90], target: [0, 16, 0] },
  eave: { pos: [24, 26, 52], target: [0, 24, 6] },
  // 倒影：贴着南岸水面、广角——楼有多高，倒影就有多深，只有广角才装得下
  mirror: { pos: [-72, 1.3, 69], target: [-22, 1.3, 14], fov: 74 },
  top: { pos: [0, 330, 110], target: [0, 8, 14] },
};
let cameraTween = null, fovTween = null;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function flyTo(view, dur = reduceMotion ? 0 : 1.6) {
  stopTour();
  const toT = new THREE.Vector3(...view.target);
  const toPos = new THREE.Vector3(...view.pos).sub(toT).multiplyScalar(dollyFor(camera.aspect)).add(toT);
  const toFov = view.fov || 42;
  if (dur <= 0) { camera.position.copy(toPos); controls.target.copy(toT); baseFov = toFov; applyFov(); return; }
  cameraTween = { t0: performance.now(), dur: dur * 1000, fromPos: camera.position.clone(), fromT: controls.target.clone(), toPos, toT };
  fovTween = { t0: performance.now(), dur: dur * 1000, from: baseFov, to: toFov };
}
function updateCameraTween(now) {
  if (cameraTween) {
    const k = Math.min(1, (now - cameraTween.t0) / cameraTween.dur), e = ease(k);
    camera.position.copy(cameraTween.fromPos).lerp(cameraTween.toPos, e);
    controls.target.copy(cameraTween.fromT).lerp(cameraTween.toT, e);
    if (k >= 1) cameraTween = null;
  }
  if (fovTween) {
    const k = Math.min(1, (now - fovTween.t0) / fovTween.dur);
    baseFov = THREE.MathUtils.lerp(fovTween.from, fovTween.to, ease(k));
    if (k >= 1) fovTween = null;
  }
  applyFov();
}

// ---- 飞行游览 ----
const S = 1.55;
const tourPath = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 22, 190), new THREE.Vector3(120, 28, 130), new THREE.Vector3(160, 42, 10),
  new THREE.Vector3(90, 62, -110), new THREE.Vector3(-60, 50, -120), new THREE.Vector3(-150, 32, -20),
  new THREE.Vector3(-110, 24, 90), new THREE.Vector3(-30, 30, 60), new THREE.Vector3(30, 26, 44),
  new THREE.Vector3(70, 20, 110),
].map((v) => v.multiply(new THREE.Vector3(S, 1.15, S))), true, 'catmullrom', 0.6);
const tourLook = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 18, 0), new THREE.Vector3(0, 20, 0), new THREE.Vector3(0, 22, 0), new THREE.Vector3(0, 26, 0),
  new THREE.Vector3(0, 24, 0), new THREE.Vector3(0, 18, 0), new THREE.Vector3(0, 16, 10), new THREE.Vector3(0, 24, 8),
  new THREE.Vector3(0, 26, 4), new THREE.Vector3(0, 18, 0),
], true, 'catmullrom', 0.6);
let tour = null;
const TOUR_SECONDS = 56;
function startTour() {
  tour = { t0: performance.now() };
  if (baseFov !== 42) fovTween = { t0: performance.now(), dur: 700, from: baseFov, to: 42 };
  $('btn-tour').setAttribute('aria-pressed', 'true');
}
function stopTour() { if (!tour) return; tour = null; $('btn-tour').setAttribute('aria-pressed', 'false'); }
function updateTour(now) {
  if (!tour) return;
  const u = (((now - tour.t0) / 1000) / TOUR_SECONDS) % 1;
  camera.position.copy(tourPath.getPointAt(u));
  controls.target.copy(tourLook.getPointAt(u));
}

// ---- 结构分层 ----
const explode = { value: 0, target: 0 };
function updateExplode(dt) {
  const d = explode.target - explode.value;
  if (Math.abs(d) < 0.0005) explode.value = explode.target;
  else explode.value += d * Math.min(1, dt * (reduceMotion ? 60 : 3.2));
  for (const [name, g] of Object.entries(layers)) g.position.y = explodeOffsets[name] * ease(explode.value);
}

// ---- 时刻 · 延时摄影 ----
const timeInput = $('time-range');
const timeLabel = $('time-label');
const clockMode = $('clock-mode'), clockTime = $('clock-time');
let timelapse = null;
let envDirty = true, envLast = 0;
const fmtTime = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60) % 60).padStart(2, '0')}`;
function phaseName(h) {
  if (h < 5.5 || h >= 20.5) return '夜景';
  if (h < 8) return '清晨';
  if (h < 17) return '白昼';
  if (h < 19.5) return '黄昏';
  return '夜景';
}
function applyTime(h, fromSlider = false) {
  setTime(h);
  envDirty = true;
  timeLabel.textContent = `${phaseName(h)} ${fmtTime(h)}`;
  clockMode.textContent = phaseName(h);
  clockTime.textContent = fmtTime(h);
  if (!fromSlider) timeInput.value = String(Math.round(h * 12));
}
timeInput.addEventListener('input', () => { stopTimelapse(); applyTime(Number(timeInput.value) / 12, true); });
function startTimelapse() { timelapse = { last: performance.now() }; $('btn-lapse').setAttribute('aria-pressed', 'true'); }
function stopTimelapse() { if (!timelapse) return; timelapse = null; $('btn-lapse').setAttribute('aria-pressed', 'false'); }
function updateTimelapse(now) {
  if (!timelapse) return;
  const dt = (now - timelapse.last) / 1000; timelapse.last = now;
  let h = clock.hours + dt * (24 / 48);
  if (h >= 24) h -= 24;
  applyTime(h);
}

// ---- 点选与说明 ----
const raycaster = new THREE.Raycaster();
raycaster.params.Points.threshold = 0;
const infoEl = $('info');
let highlighted = null;
function clearHighlight() {
  if (!highlighted) return;
  for (const [mesh, material] of highlighted) mesh.material = material;
  highlighted = null;
}
function highlight(root) {
  clearHighlight();
  highlighted = [];
  root.traverse((o) => {
    if (!o.isMesh || o.material === mat.bulb || o.material.isShaderMaterial) return;
    const orig = o.material;
    const glow = (m) => { const c = m.clone(); c.emissive = new THREE.Color(0xffd08a); c.emissiveIntensity = 0.16; if (csm && c.isMeshStandardMaterial) csm.setupMaterial(c); return c; };
    o.material = Array.isArray(orig) ? orig.map(glow) : glow(orig);
    highlighted.push([o, orig]);
  });
}
function pick(cx, cy) {
  const r = renderer.domElement.getBoundingClientRect();
  raycaster.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera);
  const hits = raycaster.intersectObjects(scene.children, true).filter((h) => h.object !== sky && h.object !== stars);
  let node = hits[0] ? hits[0].object : null;
  while (node && !node.userData.info) node = node.parent;
  if (!node) { closeInfo(); return; }
  showInfo(node);
}
function showInfo(node) {
  const info = node.userData.info;
  highlight(node);
  $('info-eyebrow').textContent = info.eyebrow;
  $('info-title').firstChild.textContent = info.title;
  $('info-sub').textContent = info.sub || '';
  $('info-text').textContent = info.text;
  $('info-dims').replaceChildren(...(info.dims || []).flatMap(([k, v]) => {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    return [dt, dd];
  }));
  infoEl.classList.add('on');
}
function closeInfo() { infoEl.classList.remove('on'); clearHighlight(); }
$('info-close').addEventListener('click', closeInfo);
let press = null;
renderer.domElement.addEventListener('pointerdown', (e) => { press = { x: e.clientX, y: e.clientY, t: performance.now(), b: e.button }; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (press && press.b === 0 && performance.now() - press.t < 400 && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 6) pick(e.clientX, e.clientY);
  press = null;
});

// ---- 控件 ----
const toggle = (btn) => { const on = btn.getAttribute('aria-pressed') !== 'true'; btn.setAttribute('aria-pressed', String(on)); return on; };
for (const b of document.querySelectorAll('#bar [data-view]')) b.addEventListener('click', () => flyTo(VIEWS[b.dataset.view]));
$('btn-lapse').addEventListener('click', () => { if (timelapse) stopTimelapse(); else startTimelapse(); });
$('btn-explode').addEventListener('click', () => { explode.target = toggle($('btn-explode')) ? 1 : 0; });
$('btn-tour').addEventListener('click', () => { if (tour) stopTour(); else { closeInfo(); startTour(); } });
$('btn-spin').addEventListener('click', () => { controls.autoRotate = toggle($('btn-spin')); });
const toggleHud = () => document.body.classList.toggle('hud-off');
$('btn-hud').addEventListener('click', toggleHud);
$('hud-show').addEventListener('click', toggleHud);
$('btn-quality').textContent = HIGH ? '画质：高' : (new URLSearchParams(location.search).get('auto') ? '画质：低（自动）' : '画质：低');
$('btn-quality').addEventListener('click', () => {
  const u = new URL(location.href); u.searchParams.set('q', HIGH ? 'low' : 'high'); location.href = u.toString();
});
for (const b of document.querySelectorAll('[data-time]')) b.addEventListener('click', () => { stopTimelapse(); applyTime(Number(b.dataset.time)); });
addEventListener('keydown', (e) => {
  if (e.target && /input|textarea/i.test(e.target.tagName)) return;
  const map = { 1: 'front', 2: 'square', 3: 'east', 4: 'eave', 5: 'mirror', 6: 'top' };
  if (map[e.key]) flyTo(VIEWS[map[e.key]]);
  else if (e.key === 'n' || e.key === 'N') { stopTimelapse(); applyTime(clock.night > 0.5 ? 10.5 : 20.5); }
  else if (e.key === 'l' || e.key === 'L') $('btn-lapse').click();
  else if (e.key === 'e' || e.key === 'E') $('btn-explode').click();
  else if (e.key === 't' || e.key === 'T') $('btn-tour').click();
  else if (e.key === 'r' || e.key === 'R') $('btn-spin').click();
  else if (e.key === 'h' || e.key === 'H') toggleHud();
  else if (e.key === 'Escape') closeInfo();
});
function onResize() {
  const pr = pixelRatio();
  camera.aspect = innerWidth / innerHeight;
  applyFov();
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(pr);
  composer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  if (csm) csm.updateFrustums();
  matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener('change', onResize, { once: true });
}
addEventListener('resize', onResize);
matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener('change', onResize, { once: true });

// ---- 国旗布料 ----
function updateFlag(t) {
  const pos = flag.mesh.geometry.attributes.position, base = flag.base;
  for (let i = 0; i < pos.count; i++) {
    const x = base[i * 3], y = base[i * 3 + 1];
    const k = (x + 2.5) / 5;
    const z = Math.sin(x * 1.6 - t * 3.4 + y * 0.5) * 0.36 * k + Math.sin(x * 3.4 - t * 5.1 + y * 1.2) * 0.12 * k;
    pos.setXYZ(i, x, y - 0.1 * k * k, z);
  }
  pos.needsUpdate = true;
  flag.mesh.geometry.computeVertexNormals();
}

// ---- 主循环 ----
let last = performance.now(), frames = 0, slowAccum = 0;
const explicitQ = new URLSearchParams(location.search).has('q');
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  // 高画质但持续掉帧（前 60 帧均值 > 80 ms）且用户未指定画质：自动降到低画质
  if (HIGH && !explicitQ && frames > 10 && frames <= 70) {
    slowAccum += dt * 1000;
    if (frames === 70 && slowAccum / 60 > 80 && !/HeadlessChrome/.test(navigator.userAgent)) {
      const u = new URL(location.href); u.searchParams.set('q', 'low'); u.searchParams.set('auto', '1'); location.replace(u.toString());
    }
  }
  updateTimelapse(now);
  updateCameraTween(now);
  updateTour(now);
  controls.update();
  updateExplode(dt);
  if (!reduceMotion || frames === 0) updateFlag(now / 1000);
  if (envDirty && now - envLast > 250) { refreshEnvironment(renderer); envDirty = false; envLast = now; }
  sun.target.position.copy(controls.target).setY(0);
  sun.position.copy(sun.target.position).addScaledVector(sky.material.uniforms.sunPosition.value, 320);
  if (csm) { csm.lightDirection.copy(sunDir).negate(); csm.update(); }
  tickEnv(dt);
  bloom.strength = isSmall ? 0 : 0.1 + 0.5 * clock.night;
  composer.render();
  if (frames++ === 1) {
    $('loading').classList.add('off');
    if (!reduceMotion) setTimeout(() => flyTo(VIEWS.front, 2.4), 100);
  }
}
applyTime(clock.hours);
applyFov();
requestAnimationFrame(frame);

// 调试钩子（测量与自动化截图用）
window.__tam = {
  camera, controls, scene, renderer, VIEWS, flyTo,
  setBaseFov: (f) => { baseFov = f; fovTween = null; applyFov(); },
  setTime: applyTime, csm, gtao, quality,
};
