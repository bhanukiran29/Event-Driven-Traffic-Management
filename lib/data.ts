import { promises as fs } from "fs";
import path from "path";

const cache = new Map<string, unknown>();

export async function readProcessedJson<T>(filename: string): Promise<T> {
  if (cache.has(filename)) {
    return cache.get(filename) as T;
  }
  const filePath = path.join(process.cwd(), "data", "processed", filename);
  const raw = await fs.readFile(filePath, "utf-8");
  const parsed = JSON.parse(raw) as T;
  cache.set(filename, parsed);
  return parsed;
}

export async function readOptionalProcessedJson<T>(filename: string): Promise<T | null> {
  try {
    return await readProcessedJson<T>(filename);
  } catch {
    return null;
  }
}

export function matchesParam(value: string, param: string | null): boolean {
  if (!param || param === "all") {
    return true;
  }
  return value.toLowerCase() === param.toLowerCase();
}

export function containsQuery(values: string[], query: string | null): boolean {
  if (!query) {
    return true;
  }
  const needle = query.toLowerCase();
  return values.some((value) => value.toLowerCase().includes(needle));
}
