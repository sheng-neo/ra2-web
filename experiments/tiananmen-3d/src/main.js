// 渲染 · 相机控制 · 交互 · 动画
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { scene, mat } from './lib.js';
import { layers, explodeOffsets } from './gate.js';
import { isSmall, flag, sky, stars, sun, clock, setTime, refreshEnvironment } from './env.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);

// ---- 渲染器 ----
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.5;
$('stage').appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 1, 1600);
camera.position.set(60, 40, 220);

// 后期：辉光（夜景灯光）+ 输出色彩
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.0, 0.4, 1.6);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---- 轨道控制 ----
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 14;
controls.maxDistance = 460;
controls.maxPolarAngle = Math.PI / 2 - 0.03;
controls.target.set(0, 16, 0);
controls.autoRotateSpeed = 0.6;
controls.addEventListener('start', () => { stopTour(); cameraTween = null; });

// ---- 机位预设 ----
const VIEWS = {
  front: { pos: [0, 22, 112], target: [0, 17, 0] },
  square: { pos: [18, 10, 236], target: [0, 20, 0] },
  east: { pos: [150, 34, 62], target: [0, 16, 0] },
  eave: { pos: [16, 22, 46], target: [0, 24, 6] },
  // 倒影：贴着南岸水面、广角——楼有多高，倒影就有多深，只有广角才装得下
  mirror: { pos: [-42, 1.3, 46.5], target: [-10, 1.3, 14], fov: 74 },
  top: { pos: [0, 232, 88], target: [0, 8, 12] },
};
let cameraTween = null;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function setFov(f) { if (camera.fov !== f) { camera.fov = f; camera.updateProjectionMatrix(); } }
function flyTo(view, dur = reduceMotion ? 0 : 1.6) {
  stopTour();
  const toPos = new THREE.Vector3(...view.pos), toT = new THREE.Vector3(...view.target), toFov = view.fov || 42;
  if (dur <= 0) { camera.position.copy(toPos); controls.target.copy(toT); setFov(toFov); return; }
  cameraTween = { t0: performance.now(), dur: dur * 1000, fromPos: camera.position.clone(), fromT: controls.target.clone(), fromFov: camera.fov, toPos, toT, toFov };
}
function updateCameraTween(now) {
  if (!cameraTween) return;
  const k = Math.min(1, (now - cameraTween.t0) / cameraTween.dur), e = ease(k);
  camera.position.copy(cameraTween.fromPos).lerp(cameraTween.toPos, e);
  controls.target.copy(cameraTween.fromT).lerp(cameraTween.toT, e);
  setFov(THREE.MathUtils.lerp(cameraTween.fromFov, cameraTween.toFov, e));
  if (k >= 1) cameraTween = null;
}

// ---- 飞行游览 ----
const tourPath = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 20, 190), new THREE.Vector3(120, 26, 130), new THREE.Vector3(160, 40, 10),
  new THREE.Vector3(90, 60, -110), new THREE.Vector3(-60, 48, -120), new THREE.Vector3(-150, 30, -20),
  new THREE.Vector3(-110, 22, 90), new THREE.Vector3(-30, 30, 60), new THREE.Vector3(30, 26, 44),
  new THREE.Vector3(70, 18, 110),
], true, 'catmullrom', 0.6);
const tourLook = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 18, 0), new THREE.Vector3(0, 20, 0), new THREE.Vector3(0, 22, 0), new THREE.Vector3(0, 26, 0),
  new THREE.Vector3(0, 24, 0), new THREE.Vector3(0, 18, 0), new THREE.Vector3(0, 16, 10), new THREE.Vector3(0, 24, 8),
  new THREE.Vector3(0, 26, 4), new THREE.Vector3(0, 18, 0),
], true, 'catmullrom', 0.6);
let tour = null;
const TOUR_SECONDS = 52;
function startTour() { tour = { t0: performance.now() }; $('btn-tour').setAttribute('aria-pressed', 'true'); }
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
  const label = `${phaseName(h)} ${fmtTime(h)}`;
  timeLabel.textContent = label;
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
  let h = clock.hours + dt * (24 / 48);          // 48 秒走完一天
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
    const glow = (m) => { const c = m.clone(); c.emissive = new THREE.Color(0xffd08a); c.emissiveIntensity = 0.16; return c; };
    o.material = Array.isArray(orig) ? orig.map(glow) : glow(orig);
    highlighted.push([o, orig]);
  });
}
function pick(cx, cy) {
  raycaster.setFromCamera(new THREE.Vector2((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1), camera);
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
  else if (e.key === 'Escape') closeInfo();
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

// ---- 国旗布料 ----
function updateFlag(t) {
  const pos = flag.mesh.geometry.attributes.position, base = flag.base;
  for (let i = 0; i < pos.count; i++) {
    const x = base[i * 3], y = base[i * 3 + 1];
    const k = (x + 3) / 6;
    const z = Math.sin(x * 1.5 - t * 3.4 + y * 0.5) * 0.42 * k + Math.sin(x * 3.2 - t * 5.1 + y * 1.2) * 0.14 * k;
    pos.setXYZ(i, x, y - 0.12 * k * k, z);
  }
  pos.needsUpdate = true;
  flag.mesh.geometry.computeVertexNormals();
}

// ---- 主循环 ----
let last = performance.now(), frames = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  updateTimelapse(now);
  updateCameraTween(now);
  updateTour(now);
  controls.update();
  updateExplode(dt);
  if (!reduceMotion || frames === 0) updateFlag(now / 1000);
  if (envDirty && now - envLast > 250) { refreshEnvironment(renderer); envDirty = false; envLast = now; }
  sun.target.position.copy(controls.target).setY(0);
  sun.position.copy(sun.target.position).addScaledVector(sky.material.uniforms.sunPosition.value, 320);
  bloom.strength = isSmall ? 0 : 0.1 + 0.5 * clock.night;
  composer.render();
  if (frames++ === 1) {
    $('loading').classList.add('off');
    if (!reduceMotion) setTimeout(() => flyTo(VIEWS.front, 2.4), 100);
  }
}
applyTime(clock.hours);
requestAnimationFrame(frame);
