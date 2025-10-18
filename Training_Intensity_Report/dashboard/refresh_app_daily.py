import os
import sys
import json
import subprocess
from pathlib import Path

# ---------------------------------------
# Step 0: Load Credentials (file OR env)
# ---------------------------------------
def load_credentials():
    """
    Load credentials in this order:
    1. Environment variable CREDENTIALS_JSON (GitHub Actions)
    2. Local file: ../config/credentials.json
    """
    
    # 1) Try environment variable (GitHub Actions)
    creds_json = os.getenv("CREDENTIALS_JSON")
    if creds_json:
        try:
            creds = json.loads(creds_json)
            print("✅ Loaded credentials from environment variable.")
            return creds["client_id"], creds["client_secret"], creds["refresh_token"]
        except Exception as e:
            print(f"⚠ Error parsing CREDENTIALS_JSON env var: {e}")

    # 2) Fallback to local file
    local_path = Path(__file__).resolve().parent.parent / "config" / "credentials.json"
    if local_path.exists():
        try:
            with open(local_path, "r") as f:
                creds = json.load(f)
            print(f"✅ Loaded credentials from local file: {local_path}")
            return creds["client_id"], creds["client_secret"], creds["refresh_token"]
        except Exception as e:
            print(f"⚠ Error reading local credentials file: {e}")

    # 3) If both fail:
    raise FileNotFoundError("❌ No valid credentials found in env or local file.")


# ---------------------------------------
# Step 1: Define Paths
# ---------------------------------------
BASE_DIR = Path(__file__).resolve().parent
SRC_DIR = BASE_DIR / "src"
API_PULL = SRC_DIR / "activities_api_pull.py"
COMPUTE_INTENSITY = SRC_DIR / "compute_intensity.py"
DASHBOARD = BASE_DIR / "streamlit_dash.py"
REFRESH_INTERVAL_HOURS = 4

# ---------------------------------------
# Step 2: Debug Paths
# ---------------------------------------
print("\n==============================")
print("🚴 Running data update pipeline...")
print("==============================")
print("CWD:", os.getcwd())
print("BASE_DIR:", BASE_DIR)
print("SRC_DIR:", SRC_DIR)
print("API_PULL exists:", API_PULL.exists())
print("COMPUTE_INTENSITY exists:", COMPUTE_INTENSITY.exists())

# ---------------------------------------
# Step 3: Validate Credentials Early
# ---------------------------------------
try:
    client_id, client_secret, refresh_token = load_credentials()
    print("✅ Credentials loaded successfully.")
except Exception as e:
    print(e)
    sys.exit(1)

# ---------------------------------------
# Step 4: Run Sub-Scripts Safely
# ---------------------------------------
def run_script(script_path):
    """Run a Python script using the same interpreter & fail if error."""
    print(f"\n➡️ Running: {script_path.name}")
    result = subprocess.run([sys.executable, script_path], cwd=BASE_DIR)
    if result.returncode != 0:
        print(f"❌ Script failed: {script_path}")
        sys.exit(result.returncode)

# Step 1: Pull new Strava activities
run_script(API_PULL)

# Step 2: Recompute intensity metrics
run_script(COMPUTE_INTENSITY)

print("\n✅ Data updated successfully.")
print("🔄 Refresh streamlit dashboard to show update...")

# ---------------------------------------
# Step 5: (Optional) Run Streamlit Locally
# ---------------------------------------
# os.system(f'streamlit run "{DASHBOARD}" --server.port 8501')

print(f"⏰ Done. Waiting {REFRESH_INTERVAL_HOURS} hours before next refresh...\n")
