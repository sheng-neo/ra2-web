/**
 * 菜单动态背景（canvas 2D）：夜空 + 星轨 + 闪烁星点 + 坠星 + 远山剪影 + 远处的「坠星光柱」。
 * 静态部分只在尺寸变化时画一次到离屏画布；每帧只画星点闪烁、流星与微尘，30fps 封顶，足够轻。
 */

export type BackdropMood = 'menu' | 'victory' | 'defeat';

export interface Backdrop {
  el: HTMLCanvasElement;
  setMood(mood: BackdropMood): void;
  dispose(): void;
}

interface Palette {
  sky: [number, string][];
  horizon: string;
  horizonGlow: string;
  beam: string;
  ridge: [string, string, string];
  rim: string;
  star: string;
  meteor: string;
  /** 每秒流星数 */
  meteorRate: number;
  /** 微尘颜色与运动方向(1 上升，-1 飘落) */
  mote: string;
  moteDir: 1 | -1;
}

const PALETTES: Record<BackdropMood, Palette> = {
  menu: {
    sky: [[0, '#02040d'], [0.34, '#060d2a'], [0.62, '#0d2152'], [0.8, '#1a4a82'], [1, '#27719a']],
    horizon: '#3aa0c8',
    horizonGlow: 'rgba(92, 214, 247, 0.34)',
    beam: '255, 226, 160',
    ridge: ['#16346a', '#0c1d45', '#050a1c'],
    rim: 'rgba(160, 220, 255, 0.5)',
    star: '225, 238, 255',
    meteor: '201, 246, 255',
    meteorRate: 0.42,
    mote: '255, 226, 160',
    moteDir: 1,
  },
  victory: {
    sky: [[0, '#050410'], [0.34, '#0e1034'], [0.62, '#262258'], [0.8, '#70502e'], [1, '#c98d3c']],
    horizon: '#ffd98a',
    horizonGlow: 'rgba(255, 214, 130, 0.42)',
    beam: '255, 240, 200',
    ridge: ['#3c3260', '#1a1838', '#07060f'],
    rim: 'rgba(255, 226, 160, 0.6)',
    star: '255, 244, 214',
    meteor: '255, 231, 173',
    meteorRate: 0.9,
    mote: '255, 231, 173',
    moteDir: 1,
  },
  defeat: {
    sky: [[0, '#030409'], [0.34, '#090c18'], [0.62, '#141a2c'], [0.8, '#2a2636'], [1, '#4a2c34']],
    horizon: '#8a4a52',
    horizonGlow: 'rgba(182, 60, 70, 0.26)',
    beam: '190, 120, 130',
    ridge: ['#1c2234', '#10131f', '#05060b'],
    rim: 'rgba(170, 130, 150, 0.35)',
    star: '170, 180, 205',
    meteor: '170, 180, 205',
    meteorRate: 0,
    mote: '150, 150, 165',
    moteDir: -1,
  },
};

interface Star { x: number; y: number; r: number; phase: number; speed: number; base: number; glint: boolean }
interface Meteor { x: number; y: number; vx: number; vy: number; life: number; max: number; len: number; w: number }
interface Mote { x: number; y: number; r: number; speed: number; drift: number; phase: number }

/** 小型种子随机数：背景布局每次打开都一样，截图可复现 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 中点位移法生成山脊线：返回 n 个 [0,1] 高度。rough 越大越嶙峋 */
function ridgeLine(rand: () => number, n: number, rough: number): number[] {
  let size = 2;
  while (size + 1 < n) size *= 2;
  const pts = new Array<number>(size + 1).fill(0);
  pts[0] = rand();
  pts[size] = rand();
  let scale = 0.9;
  for (let step = size; step > 1; step /= 2) {
    const half = step / 2;
    for (let i = half; i < size; i += step) pts[i] = (pts[i - half] + pts[i + half]) / 2 + (rand() - 0.5) * scale;
    scale *= rough;
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of pts) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const f = (i / (n - 1)) * size;
    const k = Math.min(size - 1, Math.floor(f));
    const v = pts[k] + (pts[k + 1] - pts[k]) * (f - k);
    out.push((v - lo) / (hi - lo || 1));
  }
  return out;
}

