function isPlainObject(v: unknown): v is Record<string, unknown> {
  return (
    v != null &&
    typeof v === "object" &&
    Object.getPrototypeOf(v) === Object.prototype
  );
}

export function stripUndefinedDeep<T>(v: T): T {
  if (Array.isArray(v)) {
    return v
      .map((x) => stripUndefinedDeep(x))
      .filter((x) => x !== undefined) as unknown as T;
  }

  if (isPlainObject(v)) {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      if (val === undefined) continue;
      out[k] = stripUndefinedDeep(val);
    }
    return out as T;
  }

  return v;
}
