"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Brain,
  Clock3,
  Gauge,
  Layers,
  Map as MapIcon,
  MapPin,
  MessageSquare,
  Route,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Users
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
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
  { id: "executive", label: "Executive", icon: Gauge },
  { id: "map", label: "City Map", icon: MapIcon },
  { id: "risk", label: "Risk Engine", icon: BarChart3 },
  { id: "hotspots", label: "Hotspots", icon: Layers },
  { id: "resources", label: "Resources", icon: Users },
  { id: "simulator", label: "Simulator", icon: SlidersHorizontal },
  { id: "explain", label: "Explainable AI", icon: Brain },
  { id: "copilot", label: "Copilot", icon: MessageSquare }
];

const RISK_COLORS: Record<RiskCategory, string> = {
  Critical: "#ef4444",
  High: "#f97316",
  Medium: "#f6b73c",
  Low: "#22c55e"
};

const TOOLTIP_STYLE = {
  backgroundColor: "#0b1220",
  border: "1px solid #263244",
  borderRadius: 8,
  color: "#e7eef8"
};

function labelize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format(value);
}

function riskClass(risk: RiskCategory) {
  if (risk === "Critical") {
    return "border-red-500/50 bg-red-500/10 text-red-200";
  }
  if (risk === "High") {
    return "border-orange-500/50 bg-orange-500/10 text-orange-200";
  }
  if (risk === "Medium") {
    return "border-amber-400/50 bg-amber-400/10 text-amber-100";
  }
  return "border-green-400/50 bg-green-400/10 text-green-100";
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
    <section className="min-w-0 rounded border border-ops-line bg-ops-panel/92 p-5 shadow-panel">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          {kicker ? <div className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-ops-cyan">{kicker}</div> : null}
          <h2 className="text-lg font-semibold text-ops-text">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

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
    <div className="rounded border border-ops-line bg-ops-panel p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-ops-muted">{label}</span>
        <Icon className={tone} size={18} />
      </div>
      <div className="mt-3 text-3xl font-semibold text-ops-text">{value}</div>
    </div>
  );
}

function RiskBadge({ risk }: { risk: RiskCategory }) {
  return <span className={`inline-flex rounded border px-2 py-1 text-xs font-semibold ${riskClass(risk)}`}>{risk}</span>;
}