export function createBackdrop(parent: HTMLElement, initialMood: BackdropMood = 'menu'): Backdrop {
  const canvas = document.createElement('canvas');
  canvas.className = 'sf-backdrop';
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;z-index:0;pointer-events:none;';
  parent.insertBefore(canvas, parent.firstChild);
  const ctx = canvas.getContext('2d', { alpha: false });
  // 静态内容分两层：天空在最后面，山体剪影盖在星点/光柱/流星之上
  const still = document.createElement('canvas');
  const sctx = still.getContext('2d', { alpha: false });
  const front = document.createElement('canvas');
  const fctx = front.getContext('2d');

  let mood = initialMood;
  let W = 0;
  let H = 0;
  let dpr = 1;
  let horizonY = 0;
  let beamX = 0;
  let stars: Star[] = [];
  let motes: Mote[] = [];
  const meteors: Meteor[] = [];
  let raf = 0;
  let last = 0;
  let time = 0;
  let meteorClock = 0.6;
  let disposed = false;

  function buildStatic(): void {
    if (!sctx || !fctx) return;
    const p = PALETTES[mood];
    const rand = mulberry32(20260511);
    still.width = front.width = canvas.width;
    still.height = front.height = canvas.height;
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fctx.clearRect(0, 0, W, H);

    // ── 天空层 ──
    const sky = sctx.createLinearGradient(0, 0, 0, horizonY);
    for (const [o, c] of p.sky) sky.addColorStop(o, c);
    sctx.fillStyle = sky;
    sctx.fillRect(0, 0, W, H);

    // 星河：一条斜贯天空的柔和光带
    sctx.save();
    sctx.translate(W * 0.5, horizonY * 0.4);
    sctx.rotate(-0.42);
    const band = sctx.createLinearGradient(0, -H * 0.2, 0, H * 0.2);
    band.addColorStop(0, `rgba(${p.star}, 0)`);
    band.addColorStop(0.5, `rgba(${p.star}, 0.075)`);
    band.addColorStop(1, `rgba(${p.star}, 0)`);
    sctx.fillStyle = band;
    sctx.fillRect(-W, -H * 0.2, W * 2, H * 0.4);
    sctx.restore();

    // 星轨：绕天极的同心弧（长曝光星轨），呼应界面的「星轨描边」
    const poleX = W * 0.24;
    const poleY = -H * 0.12;
    sctx.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      const r = H * (0.3 + rand() * 0.95);
      const a0 = 0.15 + rand() * 1.5;
      const len = 0.1 + rand() * 0.22;
      sctx.strokeStyle = `rgba(${p.star}, ${0.035 + rand() * 0.075})`;
      sctx.lineWidth = 0.6 + rand() * 0.8;
      sctx.beginPath();
      sctx.arc(poleX, poleY, r, a0, a0 + len);
      sctx.stroke();
    }

    // 地平线辉光（坠星落点方向最亮）
    const glowR = Math.max(W * 0.62, H * 0.75);
    const hg = sctx.createRadialGradient(beamX, horizonY, 0, beamX, horizonY, glowR);
    hg.addColorStop(0, p.horizonGlow);
    hg.addColorStop(1, 'rgba(0, 0, 0, 0)');
    sctx.fillStyle = hg;
    sctx.fillRect(0, 0, W, H);

    // ── 前景层：三层远山 + 尖塔 ──
    const layers: { base: number; amp: number; rough: number; top: string; bottom: string; rim: number; mist: number }[] = [
      { base: 0.015, amp: 0.2, rough: 0.56, top: p.ridge[0], bottom: p.horizon, rim: 1, mist: 0.2 },
      { base: 0.075, amp: 0.15, rough: 0.52, top: p.ridge[1], bottom: p.ridge[0], rim: 0.5, mist: 0.12 },
      { base: 0.16, amp: 0.11, rough: 0.6, top: p.ridge[2], bottom: p.ridge[2], rim: 0.18, mist: 0 },
    ];
    const n = Math.max(96, Math.ceil(W / 2.5));
    // 山高按较短边算：竖屏时不至于变成一排尖刺
    const span = Math.min(H, W * 1.15);
    layers.forEach((L, li) => {
      const line = ridgeLine(rand, n, L.rough);
      const yAt = (i: number): number => {
        // 最近一层加一点锯齿，像山脊上的树线
        const teeth = li === 2 ? ((i * 7) % 5) * 0.0016 * H : 0;
        return horizonY + H * L.base - line[i] ** 1.25 * span * L.amp - teeth;
      };
      fctx.beginPath();
      fctx.moveTo(0, H);
      for (let i = 0; i < n; i++) fctx.lineTo((i / (n - 1)) * W, yAt(i));
      fctx.lineTo(W, H);
      fctx.closePath();
      const g = fctx.createLinearGradient(0, horizonY - span * L.amp, 0, horizonY + H * (L.base + 0.1));
      g.addColorStop(0, L.top);
      g.addColorStop(1, L.bottom);
      fctx.fillStyle = g;
      fctx.fill();
      // 山脊受光边：离光柱越近越亮
      fctx.lineWidth = 1.3;
      fctx.strokeStyle = p.rim;
      for (let i = 1; i < n; i++) {
        const x = (i / (n - 1)) * W;
        const near = Math.max(0, 1 - Math.abs(x - beamX) / (W * 0.5));
        if (near <= 0.02) continue;
        fctx.globalAlpha = near * near * L.rim;
        fctx.beginPath();
        fctx.moveTo(((i - 1) / (n - 1)) * W, yAt(i - 1));
        fctx.lineTo(x, yAt(i));
        fctx.stroke();
      }
      fctx.globalAlpha = 1;
      // 层间薄雾
      if (L.mist > 0) {
        const my = horizonY + H * (L.base + 0.02);
        const mg = fctx.createLinearGradient(0, my - H * 0.07, 0, my + H * 0.06);
        mg.addColorStop(0, 'rgba(0, 0, 0, 0)');
        mg.addColorStop(0.6, p.horizonGlow.replace(/[\d.]+\)$/, `${L.mist})`));
        mg.addColorStop(1, 'rgba(0, 0, 0, 0)');
        fctx.fillStyle = mg;
        fctx.fillRect(0, my - H * 0.07, W, H * 0.13);
      }
    });

    // 近景两侧的水晶尖塔剪影（暗示对局里的防御塔）
    const spire = (cx: number, h0: number, w0: number): void => {
      const top = H - h0;
      fctx.fillStyle = '#03050c';
      fctx.beginPath();
      fctx.moveTo(cx - w0, H);
      fctx.lineTo(cx - w0 * 0.55, top + h0 * 0.22);
      fctx.lineTo(cx, top);
      fctx.lineTo(cx + w0 * 0.55, top + h0 * 0.22);
      fctx.lineTo(cx + w0, H);
      fctx.closePath();
      fctx.fill();
      const cy = top - h0 * 0.07;
      const tg = fctx.createRadialGradient(cx, cy, 0, cx, cy, h0 * 0.2);
      tg.addColorStop(0, `rgba(${p.beam}, 0.9)`);
      tg.addColorStop(0.18, `rgba(${p.beam}, 0.32)`);
      tg.addColorStop(1, `rgba(${p.beam}, 0)`);
      fctx.fillStyle = tg;
      fctx.fillRect(cx - h0 * 0.25, cy - h0 * 0.25, h0 * 0.5, h0 * 0.5);
      // 悬浮的菱形核心
      const cs = Math.max(3, h0 * 0.03);
      fctx.fillStyle = `rgb(${p.beam})`;
      fctx.beginPath();
      fctx.moveTo(cx, cy - cs * 1.6);
      fctx.lineTo(cx + cs, cy);
      fctx.lineTo(cx, cy + cs * 1.6);
      fctx.lineTo(cx - cs, cy);
      fctx.closePath();
      fctx.fill();
    };
    spire(W * 0.055, H * 0.42, Math.max(14, W * 0.022));
    spire(W * 0.955, H * 0.33, Math.max(12, W * 0.018));

    // 底部压暗 + 四周暗角，让前景界面更突出
    const fade = fctx.createLinearGradient(0, horizonY, 0, H);
    fade.addColorStop(0, 'rgba(3, 5, 12, 0)');
    fade.addColorStop(1, 'rgba(3, 5, 12, 0.8)');
    fctx.fillStyle = fade;
    fctx.fillRect(0, horizonY, W, H - horizonY);
    const vg = fctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.35, W / 2, H * 0.45, Math.hypot(W, H) * 0.62);
    vg.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vg.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
    fctx.fillStyle = vg;
    fctx.fillRect(0, 0, W, H);
  }

  function resize(): void {
    const w = Math.max(1, parent.clientWidth);
    const h = Math.max(1, parent.clientHeight);
    if (w === W && h === H) return;
    W = w;
    H = h;
    // 大屏不值得为背景多花像素
    dpr = Math.min(window.devicePixelRatio || 1, W * H > 1_600_000 ? 1 : 1.5);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    horizonY = H * (W >= H ? 0.74 : 0.8);
    beamX = W * 0.79;

    const rand = mulberry32(7);
    const count = Math.round(Math.min(260, Math.max(90, (W * H) / 5200)));
    stars = [];
    for (let i = 0; i < count; i++) {
      const y = rand() ** 1.5 * horizonY * 0.96;
      const big = rand() > 0.94;
      stars.push({
        x: rand() * W,
        y,
        r: big ? 1.3 + rand() * 0.9 : 0.45 + rand() * 0.8,
        phase: rand() * Math.PI * 2,
        speed: 0.6 + rand() * 2.2,
        base: 0.35 + rand() * 0.5,
        glint: big,
      });
    }
    motes = [];
    const moteCount = Math.round(Math.min(46, Math.max(18, W / 34)));
    for (let i = 0; i < moteCount; i++) {
      motes.push({ x: rand() * W, y: rand() * H, r: 0.6 + rand() * 1.5, speed: 6 + rand() * 16, drift: 4 + rand() * 10, phase: rand() * Math.PI * 2 });
    }
    buildStatic();
    draw(0);
  }

  function spawnMeteor(): void {
    const fromRight = Math.random() > 0.25;
    const speed = Math.max(W, H) * (0.55 + Math.random() * 0.45);
    const ang = (fromRight ? Math.PI * 0.8 : Math.PI * 0.22) + (Math.random() - 0.5) * 0.25;
    meteors.push({
      x: fromRight ? W * (0.35 + Math.random() * 0.7) : W * Math.random() * 0.5,
      y: -20 + Math.random() * horizonY * 0.3,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      life: 0,
      max: 0.55 + Math.random() * 0.6,
      len: Math.max(W, H) * (0.1 + Math.random() * 0.12),
      w: 1.1 + Math.random() * 1.6,
    });
  }

  function draw(dt: number): void {
    if (!ctx) return;
    const p = PALETTES[mood];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(still, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 星点闪烁
    for (const s of stars) {
      const a = s.base * (0.62 + 0.38 * Math.sin(time * s.speed + s.phase));
      ctx.fillStyle = `rgba(${p.star}, ${a.toFixed(3)})`;
      if (s.glint) {
        const g = s.r * (3.2 + 1.2 * Math.sin(time * s.speed * 0.7 + s.phase));
        ctx.fillRect(s.x - g, s.y - 0.4, g * 2, 0.8);
        ctx.fillRect(s.x - 0.4, s.y - g, 0.8, g * 2);
      }
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // 坠星光柱：自地平线升起、缓慢呼吸
    const pulse = 0.8 + 0.2 * Math.sin(time * 0.9);
    const beamTop = horizonY * 0.06;
    const beamBottom = horizonY + H * 0.04;
    const beamW = Math.max(22, Math.min(W, H) * 0.045);
    const bg = ctx.createLinearGradient(0, beamTop, 0, horizonY);
    bg.addColorStop(0, `rgba(${p.beam}, 0)`);
    bg.addColorStop(0.75, `rgba(${p.beam}, ${(0.1 * pulse).toFixed(3)})`);
    bg.addColorStop(1, `rgba(${p.beam}, ${(0.3 * pulse).toFixed(3)})`);
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(beamX - beamW * 0.22, beamTop);
    ctx.lineTo(beamX + beamW * 0.22, beamTop);
    ctx.lineTo(beamX + beamW, beamBottom);
    ctx.lineTo(beamX - beamW, beamBottom);
    ctx.closePath();
    ctx.fill();
    const core = ctx.createLinearGradient(0, beamTop, 0, horizonY);
    core.addColorStop(0, `rgba(${p.beam}, 0)`);
    core.addColorStop(1, `rgba(${p.beam}, ${(0.85 * pulse).toFixed(3)})`);
    ctx.fillStyle = core;
    ctx.fillRect(beamX - 1, beamTop, 2, beamBottom - beamTop);
    const br = Math.min(W, H) * 0.26 * pulse;
    const bgl = ctx.createRadialGradient(beamX, horizonY, 0, beamX, horizonY, br);
    bgl.addColorStop(0, `rgba(${p.beam}, 0.62)`);
    bgl.addColorStop(0.3, `rgba(${p.beam}, 0.2)`);
    bgl.addColorStop(1, `rgba(${p.beam}, 0)`);
    ctx.fillStyle = bgl;
    ctx.fillRect(beamX - br, horizonY - br, br * 2, br * 2);

    // 流星
    if (p.meteorRate > 0) {
      meteorClock -= dt;
      if (meteorClock <= 0) {
        spawnMeteor();
        meteorClock = (0.5 + Math.random()) / p.meteorRate;
      }
    }
    ctx.lineCap = 'round';
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      m.life += dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      const k = m.life / m.max;
      if (k >= 1 || m.y > horizonY + H * 0.06) {
        meteors.splice(i, 1);
        continue;
      }
      const a = Math.sin(Math.PI * Math.min(1, k * 1.15)) ** 0.7;
      const sp = Math.hypot(m.vx, m.vy);
      const tx = m.x - (m.vx / sp) * m.len;
      const ty = m.y - (m.vy / sp) * m.len;
      const g = ctx.createLinearGradient(m.x, m.y, tx, ty);
      g.addColorStop(0, `rgba(255, 255, 255, ${a.toFixed(3)})`);
      g.addColorStop(0.25, `rgba(${p.meteor}, ${(a * 0.6).toFixed(3)})`);
      g.addColorStop(1, `rgba(${p.meteor}, 0)`);
      ctx.strokeStyle = g;
      ctx.lineWidth = m.w;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.fillStyle = `rgba(255, 255, 255, ${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.w * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }

    // 山体剪影盖住光柱根部与落到地平线以下的流星
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(front, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 近处微尘：胜利/菜单时上升的星屑，失败时飘落的灰烬
    for (const mt of motes) {
      mt.y -= mt.speed * dt * p.moteDir;
      mt.x += Math.sin(time * 0.6 + mt.phase) * mt.drift * dt;
      if (mt.y < -6) mt.y = H + 6;
      if (mt.y > H + 6) mt.y = -6;
      const depth = mt.y / H;
      const a = (0.12 + 0.4 * depth) * (0.6 + 0.4 * Math.sin(time * 1.7 + mt.phase));
      ctx.fillStyle = `rgba(${p.mote}, ${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(mt.x, mt.y, mt.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function frame(now: number): void {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    const elapsed = now - last;
    // 30fps 封顶：背景不需要更高的刷新率
    if (elapsed < 31) return;
    last = now;
    const dt = Math.min(0.1, elapsed / 1000);
    time += dt;
    draw(dt);
  }

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  ro?.observe(parent);
  window.addEventListener('resize', resize);
  resize();
  raf = requestAnimationFrame(frame);

  return {
    el: canvas,
    setMood: (m) => {
      if (m === mood) return;
      mood = m;
      meteors.length = 0;
      buildStatic();
    },
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('resize', resize);
      canvas.remove();
    },
  };
}
