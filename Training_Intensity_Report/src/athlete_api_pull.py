import json
import requests
import pandas as pd
import os
import time
import csv  # needed for DictWriter

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
            "client_id": client_id,
            "client_secret": client_secret,
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
        },
    )
    response.raise_for_status()
    return response.json()["access_token"]

# ----------------------
# Get athlete data
# ----------------------
def get_athlete_data(access_token):
    headers = {"Authorization": f"Bearer {access_token}"}

    # Profile info
    profile_url = "https://www.strava.com/api/v3/athlete"
    response = requests.get(profile_url, headers=headers)
    response.raise_for_status()
    athlete = response.json()

    # Flatten athlete info
    data = {
        "id": athlete.get("id"),
        "username": athlete.get("username"),
        "firstname": athlete.get("firstname"),
        "lastname": athlete.get("lastname"),
        "weight": athlete.get("weight"),
        "city": athlete.get("city"),
        "country": athlete.get("country"),
        "sex": athlete.get("sex"),
        "bio": athlete.get("bio"),
    }

    return data

# ----------------------
# Write to CSV in /data path
# ----------------------
def write_csv(data, path=r"D:\OneDrive\Strava Training Report\Training_Intensity_Report\data\athlete_data.csv"):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    headers = list(data.keys())
    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        writer.writerow(data)
    print(f"Athlete data written to {path}")

# ----------------------
# Main
# ----------------------
if __name__ == "__main__":
    client_id, client_secret, refresh_token = load_credentials()
    access_token = refresh_access_token(client_id, client_secret, refresh_token)
    athlete_data = get_athlete_data(access_token)
    write_csv(athlete_data)
