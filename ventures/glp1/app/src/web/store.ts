/**
 * 极小的全局状态：撤销提示条、分诊弹窗、当前打开的面板。
 */
import { useSyncExternalStore } from 'react';
import type { TriageHit } from '../core/triage';
import type { MsgRef } from './i18n/translate';

export type SheetName = 'dose' | 'weight' | 'symptom' | 'food' | 'workout' | null;

export interface UiState {
  /** The message is kept as a key and turned into text when it is shown, in the language of the screen. */
  toast: { id: number; msg: MsgRef; undo?: () => void } | null;
  /** `wrote`: the alert came from a typed question and nothing was logged (the fixed card then says "What you wrote"). */
  triage: { hits: TriageHit[]; rowId: string | null; wrote?: boolean } | null;
  sheet: SheetName;
  coping: string | null;
  /** The list of warning signs from the Medication Guide is open. It lies over everything, an alert included. */
  guide: boolean;
}

let state: UiState = { toast: null, triage: null, sheet: null, coping: null, guide: false };
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
    () => state,
  );
}

export function toast(msg: MsgRef, undo?: () => void): void {
  if (toastTimer) clearTimeout(toastTimer);
  setUi({ toast: { id: Date.now(), msg, undo } });
  toastTimer = setTimeout(() => setUi({ toast: null }), 5000);
}
