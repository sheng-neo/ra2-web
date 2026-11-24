/**
 * 电车轨与山顶缆车：Overture rail 段（class tram / funicular）→ Rail[]。
 */
import type { Rail } from '@central/data';
import { shortId } from '../geo/hash';
import { clipAndSimplify, type Rect } from '../geo/polyline';
import { linesOf, type OvtSegment } from '../sources/overture';
import { projectCoords } from './project';

const SIMPLIFY_DM = 3;
const KINDS = new Set<Rail['kind']>(['tram', 'funicular']);

export function buildRails(segments: readonly OvtSegment[], extent: Rect): Rail[] {
  const rails: Rail[] = [];
  for (const seg of segments) {
    const kind = seg.class as Rail['kind'];
    if (seg.subtype !== 'rail' || !KINDS.has(kind)) continue;
    let k = 0;
    for (const coords of linesOf(seg.geometry)) {
      for (const pts of clipAndSimplify(projectCoords(coords), extent, SIMPLIFY_DM)) {
        rails.push({ id: shortId(`rail:${seg.id}:${k++}`), kind, pts });
      }
    }
  }
  return rails.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
