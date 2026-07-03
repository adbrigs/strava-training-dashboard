# Strava Training Dashboard

## The correct app to run

The current UI is the **Next.js app** in `web/`:

```
cd web && npm run dev
# opens at http://localhost:3000
```

The Streamlit app (`Training_Intensity_Report/dashboard/streamlit_dash.py`) is the **old UI** — do not launch it unless explicitly asked.

## Data pipeline: WHOOP only (Strava retired)

Strava's API went subscription-based and is no longer used. Activity history in
`activity_data_with_intensity.csv` before **2026-07-02** is frozen Strava data;
everything from that date on comes from WHOOP workouts, merged in by
`Training_Intensity_Report/dashboard/fetch_whoop.py` (see `WORKOUT_CUTOFF`).
The Strava scripts in `Training_Intensity_Report/dashboard/src/` are legacy —
do not run them.
