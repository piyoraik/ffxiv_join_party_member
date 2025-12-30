/**
 * 現在時刻を Unix epoch nanoseconds（文字列）で返します。
 *
 * Loki の `query_range` は start/end を ns で受け取れるため、それに合わせます。
 */
export function nowNs(): string {
  return String(Date.now() * 1_000_000);
}

/**
 * `endNs` から `seconds` 秒ぶん引いた nanoseconds（文字列）を返します。
 */
export function minusSecondsNs(endNs: string, seconds: number): string {
  const end = Number.parseInt(endNs, 10);
  const start = end - seconds * 1_000_000_000;
  return String(start);
}

