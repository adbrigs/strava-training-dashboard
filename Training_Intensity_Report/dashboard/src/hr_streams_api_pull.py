import json
import requests
import pandas as pd
import os
import time

# ----------------------
# Load credentials
# ----------------------
def load_credentials(path=r"D:\OneDrive\Strava Training Report\Training_Intensity_Report\config\credentials.json"):
    with open(path, "r") as f:
        creds = json.load(f)
    return creds["client_id"], creds["client_secret"], creds["refresh_token"]

# ----------------------
# Refresh access token
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
# Get all activities
# ----------------------
def get_all_activities(access_token, per_page=50):
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
    return activities

# ----------------------
# Get streams for one activity
# ----------------------
def get_activity_streams(access_token, activity_id, types="time,distance,altitude,heartrate"):
    headers = {'Authorization': f'Bearer {access_token}'}
    url = f"https://www.strava.com/api/v3/activities/{activity_id}/streams?keys={types}&key_by_type=true"
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    return response.json()

# ----------------------
# Flatten streams safely
# ----------------------
def flatten_streams(streams, activity_id, sport_type):
    if not streams or 'time' not in streams:
        return pd.DataFrame()

    n = len(streams['time']['data'])

    data = {
        'activity_id': [activity_id] * n,
        'sport_type': [sport_type] * n,
        'time': streams['time']['data'],
        'distance_miles': [d * 0.000621371 for d in streams.get('distance', {}).get('data', [0]*n)],
        'elevation_feet': [e * 3.28084 for e in streams.get('altitude', {}).get('data', [0]*n)],
        'heartrate': streams.get('heartrate', {}).get('data', [None]*n)
    }

    df = pd.DataFrame(data)

    # Compute grade (slope)
    df['grade'] = df['elevation_feet'].diff() / (df['distance_miles'].diff() * 5280)
    df['grade'] = df['grade'].fillna(0)

    # Compute pace (minutes per mile)
    df['pace'] = df['time'].diff() / df['distance_miles'].diff()
    df['pace'] = (df['pace'] / 60).fillna(0)

    return df

# ----------------------
# Load existing CSV (if exists)
# ----------------------
def load_existing_csv(path):
    if os.path.exists(path):
        existing_df = pd.read_csv(path)
        print(f"Loaded {len(existing_df)} rows from existing CSV.")
        return existing_df
    print("No existing CSV found. Creating a new one.")
    return pd.DataFrame()

# ----------------------
# Main
# ----------------------
if __name__ == "__main__":
    CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN = load_credentials()
    access_token = refresh_access_token(CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN)

    # CSV path
    csv_file = os.path.join(os.path.dirname(__file__),'..', "data", "all_hr_activities.csv")
    os.makedirs(os.path.dirname(csv_file), exist_ok=True)

    existing_df = load_existing_csv(csv_file)
    existing_ids = set(existing_df["activity_id"].unique()) if not existing_df.empty else set()

    # Fetch all activities
    activities = get_all_activities(access_token)
    print(f"Found {len(activities)} total activities")

    # Define types likely to have heart rate + Yoga and Tennis
    valid_types = ['Run', 'Ride', 'Hike', 'Walk', 'Elliptical', 'Rowing', 'Nordic Ski', 'Yoga', 'Tennis']
    
    # Filter out manual and invalid activities
    filtered_activities = [
        a for a in activities 
        if a.get('type') in valid_types and not a.get('manual', False)
    ]

    # Only new ones
    new_activities = [a for a in filtered_activities if a['id'] not in existing_ids]
    print(f"Processing {len(new_activities)} new activities with likely heart rate")

    all_streams = []
    for idx, activity in enumerate(new_activities):
        activity_id = activity['id']
        sport_type = activity.get('type', 'Unknown')
        try:
            streams = get_activity_streams(access_token, activity_id)
            flat_df = flatten_streams(streams, activity_id, sport_type)
            if not flat_df.empty:
                all_streams.append(flat_df)
            print(f"Processed {sport_type} activity {activity_id} ({idx+1}/{len(new_activities)})")
            time.sleep(0.5)  # avoid hitting rate limits
        except requests.HTTPError as e:
            print(f"Error fetching activity {activity_id}: {e}")

    if all_streams:
        new_df = pd.concat(all_streams, ignore_index=True)
        combined_df = pd.concat([existing_df, new_df], ignore_index=True)
        combined_df.to_csv(csv_file, index=False)
        print(f"Added {len(new_df)} new data points. Total now: {len(combined_df)} rows in {csv_file}")
    else:
        print("No new stream data to save.")
