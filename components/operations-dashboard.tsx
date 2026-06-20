"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  Brain,
  Gauge,
  Layers,
  Sparkles,
  SlidersHorizontal,
  X
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { CityMap } from "@/components/city-map";
import type {
  CopilotResponse,
  HotspotsPayload,
  RiskCategory,
  RiskEvent,
  SimulationResult,
  SummaryPayload
} from "@/lib/types";

type EventsPayload = {
  total: number;
  returned: number;
  events: RiskEvent[];
};

type ViewId =
  | "executive"
  | "map"
  | "risk"
  | "hotspots"
  | "resources"
  | "simulator"
  | "explain"
  | "copilot";

const VIEWS: Array<{ id: ViewId; label: string; icon: typeof Activity }> = [
  { id: "executive", label: "Command Center", icon: Gauge },
  { id: "simulator", label: "Simulator", icon: SlidersHorizontal },
  { id: "hotspots", label: "Hotspots", icon: Layers },
  { id: "explain", label: "Explainability", icon: Brain }
];

const ATTENDANCE_DEFAULTS: Record<string, number> = {
  public_event: 20000,
  procession: 10000,
  protest: 5000,
  vip_movement: 2000,
  congestion: 200,
  others: 100,
  accident: 50,
  construction: 25,
  vehicle_breakdown: 10,
  water_logging: 0,
  tree_fall: 0,
  pot_holes: 0,
  road_conditions: 0,
  debris: 0
};

const RISK_COLORS: Record<RiskCategory, string> = {
  Critical: "#DC2626",
  High: "#D97706",
  Medium: "#CA8A04",
  Low: "#16A34A"
};

const TOOLTIP_STYLE = {
  backgroundColor: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 10,
  color: "#0F172A",
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)"
};

function labelize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format(value);
}

function riskClass(risk: RiskCategory) {
  if (risk === "Critical") return "border-red-200 bg-red-50 text-red-700";
  if (risk === "High") return "border-amber-200 bg-amber-50 text-amber-700";
  if (risk === "Medium") return "border-yellow-200 bg-yellow-50 text-yellow-700";
  return "border-green-200 bg-green-50 text-green-700";
}

function Panel({
  title,
  kicker,
  children,
  action
}: {
  title: string;
  kicker?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          {kicker ? (
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-400">{kicker}</div>
          ) : null}
          <h2 className="text-[15px] font-semibold tracking-tight text-gray-900">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function KpiChip({
  label,
  value,
  dotColor
}: {
  label: string;
  value: string | number;
  dotColor: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-full border border-gray-200 bg-gray-50 px-4 py-2">
      <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: dotColor }} />
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-gray-900">{value}</span>
    </div>
  );
}

// Legacy MetricCard kept for any views not yet refactored
function MetricCard({
  label,
  value,
  tone,
  icon: Icon
}: {
  label: string;
  value: string | number;
  tone: string;
  icon: typeof Activity;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">{label}</span>
        <Icon className={tone} size={16} />
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-gray-900">{value}</div>
    </div>
  );
}

