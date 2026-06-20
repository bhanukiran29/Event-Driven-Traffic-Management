import type {
  ResourceRecommendation,
  RiskCategory,
  RiskEvent,
  ScoreComponent,
  ScoringContext,
  SimulationRequest,
  SimulationResult
} from "@/lib/types";

const COMPONENT_TO_WEIGHT: Record<string, string> = {
  "Event cause risk": "event_cause",
  "Road closure requirement": "road_closure",
  "Priority level": "priority",
  "Duration risk": "duration",
  "Corridor frequency": "corridor_density",
  "Zone frequency": "zone_density",
  "Junction frequency": "junction_density",
  "Police station workload": "police_workload",
  "Time pattern risk": "temporal_risk",
  "DBSCAN hotspot membership": "hotspot"
};

function keyText(value: string | undefined, fallback: string): string {
  return (value || fallback).trim().toLowerCase().replace(/\s+/g, "_");
}

function category(score: number): RiskCategory {
  if (score >= 80) {
    return "Critical";
  }
  if (score >= 65) {
    return "High";
  }
  if (score >= 45) {
    return "Medium";
  }
  return "Low";
}

function recommendation(
  score: number,
  closure: boolean,
  corridor: string,
  zone: string,
  context: ScoringContext,
  latitude?: number,
  longitude?: number,
  endLatitude?: number | null,
  endLongitude?: number | null
): ResourceRecommendation {
  const risk = category(score);
  const base: Record<RiskCategory, Omit<ResourceRecommendation, "risk_category" | "barricade_points" | "diversion_advisory">> = {
    Low: { officers: 2, barricades: score < 35 ? 0 : 1, patrol_units: 0, response_priority: "Monitor" },
    Medium: { officers: 4, barricades: 2, patrol_units: 1, response_priority: "Scheduled deployment" },
    High: { officers: 7, barricades: 3, patrol_units: 2, response_priority: "Priority intervention" },
    Critical: { officers: 10, barricades: 5, patrol_units: 3, response_priority: "Immediate intervention" }
  };
  const output = { ...base[risk] };
  if (closure) {
    output.officers = Math.min(12, output.officers + 2);
    output.barricades = Math.min(6, output.barricades + 2);
  }
  const barricadePoints = latitude && longitude
    ? [{ label: "Primary incident point", latitude, longitude }]
    : [];
  if (endLatitude && endLongitude) {
    barricadePoints.push({
      label: "Terminal road-closure point",
      latitude: endLatitude,
      longitude: endLongitude
    });
  }
  return {
    ...output,
    risk_category: risk,
    barricade_points: barricadePoints,
    diversion_advisory: {
      type: "dataset_advisory",
      message: "Avoid the affected corridor where feasible; this is a dataset-only advisory, not turn-by-turn routing.",
      avoid_corridor: corridor,
      candidate_corridors: (context.zone_corridor_advisories[zone] || [])
        .filter((item) => item.corridor !== corridor && item.corridor !== "Non-corridor")
        .slice(0, 3)
    }
  };
}

function explanation(components: ScoreComponent[]): string[] {
  const messages: string[] = [];
  for (const component of components.slice(0, 4)) {
    if (component.contribution <= 2.5) {
      continue;
    }
    if (component.name === "Road closure requirement") {
      messages.push("Road closure requirement materially increases operational disruption risk.");
    } else if (component.name === "Priority level") {
      messages.push("High priority classification indicates elevated operational attention.");
    } else if (component.name === "Corridor frequency") {
      messages.push("The corridor has repeated historical disruption records in the ASTraM dataset.");
    } else if (component.name === "Zone frequency") {
      messages.push("The zone has dense historical event activity.");
    } else if (component.name === "Junction frequency") {
      messages.push("The junction appears frequently in historical event records.");
    } else if (component.name === "Duration risk") {
      messages.push("Longer estimated event duration raises deployment and barricading needs.");
    } else if (component.name === "DBSCAN hotspot membership") {
      messages.push("The location falls inside a detected spatial hotspot cluster.");
    } else if (component.name === "Time pattern risk") {
      messages.push("The start time aligns with historically busy event windows.");
    } else {
      messages.push("The event cause has high historical disruption potential.");
    }
  }
  return messages.length
    ? messages
    : ["Risk is driven by a balanced mix of event type, location history, and timing."];
}

export function scoreScenario(
  request: SimulationRequest,
  context: ScoringContext,
  baseEvent?: RiskEvent
): SimulationResult {
  const eventCause = request.eventCause || baseEvent?.event_cause || "others";
  const priority = request.priority || baseEvent?.priority || "Low";
  const closure = request.requiresRoadClosure ?? baseEvent?.requires_road_closure ?? false;
  const durationHours = request.durationHours ?? baseEvent?.event_duration_hours ?? 0;
  const corridor = request.corridor || baseEvent?.corridor || "Non-corridor";
  const zone = request.zone || baseEvent?.zone || "Unmapped Zone";
  const junction = request.junction || baseEvent?.junction || "Unmapped Junction";
  const policeStation = request.policeStation || baseEvent?.police_station || "Unknown Station";
  const startHour = request.startHour ?? baseEvent?.start_hour ?? 0;
  const startDay = request.startDay || baseEvent?.start_day || "Monday";
  const clusterRisk = request.clusterRisk ?? baseEvent?.cluster_risk ?? 0;

  const durationRisk = Math.log1p(Math.min(Math.max(durationHours, 0), 72)) / Math.log1p(72);
  const values: Record<string, number> = {
    "Event cause risk": context.cause_risk[keyText(eventCause, "others")] ?? context.cause_risk.others ?? 0.5,
    "Road closure requirement": closure ? 1 : 0,
    "Priority level": context.priority_risk[keyText(priority, "low")] ?? 0.45,
    "Duration risk": durationRisk,
    "Corridor frequency": context.corridor_density[corridor] ?? 0.25,
    "Zone frequency": context.zone_density[zone] ?? 0.2,
    "Junction frequency": context.junction_density[junction] ?? 0.2,
    "Police station workload": context.police_density[policeStation] ?? 0.25,
    "Time pattern risk": ((context.hour_risk[String(startHour)] ?? 0.35) + (context.day_risk[startDay] ?? 0.35)) / 2,
    "DBSCAN hotspot membership": clusterRisk
  };

  const components = Object.entries(values)
    .map(([name, value]) => {
      const weight = context.weights[COMPONENT_TO_WEIGHT[name]] ?? 0;
      return {
        name,
        value: Number(value.toFixed(4)),
        weight: Number((weight * 100).toFixed(1)),
        contribution: Number((value * weight * 100).toFixed(2))
      };
    })
    .sort((a, b) => b.contribution - a.contribution);

  const score = Number(Math.min(100, Math.max(0, components.reduce((sum, item) => sum + item.contribution, 0))).toFixed(1));
  return {
    event_id: baseEvent?.id || request.eventId || null,
    baseline_score: baseEvent?.traffic_impact_score ?? null,
    traffic_impact_score: score,
    risk_category: category(score),
    score_components: components,
    explanation: explanation(components),
    recommendation: recommendation(
      score,
      closure,
      corridor,
      zone,
      context,
      baseEvent?.latitude,
      baseEvent?.longitude,
      baseEvent?.end_latitude,
      baseEvent?.end_longitude
    )
  };
}
