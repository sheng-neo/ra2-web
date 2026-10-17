// ===== sim/events/queries.ts =====（CONTRACTS §I：TechQuery / DisasterQuery / NewsQuery 三键同归 events）
// 全部纯 / 同步 / 不消费 PRNG；绑定前（init / postLoad 之前）按空城作答（不抛错，与 nullSystem 一致）。
import type { TechKey } from '../../contracts/catalogue';
import { TILES, tileIndex } from '../../contracts/grid';
import type { DisasterQuery, NewsQuery, TechQuery, ThingView } from '../../contracts/queries';
import { thingViews } from './actors';
import { peekPriv } from './common';
import type { EventsRuntime } from './common';
import { dispatchAvailable } from './dispatch';
import { focusPoints } from './machine';
import { paperView, storiesView } from './news';
import { isInvented } from './tech';

const ZERO_MARKERS: Readonly<Uint8Array> = new Uint8Array(TILES);
const EMPTY: readonly never[] = Object.freeze([]) as readonly never[];

export function makeQueries(rt: EventsRuntime): { tech: TechQuery; disasters: DisasterQuery; news: NewsQuery } {
  const P = () => (rt.ctx ? peekPriv(rt.ctx.state) : null);
  const things = (): ThingView[] => { const p = P(); return p ? thingViews(p) : []; };
  return {
    tech: { invented: (key: TechKey) => (rt.ctx ? isInvented(rt.ctx.state, key) : false) },
    disasters: {
      marker: (i) => P()?.marker[i] ?? 0,
      markers: () => P()?.marker ?? ZERO_MARKERS,
      focusPoints: () => { const p = P(); return p ? focusPoints(p) : EMPTY; },
      thingsAt: (i) => things().filter((t) => tileIndex(t.x, t.y) === i),
      things,
      dispatchAvailable: (kind) => (rt.ctx ? dispatchAvailable(rt.ctx, kind) : 0),
    },
    news: {
      currentPaper: () => { const p = P(); return p ? paperView(p) : null; },
      stories: () => { const p = P(); return p ? storiesView(p) : EMPTY; },
    },
  };
}
