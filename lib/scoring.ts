import type {
  ResourceRecommendation,
  DiversionCandidate,
  DiversionPlan,
  EventScale,
  InterventionAnalysis,
  InterventionScenario,
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

function eventScale(attendance: number): EventScale {
  if (attendance <= 500) return "Small";
  if (attendance <= 2500) return "Medium";
  if (attendance <= 10000) return "Large";
  return "Mega";
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const radiusKm = 6371;
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * radiusKm * Math.asin(Math.sqrt(a));
}

function diversionPlan(
  corridor: string,
  zone: string,
  score: number,
  closure: boolean,
  clusterRisk: number,
  context: ScoringContext,
  latitude?: number,
  longitude?: number
): DiversionPlan {
  const minimumSupport = context.diversion_config?.minimum_corridor_support ?? 20;
  const maximumDistanceKm = context.diversion_config?.maximum_distance_km ?? 20;
  const zoneDensity = Math.min(1, Math.max(0, context.zone_density[zone] ?? 0.2));
  const candidates = context.zone_corridor_advisories[zone] || [];
  const affectedRisk = candidates.find((item) => item.corridor === corridor)?.average_tis ?? score;
  const ranked = candidates
    .filter((item) => item.corridor !== corridor && item.corridor !== "Non-corridor" && item.count >= minimumSupport)
    .flatMap((item): DiversionCandidate[] => {
      const distanceKm = latitude !== undefined && longitude !== undefined
        ? haversineKm(latitude, longitude, item.latitude, item.longitude)
        : 12.5;
      if (distanceKm > maximumDistanceKm) return [];
      const historicalSafety = 1 - Math.min(1, item.average_tis / 100);
      const candidateHotspotSafety = 1 - Math.min(1, Math.max(0, item.average_hotspot_density));
      const eventHotspotRelief = Math.max(0, Math.min(1, clusterRisk) - item.average_hotspot_density);
      const hotspotSafety = candidateHotspotSafety * 0.7 + eventHotspotRelief * 0.3;
      const zoneRelief = 1 - zoneDensity;
      const closureResilience = closure
        ? 1 - Math.min(1, item.closure_rate)
        : 0.5 + (1 - Math.min(1, item.closure_rate)) * 0.5;
      const proximity = 1 - Math.min(1, distanceKm / 25);
      const stability = 1 - Math.min(1, item.tis_standard_deviation / 20);
      const candidateScore = 100 * (
        historicalSafety * 0.35
        + hotspotSafety * 0.2
        + zoneRelief * 0.1
        + closureResilience * 0.15
        + proximity * 0.1
        + stability * 0.1
      );
      const riskReduction = affectedRisk > 0
        ? ((affectedRisk - item.average_tis) / affectedRisk) * 100
        : 0;
      return [{
        ...item,
        diversion_score: Number(candidateScore.toFixed(1)),
        risk_reduction_percentage: Number(riskReduction.toFixed(1)),
        distance_km: Number(distanceKm.toFixed(1))
      }];
    })
    .sort((a, b) => (b.diversion_score ?? 0) - (a.diversion_score ?? 0));
  const primary = ranked[0];
  const secondary = ranked[1];
  if (!primary) {
    return {
      type: "diversion_plan",
      message: `No eligible same-zone corridor has at least ${minimumSupport} records within ${maximumDistanceKm} km.`,
      avoid_corridor: corridor,
      primary_diversion_corridor: null,
      secondary_diversion_corridor: null,
      estimated_congestion_reduction: 0,
      diversion_confidence_score: 0,
      before_diversion_score: score,
      after_diversion_score: score,
      rationale: [`Candidates require at least ${minimumSupport} historical records and must be within ${maximumDistanceKm} km.`],
      candidate_corridors: []
    };
  }
  const riskReduction = primary.risk_reduction_percentage ?? 0;
  const estimatedReduction = riskReduction > 0
    ? Math.min(35, Math.max(0, riskReduction * 0.65 + (closure ? 3 : 0)))
    : 0;
  const supportScore = Math.min(1, primary.count / 100);
  const stabilityScore = 1 - Math.min(1, primary.tis_standard_deviation / 20);
  const riskAdvantage = Math.max(0, Math.min(1, riskReduction / 40));
  const hotspotQuality = 1 - Math.min(1, primary.average_hotspot_density);
  const closureQuality = 1 - Math.min(1, primary.closure_rate);
  const proximityQuality = 1 - Math.min(1, (primary.distance_km ?? maximumDistanceKm) / maximumDistanceKm);
  const candidateQuality = riskAdvantage * 0.6
    + (hotspotQuality * 0.35 + closureQuality * 0.35 + proximityQuality * 0.3) * 0.4;
  const confidence = Math.min(95, Math.max(0,
    100 * (supportScore * 0.4 + stabilityScore * 0.3 + candidateQuality * 0.3)
  ));
  const riskRationale = riskReduction >= 0
    ? `Selected because corridor risk is ${riskReduction.toFixed(1)}% lower than affected corridor.`
    : `Selected on composite resilience despite corridor risk being ${Math.abs(riskReduction).toFixed(1)}% higher than affected corridor.`;
  return {
    type: "diversion_plan",
    message: `Route traffic primarily via ${primary.corridor}${secondary ? `, with ${secondary.corridor} as secondary relief` : ""}.`,
    avoid_corridor: corridor,
    primary_diversion_corridor: primary.corridor,
    secondary_diversion_corridor: secondary?.corridor ?? null,
    estimated_congestion_reduction: Number(estimatedReduction.toFixed(1)),
    diversion_confidence_score: Number(confidence.toFixed(1)),
    before_diversion_score: score,
    after_diversion_score: Number((score * (1 - estimatedReduction / 100)).toFixed(1)),
    rationale: [
      riskRationale,
      `Candidate has ${primary.count} historical records, TIS deviation ${primary.tis_standard_deviation.toFixed(1)}, and lies ${primary.distance_km?.toFixed(1)} km away.`,
      `Confidence ${confidence.toFixed(1)}% is derived independently from support, stability, and candidate quality.`
    ],
    candidate_corridors: ranked.slice(0, 3)
  };
}

function recommendation(
  score: number,
  closure: boolean,
  corridor: string,
  zone: string,
  context: ScoringContext,
  attendance: number,
  durationHours: number,
  clusterRisk: number,
  latitude?: number,
  longitude?: number,
  endLatitude?: number | null,
  endLongitude?: number | null
): ResourceRecommendation {
  const risk = category(score);
  const safeAttendance = Math.max(0, Math.round(attendance));
  const safeDuration = Math.min(72, Math.max(0, durationHours));
  const attendanceOfficers = Math.ceil(safeAttendance / 500);
  const impactOfficers = Math.ceil(score / 20);
  const closureOfficers = closure ? 4 : 0;
  const durationOfficers = Math.ceil(safeDuration / 8);
  const officers = Math.min(80, Math.max(2, 1 + attendanceOfficers + impactOfficers + closureOfficers + durationOfficers));
  const severityBarricades: Record<RiskCategory, number> = { Low: 0, Medium: 1, High: 3, Critical: 5 };
  const attendanceBarricades = Math.ceil(safeAttendance / 1000);
  const closureBarricades = closure ? 3 : 0;
  const hotspotBarricades = Math.ceil(Math.min(1, Math.max(0, clusterRisk)) * 4);
  const barricades = Math.min(40, attendanceBarricades + closureBarricades + severityBarricades[risk] + hotspotBarricades);
  const responsePriority: Record<RiskCategory, string> = {
    Low: "Monitor",
    Medium: "Scheduled deployment",
    High: "Priority intervention",
    Critical: "Immediate intervention"
  };
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
    officers,
    barricades,
    patrol_units: Math.max(1, Math.ceil(officers / 6)),
    response_priority: responsePriority[risk],
    risk_category: risk,
    officer_allocation_rationale: [
      `${safeAttendance.toLocaleString("en-IN")} expected attendees require ${attendanceOfficers} attendance-based officer units.`,
      `TIS ${score.toFixed(1)} and ${safeDuration.toFixed(1)} hours add ${impactOfficers + durationOfficers} operational officer units.`,
      closure ? "Road closure adds 4 traffic-control officers." : "No closure-specific officers are added."
    ],
    barricade_allocation_rationale: [
      `${safeAttendance.toLocaleString("en-IN")} expected attendees require ${attendanceBarricades} attendance-based barricade units.`,
      `${risk} severity and hotspot exposure add ${severityBarricades[risk] + hotspotBarricades} barricade units.`,
      closure ? "Road closure adds 3 perimeter barricades." : "No closure-specific barricades are added."
    ],
    allocation_explanation: [
      `${safeAttendance.toLocaleString("en-IN")} expected attendees add ${attendanceOfficers} officer units and ${attendanceBarricades} barricade units.`,
      `TIS ${score.toFixed(1)} adds ${impactOfficers} officer units; ${risk.toLowerCase()} severity adds ${severityBarricades[risk]} barricade units.`,
      closure
        ? "Road closure adds 4 officers and 3 barricades."
        : "No road closure increment is applied.",
      `${safeDuration.toFixed(1)} hours adds ${durationOfficers} officer units.`,
      `Hotspot risk ${(Math.min(1, Math.max(0, clusterRisk)) * 100).toFixed(0)}% adds ${hotspotBarricades} barricade units.`
    ],
    barricade_points: barricadePoints,
    diversion_advisory: diversionPlan(corridor, zone, score, closure, clusterRisk, context, latitude, longitude)
  };
}

