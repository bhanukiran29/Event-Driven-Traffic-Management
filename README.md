# GridSense AI

AI-powered Traffic Operations Copilot for Bengaluru Traffic Police, built for Flipkart Gridlock 2.0.

GridSense AI turns the instructor-provided ASTraM event dataset into an operations dashboard for event impact scoring, hotspot discovery, manpower planning, barricading advisories, scenario simulation, and offline traffic-copilot answers.

## What This Prototype Does

- Computes a proprietary **Traffic Impact Score (TIS)** from ASTraM event records.
- Trains a **CatBoost surrogate model** to learn the TIS target from event features.
- Benchmarks CatBoost against Random Forest, Extra Trees, XGBoost, and LightGBM.
- Detects spatial hotspots with DBSCAN.
- Estimates event attendance and venue capacity from historical event type.
- Dynamically recommends officers, barricades, patrol units, and response priority from attendance and operational risk factors.
- Provides dataset-only diversion advisories without external routing intelligence.
- Renders a Mapbox-based Bengaluru operations map with heatmap and event layers.
- Includes an offline copilot that answers from processed local dataset insights.

## Data Boundary

This project uses only the provided ASTraM anonymized event dataset.

The dataset does **not** include measured congestion labels, vehicle counts, travel time, or delay duration. Therefore, GridSense AI does not claim to predict measured congestion. It predicts an operational traffic-impact risk score.

Mapbox is used only for map rendering.

## Model Status

The model is trained as a **surrogate model for Traffic Impact Score**, not as a real congestion predictor.

Current trained model:

| Model | Role | R2 | MAE | RMSE |
|---|---:|---:|---:|---:|
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

- Next.js
- TypeScript
- Tailwind CSS
- Mapbox GL
- Recharts
- Python
- CatBoost
- Scikit-learn
- XGBoost
- LightGBM
- SHAP

## Local Setup

Install frontend dependencies:

```bash
npm install
```

Create `.env.local`:

```bash
NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token
```

Run the app:

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:3000
```

## Data Processing

The raw CSV is expected at:

```text
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

- `GET /api/summary`
- `GET /api/events`
- `GET /api/hotspots`
- `POST /api/simulate`
- `POST /api/copilot`

## Notes For Deployment

- Set `NEXT_PUBLIC_MAPBOX_TOKEN` in the hosting provider.
- Do not commit `.env.local`.
- The app reads generated JSON files from `data/processed`.
- The current version is a demo app using Next.js API routes, not FastAPI/PostgreSQL.

## License

MIT
