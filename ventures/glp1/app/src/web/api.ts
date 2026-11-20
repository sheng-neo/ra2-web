/**
 * 调用服务端的 AI 识别。服务端没配密钥、断网、用户拒绝 AI 时都会失败，界面要能回落到手动。
 */
import type { SymptomKind } from '../core/triage';

export type AiEvent =
  | { type: 'food'; label: string; proteinG: number; lowG: number; highG: number; kcal: number | null; confidence: number }
  | { type: 'dose'; amount: number; unit: 'mg' | 'units' | 'mL' | 'clicks'; site: string | null; minutesAgo: number | null }
  | { type: 'weight'; kg: number }
  | { type: 'symptom'; kind: SymptomKind; grade: number }
  | { type: 'question'; text: string; outOfScope: boolean }
  | { type: 'unknown'; text: string };

export interface ParseContext {
  drug: string | null;
  doseUnit: string;
  weightUnit: string;
  localTime: string;
}

export class AiUnavailable extends Error {}

export async function parseRemote(input: { text?: string; imageJpegBase64?: string }, context: ParseContext): Promise<AiEvent[]> {
  let res: Response;
  try {
    res = await fetch('/api/parse', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...input, context }),
    });
  } catch {
    throw new AiUnavailable('offline');
  }
  if (res.status === 503 || res.status === 404) throw new AiUnavailable('unavailable');
  if (!res.ok) throw new Error(`parse failed: ${res.status}`);
  const data = (await res.json()) as { events: AiEvent[] };
  return data.events;
}

/** 前端先把照片压成长边不超过 1024 像素的 JPEG，再上传。 */
export async function compressImage(file: File, maxSide = 1024, quality = 0.8): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}
