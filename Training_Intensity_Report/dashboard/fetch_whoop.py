"""
Fetch WHOOP historical data and write to web/public/data/whoop_history.json.
Runs in GitHub Actions using WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET, WHOOP_REFRESH_TOKEN secrets.
"""
import json, os, sys
from datetime import datetime, timezone
from pathlib import Path

import requests

CLIENT_ID     = os.environ.get("WHOOP_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("WHOOP_CLIENT_SECRET", "")
REFRESH_TOKEN = os.environ.get("WHOOP_REFRESH_TOKEN", "")

API       = "https://api.prod.whoop.com/developer/v2"
TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token"
OUT_PATH  = Path(__file__).parents[2] / "web" / "public" / "data" / "whoop_history.json"
BODY_OUT_PATH = Path(__file__).parents[2] / "web" / "public" / "data" / "whoop_body_measurement.json"


def get_access_token() -> str:
    r = requests.post(TOKEN_URL, data={
        "grant_type":    "refresh_token",
        "refresh_token": REFRESH_TOKEN,
        "client_id":     CLIENT_ID,
        "client_secret": CLIENT_SECRET,
    })
    if r.status_code == 400:
        print("WHOOP refresh token is invalid or expired (HTTP 400).")
        print("Go to Settings in the dashboard → copy the refresh token → update WHOOP_REFRESH_TOKEN in GitHub Secrets.")
        sys.exit(0)
    r.raise_for_status()
    return r.json()["access_token"]


def paginate(endpoint: str, token: str, params: dict | None = None) -> list:
    headers = {"Authorization": f"Bearer {token}"}
    records, next_token = [], None
    while True:
        p = {**(params or {}), "limit": 25}
        if next_token:
            p["nextToken"] = next_token
        r = requests.get(f"{API}{endpoint}", headers=headers, params=p)
        r.raise_for_status()
        data = r.json()
        records.extend(data.get("records", []))
        next_token = data.get("next_token")
        if not next_token:
            break
    return records


def get_json(endpoint: str, token: str) -> dict:
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.get(f"{API}{endpoint}", headers=headers)
    r.raise_for_status()
    return r.json()


def main():
    if not REFRESH_TOKEN:
        print("WHOOP_REFRESH_TOKEN not set — skipping WHOOP fetch.")
        sys.exit(0)

    print("Fetching WHOOP access token…")
    token = get_access_token()

    print("Fetching recovery records…")
    recoveries = paginate("/recovery", token)
    print(f"  {len(recoveries)} records")

    print("Fetching sleep records…")
    sleeps = paginate("/activity/sleep", token)
    print(f"  {len(sleeps)} records")

    print("Fetching cycle (strain) records…")
    cycles = paginate("/cycle", token)
    print(f"  {len(cycles)} records")

    print("Fetching body measurement…")
    try:
        body_measurement = get_json("/user/measurement/body", token)
    except requests.HTTPError as exc:
        print(f"  body measurement unavailable: {exc}")
        body_measurement = {}

    # Map by date: YYYY-MM-DD
    # API returns newest-first, so the first entry seen for a date is the most current.
    rec_by_date: dict[str, dict] = {}
    for r in recoveries:
        if r.get("score_state") != "SCORED" or not r.get("score"):
            continue
        date = r["created_at"][:10]
        if date in rec_by_date:
            continue
        s = r["score"]
        rec_by_date[date] = {
            "recovery":  round(s["recovery_score"]),
            "hrv":       round(s["hrv_rmssd_milli"]),
            "restingHr": round(s["resting_heart_rate"]),
        }

    slp_by_date: dict[str, dict] = {}
    for s in sleeps:
        if s.get("score_state") != "SCORED" or not s.get("score") or s.get("nap"):
            continue
        date = s["start"][:10]
        if date in slp_by_date:
            continue
        sc = s["score"]
        st = sc.get("stage_summary", {})
        duration_ms = st.get("total_in_bed_time_milli", 0) - st.get("total_awake_time_milli", 0)
        slp_by_date[date] = {
            "sleepMs":          duration_ms,
            "sleepPerformance": round(sc.get("sleep_performance_percentage", 0)),
        }

    strain_by_date: dict[str, dict] = {}
    for c in cycles:
        if c.get("score_state") != "SCORED" or not c.get("score"):
            continue
        date = c["start"][:10]
        if date in strain_by_date:
            continue
        strain_by_date[date] = {"strain": round(c["score"]["strain"], 1)}

    # Write today's weight snapshot into per-date history if available
    weight_kg = body_measurement.get("weight_kilogram")
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    weight_by_date: dict[str, dict] = {}
    if weight_kg is not None:
        weight_by_date[today_str] = {"weightKg": weight_kg}

    all_dates = sorted(
        set(rec_by_date) | set(slp_by_date) | set(strain_by_date) | set(weight_by_date)
    )

    history = []
    for date in all_dates:
        entry: dict = {"date": date}
        entry.update(rec_by_date.get(date, {}))
        entry.update(slp_by_date.get(date, {}))
        entry.update(strain_by_date.get(date, {}))
        entry.update(weight_by_date.get(date, {}))
        history.append(entry)

    OUT_PATH.write_text(json.dumps(history, indent=2))
    print(f"Wrote {len(history)} WHOOP records → {OUT_PATH}")

    BODY_OUT_PATH.write_text(json.dumps({
        "weightKg": body_measurement.get("weight_kilogram"),
        "heightM": body_measurement.get("height_meter"),
        "maxHeartRate": body_measurement.get("max_heart_rate"),
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
    }, indent=2))
    print(f"Wrote WHOOP body measurement → {BODY_OUT_PATH}")


if __name__ == "__main__":
    main()
