const PREFIX = "exec-os:";

export async function kvGet<T>(key: string): Promise<T | null> {
  try {
    const res = await fetch(`/api/kv?key=${PREFIX}${key}`);
    const data = await res.json();
    if (data.value === null || data.value === undefined) return null;
    if (typeof data.value === "string") return JSON.parse(data.value) as T;
    return data.value as T;
  } catch {
    return null;
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  try {
    await fetch("/api/kv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: PREFIX + key, value: JSON.stringify(value) }),
    });
  } catch {}
}

export async function kvDel(key: string): Promise<void> {
  try {
    await fetch(`/api/kv?key=${PREFIX}${key}`, { method: "DELETE" });
  } catch {}
}
