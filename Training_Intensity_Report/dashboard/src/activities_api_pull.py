import os
import json
import requests
import pandas as pd
from pathlib import Path

# Load Credentials

def load_credentials(path=None):
    """
    Load client_id, client_secret, refresh_token from config/credentials.json
    or from environment variable CREDENTIALS_JSON (for GitHub Actions).
    """
    import os, json
    from pathlib import Path

    # 1️⃣ If running on GitHub Actions, use the secret environment variable
    creds_json = os.environ.get("CREDENTIALS_JSON")
    if creds_json:
        creds = json.loads(creds_json)
        return creds["client_id"], creds["client_secret"], creds["refresh_token"], creds.get("access_token")

    # 2️⃣ Otherwise, use local file
    if path is None:
        from pathlib import Path
        repo_root = Path(__file__).parent.parent.parent  # one more .parent to go up to repo root
        path = repo_root / "config" / "credentials.json"

    if not path.exists():
        raise FileNotFoundError(f"Credentials file not found at {path}")

    with open(path, "r") as f:
        creds = json.load(f)

    return creds["client_id"], creds["client_secret"], creds["refresh_token"], creds.get("access_token")

# ----------------------
# Refresh Strava access token
# ----------------------
def refresh_access_token(client_id, client_secret, refresh_token):
    response = requests.post(
        "https://www.strava.com/oauth/token",
        data={
            'client_id': client_id,
            'client_secret': client_secret,
            'grant_type': 'refresh_token',
            'refresh_token': refresh_token
        }
    )
    print(f"Token refresh response status: {response.status_code}")
    if response.status_code != 200:
        print(f"Token refresh failed: {response.text}")
    response.raise_for_status()
    token_data = response.json()
    print(f"Token refresh successful. Access token: {token_data.get('access_token', 'N/A')[:20]}...")
    return token_data['access_token']

# ----------------------
# Fetch HR streams for activities with HR
# ----------------------
def get_hr_streams(access_token, activity_ids):
    headers = {'Authorization': f'Bearer {access_token}'}
    streams_data = {}
    
    for activity_id in activity_ids:
        try:
            url = f"https://www.strava.com/api/v3/activities/{activity_id}/streams?keys=heartrate,time&key_by_type=true"
            response = requests.get(url, headers=headers)
            response.raise_for_status()
            data = response.json()
            if 'heartrate' in data and 'time' in data:
                streams_data[activity_id] = {
                    'heartrate': data['heartrate']['data'],
                    'time': data['time']['data']
                }
        except Exception as e:
            print(f"Failed to get streams for activity {activity_id}: {e}")
    
    return streams_data
def get_all_activities(access_token, per_page=175):
    headers = {'Authorization': f'Bearer {access_token}'}
    activities = []
    page = 1

    while True:
        url = f"https://www.strava.com/api/v3/athlete/activities?per_page={per_page}&page={page}"
        print(f"Fetching activities page {page}...")
        response = requests.get(url, headers=headers)
        print(f"Activities API response status: {response.status_code}")
        if response.status_code != 200:
            print(f"Activities API failed: {response.text}")
        response.raise_for_status()
        data = response.json()

        if not data:
            break

        activities.extend(data)
        page += 1

    if not activities:
        print("No activities found.")
        return pd.DataFrame()

    df = pd.json_normalize(activities)
    print(f"Fetched {len(df)} activities from API.")
    return df

# ----------------------
# Load existing CSV if it exists
# ----------------------
def load_existing_activities(path):
    if os.path.exists(path):
        existing_df = pd.read_csv(path)
        print(f"Loaded {len(existing_df)} existing activities from CSV.")
        return existing_df
    print("No existing CSV found. Will create a new one.")
    return pd.DataFrame()

# ----------------------
# Append only new activities to CSV
# ----------------------
def save_new_activities(new_df, existing_df, path):
    if new_df.empty:
        print("No new data fetched.")
        return

    if not existing_df.empty and "id" in existing_df.columns:
        existing_ids = set(existing_df["id"].astype(str))
        new_df = new_df[~new_df["id"].astype(str).isin(existing_ids)]

    if new_df.empty:
        print("No new activities to append.")
        return

    combined_df = pd.concat([existing_df, new_df], ignore_index=True)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    combined_df.to_csv(path, index=False)
    print(f"Added {len(new_df)} new activities. Total now: {len(combined_df)}.")

# ----------------------
# Main
# ----------------------
if __name__ == "__main__":
    print("Processing... please wait.")
    CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN, ACCESS_TOKEN = load_credentials()
    
    # Use provided access token if available, otherwise refresh
    if ACCESS_TOKEN:
        print("Using provided access token...")
        access_token = ACCESS_TOKEN
    else:
        print("Refreshing access token...")
        access_token = refresh_access_token(CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN)

    csv_path = os.path.join(os.path.dirname(__file__), "..", "data", "all_activities_rawdata.csv")
    existing_df = load_existing_activities(csv_path)

    # Fetch new data
    all_activities_df = get_all_activities(access_token)
    
    # Get HR streams for activities with HR
    hr_activity_ids = all_activities_df[all_activities_df['has_heartrate'] == True]['id'].tolist()
    if hr_activity_ids:
        print(f"Fetching HR streams for {len(hr_activity_ids)} activities...")
        streams = get_hr_streams(access_token, hr_activity_ids)
        # Save streams to a JSON file
        streams_path = os.path.join(os.path.dirname(csv_path), "hr_streams.json")
        with open(streams_path, 'w') as f:
            json.dump(streams, f)
        print(f"Saved HR streams to {streams_path}")
    
    save_new_activities(all_activities_df, existing_df, csv_path)

    print("All done!")