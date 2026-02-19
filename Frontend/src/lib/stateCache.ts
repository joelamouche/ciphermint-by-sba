const ONE_HOUR_MS = 60 * 60 * 1000;

interface CachedValue<T> {
  value: T;
  timestamp: number;
}

function isExpired(timestamp: number, maxAgeMs: number) {
  return Date.now() - timestamp > maxAgeMs;
}

export function loadCachedBoolean(
  key: string,
  maxAgeMs: number = ONE_HOUR_MS,
): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedValue<boolean>;
    if (!parsed || typeof parsed.timestamp !== "number") return null;
    if (isExpired(parsed.timestamp, maxAgeMs)) return null;
    return parsed.value;
  } catch {
    return null;
  }
}

export function saveCachedBoolean(key: string, value: boolean) {
  if (typeof window === "undefined") return;
  const payload: CachedValue<boolean> = {
    value,
    timestamp: Date.now(),
  };
  try {
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // ignore write errors
  }
}

export function loadCachedBigint(
  key: string,
  maxAgeMs: number = ONE_HOUR_MS,
): bigint | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedValue<string>;
    if (!parsed || typeof parsed.timestamp !== "number") return null;
    if (isExpired(parsed.timestamp, maxAgeMs)) return null;
    return BigInt(parsed.value);
  } catch {
    return null;
  }
}

export function saveCachedBigint(key: string, value: bigint) {
  if (typeof window === "undefined") return;
  const payload: CachedValue<string> = {
    value: value.toString(),
    timestamp: Date.now(),
  };
  try {
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // ignore write errors
  }
}

