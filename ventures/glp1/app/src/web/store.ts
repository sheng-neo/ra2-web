/**
 * 极小的全局状态：撤销提示条、分诊弹窗、当前打开的面板。
 */
import { useSyncExternalStore } from 'react';
import type { TriageHit } from '../core/triage';

export type SheetName = 'dose' | 'weight' | 'symptom' | 'food' | 'workout' | null;

export interface UiState {
  toast: { id: number; text: string; undo?: () => void } | null;
  triage: { hits: TriageHit[]; rowId: string | null } | null;
  sheet: SheetName;
  coping: string | null;
}

let state: UiState = { toast: null, triage: null, sheet: null, coping: null };
const subs = new Set<() => void>();
let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function setUi(patch: Partial<UiState>): void {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
}

export function useUi(): UiState {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => state,
  );
}

export function toast(text: string, undo?: () => void): void {
  if (toastTimer) clearTimeout(toastTimer);
  setUi({ toast: { id: Date.now(), text, undo } });
  toastTimer = setTimeout(() => setUi({ toast: null }), 5000);
}