function ScoreBreakdown({ event }: { event: RiskEvent }) {
  return (
    <div className="space-y-3">
      {event.score_components.slice(0, 8).map((component) => (
        <div key={component.name}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-ops-muted">{component.name}</span>
            <span className="font-semibold text-ops-text">{component.contribution}</span>
          </div>
          <div className="h-2 rounded bg-slate-800">
            <div
              className="h-2 rounded bg-ops-cyan"
              style={{ width: `${Math.min(100, (component.contribution / 15) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function EventTable({ events, compact = false }: { events: RiskEvent[]; compact?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-[0.14em] text-ops-muted">
            <th className="border-b border-ops-line px-3 py-3">Event</th>
            <th className="border-b border-ops-line px-3 py-3">TIS</th>
            <th className="border-b border-ops-line px-3 py-3">Risk</th>
            <th className="border-b border-ops-line px-3 py-3">Cause</th>
            {!compact ? <th className="border-b border-ops-line px-3 py-3">Corridor</th> : null}
            {!compact ? <th className="border-b border-ops-line px-3 py-3">Station</th> : null}
            <th className="border-b border-ops-line px-3 py-3">Officers</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id} className="border-b border-ops-line">
              <td className="border-b border-ops-line px-3 py-3 font-semibold text-ops-text">{event.id}</td>
              <td className="border-b border-ops-line px-3 py-3 text-ops-cyan">{event.traffic_impact_score}</td>
              <td className="border-b border-ops-line px-3 py-3"><RiskBadge risk={event.risk_category} /></td>
              <td className="border-b border-ops-line px-3 py-3 text-ops-muted">{labelize(event.event_cause)}</td>
              {!compact ? <td className="border-b border-ops-line px-3 py-3 text-ops-muted">{event.corridor}</td> : null}
              {!compact ? <td className="border-b border-ops-line px-3 py-3 text-ops-muted">{event.police_station}</td> : null}
              <td className="border-b border-ops-line px-3 py-3 text-ops-text">{event.recommendation.officers}</td>
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
    <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-ops-muted">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded border border-ops-line bg-slate-950 px-3 text-sm normal-case tracking-normal text-ops-text outline-none focus:border-ops-cyan"
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
  const causes = useMemo(() => ["vehicle_breakdown", "construction", "accident", "water_logging", "public_event", "procession", "vip_movement", "protest", "pot_holes", "others"], []);
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

  if (loading || !summary || !hotspots) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ops-bg text-ops-text">
        <div className="rounded border border-ops-line bg-ops-panel p-6 text-sm text-ops-muted">Loading GridSense AI operations console...</div>
      </main>
    );
  }

  const metrics = summary.metrics;
  const mapEvents = filteredEvents.slice(0, 800);
  const resourceEvents = filteredEvents.filter((event) => event.risk_category === "High" || event.risk_category === "Critical").slice(0, 9);
  const displayEvent = selectedEvent || summary.top_risk_events[0];

  return (
    <main className="min-h-screen overflow-x-hidden bg-ops-bg px-4 py-5 text-ops-text md:px-6">
      <div className="mx-auto w-full min-w-0 max-w-[1500px]">
        <header className="mb-5 rounded border border-ops-line bg-ops-panel/95 p-5 shadow-panel">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-ops-cyan">Bengaluru Traffic Police ASTraM</div>
              <h1 className="text-3xl font-semibold text-ops-text md:text-5xl">GridSense AI</h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-ops-muted md:text-base">
                Predict. Prioritize. Prevent. Operational traffic impact intelligence using only the provided ASTraM event dataset.
              </p>
            </div>
            <div className="grid gap-2 rounded border border-ops-line bg-slate-950 p-4 text-sm text-ops-muted">
              <div className="flex items-center gap-2 text-ops-amber"><AlertTriangle size={16} /> Honest risk model</div>
              <p className="max-w-xl leading-5">{summary.honesty_notice}</p>
            </div>
          </div>
          <nav className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
            {VIEWS.map((view) => {
              const Icon = view.icon;
              const active = activeView === view.id;
              return (
                <button
                  key={view.id}
                  onClick={() => setActiveView(view.id)}
                  className={`flex h-11 items-center justify-center gap-2 rounded border px-3 text-sm font-semibold transition ${
                    active
                      ? "border-ops-cyan bg-ops-cyan/14 text-ops-text"
                      : "border-ops-line bg-slate-950 text-ops-muted hover:border-ops-cyan/60 hover:text-ops-text"
                  }`}
                >
                  <Icon size={16} />
                  {view.label}
                </button>
              );
            })}
          </nav>
        </header>

        <section className="mb-5 grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Total Events" value={compactNumber(metrics.total_events)} tone="text-ops-cyan" icon={Activity} />
          <MetricCard label="Road Closures" value={compactNumber(metrics.road_closures)} tone="text-ops-amber" icon={Route} />
          <MetricCard label="High Risk" value={compactNumber(metrics.high_risk_events)} tone="text-orange-300" icon={AlertTriangle} />
          <MetricCard label="Active Events" value={compactNumber(metrics.active_events)} tone="text-ops-green" icon={Clock3} />
          <MetricCard label="Average TIS" value={metrics.average_tis} tone="text-ops-cyan" icon={Gauge} />
        </section>

        {activeView === "executive" ? (
          <div className="grid min-w-0 gap-5 xl:grid-cols-[1.1fr_0.9fr]">
            <Panel title="Operational Risk Overview" kicker="Executive dashboard">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary.risk_bands}>
                    <CartesianGrid stroke="#263244" vertical={false} />
                    <XAxis dataKey="name" stroke="#8EA3B8" fontSize={12} />
                    <YAxis stroke="#8EA3B8" fontSize={12} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {summary.risk_bands.map((entry) => (
                        <Cell key={entry.name} fill={RISK_COLORS[entry.name]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel title="Monthly Event Pattern" kicker="Historical coverage">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={summary.monthly_trend}>
                    <CartesianGrid stroke="#263244" vertical={false} />
                    <XAxis dataKey="month" stroke="#8EA3B8" fontSize={12} />
                    <YAxis stroke="#8EA3B8" fontSize={12} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Area type="monotone" dataKey="events" stroke="#38bdf8" fill="#38bdf833" strokeWidth={2} />
                    <Line type="monotone" dataKey="average_tis" stroke="#f6b73c" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel title="Top Risk Events" kicker="Immediate attention" action={<ShieldCheck className="text-ops-green" size={18} />}>
              <EventTable events={summary.top_risk_events.slice(0, 8)} />
            </Panel>
            <Panel title="Primary Event Causes" kicker="Incident mix">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={summary.top_causes.slice(0, 6)} dataKey="count" nameKey="name" innerRadius={55} outerRadius={105} paddingAngle={2}>
                      {summary.top_causes.slice(0, 6).map((entry, index) => (
                        <Cell key={entry.name} fill={["#38bdf8", "#f6b73c", "#22c55e", "#ef4444", "#94a3b8", "#f97316"][index]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value, name) => [value, labelize(String(name))]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid gap-2 text-sm text-ops-muted">
                {summary.top_causes.slice(0, 6).map((item) => (
                  <div key={item.name} className="flex items-center justify-between border-b border-ops-line py-2">
                    <span>{labelize(item.name)}</span>
                    <span className="font-semibold text-ops-text">{item.count}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        ) : null}

        {activeView === "map" ? (
          <div className="grid min-w-0 gap-5 xl:grid-cols-[1.4fr_0.6fr]">
            <Panel
              title="City Intelligence Map"
              kicker="Risk overlays"
              action={
                <div className="grid gap-2 sm:grid-cols-2">
                  <SelectControl label="Risk" value={riskFilter} onChange={setRiskFilter} options={["all", "Critical", "High", "Medium", "Low"]} />
                  <SelectControl label="Zone" value={zoneFilter} onChange={setZoneFilter} options={zones} />
                </div>
              }
            >
              <CityMap events={mapEvents} clusters={hotspots.clusters} heatmapPoints={hotspots.heatmap_points} mode="events" />
            </Panel>
            <Panel title="Map Event Feed" kicker={`${filteredEvents.length} matching records`}>
              <label className="mb-4 flex h-10 items-center gap-2 rounded border border-ops-line bg-slate-950 px-3 text-sm text-ops-muted">
                <Search size={16} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search event, cause, corridor"
                  className="w-full bg-transparent text-ops-text outline-none"
                />
              </label>
              <div className="space-y-3">
                {filteredEvents.slice(0, 8).map((event) => (
                  <button
                    key={event.id}
                    onClick={() => setSelectedEventId(event.id)}
                    className="w-full rounded border border-ops-line bg-slate-950 p-3 text-left hover:border-ops-cyan"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-ops-text">{event.id}</span>
                      <RiskBadge risk={event.risk_category} />
                    </div>
                    <div className="mt-2 text-xs text-ops-muted">{labelize(event.event_cause)} - {event.corridor}</div>
                    <div className="mt-2 text-sm text-ops-cyan">TIS {event.traffic_impact_score}</div>
                  </button>
                ))}
              </div>
            </Panel>
          </div>
        ) : null}

        {activeView === "risk" ? (
          <div className="grid min-w-0 gap-5 xl:grid-cols-[1.1fr_0.9fr]">
            <Panel title="Traffic Impact Score Engine" kicker="Operational risk ranking">
              <EventTable events={filteredEvents.slice(0, 12)} />
            </Panel>
            <div className="grid min-w-0 gap-5">
              <Panel title="Score Formula Weights" kicker="TIS layer">
                <div className="grid gap-3">
                  {summary.score_weights.map((item) => (
                    <div key={item.name}>
                      <div className="mb-1 flex items-center justify-between text-xs text-ops-muted">
                        <span>{item.name}</span>
                        <span className="text-ops-text">{item.weight}%</span>
                      </div>
                      <div className="h-2 rounded bg-slate-800">
                        <div className="h-2 rounded bg-ops-amber" style={{ width: `${item.weight * 4}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
              <Panel title="Surrogate Model Comparison" kicker="No measured congestion labels">
                <div className="grid gap-3">
                  {summary.model_comparison.map((model) => (
                    <div key={model.model} className="rounded border border-ops-line bg-slate-950 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold text-ops-text">{model.model}</span>
                        <span className="text-sm text-ops-cyan">{model.r2 === null ? "Optional" : `R2 ${model.r2}`}</span>
                      </div>
                      <p className="mt-2 text-sm leading-5 text-ops-muted">{model.fit_status}</p>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          </div>
        ) : null}

        {activeView === "hotspots" ? (
          <div className="grid min-w-0 gap-5 xl:grid-cols-[1.35fr_0.65fr]">
            <Panel title="Hotspot Explorer" kicker="DBSCAN eps 750m">
              <CityMap events={mapEvents} clusters={hotspots.clusters} heatmapPoints={hotspots.heatmap_points} mode="hotspots" />
            </Panel>
            <Panel title="Cluster Intelligence" kicker={`${hotspots.clusters.length} clusters`}>
              <div className="space-y-3">
                {hotspots.clusters.slice(0, 10).map((cluster) => (
                  <div key={cluster.id} className="rounded border border-ops-line bg-slate-950 p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-ops-text">Cluster {cluster.id}</span>
                      <span className="text-sm text-ops-cyan">{cluster.average_tis} TIS</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-ops-muted">
                      <span>{cluster.count} events</span>
                      <span>{labelize(cluster.top_cause)}</span>
                      <span>{cluster.top_corridor}</span>
                      <span>{cluster.top_police_station}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        ) : null}

        {activeView === "resources" ? (
          <div className="grid min-w-0 gap-5 xl:grid-cols-[1fr_1fr]">
            <Panel title="Resource Planner" kicker="Deployment recommendations">
              <div className="grid gap-3">
                {resourceEvents.map((event) => (
                  <div key={event.id} className="rounded border border-ops-line bg-slate-950 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-ops-text">{event.id}</div>
                        <div className="mt-1 text-sm text-ops-muted">{labelize(event.event_cause)} - {event.corridor}</div>
                      </div>
                      <RiskBadge risk={event.risk_category} />
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
                      <div className="rounded border border-ops-line p-3"><div className="text-2xl font-semibold text-ops-text">{event.recommendation.officers}</div><div className="text-ops-muted">Officers</div></div>
                      <div className="rounded border border-ops-line p-3"><div className="text-2xl font-semibold text-ops-text">{event.recommendation.barricades}</div><div className="text-ops-muted">Barricades</div></div>
                      <div className="rounded border border-ops-line p-3"><div className="text-2xl font-semibold text-ops-text">{event.recommendation.patrol_units}</div><div className="text-ops-muted">Patrols</div></div>
                    </div>
                    <div className="mt-3 text-sm text-ops-cyan">{event.recommendation.response_priority}</div>
                    <div className="mt-3 text-xs text-ops-muted">
                      {event.expected_attendance.toLocaleString("en-IN")} expected attendees - {event.event_scale} event
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title="Barricading And Diversion Advisories" kicker="Dataset-only routing policy">
              {displayEvent ? (
                <div className="space-y-4">
                  <div className="rounded border border-ops-line bg-slate-950 p-4">
                    <div className="flex items-center gap-2 text-ops-cyan"><MapPin size={17} /> {displayEvent.id}</div>
                    <div className="mt-2 text-sm leading-6 text-ops-muted">{displayEvent.address}</div>
                    <div className="mt-3 grid gap-2">
                      {displayEvent.recommendation.barricade_points.map((point) => (
                        <div key={point.label} className="flex items-center justify-between rounded border border-ops-line px-3 py-2 text-sm">
                          <span>{point.label}</span>
                          <span className="text-ops-muted">{point.latitude.toFixed(4)}, {point.longitude.toFixed(4)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded border border-ops-line bg-slate-950 p-4">
                    <div className="flex items-center gap-2 text-ops-cyan"><Users size={17} /> Allocation rationale</div>
                    <div className="mt-3 grid gap-2">
                      {displayEvent.recommendation.allocation_explanation.map((reason) => (
                        <div key={reason} className="rounded border border-ops-line px-3 py-2 text-sm text-ops-muted">{reason}</div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded border border-ops-line bg-slate-950 p-4">
                    <div className="flex items-center gap-2 text-ops-amber"><Route size={17} /> Avoid {displayEvent.recommendation.diversion_advisory.avoid_corridor}</div>
                    <p className="mt-2 text-sm leading-6 text-ops-muted">{displayEvent.recommendation.diversion_advisory.message}</p>
                    <div className="mt-3 grid gap-2">
                      {displayEvent.recommendation.diversion_advisory.candidate_corridors.map((corridor) => (
                        <div key={corridor.corridor} className="flex items-center justify-between rounded border border-ops-line px-3 py-2 text-sm">
                          <span>{corridor.corridor}</span>
                          <span className="text-ops-cyan">Avg TIS {corridor.average_tis}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </Panel>
          </div>
        ) : null}

        {activeView === "simulator" ? (
          <div className="grid min-w-0 gap-5 xl:grid-cols-[0.75fr_1.25fr]">
            <Panel title="Scenario Simulator" kicker="What-if controls">
              <div className="grid gap-4">
                <SelectControl label="Event" value={selectedEventId} onChange={setSelectedEventId} options={events.slice(0, 40).map((event) => event.id)} />
                <SelectControl label="Cause" value={simCause} onChange={setSimCause} options={causes} />
                <SelectControl label="Priority" value={simPriority} onChange={setSimPriority} options={["High", "Low"]} />
                <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-ops-muted">
                  Expected Attendance
                  <input
                    type="number"
                    min={0}
                    max={1000000}
                    step={100}
                    value={simAttendance}
                    onChange={(event) => setSimAttendance(Math.max(0, Number(event.target.value)))}
                    className="h-10 rounded border border-ops-line bg-slate-950 px-3 text-sm text-ops-text outline-none focus:border-ops-cyan"
                  />
                </label>
                <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-ops-muted">
                  Duration Hours
                  <input
                    type="number"
                    min={0}
                    max={72}
                    step={0.5}
                    value={simDuration}
                    onChange={(event) => setSimDuration(Number(event.target.value))}
                    className="h-10 rounded border border-ops-line bg-slate-950 px-3 text-sm text-ops-text outline-none focus:border-ops-cyan"
                  />
                </label>
                <label className="flex items-center justify-between rounded border border-ops-line bg-slate-950 p-3 text-sm text-ops-text">
                  Road closure required
                  <input type="checkbox" checked={simClosure} onChange={(event) => setSimClosure(event.target.checked)} className="h-5 w-5 accent-sky-400" />
                </label>
                <button onClick={runSimulation} className="h-11 rounded bg-ops-cyan px-4 font-semibold text-slate-950 hover:bg-sky-300">Recalculate TIS</button>
              </div>
            </Panel>
            <Panel title="Simulation Output" kicker={simulationResult ? "Recalculated scenario" : "Baseline selected event"}>
              {simulationResult ? (
                <div className="grid min-w-0 gap-5 xl:grid-cols-[0.75fr_1.25fr]">
                  <div className="rounded border border-ops-line bg-slate-950 p-5">
                    <div className="text-sm text-ops-muted">Scenario TIS</div>
                    <div className="mt-2 text-6xl font-semibold text-ops-text">{simulationResult.traffic_impact_score}</div>
                    <div className="mt-4"><RiskBadge risk={simulationResult.risk_category} /></div>
                    <div className="mt-2 text-sm text-ops-muted">
                      {simulationResult.expected_attendance.toLocaleString("en-IN")} attendees - {simulationResult.event_scale} event
                    </div>
                    <div className="mt-5 grid grid-cols-3 gap-2 text-center text-sm">
                      <div className="rounded border border-ops-line p-3"><div className="text-2xl text-ops-text">{simulationResult.recommendation.officers}</div><div className="text-ops-muted">Officers</div></div>
                      <div className="rounded border border-ops-line p-3"><div className="text-2xl text-ops-text">{simulationResult.recommendation.barricades}</div><div className="text-ops-muted">Barricades</div></div>
                      <div className="rounded border border-ops-line p-3"><div className="text-2xl text-ops-text">{simulationResult.recommendation.patrol_units}</div><div className="text-ops-muted">Patrols</div></div>
                    </div>
                  </div>
                  <div>
                    <ScoreBreakdown event={{ ...(displayEvent as RiskEvent), score_components: simulationResult.score_components }} />
                    <div className="mt-5 grid gap-2 text-sm text-ops-muted">
                      {simulationResult.recommendation.allocation_explanation.map((item) => <div key={item} className="rounded border border-ops-cyan/30 bg-slate-950 p-3">{item}</div>)}
                      {simulationResult.explanation.map((item) => <div key={item} className="rounded border border-ops-line bg-slate-950 p-3">{item}</div>)}
                    </div>
                  </div>
                </div>
              ) : displayEvent ? (
                <div className="grid min-w-0 gap-5 xl:grid-cols-[0.75fr_1.25fr]">
                  <div className="rounded border border-ops-line bg-slate-950 p-5">
                    <div className="text-sm text-ops-muted">Baseline TIS</div>
                    <div className="mt-2 text-6xl font-semibold text-ops-text">{displayEvent.traffic_impact_score}</div>
                    <div className="mt-4"><RiskBadge risk={displayEvent.risk_category} /></div>
                  </div>
                  <ScoreBreakdown event={displayEvent} />
                </div>
              ) : null}
            </Panel>
          </div>
        ) : null}

        {activeView === "explain" ? (
          <div className="grid min-w-0 gap-5 xl:grid-cols-[0.9fr_1.1fr]">
            <Panel title="Explainable AI" kicker="Feature contribution view">
              {displayEvent ? (
                <div className="space-y-4">
                  <div className="rounded border border-ops-line bg-slate-950 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold text-ops-text">{displayEvent.id}</div>
                        <div className="mt-1 text-sm text-ops-muted">{labelize(displayEvent.event_cause)} - {displayEvent.corridor}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-semibold text-ops-text">{displayEvent.traffic_impact_score}</div>
                        <RiskBadge risk={displayEvent.risk_category} />
                      </div>
                    </div>
                  </div>
                  <ScoreBreakdown event={displayEvent} />
                  <div className="grid gap-2">
                    {displayEvent.explanation.map((item) => <div key={item} className="rounded border border-ops-line bg-slate-950 p-3 text-sm text-ops-muted">{item}</div>)}
                  </div>
                </div>
              ) : null}
            </Panel>
              <Panel title="Global Feature Importance" kicker="Trained surrogate model">
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary.feature_importance.slice(0, 10)} layout="vertical" margin={{ left: 38 }}>
                    <CartesianGrid stroke="#263244" horizontal={false} />
                    <XAxis type="number" stroke="#8EA3B8" fontSize={12} />
                    <YAxis dataKey="feature" type="category" stroke="#8EA3B8" fontSize={11} width={150} tickFormatter={(value) => String(value).slice(0, 22)} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="average_contribution" fill="#38bdf8" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>
        ) : null}

        {activeView === "copilot" ? (
          <div className="grid min-w-0 gap-5 xl:grid-cols-[0.75fr_1.25fr]">
            <Panel title="Traffic Copilot" kicker="Offline dataset assistant">
              <div className="grid gap-3">
                <textarea
                  value={copilotQuestion}
                  onChange={(event) => setCopilotQuestion(event.target.value)}
                  className="min-h-28 rounded border border-ops-line bg-slate-950 p-3 text-sm text-ops-text outline-none focus:border-ops-cyan"
                />
                <button onClick={() => askCopilot()} className="h-11 rounded bg-ops-cyan px-4 font-semibold text-slate-950 hover:bg-sky-300">Ask Copilot</button>
                {[
                  "Which zones need attention?",
                  "Which corridor has the most disruptions?",
                  "Show top hotspots.",
                  "What resources are needed first?",
                  "Why is the highest event risky?"
                ].map((sample) => (
                  <button key={sample} onClick={() => askCopilot(sample)} className="rounded border border-ops-line bg-slate-950 px-3 py-2 text-left text-sm text-ops-muted hover:border-ops-cyan hover:text-ops-text">
                    {sample}
                  </button>
                ))}
              </div>
            </Panel>
            <Panel title="Copilot Response" kicker="RAG over processed insights">
              {copilotResponse ? (
                <div>
                  <p className="text-lg leading-8 text-ops-text">{copilotResponse.answer}</p>
                  <div className="mt-5 grid gap-2">
                    {copilotResponse.supporting_facts.map((fact) => (
                      <div key={fact} className="rounded border border-ops-line bg-slate-950 p-3 text-sm text-ops-muted">{fact}</div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded border border-ops-line bg-slate-950 p-5 text-sm text-ops-muted">Ask a question to generate an offline operations answer from the processed ASTraM dataset.</div>
              )}
            </Panel>
          </div>
        ) : null}
      </div>
    </main>
  );
}
