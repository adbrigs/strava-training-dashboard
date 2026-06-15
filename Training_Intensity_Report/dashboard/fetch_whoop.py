"""
Fetch WHOOP historical data and write to web/public/data/whoop_history.json.
Runs in GitHub Actions using WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET, WHOOP_REFRESH_TOKEN secrets.
"""
import json, os, sys
from pathlib import Path

import requests

CLIENT_ID     = os.environ.get("WHOOP_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("WHOOP_CLIENT_SECRET", "")
REFRESH_TOKEN = os.environ.get("WHOOP_REFRESH_TOKEN", "")

API       = "https://api.prod.whoop.com/developer/v2"
TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token"
OUT_PATH  = Path(__file__).parents[2] / "web" / "public" / "data" / "whoop_history.json"


def get_access_token() -> str:
    r = requests.post(TOKEN_URL, data={
        "grant_type":    "refresh_token",
        "refresh_token": REFRESH_TOKEN,
        "client_id":     CLIENT_ID,
        "client_secret": CLIENT_SECRET,
    })
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

    # Map by date: YYYY-MM-DD
    rec_by_date: dict[str, dict] = {}
    for r in recoveries:
        if r.get("score_state") != "SCORED" or not r.get("score"):
            continue
        date = r["created_at"][:10]
        s = r["score"]
        rec_by_date[date] = {
            "recovery":   round(s["recovery_score"]),
            "hrv":        round(s["hrv_rmssd_milli"]),
            "restingHr":  round(s["resting_heart_rate"]),
        }

    slp_by_date: dict[str, dict] = {}
    for s in sleeps:
        if s.get("score_state") != "SCORED" or not s.get("score") or s.get("nap"):
            continue
        date = s["start"][:10]
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
        strain_by_date[date] = {"strain": round(c["score"]["strain"], 1)}

    all_dates = sorted(
        set(rec_by_date) | set(slp_by_date) | set(strain_by_date)
    )

    history = []
    for date in all_dates:
        entry: dict = {"date": date}
        entry.update(rec_by_date.get(date, {}))
        entry.update(slp_by_date.get(date, {}))
        entry.update(strain_by_date.get(date, {}))
        history.append(entry)

    OUT_PATH.write_text(json.dumps(history, indent=2))
    print(f"Wrote {len(history)} WHOOP records → {OUT_PATH}")


if __name__ == "__main__":
    main()
