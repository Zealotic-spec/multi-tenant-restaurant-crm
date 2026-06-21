import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

/**
 * Парольное хэширование на встроенном Node crypto (scrypt), без внешних зависимостей.
 * Формат хранения: "<salt_hex>:<hash_hex>".
 */

const KEY_LENGTH = 64;

export function hashPassword(plainPassword: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(plainPassword, salt, KEY_LENGTH);
  return `${salt}:${derived.toString("hex")}`;
}

export function verifyPassword(plainPassword: string, storedHash: string): boolean {
  const [salt, hashHex] = storedHash.split(":");
  if (!salt || !hashHex) return false;

  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(plainPassword, salt, expected.length);

  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/** Хэш ли это (а не случайно оставшийся plaintext пароль из старых данных)? */
export function isHashed(value: string): boolean {
  return /^[a-f0-9]{32,}:[a-f0-9]{32,}$/i.test(value);
}

/** Случайный одноразовый пароль для сброса (например, сотрудник забыл свой). Без похожих символов (0/O, 1/I/l). */
export function generateRandomPassword(length = 10): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}
