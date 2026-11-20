import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import type { Profile } from '../core/types';
import { db, deviceTz } from './db';
import { derive, type Derived, type Records } from './derive';

const EMPTY: Records = { doses: [], foods: [], weights: [], symptoms: [], workouts: [] };

export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    const vis = () => document.visibilityState === 'visible' && setNow(Date.now());
    document.addEventListener('visibilitychange', vis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [intervalMs]);
  return now;
}

/** undefined = 还在加载；null = 还没建档。 */
export function useProfile(): Profile | null | undefined {
  return useLiveQuery(async () => (await db.profile.get('me')) ?? null, []);
}

export function useRecords(): Records {
  return (
    useLiveQuery(async () => {
      const [doses, foods, weights, symptoms, workouts] = await Promise.all([
        db.doses.toArray(),
        db.foods.toArray(),
        db.weights.toArray(),
        db.symptoms.toArray(),
        db.workouts.toArray(),
      ]);
      return { doses, foods, weights, symptoms, workouts };
    }, []) ?? EMPTY
  );
}

export function useDerived(profile: Profile, rec: Records, now: number): Derived {
  return useMemo(() => derive(profile, rec, now, deviceTz()), [profile, rec, now]);
}
