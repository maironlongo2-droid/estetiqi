// Proteção proporcional contra abuso para endpoints públicos.
//
// Implementação em memória, por instância de processo. Em ambiente serverless
// cada instância tem seu próprio contador, o que é aceitável como primeira
// barreira (o objetivo é limitar abuso trivial, não ser um WAF). A limpeza de
// buckets antigos evita crescimento ilimitado da memória.

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 5000;

function pruneExpired(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

export type RateLimitResult = {
  ok: boolean;
  retryAfterSeconds: number;
};

export function rateLimit(
  key: string,
  options: { limit: number; windowMs: number }
): RateLimitResult {
  const now = Date.now();

  if (buckets.size > MAX_BUCKETS) {
    pruneExpired(now);
  }

  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }

  if (existing.count >= options.limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((existing.resetAt - now) / 1000)
      ),
    };
  }

  existing.count += 1;
  return { ok: true, retryAfterSeconds: 0 };
}

export function clientIpFromRequest(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  return realIp || "unknown";
}
