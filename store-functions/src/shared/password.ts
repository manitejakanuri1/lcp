import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';

/**
 * scrypt password hashing (Node built-in; no native dependency). Stored format:
 *   scrypt$<N>$<r>$<p>$<salt b64>$<hash b64>
 * Parameters live in the string, so they can be raised later without invalidating old hashes.
 * INTERIM ONLY: once the identity provider lands it owns credentials and this file is deleted.
 */
const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_LEN = 64;

const derive = (password: string, salt: Buffer, n: number, r: number, p: number, len: number) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCb(password, salt, len, { N: n, r, p, maxmem: 128 * n * r * 2 }, (err, key) => (err ? reject(err) : resolve(key))),
  );

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P, KEY_LEN);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await derive(password, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

