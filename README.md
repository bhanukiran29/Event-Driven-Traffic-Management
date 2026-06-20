# GridSense AI

AI-powered Traffic Operations Copilot for Bengaluru Traffic Police, built for Flipkart Gridlock 2.0.

GridSense AI turns the instructor-provided ASTraM event dataset into a premium event intelligence command center — covering event impact scoring, spatial hotspot discovery, manpower planning, barricading advisories, scenario simulation, and offline AI-copilot answers.

## Interface

The application is a **persistent-map command center** with a light-theme, executive-ready design.

**Sidebar modes**

| Mode | What it shows |
|---|---|
| Command Center | Operational Risk Index gauge · Critical event alerts · Risk distribution · Monthly trend · Top causes · Event feed |
| Simulator | Scenario builder (cause, attendance, duration, closure, priority) · Animated TIS output · Intervention comparison |
| Hotspots | DBSCAN spatial cluster intelligence on the live map |
| Explainability | Per-event score breakdown · Global feature importance chart · AI explanation bullets |

**Copilot** — click the sparkle icon below the sidebar modes to open the offline AI assistant as a slide-in overlay. It answers questions from the processed ASTraM dataset without any external API calls.

## What This Prototype Does

- Computes a proprietary **Traffic Impact Score (TIS)** from ASTraM event records.
- Trains a **CatBoost surrogate model** to learn the TIS target from event features.
- Benchmarks CatBoost against Random Forest, Extra Trees, XGBoost, and LightGBM.
- Detects spatial hotspots with DBSCAN.
- Estimates event attendance and venue capacity from historical event type.
- Dynamically recommends officers, barricades, patrol units, and response priority from attendance and operational risk factors.
- Plans primary and secondary diversion corridors using local historical risk, hotspot density, closure resilience, zone density, and event proximity.
- Compares four intervention strategies and recommends the lowest-risk operational scenario.
- Renders a Mapbox-based Bengaluru operations map (Mapbox Light style) with heatmap and event layers.
- Includes an offline copilot that answers from processed local dataset insights.

## Data Boundary

This project uses only the provided ASTraM anonymized event dataset.

The dataset does **not** include measured congestion labels, vehicle counts, travel time, or delay duration. Therefore, GridSense AI does not claim to predict measured congestion. It predicts an operational traffic-impact risk score.

Mapbox is used only for map rendering.

## Model Status

The model is trained as a **surrogate model for Traffic Impact Score**, not as a real congestion predictor.

Current trained model:

| Model | Role | R² | MAE | RMSE |
|---|---|---:|---:|---:|
| CatBoostRegressor | Primary TIS surrogate | 0.9921 | 0.3726 | 0.5958 |
| RandomForestRegressor | Benchmark | 0.9512 | 1.0803 | 1.4806 |
| ExtraTreesRegressor | Benchmark | 0.9515 | 1.0948 | 1.4762 |
| XGBRegressor | Benchmark | 0.9802 | 0.7080 | 0.9434 |
| LGBMRegressor | Benchmark | 0.9824 | 0.6104 | 0.8906 |

Model artifacts:

- `models/tis_surrogate_model.pkl`
- `models/catboost_tis_surrogate.cbm`
- `models/model_card.json`
- `data/processed/model_metrics.json`
- `data/processed/model_predictions.json`
- `data/processed/model_feature_importance.json`

## Tech Stack

**Frontend**
- Next.js 15 · TypeScript · Tailwind CSS
- Mapbox GL · Recharts · Framer Motion
- Inter (Google Fonts via `next/font`)

**ML / Data**
- Python · CatBoost · Scikit-learn · XGBoost · LightGBM · SHAP

## Local Setup

Install frontend dependencies:

```bash
npm install
```

Create `.env.local`:

```
NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token
```

Run the app:

```bash
npm run dev
```

Open `http://localhost:3000`

## Data Processing

The raw CSV is expected at:

```
data/raw/astram_events.csv
```

Generate processed dashboard artifacts:

```bash
npm run process:data
npm run verify:data
```

## Model Training

Create and activate a Python virtual environment, then install ML dependencies:

```bash
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Train and verify the surrogate model:

```bash
npm run train:model
npm run verify:model
```

## Production Build

```bash
npm run build
npm run start
```

For Windows local preview after build:

```bash
scripts\run-prod.cmd
```

## API Routes

| Method | Route | Description |
|---|---|---|
| GET | `/api/summary` | Citywide metrics, risk bands, trends, model comparison |
| GET | `/api/events` | Full event list with TIS scores and recommendations |
| GET | `/api/hotspots` | DBSCAN clusters and heatmap points |
| POST | `/api/simulate` | Run a what-if scenario and return updated TIS + intervention analysis |
| POST | `/api/copilot` | Offline RAG answer from processed dataset insights |

## Notes For Deployment

- Set `NEXT_PUBLIC_MAPBOX_TOKEN` in the hosting provider environment.
- Do not commit `.env.local`.
- The app reads generated JSON files from `data/processed/` — run data processing before deploying.
- The current version uses Next.js API routes, not FastAPI/PostgreSQL.
- The post-event learning schema is documented for future integration; no feedback database is implemented.

## License

MIT
