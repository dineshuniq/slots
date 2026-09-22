/**
 * Candidate access tokens: four uppercase alphanumeric characters.
 *
 * Generated from an alphabet with I, O, 0 and 1 removed, because these are
 * read off a list and typed by hand. Sign-in accepts any A-Z0-9 token, so
 * tokens issued elsewhere still work.
 */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const TOKEN_LENGTH = 4;
export const TOKEN_PATTERN = /^[A-Z0-9]{4}$/;

export function generateToken(): string {
  const bytes = new Uint8Array(TOKEN_LENGTH);
  crypto.getRandomValues(bytes);

  let token = "";
  for (const byte of bytes) token += ALPHABET[byte % ALPHABET.length];
  return token;
}

export function normaliseToken(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidToken(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}
