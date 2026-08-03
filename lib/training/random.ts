import { hashSeed } from "../random";

export { hashSeed, seededRandom } from "../random";

/** Seed nova para cada sessão; usa entropia do navegador quando disponível. */
export function createSessionSeed(): number {
  try {
    const values = new Uint32Array(1);
    globalThis.crypto?.getRandomValues(values);
    if (values[0] !== 0) return values[0];
  } catch {
    // Ambientes antigos continuam recebendo uma seed variável pelo fallback.
  }

  return hashSeed(Date.now(), Math.random()) || 1;
}
