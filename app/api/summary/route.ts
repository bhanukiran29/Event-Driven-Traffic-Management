import { readOptionalProcessedJson, readProcessedJson } from "@/lib/data";
import type { SummaryPayload } from "@/lib/types";

export async function GET() {
  const summary = await readProcessedJson<SummaryPayload>("summary.json");
  const modelMetrics = await readOptionalProcessedJson<{
    best_model: string;
    model_comparison: SummaryPayload["model_comparison"];
    feature_importance: Array<{ feature: string; importance: number }>;
  }>("model_metrics.json");

  if (!modelMetrics) {
    return Response.json(summary);
  }

  return Response.json({
    ...summary,
    model_comparison: modelMetrics.model_comparison,
    feature_importance: modelMetrics.feature_importance.map((item) => ({
      feature: item.feature,
      average_contribution: item.importance,
      weight: 0
    }))
  });
}
