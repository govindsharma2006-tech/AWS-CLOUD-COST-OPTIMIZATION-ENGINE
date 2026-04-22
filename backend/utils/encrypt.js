const crypto = require("crypto");

const ALGO = "aes-256-cbc";

// Derive a 32-byte key from the secret. Falls back to a built-in default
// so the app works without any .env change — set ENCRYPT_SECRET in production.
const KEY = crypto.scryptSync(
  process.env.ENCRYPT_SECRET || "cloudlens_default_enc_key_do_not_use_in_prod!",
  "cl_salt_v1",
  32
);

function encrypt(text) {
  if (!text) return null;
  const iv     = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const enc    = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + enc.toString("hex");
}

function decrypt(text) {
  if (!text) return null;
  try {
    const [ivHex, encHex] = text.split(":");
    const iv      = Buffer.from(ivHex, "hex");
    const enc     = Buffer.from(encHex, "hex");
    const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch {
    // Backwards-compat: if stored value is not encrypted yet, return as-is
    return text;
  }
}

module.exports = { encrypt, decrypt };
