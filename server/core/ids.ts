import { randomBytes } from 'node:crypto';

// ULID: 48 бит времени + 80 бит случайности, Crockford base32, сортируется по времени создания.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
let lastTime = 0;
let lastRandom: number[] = [];

export function ulid(now = Date.now()): string {
  let rand: number[];
  if (now === lastTime) {
    rand = [...lastRandom];
    for (let i = rand.length - 1; i >= 0; i--) {
      if (rand[i] < 31) { rand[i]++; break; }
      rand[i] = 0;
    }
  } else {
    rand = Array.from(randomBytes(16)).map((b) => b & 31);
  }
  lastTime = now;
  lastRandom = rand;
  let time = '';
  let t = now;
  for (let i = 0; i < 10; i++) { time = ALPHABET[t % 32] + time; t = Math.floor(t / 32); }
  return time + rand.map((r) => ALPHABET[r]).join('');
}
