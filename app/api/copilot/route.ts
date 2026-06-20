import { readProcessedJson } from "@/lib/data";
import type { HotspotCluster, RiskEvent, SummaryPayload } from "@/lib/types";

type CopilotCorpus = {
  summary: SummaryPayload;
  top_events: RiskEvent[];
  hotspots: HotspotCluster[];
  corridor_hotspots: Array<{ name: string; count: number; average_tis: number }>;
  zone_hotspots: Array<{ name: string; count: number; average_tis: number }>;
};

function list(items: string[]) {
  return items.join("; ");
}

export async function POST(request: Request) {
  const body = (await request.json()) as { question?: string };
  const question = (body.question || "").toLowerCase();
  const corpus = await readProcessedJson<CopilotCorpus>("copilot_corpus.json");
  const { summary } = corpus;
  let answer = "";
  let supporting_facts: string[] = [];

  if (question.includes("zone")) {
    const zones = corpus.zone_hotspots.slice(0, 5);
    answer = `The highest attention zones by average TIS are ${list(zones.map((item) => `${item.name} (${item.average_tis})`))}. Prioritize the top zones for command-room monitoring and reserve deployment.`;
    supporting_facts = zones.map((item) => `${item.name}: ${item.count} events, average TIS ${item.average_tis}`);
  } else if (question.includes("corridor") || question.includes("diversion")) {
    const corridors = corpus.corridor_hotspots.slice(0, 5);
    answer = `Corridor risk is led by ${list(corridors.map((item) => `${item.name} (${item.average_tis})`))}. Diversion guidance is dataset-only: avoid the affected corridor and prefer lower-risk corridors in the same zone when available.`;
    supporting_facts = corridors.map((item) => `${item.name}: ${item.count} events, average TIS ${item.average_tis}`);
  } else if (question.includes("hotspot") || question.includes("cluster")) {
    const clusters = corpus.hotspots.slice(0, 5);
    answer = `DBSCAN found ${corpus.hotspots.length} hotspot clusters. The largest operational watch area is cluster ${clusters[0]?.id}, with ${clusters[0]?.count} events and average TIS ${clusters[0]?.average_tis}.`;
    supporting_facts = clusters.map((item) => `Cluster ${item.id}: ${item.count} events near ${item.top_police_station}, top cause ${item.top_cause}`);
  } else if (question.includes("resource") || question.includes("officer") || question.includes("barricade")) {
    const events = corpus.top_events.slice(0, 3);
    answer = `For immediate resource planning, start with the top-risk events and apply the TIS recommendation bands. Current top events require ${list(events.map((event) => `${event.recommendation.officers} officers for ${event.id}`))}.`;
    supporting_facts = events.map((event) => `${event.id}: TIS ${event.traffic_impact_score}, ${event.recommendation.officers} officers, ${event.recommendation.barricades} barricades`);
  } else if (question.includes("why") || question.includes("high risk")) {
    const event = corpus.top_events[0];
    answer = `${event.id} is the highest-risk event. Its risk is driven by ${event.explanation.join(" ")}`;
    supporting_facts = event.score_components.slice(0, 5).map((item) => `${item.name}: ${item.contribution} score contribution`);
  } else {
    answer = `Citywide operational risk is medium overall, with ${summary.metrics.total_events} ASTraM records, ${summary.metrics.road_closures} road closures, ${summary.metrics.high_risk_events} high-or-critical events, and average TIS ${summary.metrics.average_tis}. This is operational risk scoring, not measured congestion prediction.`;
    supporting_facts = [
      `Date range: ${summary.data_quality.date_range.start.slice(0, 10)} to ${summary.data_quality.date_range.end.slice(0, 10)}`,
      `Active events: ${summary.metrics.active_events}`,
      `Planned events: ${summary.metrics.planned_events}`,
      `Unplanned events: ${summary.metrics.unplanned_events}`
    ];
  }

  return Response.json({ answer, supporting_facts });
}
