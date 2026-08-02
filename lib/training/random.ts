/** PRNG pequeno e determinístico para mãos e testes reproduzíveis. */
export function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function hashSeed(...values: Array<string | number>): number {
  let hash = 2_166_136_261;
  for (const value of values.join(":")) {
    hash ^= value.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

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
