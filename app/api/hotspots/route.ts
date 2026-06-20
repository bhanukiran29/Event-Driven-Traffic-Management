import { readProcessedJson } from "@/lib/data";
import type { HotspotsPayload } from "@/lib/types";

export async function GET() {
  const hotspots = await readProcessedJson<HotspotsPayload>("hotspots.json");
  return Response.json(hotspots);
}
