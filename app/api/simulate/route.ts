import { readProcessedJson } from "@/lib/data";
import { scoreScenario } from "@/lib/scoring";
import type { RiskEvent, ScoringContext, SimulationRequest } from "@/lib/types";

export async function POST(request: Request) {
  const body = (await request.json()) as SimulationRequest;
  const [events, context] = await Promise.all([
    readProcessedJson<RiskEvent[]>("events.json"),
    readProcessedJson<ScoringContext>("context.json")
  ]);
  const baseEvent = body.eventId ? events.find((event) => event.id === body.eventId) : undefined;
  const result = scoreScenario(body, context, baseEvent);
  return Response.json(result);
}
