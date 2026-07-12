// Change the passcode without ever storing the plan in plaintext.
// Usage:  node tools/reencrypt.mjs "<current-passcode>" "<new-passcode>"
// Run from the repo root. Rewrites content.enc.json in place.
import { webcrypto as crypto } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const [, , oldPass, newPass] = process.argv;
if (!oldPass || !newPass) {
  console.error('Usage: node tools/reencrypt.mjs "<current-passcode>" "<new-passcode>"');
  process.exit(1);
}
const FILE = "content.enc.json";
const ITER = 250000;
const enc = new TextEncoder();
const b64 = (b) => Buffer.from(b).toString("base64");
const unb64 = (s) => new Uint8Array(Buffer.from(s, "base64"));

async function keyFrom(pass, salt, usage) {
  const base = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, [usage]);
}

const data = JSON.parse(readFileSync(FILE, "utf8"));
const oldKey = await keyFrom(oldPass, unb64(data.salt), "decrypt");
let plain;
try {
  plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(data.iv) }, oldKey, unb64(data.ct));
} catch {
  console.error("Current passcode is wrong — nothing changed.");
  process.exit(1);
}

const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const newKey = await keyFrom(newPass, salt, "encrypt");
const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, newKey, plain);

writeFileSync(FILE, JSON.stringify({
  v: 1, kdf: "PBKDF2-SHA256", iterations: ITER, cipher: "AES-GCM",
  salt: b64(salt), iv: b64(iv), ct: b64(new Uint8Array(ct)),
}, null, 2));
console.log("Passcode changed. Commit & push content.enc.json to publish.");
