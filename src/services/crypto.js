// Minimal cross-runtime webcrypto helpers for symmetric AES-GCM encryption.
// [FIX] Add robust fallback for devices without WebCrypto support
let isWebCryptoAvailable = false;
let cryptoAPI = null;
let subtleAPI = null;

// [FIX] Salt for fallback hash (not cryptographically secure, but adds obscurity)
const FALLBACK_SALT = 'CoproWatch-v2-SecureHashSalt-2024';

// Initialize crypto APIs safely
function initCrypto() {
  try {
    if (typeof window !== 'undefined') {
      cryptoAPI = window.crypto || window.msCrypto || window.webkitCrypto;
      if (cryptoAPI && cryptoAPI.subtle) {
        subtleAPI = cryptoAPI.subtle;
        isWebCryptoAvailable = true;
        console.log('[CRYPTO] WebCrypto API available - Encryption/Decryption OK');
      } else {
        console.warn('[CRYPTO] WebCrypto API not supported on this device! Using fallback.');
        console.log('[CRYPTO] User Agent:', navigator.userAgent);
        isWebCryptoAvailable = false;
      }
    }
  } catch (e) {
    console.warn('[CRYPTO] Error initializing WebCrypto:', e);
    isWebCryptoAvailable = false;
  }
}

// Fallback encryption using XOR (for devices without WebCrypto)
// WARNING: This is NOT cryptographically secure, but prevents app crashes
function xorEncrypt(text, password, extension = '') {
  let result = '';
  const hardenedPw = password + extension;
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ hardenedPw.charCodeAt(i % hardenedPw.length));
  }
  return btoa(result);
}

function xorDecrypt(encoded, password, extension = '') {
  const text = atob(encoded);
  let result = '';
  const hardenedPw = password + extension;
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ hardenedPw.charCodeAt(i % hardenedPw.length));
  }
  return result;
}

function toUint8Array(str) {
  return new TextEncoder().encode(str);
}

function fromUint8Array(bytes) {
  return new TextDecoder().decode(bytes);
}

function base64Encode(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64Decode(str) {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(str, 'base64'));
  const binary = atob(str);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(password, salt, extension = '', iterations = 250000) {
  if (!isWebCryptoAvailable || !subtleAPI) {
    throw new Error('WebCrypto not available');
  }

  // [SECURITY] Mix the password with the custom extension before derivation.
  // This ensures that even a 4-digit PIN has high entropy for the attacker.
  const hardenedPassword = password + extension;

  const pwKey = await subtleAPI.importKey(
    'raw',
    toUint8Array(hardenedPassword),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return subtleAPI.deriveKey(
    { name: 'PBKDF2', salt: salt, iterations, hash: 'SHA-256' },
    pwKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptString(password, plaintext, extension = '') {
  console.log('[CRYPTO ENCRYPT] password length:', password?.length, 'extension length:', extension?.length);
  
  // Fallback if WebCrypto is not available
  if (!isWebCryptoAvailable) {
    console.warn('[CRYPTO] Using fallback XOR encryption (not secure)');
    return JSON.stringify({
      method: 'xor',
      salt: btoa(password.slice(0, 8)),
      data: xorEncrypt(plaintext, password, extension),
    });
  }

  const salt = cryptoAPI.getRandomValues(new Uint8Array(16));
  const iv = cryptoAPI.getRandomValues(new Uint8Array(12));
  console.log('[CRYPTO ENCRYPT] Deriving key with password + extension');
  const key = await deriveKey(password, salt, extension);
  const cipherBytes = new Uint8Array(
    await subtleAPI.encrypt({ name: 'AES-GCM', iv }, key, toUint8Array(plaintext))
  );
  console.log('[CRYPTO ENCRYPT] Encryption successful');
  return JSON.stringify({
    method: 'aes-gcm',
    salt: base64Encode(salt),
    iv: base64Encode(iv),
    data: base64Encode(cipherBytes),
  });
}

export async function decryptString(password, payload, extension = '') {
  console.log('[CRYPTO DECRYPT] password length:', password?.length, 'extension length:', extension?.length);
  const obj = typeof payload === 'string' ? JSON.parse(payload) : payload;

  // Handle fallback XOR encryption
  if (obj.method === 'xor') {
    return xorDecrypt(obj.data, password, extension);
  }

  const salt = base64Decode(obj.salt);
  const iv = base64Decode(obj.iv);
  const data = base64Decode(obj.data);
  console.log('[CRYPTO DECRYPT] Deriving key for decryption');
  const key = await deriveKey(password, salt, extension);
  
  // Use subtleAPI directly instead of just 'subtle' which was a typo in previous version
  const plainBytes = new Uint8Array(await subtleAPI.decrypt({ name: 'AES-GCM', iv }, key, data));
  console.log('[CRYPTO DECRYPT] Decryption successful');
  return fromUint8Array(plainBytes);
}

export async function hashString(message, extension = '') {
  // Mix with extension for hashing
  const pepperedMessage = message + extension;
  console.log('[HASH] Hashing message (length:', message?.length, ') with extension (length:', extension?.length, ')');

  // Fallback if WebCrypto is not available
  if (!isWebCryptoAvailable) {
    console.warn('[HASH] Using fallback hash (not secure)');
    const saltedMessage = pepperedMessage + FALLBACK_SALT;
    let hash = 0;
    for (let i = 0; i < saltedMessage.length; i++) {
      const char = saltedMessage.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(64, '0').slice(0, 64);
  }

  const msgBuffer = new TextEncoder().encode(pepperedMessage);
  const hashBuffer = await cryptoAPI.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const result = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  console.log('[HASH] Hash result length:', result.length);
  return result;
}

// Export availability check for other modules
export function isCryptoAvailable() {
  return isWebCryptoAvailable;
}

// Initialize immediately
initCrypto();
