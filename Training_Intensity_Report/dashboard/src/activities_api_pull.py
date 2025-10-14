import os
import json
import requests
import pandas as pd

# ----------------------
# Load credentials from JSON
# ----------------------
def load_credentials(path=r"D:\OneDrive\Strava Training Report\Training_Intensity_Report\config\credentials.json"):
    with open(path, "r") as f:
        creds = json.load(f)
    return creds["client_id"], creds["client_secret"], creds["refresh_token"]

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
    response.raise_for_status()
    return response.json()['access_token']

# ----------------------
# Fetch activities from Strava API
# ----------------------
def get_all_activities(access_token, per_page=175):
    headers = {'Authorization': f'Bearer {access_token}'}
    activities = []
    page = 1

    while True:
        url = f"https://www.strava.com/api/v3/athlete/activities?per_page={per_page}&page={page}"
        response = requests.get(url, headers=headers)
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
    CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN = load_credentials()
    access_token = refresh_access_token(CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN)

    csv_path = os.path.join(os.path.dirname(__file__), "..", "data", "all_activities_rawdata.csv")
    existing_df = load_existing_activities(csv_path)

    # Fetch new data
    all_activities_df = get_all_activities(access_token)
    save_new_activities(all_activities_df, existing_df, csv_path)

    print("All done!")