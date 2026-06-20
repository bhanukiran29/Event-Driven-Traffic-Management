import { containsQuery, matchesParam, readProcessedJson } from "@/lib/data";
import type { RiskEvent } from "@/lib/types";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const events = await readProcessedJson<RiskEvent[]>("events.json");
  const risk = url.searchParams.get("risk");
  const zone = url.searchParams.get("zone");
  const corridor = url.searchParams.get("corridor");
  const cause = url.searchParams.get("cause");
  const status = url.searchParams.get("status");
  const query = url.searchParams.get("q");
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam === "all" ? Number.MAX_SAFE_INTEGER : Number(limitParam || 500);

  const filtered = events.filter((event) => {
    return (
      matchesParam(event.risk_category, risk) &&
      matchesParam(event.zone, zone) &&
      matchesParam(event.corridor, corridor) &&
      matchesParam(event.event_cause, cause) &&
      matchesParam(event.status, status) &&
      containsQuery(
        [
          event.id,
          event.address,
          event.event_cause,
          event.corridor,
          event.zone,
          event.junction,
          event.police_station,
          event.description
        ],
        query
      )
    );
  });

  return Response.json({
    total: filtered.length,
    returned: Math.min(filtered.length, limit),
    events: filtered.slice(0, limit)
  });
}