function interventionAnalysis(
  score: number,
  closure: boolean,
  recommendation: ResourceRecommendation
): InterventionAnalysis {
  const plan = recommendation.diversion_advisory;
  const diversionTis = plan.after_diversion_score;
  const diversionOfficers = Math.max(2, Math.ceil(recommendation.officers * 0.25));
  const diversionPatrols = Math.max(1, Math.ceil(recommendation.patrol_units * 0.5));
  const barricadeOfficers = Math.max(diversionOfficers, Math.ceil(recommendation.officers * 0.6));
  const barricadeEffect = Math.min(12, recommendation.barricades * 0.6 + (closure ? 2 : 0));
  const barricadeTis = Number((diversionTis * (1 - barricadeEffect / 100)).toFixed(1));
  const additionalOfficerEffect = Math.min(10,
    Math.max(0, recommendation.officers - diversionOfficers) * 0.2 + recommendation.patrol_units * 0.5
  );
  const fullInterventionTis = Number((barricadeTis * (1 - additionalOfficerEffect / 100)).toFixed(1));
  const reduction = (projectedTis: number) => Number((score > 0 ? ((score - projectedTis) / score) * 100 : 0).toFixed(1));
  const scenarios: InterventionScenario[] = [
    {
      id: "no_intervention",
      name: "No Intervention",
      projected_tis: score,
      projected_resources: { officers: 0, barricades: 0, patrol_units: 0 },
      estimated_operational_risk_reduction: 0,
      rationale: ["Establishes the untreated operational-risk baseline."]
    },
    {
      id: "diversion_only",
      name: "Diversion Only",
      projected_tis: diversionTis,
      projected_resources: { officers: diversionOfficers, barricades: 0, patrol_units: diversionPatrols },
      estimated_operational_risk_reduction: reduction(diversionTis),
      rationale: [
        plan.primary_diversion_corridor
          ? `Uses ${plan.primary_diversion_corridor} to reduce corridor pressure without perimeter control.`
          : "No qualified diversion is available, so projected TIS remains at baseline."
      ]
    },
    {
      id: "diversion_barricades",
      name: "Diversion + Barricades",
      projected_tis: barricadeTis,
      projected_resources: {
        officers: barricadeOfficers,
        barricades: recommendation.barricades,
        patrol_units: diversionPatrols
      },
      estimated_operational_risk_reduction: reduction(barricadeTis),
      rationale: [`Adds ${recommendation.barricades} barricades for access control and conflict-point protection.`]
    },
    {
      id: "full_intervention",
      name: "Diversion + Barricades + Additional Officers",
      projected_tis: fullInterventionTis,
      projected_resources: {
        officers: recommendation.officers,
        barricades: recommendation.barricades,
        patrol_units: recommendation.patrol_units
      },
      estimated_operational_risk_reduction: reduction(fullInterventionTis),
      rationale: [`Deploys the full ${recommendation.officers}-officer recommendation to manage crossings, queues, and diversion compliance.`]
    }
  ];
  const best = [...scenarios].sort((a, b) => a.projected_tis - b.projected_tis)[0];
  return {
    scenarios,
    best_scenario: best.id,
    best_scenario_name: best.name,
    improvement_percentage: best.estimated_operational_risk_reduction,
    rationale: [
      `${best.name} is selected because it produces the lowest projected TIS (${best.projected_tis.toFixed(1)}).`,
      `The modeled improvement is ${best.estimated_operational_risk_reduction.toFixed(1)}% versus no intervention.`,
      ...best.rationale
    ]
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
  const expectedAttendance = Math.max(0, Math.round(request.expectedAttendance ?? baseEvent?.expected_attendance ?? 0));
  const latitude = request.latitude ?? baseEvent?.latitude;
  const longitude = request.longitude ?? baseEvent?.longitude;

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
  const computedRecommendation = recommendation(
    score,
    closure,
    corridor,
    zone,
    context,
    expectedAttendance,
    durationHours,
    clusterRisk,
    latitude,
    longitude,
    baseEvent?.end_latitude,
    baseEvent?.end_longitude
  );
  return {
    event_id: baseEvent?.id || request.eventId || null,
    baseline_score: baseEvent?.traffic_impact_score ?? null,
    traffic_impact_score: score,
    risk_category: category(score),
    expected_attendance: expectedAttendance,
    event_scale: eventScale(expectedAttendance),
    score_components: components,
    explanation: explanation(components),
    recommendation: computedRecommendation,
    intervention_analysis: interventionAnalysis(score, closure, computedRecommendation)
  };
}