function RiskBadge({ risk }: { risk: RiskCategory }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${riskClass(risk)}`}>
      {risk}
    </span>
  );
}

function ScoreBreakdown({ event }: { event: RiskEvent }) {
  return (
    <div className="space-y-3">
      {event.score_components.slice(0, 8).map((component) => (
        <div key={component.name}>
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-gray-500">{component.name}</span>
            <span className="font-semibold tabular-nums text-gray-900">{component.contribution}</span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-100">
            <div
              className="h-1.5 rounded-full bg-blue-500"
              style={{ width: `${Math.min(100, (component.contribution / 15) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// Card-based event list replacing the old table
function EventList({ events, onSelect, selectedId }: { events: RiskEvent[]; onSelect?: (id: string) => void; selectedId?: string }) {
  return (
    <div className="space-y-2">
      {events.map((event) => (
        <button
          key={event.id}
          onClick={() => onSelect?.(event.id)}
          className={`w-full rounded-xl border p-3.5 text-left transition-all ${
            selectedId === event.id
              ? "border-blue-200 bg-blue-50"
              : "border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50"
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-mono text-[12px] font-medium text-gray-900">{event.id}</div>
              <div className="mt-0.5 truncate text-xs text-gray-400">{labelize(event.event_cause)} · {event.corridor}</div>
            </div>
            <div className="flex flex-shrink-0 flex-col items-end gap-1">
              <RiskBadge risk={event.risk_category} />
              <span className="text-sm font-semibold tabular-nums text-gray-700">TIS {event.traffic_impact_score}</span>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-3 text-[11px] text-gray-400">
            <span>{event.police_station}</span>
            <span>·</span>
            <span>{event.recommendation.officers} officers</span>
          </div>
        </button>
      ))}
    </div>
  );
}

// Keep legacy EventTable for any view still using it
function EventTable({ events, compact = false }: { events: RiskEvent[]; compact?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-[0.08em] text-gray-400">
            <th className="border-b border-gray-100 px-3 py-2.5">Event</th>
            <th className="border-b border-gray-100 px-3 py-2.5">TIS</th>
            <th className="border-b border-gray-100 px-3 py-2.5">Risk</th>
            <th className="border-b border-gray-100 px-3 py-2.5">Cause</th>
            {!compact ? <th className="border-b border-gray-100 px-3 py-2.5">Corridor</th> : null}
            {!compact ? <th className="border-b border-gray-100 px-3 py-2.5">Station</th> : null}
            <th className="border-b border-gray-100 px-3 py-2.5">Officers</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id} className="hover:bg-gray-50">
              <td className="border-b border-gray-50 px-3 py-2.5 font-mono text-xs font-medium text-gray-900">{event.id}</td>
              <td className="border-b border-gray-50 px-3 py-2.5 font-semibold tabular-nums text-blue-600">{event.traffic_impact_score}</td>
              <td className="border-b border-gray-50 px-3 py-2.5"><RiskBadge risk={event.risk_category} /></td>
              <td className="border-b border-gray-50 px-3 py-2.5 text-gray-500">{labelize(event.event_cause)}</td>
              {!compact ? <td className="border-b border-gray-50 px-3 py-2.5 text-gray-500">{event.corridor}</td> : null}
              {!compact ? <td className="border-b border-gray-50 px-3 py-2.5 text-gray-500">{event.police_station}</td> : null}
              <td className="border-b border-gray-50 px-3 py-2.5 font-medium text-gray-700">{event.recommendation.officers}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SelectControl({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="grid gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm normal-case tracking-normal text-gray-900 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option === "all" ? "All" : labelize(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

// Operational Risk Index — SVG arc gauge
function RiskGauge({ score }: { score: number }) {
  const clampedScore = Math.max(0, Math.min(100, score));
  const radius = 70;
  const cx = 110;
  const cy = 100;
  const startAngle = -200;
  const endAngle = 20;
  const totalArc = endAngle - startAngle;
  const filledArc = (clampedScore / 100) * totalArc;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const arcPath = (start: number, end: number, r: number) => {
    const x1 = cx + r * Math.cos(toRad(start));
    const y1 = cy + r * Math.sin(toRad(start));
    const x2 = cx + r * Math.cos(toRad(end));
    const y2 = cy + r * Math.sin(toRad(end));
    const largeArc = Math.abs(end - start) > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
  };
  const riskColor = clampedScore >= 80 ? "#DC2626" : clampedScore >= 65 ? "#D97706" : clampedScore >= 45 ? "#CA8A04" : "#16A34A";
  const riskLabel = clampedScore >= 80 ? "Critical" : clampedScore >= 65 ? "High" : clampedScore >= 45 ? "Elevated" : "Low";
  return (
    <div className="flex flex-col items-center py-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-400 mb-2">Operational Risk Index</div>
      <svg width="220" height="130" viewBox="0 0 220 130" role="img" aria-label={`Operational Risk Index: ${clampedScore}`}>
        {/* Track */}
        <path d={arcPath(startAngle, endAngle, radius)} fill="none" stroke="#F3F4F6" strokeWidth="12" strokeLinecap="round" />
        {/* Fill */}
        <path d={arcPath(startAngle, startAngle + filledArc, radius)} fill="none" stroke={riskColor} strokeWidth="12" strokeLinecap="round" />
        {/* Score number */}
        <text x={cx} y={cy + 8} textAnchor="middle" fontSize="36" fontWeight="700" fill="#0F172A" fontFamily="var(--font-inter,system-ui)">{clampedScore}</text>
        <text x={cx} y={cy + 28} textAnchor="middle" fontSize="11" fill={riskColor} fontFamily="var(--font-inter,system-ui)" fontWeight="600">{riskLabel} Risk</text>
        {/* Band labels */}
        <text x="28" y="118" fontSize="9" fill="#9CA3AF" fontFamily="var(--font-inter,system-ui)">Low</text>
        <text x="92" y="28" fontSize="9" fill="#9CA3AF" fontFamily="var(--font-inter,system-ui)">Med</text>
        <text x="178" y="118" fontSize="9" fill="#9CA3AF" fontFamily="var(--font-inter,system-ui)">Critical</text>
      </svg>
    </div>
  );
}

export function OperationsDashboard() {
  const [activeView, setActiveView] = useState<ViewId>("executive");
  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [events, setEvents] = useState<RiskEvent[]>([]);
  const [hotspots, setHotspots] = useState<HotspotsPayload | null>(null);
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [zoneFilter, setZoneFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [simDuration, setSimDuration] = useState(2);
  const [simAttendance, setSimAttendance] = useState(250);
  const [simPriority, setSimPriority] = useState("High");
  const [simClosure, setSimClosure] = useState(false);
  const [simCause, setSimCause] = useState("vehicle_breakdown");
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [copilotQuestion, setCopilotQuestion] = useState("Summarize citywide traffic risks.");
  const [copilotResponse, setCopilotResponse] = useState<CopilotResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const [summaryResponse, eventsResponse, hotspotsResponse] = await Promise.all([
        fetch("/api/summary"),
        fetch("/api/events?limit=1200"),
        fetch("/api/hotspots")
      ]);
      const nextSummary = (await summaryResponse.json()) as SummaryPayload;
      const nextEvents = (await eventsResponse.json()) as EventsPayload;
      const nextHotspots = (await hotspotsResponse.json()) as HotspotsPayload;
      setSummary(nextSummary);
      setEvents(nextEvents.events);
      setHotspots(nextHotspots);
      setSelectedEventId(nextSummary.top_risk_events[0]?.id || nextEvents.events[0]?.id || "");
      setLoading(false);
    }
    loadData().catch(() => setLoading(false));
  }, []);

  const selectedEvent = useMemo(() => {
    return events.find((event) => event.id === selectedEventId) || summary?.top_risk_events[0] || events[0];
  }, [events, selectedEventId, summary]);

  useEffect(() => {
    if (!selectedEvent) {
      return;
    }
    setSimDuration(Math.min(72, Math.max(0, Math.round(selectedEvent.event_duration_hours * 10) / 10)));
    setSimAttendance(selectedEvent.expected_attendance);
    setSimPriority(selectedEvent.priority);
    setSimClosure(selectedEvent.requires_road_closure);
    setSimCause(selectedEvent.event_cause);
    setSimulationResult(null);
  }, [selectedEvent?.id]);

  const zones = useMemo(() => ["all", ...(summary?.top_zones.map((zone) => zone.name) || [])], [summary]);
  const causes = useMemo(() => ["vehicle_breakdown", "construction", "accident", "water_logging", "tree_fall", "public_event", "procession", "vip_movement", "protest", "congestion", "pot_holes", "road_conditions", "debris", "others"], []);
  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const riskOk = riskFilter === "all" || event.risk_category === riskFilter;
      const zoneOk = zoneFilter === "all" || event.zone === zoneFilter;
      const queryOk = !query || [event.id, event.event_cause, event.corridor, event.zone, event.police_station, event.address]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase());
      return riskOk && zoneOk && queryOk;
    });
  }, [events, query, riskFilter, zoneFilter]);

  async function runSimulation() {
    if (!selectedEvent) {
      return;
    }
    const response = await fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: selectedEvent.id,
        eventCause: simCause,
        requiresRoadClosure: simClosure,
        priority: simPriority,
        durationHours: simDuration,
        expectedAttendance: simAttendance,
        latitude: selectedEvent.latitude,
        longitude: selectedEvent.longitude,
        corridor: selectedEvent.corridor,
        zone: selectedEvent.zone,
        junction: selectedEvent.junction,
        policeStation: selectedEvent.police_station,
        startHour: selectedEvent.start_hour,
        startDay: selectedEvent.start_day,
        clusterRisk: selectedEvent.cluster_risk
      })
    });
    setSimulationResult((await response.json()) as SimulationResult);
  }

  async function askCopilot(question = copilotQuestion) {
    setCopilotQuestion(question);
    const response = await fetch("/api/copilot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question })
    });
    setCopilotResponse((await response.json()) as CopilotResponse);
  }

  // Derived risk index (0-100) for the gauge
  const operationalRiskScore = useMemo(() => {
    if (!summary) return 0;
    const m = summary.metrics;
    const criticalWeight = m.total_events > 0 ? (m.critical_events / m.total_events) * 40 : 0;
    const highWeight = m.total_events > 0 ? (m.high_risk_events / m.total_events) * 30 : 0;
    const tisWeight = Math.min(30, (m.average_tis / 100) * 30);
    return Math.round(criticalWeight + highWeight + tisWeight);
  }, [summary]);

  const [copilotOpen, setCopilotOpen] = useState(false);

  if (loading || !summary || !hotspots) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-blue-500" />
          <div className="text-sm text-gray-400">Loading Event-Driven Traffic Management...</div>
        </div>
      </div>
    );
  }

  const metrics = summary.metrics;
  const mapEvents = filteredEvents.slice(0, 800);
  const resourceEvents = filteredEvents.filter((event) => event.risk_category === "High" || event.risk_category === "Critical").slice(0, 9);
  const displayEvent = selectedEvent || summary.top_risk_events[0];

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50">
      {/* ── Top Bar ─────────────────────────────────────────── */}
      <header className="flex h-[52px] flex-shrink-0 items-center justify-between border-b border-gray-200 bg-white px-5 shadow-sm">
        <div className="flex items-center gap-3">
          {/* Logomark: two stacked squares */}
          <div className="flex flex-col gap-0.5" aria-hidden>
            <div className="flex gap-0.5">
              <div className="h-2.5 w-2.5 rounded-sm bg-blue-600" />
              <div className="h-2.5 w-2.5 rounded-sm bg-red-500" />
            </div>
            <div className="flex gap-0.5">
              <div className="h-2.5 w-2.5 rounded-sm bg-amber-500" />
              <div className="h-2.5 w-2.5 rounded-sm bg-green-500" />
            </div>
          </div>
          <div>
            <div className="text-[13px] font-semibold tracking-tight text-gray-900">Event-Driven Traffic Management</div>
            <div className="text-[11px] text-gray-400">Bengaluru · Operational Intelligence</div>
          </div>
        </div>
        {/* KPI chips */}
        <div className="flex items-center gap-2">
          <KpiChip label="Events" value={compactNumber(metrics.total_events)} dotColor="#3B82F6" />
          <KpiChip label="Critical" value={compactNumber(metrics.critical_events)} dotColor="#DC2626" />
          <KpiChip label="Active" value={compactNumber(metrics.active_events)} dotColor="#16A34A" />
          <KpiChip label="Avg TIS" value={metrics.average_tis} dotColor="#9CA3AF" />
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left Sidebar ─────────────────────────────────── */}
        <nav className="flex w-[72px] flex-shrink-0 flex-col border-r border-gray-200 bg-white" aria-label="Main navigation">
          {/* Primary modes */}
          <div className="flex flex-col gap-1 px-2 pt-4 pb-2">
            {VIEWS.map((view) => {
              const Icon = view.icon;
              const active = activeView === view.id;
              return (
                <button
                  key={view.id}
                  onClick={() => setActiveView(view.id)}
                  aria-label={view.label}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 px-1 transition-all w-full ${
                    active
                      ? "bg-blue-50 text-blue-600"
                      : "text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-blue-600" />
                  )}
                  <Icon size={16} />
                  <span className="text-[9px] font-medium leading-none text-center">{view.label}</span>
                </button>
              );
            })}
          </div>
          {/* Divider + Copilot — always visible, pinned below modes */}
          <div className="px-2 pb-4">
            <div className="h-px bg-gray-100 mb-2" />
            <button
              onClick={() => setCopilotOpen(true)}
              aria-label="Open Copilot"
              className={`relative flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 px-1 transition-all w-full ${
                copilotOpen
                  ? "bg-blue-50 text-blue-600"
                  : "text-gray-400 hover:bg-blue-50 hover:text-blue-600"
              }`}
            >
              <Sparkles size={16} />
              <span className="text-[9px] font-medium leading-none">Copilot</span>
            </button>
          </div>
        </nav>

        {/* ── Main Canvas ───────────────────────────────────── */}
        <div className="relative flex flex-1 overflow-hidden">
          {/* Persistent map — always rendered, opacity changes by mode */}
          <motion.div
            className="absolute inset-0"
            animate={{ opacity: activeView === "explain" ? 0.35 : 1 }}
            transition={{ duration: 0.3 }}
          >
            <CityMap
              events={mapEvents}
              clusters={hotspots.clusters}
              heatmapPoints={hotspots.heatmap_points}
              mode={activeView === "hotspots" ? "hotspots" : "events"}
            />
          </motion.div>

          {/* Floating map controls (bottom-left) */}
          {activeView !== "explain" && (
            <div className="absolute bottom-6 left-6 z-10 flex flex-col gap-2">
              {/* Risk filter pills */}
              <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white/95 p-1.5 shadow-raised backdrop-blur-sm">
                {(["all", "Critical", "High", "Medium", "Low"] as const).map((level) => {
                  const isAll = level === "all";
                  const active = riskFilter === level;
                  const color = isAll ? undefined : RISK_COLORS[level as RiskCategory];
                  return (
                    <button
                      key={level}
                      onClick={() => setRiskFilter(level)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                        active
                          ? isAll
                            ? "bg-gray-900 text-white"
                            : "text-white"
                          : "text-gray-500 hover:bg-gray-100"
                      }`}
                      style={active && !isAll ? { backgroundColor: color } : undefined}
                    >
                      {level === "all" ? "All" : level}
                    </button>
                  );
                })}
              </div>
              {/* Zone select */}
              <select
                value={zoneFilter}
                onChange={(e) => setZoneFilter(e.target.value)}
                className="h-9 rounded-xl border border-gray-200 bg-white/95 px-3 text-xs text-gray-700 shadow-raised backdrop-blur-sm outline-none focus:border-blue-400"
              >
                {zones.map((z) => (
                  <option key={z} value={z}>{z === "all" ? "All Zones" : z}</option>
                ))}
              </select>
            </div>
          )}

          {/* ── Right Drawer ──────────────────────────────────── */}
          <div
            className={`absolute right-0 top-0 z-10 h-full overflow-y-auto border-l border-gray-200 bg-white shadow-overlay transition-all ${
              activeView === "simulator" ? "w-[38%] min-w-[380px]" : "w-[360px]"
            }`}
          >

          {/* ── Command Center Drawer ─────────────────────── */}
            {activeView === "executive" && (
              <div className="flex flex-col gap-0">
                {/* Risk Gauge hero */}
                <div className="border-b border-gray-100 p-5">
                  <RiskGauge score={operationalRiskScore} />
                </div>

                {/* Critical events */}
                <div className="border-b border-gray-100 p-5">
                  <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">Requires Attention</div>
                  <div className="space-y-2">
                    {summary.top_risk_events.slice(0, 3).map((event) => (
                      <div key={event.id} className="rounded-xl border border-red-100 bg-red-50 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-mono text-[12px] font-medium text-gray-900">{event.id}</div>
                            <div className="mt-0.5 text-xs text-gray-500">{labelize(event.event_cause)}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold tabular-nums text-red-600">{event.traffic_impact_score}</div>
                            <div className="text-[10px] text-gray-400">TIS</div>
                          </div>
                        </div>
                        <div className="mt-2 text-[11px] text-gray-400">{event.corridor} · {event.recommendation.officers} officers</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Risk distribution */}
                <div className="border-b border-gray-100 p-5">
                  <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">Risk Distribution</div>
                  <div className="h-[120px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={summary.risk_bands} barSize={32}>
                        <CartesianGrid stroke="#F3F4F6" vertical={false} />
                        <XAxis dataKey="name" stroke="#9CA3AF" fontSize={11} tickLine={false} />
                        <YAxis stroke="#9CA3AF" fontSize={11} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                          {summary.risk_bands.map((entry) => (
                            <Cell key={entry.name} fill={RISK_COLORS[entry.name]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Monthly trend */}
                <div className="border-b border-gray-100 p-5">
                  <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">Monthly Event Trend</div>
                  <div className="h-[90px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={summary.monthly_trend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                        <CartesianGrid stroke="#F3F4F6" vertical={false} />
                        <XAxis dataKey="month" stroke="#9CA3AF" fontSize={10} tickLine={false} />
                        <YAxis stroke="#9CA3AF" fontSize={10} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                        <Area type="monotone" dataKey="events" stroke="#3B82F6" fill="#EFF6FF" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Top causes */}
                <div className="p-5">
                  <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">Top Causes</div>
                  <div className="space-y-2">
                    {summary.top_causes.slice(0, 5).map((item, i) => {
                      const maxCount = summary.top_causes[0]?.count || 1;
                      const pct = Math.round((item.count / maxCount) * 100);
                      const colors = ["#3B82F6", "#D97706", "#DC2626", "#16A34A", "#6366F1"];
                      return (
                        <div key={item.name}>
                          <div className="mb-1 flex items-center justify-between text-[12px]">
                            <span className="text-gray-600">{labelize(item.name)}</span>
                            <span className="font-semibold tabular-nums text-gray-900">{item.count}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-gray-100">
                            <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: colors[i] }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Event feed */}
                <div className="border-t border-gray-100 p-5">
                  <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">Top Risk Events</div>
                  <EventList
                    events={summary.top_risk_events.slice(0, 6)}
                    onSelect={setSelectedEventId}
                    selectedId={selectedEventId}
                  />
                </div>
              </div>
            )}
            {/* ── Hotspots Drawer ──────────────────────── */}
            {activeView === "hotspots" && (
              <div className="flex flex-col gap-0">
                <div className="border-b border-gray-100 p-5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-1">Cluster Intelligence</div>
                  <div className="text-[13px] text-gray-500">{hotspots.clusters.length} spatial clusters · DBSCAN 750m</div>
                </div>
                <div className="p-4 space-y-2">
                  {hotspots.clusters.slice(0, 14).map((cluster) => (
                    <div key={cluster.id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-card">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-medium text-gray-900 text-sm">Cluster {cluster.id}</div>
                          <div className="text-xs text-gray-400 mt-0.5">{cluster.count} events · {labelize(cluster.top_cause)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold tabular-nums text-gray-900">{cluster.average_tis}</div>
                          <div className="text-[10px] text-gray-400">avg TIS</div>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <RiskBadge risk={cluster.risk_category} />
                        <span className="text-xs text-gray-400 truncate">{cluster.top_corridor}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Simulator Drawer ─────────────────────── */}
            {activeView === "simulator" && (
              <div className="flex flex-col h-full">
                {/* Scenario Builder */}
                <div className="border-b border-gray-100 p-5 flex-shrink-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-3">Scenario</div>
                  <div className="grid gap-3">
                    <SelectControl
                      label="Event"
                      value={selectedEventId}
                      onChange={setSelectedEventId}
                      options={events.slice(0, 40).map((e) => e.id)}
                    />
                    <SelectControl
                      label="Cause"
                      value={simCause}
                      onChange={(value) => {
                        setSimCause(value);
                        setSimAttendance(ATTENDANCE_DEFAULTS[value] ?? simAttendance);
                      }}
                      options={causes}
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <label className="grid gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                        Attendance
                        <input
                          type="number" min={0} max={1000000} step={100}
                          value={simAttendance}
                          onChange={(e) => setSimAttendance(Math.max(0, Number(e.target.value)))}
                          className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        />
                      </label>
                      <label className="grid gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                        Duration (h)
                        <input
                          type="number" min={0} max={72} step={0.5}
                          value={simDuration}
                          onChange={(e) => setSimDuration(Number(e.target.value))}
                          className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        />
                      </label>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                      <span className="text-sm font-medium text-gray-700">Road closure required</span>
                      <button
                        role="switch"
                        aria-checked={simClosure}
                        onClick={() => setSimClosure(!simClosure)}
                        className={`relative h-6 w-11 rounded-full transition-colors ${simClosure ? "bg-blue-600" : "bg-gray-200"}`}
                      >
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${simClosure ? "translate-x-5" : "translate-x-0.5"}`} />
                      </button>
                    </div>
                    <div className="flex gap-2">
                      {["High", "Low"].map((p) => (
                        <button
                          key={p}
                          onClick={() => setSimPriority(p)}
                          className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-all ${
                            simPriority === p
                              ? "border-blue-200 bg-blue-50 text-blue-700"
                              : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                          }`}
                        >
                          {p} Priority
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={runSimulation}
                      className="h-11 w-full rounded-xl bg-blue-600 font-semibold text-white shadow-sm hover:bg-blue-700 active:bg-blue-800 transition-colors"
                    >
                      Run Scenario
                    </button>
                  </div>
                </div>

                {/* Simulation Output */}
                <div className="flex-1 overflow-y-auto">
                  <AnimatePresence mode="wait">
                    {simulationResult ? (
                      <motion.div
                        key="result"
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="p-5 space-y-4"
                      >
                        {/* TIS Hero */}
                        <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-card">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">Scenario TIS</div>
                          <div className="mt-1 flex items-end gap-3">
                            <div className="text-6xl font-bold tabular-nums tracking-tight text-gray-900">
                              {simulationResult.traffic_impact_score}
                            </div>
                            {simulationResult.baseline_score !== null && (
                              <div className={`mb-2 rounded-full px-2.5 py-1 text-xs font-semibold ${
                                simulationResult.traffic_impact_score > simulationResult.baseline_score
                                  ? "bg-red-50 text-red-600"
                                  : "bg-green-50 text-green-600"
                              }`}>
                                {simulationResult.traffic_impact_score > simulationResult.baseline_score ? "▲" : "▼"}
                                {" "}{Math.abs(simulationResult.traffic_impact_score - simulationResult.baseline_score).toFixed(1)}
                              </div>
                            )}
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <RiskBadge risk={simulationResult.risk_category} />
                            <span className="text-xs text-gray-400">{simulationResult.event_scale} · {simulationResult.expected_attendance.toLocaleString("en-IN")} attendees</span>
                          </div>
                        </div>

                        {/* Resource blocks */}
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { label: "Officers", value: simulationResult.recommendation.officers },
                            { label: "Barricades", value: simulationResult.recommendation.barricades },
                            { label: "Patrols", value: simulationResult.recommendation.patrol_units }
                          ].map((stat) => (
                            <div key={stat.label} className="rounded-xl border border-gray-100 bg-white p-3 text-center shadow-card">
                              <div className="text-2xl font-bold tabular-nums text-gray-900">{stat.value}</div>
                              <div className="text-[11px] text-gray-400">{stat.label}</div>
                            </div>
                          ))}
                        </div>

                        {/* Diversion */}
                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-2">Diversion Advisory</div>
                          <div className="grid grid-cols-3 gap-2 text-center mb-3">
                            <div>
                              <div className="text-lg font-bold tabular-nums text-amber-600">{simulationResult.recommendation.diversion_advisory.before_diversion_score}</div>
                              <div className="text-[10px] text-gray-400">Before</div>
                            </div>
                            <div>
                              <div className="text-lg font-bold tabular-nums text-green-600">{simulationResult.recommendation.diversion_advisory.after_diversion_score}</div>
                              <div className="text-[10px] text-gray-400">After</div>
                            </div>
                            <div>
                              <div className="text-lg font-bold tabular-nums text-blue-600">{simulationResult.recommendation.diversion_advisory.estimated_congestion_reduction}%</div>
                              <div className="text-[10px] text-gray-400">Reduction</div>
                            </div>
                          </div>
                          <div className="text-xs text-gray-600 leading-relaxed">{simulationResult.recommendation.diversion_advisory.message}</div>
                        </div>

                        {/* Score breakdown */}
                        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-card">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-3">Score Breakdown</div>
                          <ScoreBreakdown event={{ ...(displayEvent as RiskEvent), score_components: simulationResult.score_components }} />
                        </div>

                        {/* Intervention comparison */}
                        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-card">
                          <div className="flex items-center justify-between mb-3">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">Interventions</div>
                            <div className="text-sm font-semibold text-green-600">{simulationResult.intervention_analysis.improvement_percentage}% best</div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {simulationResult.intervention_analysis.scenarios.map((scenario) => (
                              <div
                                key={scenario.id}
                                className={`rounded-lg border p-3 ${
                                  scenario.id === simulationResult.intervention_analysis.best_scenario
                                    ? "border-green-200 bg-green-50"
                                    : "border-gray-100 bg-white"
                                }`}
                              >
                                <div className="text-xs font-medium text-gray-700 leading-tight">{scenario.name}</div>
                                <div className="mt-1.5 text-2xl font-bold tabular-nums text-gray-900">{scenario.projected_tis}</div>
                                <div className="text-[10px] text-gray-400">{scenario.estimated_operational_risk_reduction}% reduction</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="baseline"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="p-5 space-y-4"
                      >
                        {displayEvent && (
                          <>
                            <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-card">
                              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">Baseline TIS</div>
                              <div className="mt-1 text-6xl font-bold tabular-nums tracking-tight text-gray-900">{displayEvent.traffic_impact_score}</div>
                              <div className="mt-2 flex items-center gap-2">
                                <RiskBadge risk={displayEvent.risk_category} />
                                <span className="text-xs text-gray-400">{labelize(displayEvent.event_cause)}</span>
                              </div>
                            </div>
                            <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-card">
                              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-3">Score Breakdown</div>
                              <ScoreBreakdown event={displayEvent} />
                            </div>
                          </>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )}

            {/* ── Explainability Drawer ─────────────────── */}
            {activeView === "explain" && (
              <div className="p-5 space-y-4">
                <SelectControl label="Event" value={selectedEventId} onChange={setSelectedEventId} options={events.slice(0, 40).map((e) => e.id)} />
                {displayEvent && (
                  <>
                    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-card">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-mono text-[12px] font-medium text-gray-900">{displayEvent.id}</div>
                          <div className="mt-0.5 text-xs text-gray-400">{labelize(displayEvent.event_cause)} · {displayEvent.corridor}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold tabular-nums text-gray-900">{displayEvent.traffic_impact_score}</div>
                          <RiskBadge risk={displayEvent.risk_category} />
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-card">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-3">Score Breakdown</div>
                      <ScoreBreakdown event={displayEvent} />
                    </div>
                    <div className="space-y-1.5">
                      {displayEvent.explanation.map((item) => (
                        <div key={item} className="rounded-lg bg-gray-50 px-3 py-2.5 text-xs text-gray-600 leading-relaxed">{item}</div>
                      ))}
                    </div>
                    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-card">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-3">Global Feature Importance</div>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={summary.feature_importance.slice(0, 8)} layout="vertical" margin={{ left: 8, right: 8 }}>
                            <CartesianGrid stroke="#F3F4F6" horizontal={false} />
                            <XAxis type="number" stroke="#9CA3AF" fontSize={10} tickLine={false} />
                            <YAxis dataKey="feature" type="category" stroke="#9CA3AF" fontSize={10} width={130} tickFormatter={(v) => String(v).slice(0, 20)} tickLine={false} axisLine={false} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            <Bar dataKey="average_contribution" fill="#3B82F6" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>{/* end right drawer */}
        </div>{/* end main canvas */}
      </div>{/* end body */}

      {/* ── Copilot Overlay ──────────────────────────────────── */}
      <AnimatePresence>
        {copilotOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-gray-900/10"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCopilotOpen(false)}
            />
            <motion.div
              className="fixed right-0 top-0 z-50 flex h-full w-[440px] flex-col bg-white shadow-overlay"
              initial={{ x: 440 }}
              animate={{ x: 0 }}
              exit={{ x: 440 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-blue-600" />
                  <span className="text-[15px] font-semibold text-gray-900">Copilot</span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">Offline · ASTraM dataset</span>
                </div>
                <button onClick={() => setCopilotOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100" aria-label="Close copilot">
                  <X size={16} />
                </button>
              </div>
              <div className="border-b border-gray-100 p-5">
                <textarea
                  value={copilotQuestion}
                  onChange={(e) => setCopilotQuestion(e.target.value)}
                  rows={3}
                  placeholder="Ask about traffic risks, corridors, zones..."
                  className="w-full resize-none rounded-xl bg-gray-50 p-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                />
                <button onClick={() => askCopilot()} className="mt-3 h-9 w-full rounded-xl bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 transition-colors">Ask</button>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {["Which zones need attention?", "Top hotspots?", "Most disrupted corridor?", "What resources are needed first?", "Why is the highest event risky?"].map((sample) => (
                    <button key={sample} onClick={() => askCopilot(sample)} className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] text-gray-500 hover:bg-gray-50 hover:text-gray-700">
                      {sample}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                {copilotResponse ? (
                  <div>
                    <p className="text-[15px] leading-7 text-gray-900">{copilotResponse.answer}</p>
                    <div className="mt-4 space-y-2">
                      {copilotResponse.supporting_facts.map((fact) => (
                        <div key={fact} className="rounded-lg bg-gray-50 px-3 py-2.5 text-xs text-gray-600 leading-relaxed">{fact}</div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-gray-400">Ask a question to get an answer from the processed event dataset.</div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
