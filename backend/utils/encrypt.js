const crypto = require("crypto");

const ALGO = "aes-256-cbc";

// Enforce ENCRYPT_SECRET in production to prevent security vulnerabilities
if (process.env.NODE_ENV === "production" && !process.env.ENCRYPT_SECRET) {
  throw new Error("CRITICAL SECURITY ERROR: ENCRYPT_SECRET must be set in production environment variables.");
}

// Derive a 32-byte key from the secret.
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
