/**
 * 稳定哈希：同一输入在任何机器上得到同样结果。管线里一切「随机」都从这里来，禁用 Math.random。
 */
import { createHash } from 'node:crypto';

function sha1(key: string): Buffer {
  return createHash('sha1').update(key).digest();
}

/** 10 位十六进制短 ID（40 bit；构建时另做碰撞检查）。 */
export function shortId(key: string): string {
  return sha1(key).toString('hex').slice(0, 10);
}

/** 32 位无符号整数哈希；salt 区分不同用途，避免同一 ID 的各种「随机量」相关。 */
export function hashU32(key: string, salt: string): number {
  return sha1(`${salt}:${key}`).readUInt32BE(0);
}

/** 整个文件/字符串的 sha256（十六进制）。 */
export function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}
