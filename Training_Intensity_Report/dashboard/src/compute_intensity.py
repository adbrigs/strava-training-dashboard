import pandas as pd
import numpy as np
import os

# ----------------------
# Compute personalized intensity and TRIMP
# ----------------------
def compute_personalized_intensity(
    base_path = os.path.dirname(os.path.dirname(__file__)),
    age=27,
    hr_rest=60
):
    data_dir = os.path.join(base_path, "data")
    input_csv = os.path.join(data_dir, "all_activities_rawdata.csv")
    output_csv = os.path.join(data_dir, "activity_data_with_intensity.csv")

    # Estimate HR max using Tanaka formula
    hr_max = 208 - 0.7 * age
    print(f"Using personalized HR_max = {hr_max:.0f} bpm, HR_rest = {hr_rest} bpm")

    # --- Load data ---
    df = pd.read_csv(input_csv)

    # Ensure numeric columns
    numeric_cols = [
        "distance", "moving_time", "total_elevation_gain",
        "average_heartrate", "max_heartrate"
    ]
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    # Skip manual/no HR activities
    df = df[
        (df["manual"] == False) &
        (df["has_heartrate"] == True) &
        (df["average_heartrate"].notnull()) &
        (df["moving_time"] > 0)
    ].copy()

    # --- Unit conversions ---
    df["distance (miles)"] = df["distance"] * 0.000621371
    df["elevation_gain (feet)"] = df["total_elevation_gain"] * 3.28084
    df["moving_time (minutes)"] = df["moving_time"] / 60

    # --- HR Ratio ---
    df["hr_ratio (0-1)"] = (df["average_heartrate"] - hr_rest) / (hr_max - hr_rest)
    df["hr_ratio (0-1)"] = df["hr_ratio (0-1)"].clip(lower=0)

    # --- TRIMP ---
    df["trimp (score)"] = df["moving_time (minutes)"] * df["hr_ratio (0-1)"] * np.exp(1.92 * df["hr_ratio (0-1)"])
    df["trimp (score)"] = df["trimp (score)"].clip(lower=0)

    # --- Personalized HR zones ---
    def get_hr_zone(hr):
        if pd.isna(hr):
            return np.nan
        hr_ratio = (hr - hr_rest) / (hr_max - hr_rest)
        if hr_ratio < 0.6: return 1
        elif hr_ratio < 0.7: return 2
        elif hr_ratio < 0.8: return 3
        elif hr_ratio < 0.9: return 4
        else: return 5

    df["hr_zone (1-5)"] = df["average_heartrate"].apply(get_hr_zone)

    # --- Sort by date and format ---
    if "start_date_local" in df.columns:
        df["start_date_local"] = pd.to_datetime(df["start_date_local"])
        df.sort_values(by="start_date_local", ascending=False, inplace=True)
        df["start_date_local_formatted"] = df["start_date_local"].dt.strftime("%b %d, %Y %I:%M %p")

    # --- Reorder columns for readability ---
    columns_order = [
        "start_date_local_formatted", "name", "sport_type",
        "distance (miles)", "moving_time (minutes)", "elevation_gain (feet)",
        "average_heartrate", "max_heartrate", "hr_ratio (0-1)", "hr_zone (1-5)",
        "trimp (score)", "id"
    ]
    df = df[[c for c in columns_order if c in df.columns]]

    # --- Save CSV ---
    os.makedirs(data_dir, exist_ok=True)
    output_sorted_csv = os.path.join(data_dir, "activity_data_with_intensity.csv")
    df.to_csv(output_sorted_csv, index=False)
    print(f"✅ Saved personalized & sorted activity data: {output_sorted_csv}")
    print(f"📊 Processed {len(df)} valid activities with HR data.")

    return df

# ----------------------
# Example usage
# ----------------------
if __name__ == "__main__":
    my_age = 27
    my_resting_hr = 57

    df_final = compute_personalized_intensity(age=my_age, hr_rest=my_resting_hr)
    print(df_final.head(10))
