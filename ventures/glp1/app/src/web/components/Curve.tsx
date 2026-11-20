import type { CurvePoint } from '../../core/pk';

/**
 * 药物水平曲线（相对指数）。实线是已经发生的，虚线是"按计划继续用"的估算。
 */
export function Curve({ points, nowMs, doseTimes, height = 120, compact = false }: { points: CurvePoint[]; nowMs: number; doseTimes: number[]; height?: number; compact?: boolean }) {
  if (points.length < 2) return null;
  const w = 340;
  const h = height;
  const padY = 8;
  const t0 = points[0].tMs;
  const t1 = points[points.length - 1].tMs;
  const maxV = Math.max(110, ...points.map((p) => p.index));
  const x = (t: number) => ((t - t0) / (t1 - t0)) * w;
  const y = (v: number) => h - padY - (v / maxV) * (h - 2 * padY);
  const path = (ps: CurvePoint[]) => ps.map((p, i) => `${i ? 'L' : 'M'}${x(p.tMs).toFixed(1)},${y(p.index).toFixed(1)}`).join('');
  const past = points.filter((p) => !p.projected);
  const future = points.filter((p) => p.projected);
  if (past.length && future.length) future.unshift(past[past.length - 1]);
  return (
    <svg className="curve" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="药物水平估算曲线">
      <line x1="0" x2={w} y1={y(100)} y2={y(100)} className="curve-ref" />
      {!compact && (
        <text x="2" y={y(100) - 3} className="curve-label">
          100
        </text>
      )}
      {doseTimes
        .filter((t) => t >= t0 && t <= t1)
        .map((t) => (
          <line key={t} x1={x(t)} x2={x(t)} y1={h - padY} y2={h - padY - 6} className="curve-dose" />
        ))}
      <path d={path(past)} className="curve-past" />
      {future.length > 1 && <path d={path(future)} className="curve-future" />}
      <line x1={x(nowMs)} x2={x(nowMs)} y1={0} y2={h} className="curve-now" />
    </svg>
  );
}
