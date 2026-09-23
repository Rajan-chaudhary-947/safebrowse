const ITERATIONS = 120_000;
const HASH_ALGORITHM = "SHA-256";
const VERSION = "pbkdf2-v1";

function toBase64(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

async function derive(
  pin: string,
  salt: Uint8Array<ArrayBuffer>
): Promise<Uint8Array<ArrayBuffer>> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: ITERATIONS,
      hash: HASH_ALGORITHM,
    },
    material,
    256
  );

  return new Uint8Array(bits);
}

export async function hashPin(pin: string): Promise<string> {
  validatePin(pin);

  const salt = new Uint8Array(new ArrayBuffer(16));
  crypto.getRandomValues(salt);

  const digest = await derive(pin, salt);

  return `${VERSION}$${ITERATIONS}$${toBase64(salt)}$${toBase64(
    digest
  )}`;
}

export async function verifyPin(
  pin: string,
  encoded: string
): Promise<boolean> {
  try {
    const [version, iterationsText, saltText, digestText] =
      encoded.split("$");

    if (
      version !== VERSION ||
      Number(iterationsText) !== ITERATIONS ||
      !saltText ||
      !digestText
    ) {
      return false;
    }

    const expected = fromBase64(digestText);
    const actual = await derive(pin, fromBase64(saltText));

    if (actual.length !== expected.length) {
      return false;
    }

    let diff = 0;

    for (let i = 0; i < actual.length; i += 1) {
      diff |= actual[i] ^ expected[i];
    }

    return diff === 0;
  } catch {
    return false;
  }
}

export function validatePin(pin: string): void {
  if (!/^\d{4,8}$/.test(pin)) {
    throw new Error("PIN must contain 4–8 digits.");
  }
}