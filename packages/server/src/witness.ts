/**
 * 「见证者」计数：每位首次到访者领取一个序号（第 N 位见证者）。
 * 持久化到文件（Fly 卷 /data 存在则用之，跨部署不丢；否则退本地文件；
 * 再不行退纯内存——永不因计数失败影响服务）。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const FILE = process.env.WITNESS_FILE ?? (existsSync('/data') ? '/data/witness.json' : './witness.json');

let count = (() => {
  try {
    if (existsSync(FILE)) {
      const n = (JSON.parse(readFileSync(FILE, 'utf8')) as { count?: number }).count;
      if (typeof n === 'number' && n >= 0) return Math.floor(n);
    }
  } catch {
    /* 读不到就从 0 起 */
  }
  return 0;
})();

function persist(): void {
  try {
    mkdirSync(dirname(FILE), { recursive: true });
    writeFileSync(FILE, JSON.stringify({ count }));
  } catch {
    /* 写不了就只留内存 */
  }
}

/** 当前见证者总数。 */
export function totalWitnesses(): number {
  return count;
}

/** 领取一个新序号（= 领取后的总数）。 */
export function claimWitness(): number {
  count += 1;
  persist();
  return count;
}
