"""
Fetch WHOOP historical data and write to web/public/data/whoop_history.json.
Also fetches WHOOP workouts (from WORKOUT_CUTOFF onward) and merges them into
activity_data_with_intensity.csv — the frozen Strava history stays untouched.
Runs in GitHub Actions using WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET, WHOOP_REFRESH_TOKEN secrets.
"""
import base64, csv, json, math, os, sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
from nacl import encoding, public

CLIENT_ID     = os.environ.get("WHOOP_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("WHOOP_CLIENT_SECRET", "")
REFRESH_TOKEN = os.environ.get("WHOOP_REFRESH_TOKEN", "")
GH_TOKEN      = os.environ.get("GH_TOKEN", "")
GH_REPO       = os.environ.get("GITHUB_REPOSITORY", "")  # automatically set in Actions

API       = "https://api.prod.whoop.com/developer/v2"
TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token"
OUT_PATH  = Path(__file__).parents[2] / "web" / "public" / "data" / "whoop_history.json"
BODY_OUT_PATH = Path(__file__).parents[2] / "web" / "public" / "data" / "whoop_body_measurement.json"
CSV_PATH      = Path(__file__).parent / "data" / "activity_data_with_intensity.csv"
WEB_CSV_PATH  = Path(__file__).parents[2] / "web" / "public" / "data" / "activity_data_with_intensity.csv"
SUPPLEMENT_PATH   = Path(__file__).parents[2] / "web" / "public" / "data" / "activity_supplement.csv"
HR_SUMMARIES_PATH = Path(__file__).parents[2] / "web" / "public" / "data" / "hr_summaries.csv"

# Strava history is frozen before this local date; WHOOP owns everything after.
WORKOUT_CUTOFF = "2026-07-02"

# Same personalization as compute_intensity.py
AGE     = 27
HR_REST = 57
HR_MAX  = 208 - 0.7 * AGE  # Tanaka

DATE_FMT = "%b %d, %Y %I:%M %p"  # matches Strava-era start_date_local_formatted

# WHOOP sport_name → (dashboard sport_type, display name)
SPORT_MAP = {
    "weightlifting":       ("WeightTraining", "Weight Training"),
    "running":             ("Run", "Run"),
    "walking":             ("Walk", "Walk"),
    "cycling":             ("Ride", "Ride"),
    "hiking":              ("Hike", "Hike"),
    "swimming":            ("Swim", "Swim"),
    "rowing":              ("Rowing", "Rowing"),
    "elliptical":          ("Elliptical", "Elliptical"),
    "yoga":                ("Yoga", "Yoga"),
    "functional_fitness":  ("Workout", "Functional Fitness"),
}


def get_tokens() -> tuple[str, str]:
    """Exchange the refresh token for a new access + refresh token pair."""
    r = requests.post(TOKEN_URL, data={
        "grant_type":    "refresh_token",
        "refresh_token": REFRESH_TOKEN,
        "client_id":     CLIENT_ID,
        "client_secret": CLIENT_SECRET,
    })
    if r.status_code == 400:
        print("::error::WHOOP refresh token is invalid or expired (HTTP 400).")
        print("Open the dashboard → Settings → 'Generate cron token' → update WHOOP_REFRESH_TOKEN in GitHub Secrets.")
        # Exit non-zero so the workflow run is marked failed and surfaces the
        # stale token instead of silently freezing the committed history.
        sys.exit(1)
    r.raise_for_status()
    data = r.json()
    return data["access_token"], data["refresh_token"]


def update_github_secret(secret_name: str, secret_value: str) -> None:
    """Write a new value to a GitHub Actions secret using the repo public key."""
    if not GH_TOKEN or not GH_REPO:
        print(f"  GH_TOKEN or GITHUB_REPOSITORY not set — skipping secret update for {secret_name}.")
        return
    api = f"https://api.github.com/repos/{GH_REPO}"
    headers = {
        "Authorization": f"token {GH_TOKEN}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    r = requests.get(f"{api}/actions/secrets/public-key", headers=headers)
    r.raise_for_status()
    key_data = r.json()
    pub_key = public.PublicKey(key_data["key"].encode(), encoding.Base64Encoder())
    encrypted = base64.b64encode(public.SealedBox(pub_key).encrypt(secret_value.encode())).decode()
    r = requests.put(
        f"{api}/actions/secrets/{secret_name}",
        headers=headers,
        json={"encrypted_value": encrypted, "key_id": key_data["key_id"]},
    )
    r.raise_for_status()
    print(f"  Updated GitHub Secret: {secret_name}")


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


def _time_of_day(hour: int) -> str:
    if 4 <= hour < 11:  return "Morning"
    if 11 <= hour < 14: return "Lunch"
    if 14 <= hour < 17: return "Afternoon"
    if 17 <= hour < 21: return "Evening"
    return "Night"


def _hr_zone(hr: float) -> int:
    ratio = (hr - HR_REST) / (HR_MAX - HR_REST)
    if ratio < 0.6: return 1
    if ratio < 0.7: return 2
    if ratio < 0.8: return 3
    if ratio < 0.9: return 4
    return 5


def _parse_offset(offset: str) -> timedelta:
    """'-05:00' → timedelta(hours=-5)."""
    try:
        sign = -1 if offset.startswith("-") else 1
        hours, minutes = offset.lstrip("+-").split(":")
        return sign * timedelta(hours=int(hours), minutes=int(minutes))
    except Exception:
        return timedelta(0)


def workout_to_row(w: dict) -> dict | None:
    """Map a WHOOP v2 workout to an activity_data_with_intensity.csv row."""
    if w.get("score_state") != "SCORED" or not w.get("score"):
        return None
    score = w["score"]
    avg_hr = score.get("average_heart_rate")
    if not avg_hr:
        return None

    start_utc = datetime.fromisoformat(w["start"].replace("Z", "+00:00"))
    end_utc   = datetime.fromisoformat(w["end"].replace("Z", "+00:00"))
    local     = start_utc + _parse_offset(w.get("timezone_offset", "+00:00"))
    if local.strftime("%Y-%m-%d") < WORKOUT_CUTOFF:
        return None  # Strava history owns dates before the cutoff

    duration_min = (end_utc - start_utc).total_seconds() / 60
    if duration_min <= 0:
        return None

    sport_type, display = SPORT_MAP.get(
        w.get("sport_name", ""),
        (w.get("sport_name", "Workout").replace("_", " ").title().replace(" ", ""),
         w.get("sport_name", "Workout").replace("_", " ").title()),
    )

    miles     = (score.get("distance_meter") or 0) * 0.000621371
    elev_feet = (score.get("altitude_gain_meter") or 0) * 3.28084
    pace      = duration_min / miles if miles > 0.05 else None
    pace_fmt  = None
    if pace is not None:
        total_sec = int(round(pace * 60))
        pace_fmt = f"{total_sec // 60}:{total_sec % 60:02d} /mi"

    hr_ratio = max(0.0, (avg_hr - HR_REST) / (HR_MAX - HR_REST))
    trimp    = max(0.0, duration_min * hr_ratio * math.exp(1.92 * hr_ratio))

    zones = score.get("zone_durations") or score.get("zone_duration") or {}
    def _zone_min(key: str) -> float:
        return (zones.get(key) or 0) / 60000
    # WHOOP zone 0 (below 50% max HR) folds into the dashboard's zone 1
    zone_minutes = [
        _zone_min("zone_zero_milli") + _zone_min("zone_one_milli"),
        _zone_min("zone_two_milli"),
        _zone_min("zone_three_milli"),
        _zone_min("zone_four_milli"),
        _zone_min("zone_five_milli"),
    ]

    row = {
        "start_date_local_formatted": local.strftime(DATE_FMT),
        "name": f"{_time_of_day(local.hour)} {display}",
        "sport_type": sport_type,
        "distance (miles)": round(miles, 6),
        "moving_time (minutes)": round(duration_min, 4),
        "pace (min_per_mile)": round(pace, 4) if pace is not None else "",
        "pace_formatted": pace_fmt or "",
        "elevation_gain (feet)": round(elev_feet, 2),
        "average_heartrate": avg_hr,
        "max_heartrate": score.get("max_heart_rate", ""),
        "hr_ratio (0-1)": round(hr_ratio, 6),
        "hr_zone (1-5)": _hr_zone(avg_hr),
        "trimp (score)": round(trimp, 4),
        "id": str(w["id"]),
    }
    for i, mins in enumerate(zone_minutes, start=1):
        row[f"zone_{i}_time_minutes"] = round(mins, 4)
    return row


# WHOOP HR zones as fractions of max HR: zone 0 <50%, zone 1 50-60%, … zone 5 90%+
ZONE_KEYS = ["zone_zero_milli", "zone_one_milli", "zone_two_milli",
             "zone_three_milli", "zone_four_milli", "zone_five_milli"]
ZONE_PCT_BOUNDS = [0.0, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]


def _workout_zones(w: dict) -> dict:
    return w["score"].get("zone_durations") or w["score"].get("zone_duration") or {}


def _pct_over(threshold: float, zones: dict, max_hr: float):
    """Estimate % of workout time above an HR threshold from zone durations.
    Assumes HR is uniformly distributed within the zone containing the threshold."""
    total = sum(zones.get(k) or 0 for k in ZONE_KEYS)
    if total <= 0:
        return ""
    above = 0.0
    for i, key in enumerate(ZONE_KEYS):
        lo = ZONE_PCT_BOUNDS[i] * max_hr
        hi = ZONE_PCT_BOUNDS[i + 1] * max_hr
        duration = zones.get(key) or 0
        if threshold <= lo:
            above += duration
        elif threshold < hi:
            above += duration * (hi - threshold) / (hi - lo)
    return round(100 * above / total, 1)


def _merge_rows_csv(path: Path, key: str, new_rows: list, extra_fields: tuple = ()) -> None:
    """Replace-or-append rows into a CSV by key, extending the header if needed."""
    if not path.exists():
        print(f"  {path.name} not found — skipping.")
        return
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = list(reader.fieldnames)
        existing = list(reader)
    fieldnames += [c for c in extra_fields if c not in fieldnames]
    new_ids = {r[key] for r in new_rows}
    merged = [r for r in existing if r.get(key) not in new_ids] + [
        {k: ("" if v is None else str(v)) for k, v in r.items()} for r in new_rows
    ]
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, restval="", extrasaction="ignore")
        writer.writeheader()
        writer.writerows(merged)
    print(f"  Merged {len(new_rows)} WHOOP rows into {path.name}.")


def update_supplement_csv(workouts: list) -> None:
    """Add strain + calories (real WHOOP data) to the chatbot's supplement table."""
    rows = []
    for w in workouts:
        score = w["score"]
        start = datetime.fromisoformat(w["start"].replace("Z", "+00:00"))
        end   = datetime.fromisoformat(w["end"].replace("Z", "+00:00"))
        kj = score.get("kilojoule")
        rows.append({
            "id": str(w["id"]),
            "elapsed_time": int((end - start).total_seconds()),
            "kilojoules": round(kj, 1) if kj else "",
            "calories": round(kj / 4.184) if kj else "",
            "strain": round(score["strain"], 1) if score.get("strain") is not None else "",
            "device_name": "WHOOP",
        })
    _merge_rows_csv(SUPPLEMENT_PATH, "id", rows, extra_fields=("strain", "calories"))


def update_hr_summaries_csv(workouts: list, max_hr: float) -> None:
    """Append honest HR summary fields for WHOOP workouts: avg/max HR plus
    pct_over_* estimated from zone durations. Stream-only fields (median,
    halves, cardiac drift) stay blank — WHOOP's API has no raw HR stream."""
    rows = []
    for w in workouts:
        score = w["score"]
        zones = _workout_zones(w)
        rows.append({
            "activity_id": str(w["id"]),
            "hr_avg": score.get("average_heart_rate", ""),
            "hr_max": score.get("max_heart_rate", ""),
            "pct_over_150": _pct_over(150, zones, max_hr),
            "pct_over_160": _pct_over(160, zones, max_hr),
            "pct_over_170": _pct_over(170, zones, max_hr),
        })
    _merge_rows_csv(HR_SUMMARIES_PATH, "activity_id", rows)


def update_activity_csv(workouts: list) -> None:
    """Merge WHOOP workout rows into the activity CSV, preserving Strava history."""
    if not CSV_PATH.exists():
        print(f"  Activity CSV not found at {CSV_PATH} — skipping workout merge.")
        return

    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        existing = list(reader)

    new_rows = [r for r in (workout_to_row(w) for w in workouts) if r]
    if not new_rows:
        print("  No scored WHOOP workouts past cutoff — CSV unchanged.")
        return

    # Replace rows re-delivered by webhook score updates, keep everything else
    new_ids = {r["id"] for r in new_rows}
    merged = [r for r in existing if r.get("id") not in new_ids] + [
        {k: ("" if v is None else str(v)) for k, v in r.items()} for r in new_rows
    ]

    def _sort_key(r: dict) -> datetime:
        try:
            return datetime.strptime(r["start_date_local_formatted"], DATE_FMT)
        except Exception:
            return datetime.min

    merged.sort(key=_sort_key, reverse=True)

    for path in (CSV_PATH, WEB_CSV_PATH):
        with open(path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(merged)
    print(f"  Merged {len(new_rows)} WHOOP workouts into activity CSV ({len(merged)} total rows).")


def main():
    if not REFRESH_TOKEN:
        print("WHOOP_REFRESH_TOKEN not set — skipping WHOOP fetch.")
        sys.exit(0)

    print("Fetching WHOOP access token…")
    token, new_refresh_token = get_tokens()
    print("Updating WHOOP_REFRESH_TOKEN secret…")
    try:
        update_github_secret("WHOOP_REFRESH_TOKEN", new_refresh_token)
    except Exception as e:
        print(f"  Warning: could not update secret: {e}")

    print("Fetching recovery records…")
    recoveries = paginate("/recovery", token)
    print(f"  {len(recoveries)} records")

    print("Fetching sleep records…")
    sleeps = paginate("/activity/sleep", token)
    print(f"  {len(sleeps)} records")

    print("Fetching cycle (strain) records…")
    cycles = paginate("/cycle", token)
    print(f"  {len(cycles)} records")

    print("Fetching workouts…")
    # Fetch from a day before the cutoff (UTC) so timezone offsets can't drop the first workout
    workouts = paginate("/activity/workout", token, {"start": "2026-07-01T00:00:00.000Z"})
    print(f"  {len(workouts)} records")

    print("Fetching body measurement…")
    try:
        body_measurement = get_json("/user/measurement/body", token)
    except requests.HTTPError as exc:
        print(f"  body measurement unavailable: {exc}")
        body_measurement = {}

    print("Merging workouts into activity data…")
    eligible = [w for w in workouts if workout_to_row(w) is not None]
    print(f"  {len(eligible)} scored workouts past cutoff")
    update_activity_csv(eligible)
    update_supplement_csv(eligible)
    update_hr_summaries_csv(eligible, body_measurement.get("max_heart_rate") or HR_MAX)

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

    # Weight comes from /user/measurement/body, which only returns the *current*
    # value — previous days are not re-derivable from the API. So we must carry
    # forward weight snapshots already saved in the existing history file;
    # otherwise each refresh would overwrite history with only today's weight.
    weight_by_date: dict[str, dict] = {}
    if OUT_PATH.exists():
        try:
            for entry in json.loads(OUT_PATH.read_text()):
                if "weightKg" in entry:
                    weight_by_date[entry["date"]] = {
                        "weightKg":  entry["weightKg"],
                        "weightLbs": entry["weightLbs"],
                    }
        except (json.JSONDecodeError, KeyError, OSError) as exc:
            print(f"  could not read existing weight history: {exc}")

    # Overlay today's weight snapshot if available.
    weight_kg = body_measurement.get("weight_kilogram")
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if weight_kg is not None:
        weight_lbs = round(weight_kg * 2.20462, 1)
        weight_by_date[today_str] = {"weightKg": round(weight_kg, 2), "weightLbs": weight_lbs}

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
