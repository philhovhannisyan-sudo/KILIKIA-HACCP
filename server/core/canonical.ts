// Канонический JSON: ключи отсортированы рекурсивно. Основа хэшей журнала и дампа (К8, К9).
export function canonical(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}
function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === 'object' && !(v instanceof Uint8Array)) {
    return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sortDeep((v as Record<string, unknown>)[k])]));
  }
  if (v instanceof Uint8Array) return Buffer.from(v).toString('base64');
  return v;
}
