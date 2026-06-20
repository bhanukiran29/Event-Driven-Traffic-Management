export type RiskCategory = "Critical" | "High" | "Medium" | "Low";
export type EventScale = "Small" | "Medium" | "Large" | "Mega";

export type ScoreComponent = {
  name: string;
  value: number;
  weight: number;
  contribution: number;
};

export type ResourceRecommendation = {
  officers: number;
  barricades: number;
  patrol_units: number;
  response_priority: string;
  risk_category: RiskCategory;
  allocation_explanation: string[];
  barricade_points: Array<{
    label: string;
    latitude: number;
    longitude: number;
  }>;
  diversion_advisory: {
    type: string;
    message: string;
    avoid_corridor: string;
    candidate_corridors: Array<{
      corridor: string;
      average_tis: number;
      count: number;
    }>;
  };
};

export type EventRecord = {
  id: string;
  event_type: string;
  expected_attendance: number;
  venue_capacity: number;
  event_scale: EventScale;
  latitude: number;
  longitude: number;
  end_latitude: number | null;
  end_longitude: number | null;
  address: string;
  end_address: string | null;
  event_cause: string;
  requires_road_closure: boolean;
  start_datetime: string;
  start_date: string;
  start_hour: number;
  start_day: string;
  start_month: string;
  status: string;
  authenticated: string;
  description: string;
  veh_type: string;
  veh_no: string;
  corridor: string;
  priority: string;
  police_station: string;
  kgid: string;
  zone: string;
  junction: string;
  event_duration_hours: number;
  duration_source: string;
  spatial_cluster_id: number;
  cluster_risk: number;
};

export type RiskEvent = EventRecord & {
  traffic_impact_score: number;
  risk_category: RiskCategory;
  score_components: ScoreComponent[];
  explanation: string[];
  recommendation: ResourceRecommendation;
};

export type HotspotCluster = {
  id: number;
  latitude: number;
  longitude: number;
  count: number;
  average_tis: number;
  risk_category: RiskCategory;
  top_cause: string;
  top_corridor: string;
  top_police_station: string;
};

export type SummaryMetric = {
  total_events: number;
  road_closures: number;
  high_risk_events: number;
  critical_events: number;
  active_events: number;
  average_tis: number;
  planned_events: number;
  unplanned_events: number;
};

export type SummaryPayload = {
  generated_at: string;
  data_source: string;
  honesty_notice: string;
  data_quality: {
    raw_rows: number;
    processed_rows: number;
    dropped_columns_over_95_missing: string[];
    duration_source_counts: Record<string, number>;
    date_range: { start: string; end: string };
  };
  metrics: SummaryMetric;
  risk_bands: Array<{ name: RiskCategory; count: number; percentage: number }>;
  top_causes: Array<{ name: string; count: number }>;
  top_corridors: Array<{ name: string; count: number }>;
  top_zones: Array<{ name: string; count: number; average_tis: number }>;
  top_police_stations: Array<{ name: string; count: number; average_tis: number }>;
  monthly_trend: Array<{ month: string; events: number; closures: number; average_tis: number }>;
  hourly_risk: Array<{ hour: number; events: number; average_tis: number }>;
  day_risk: Array<{ day: string; events: number; average_tis: number }>;
  score_weights: Array<{ name: string; weight: number }>;
  feature_importance: Array<{ feature: string; average_contribution: number; weight: number }>;
  model_comparison: Array<{
    model: string;
    role: string;
    fit_status: string;
    r2: number | null;
    mae: number | null;
    rmse?: number | null;
  }>;
  top_risk_events: RiskEvent[];
};

export type HotspotsPayload = {
  clusters: HotspotCluster[];
  heatmap_points: Array<{
    id: string;
    latitude: number;
    longitude: number;
    weight: number;
    risk_category: RiskCategory;
  }>;
  corridor_hotspots: Array<{ name: string; count: number; average_tis: number }>;
  zone_hotspots: Array<{ name: string; count: number; average_tis: number }>;
  police_station_hotspots: Array<{ name: string; count: number; average_tis: number }>;
};

export type ScoringContext = {
  weights: Record<string, number>;
  cause_risk: Record<string, number>;
  corridor_density: Record<string, number>;
  zone_density: Record<string, number>;
  junction_density: Record<string, number>;
  police_density: Record<string, number>;
  hour_risk: Record<string, number>;
  day_risk: Record<string, number>;
  priority_risk: Record<string, number>;
  risk_thresholds: Record<RiskCategory, number>;
  zone_corridor_advisories: Record<
    string,
    Array<{ corridor: string; average_tis: number; count: number }>
  >;
};

export type SimulationRequest = {
  eventId?: string;
  eventCause?: string;
  requiresRoadClosure?: boolean;
  priority?: string;
  durationHours?: number;
  corridor?: string;
  zone?: string;
  junction?: string;
  policeStation?: string;
  startHour?: number;
  startDay?: string;
  clusterRisk?: number;
  expectedAttendance?: number;
};

export type SimulationResult = {
  event_id: string | null;
  baseline_score: number | null;
  traffic_impact_score: number;
  risk_category: RiskCategory;
  expected_attendance: number;
  event_scale: EventScale;
  score_components: ScoreComponent[];
  explanation: string[];
  recommendation: ResourceRecommendation;
};

export type CopilotResponse = {
  answer: string;
  supporting_facts: string[];
};
