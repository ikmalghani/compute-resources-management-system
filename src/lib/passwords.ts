import { randomBytes } from "crypto";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export function generatePassword() {
  const bytes = randomBytes(16);
  let password = "";
  for (const byte of bytes) password += alphabet[byte % alphabet.length];
  return password;
}
