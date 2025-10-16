import time
import os
from pathlib import Path

# Base directory (the folder this script is in)
BASE_DIR = Path(__file__).resolve().parent

# Scripts in src subfolder
SRC_DIR = BASE_DIR / "src"
API_PULL = SRC_DIR / "activities_api_pull.py"
COMPUTE_INTENSITY = SRC_DIR / "compute_intensity.py"
DASHBOARD = BASE_DIR / "streamlit_dash.py"

REFRESH_INTERVAL_HOURS = 6

while True:
    print("\n==============================")
    print("🚴 Running data update pipeline...")
    print("==============================")

    # Step 1: Pull new Strava activities
    os.system(f'python "{API_PULL}"')

    # Step 2: Recompute intensity metrics
    os.system(f'python "{COMPUTE_INTENSITY}"')

    print("\n✅ Data updated successfully.")
    print("🔄 Launching Streamlit dashboard...")

    # Step 3: Run Streamlit dashboard
    os.system(f'streamlit run "{DASHBOARD}" --server.port 8501')

    print(f"⏰ Streamlit app closed or restarted. Waiting {REFRESH_INTERVAL_HOURS} hours before next refresh...\n")
    time.sleep(REFRESH_INTERVAL_HOURS * 60 * 60)