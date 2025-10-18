# streamlit_dash_upgraded.py
import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime, timedelta
import re
import numpy as np
import os

# -------------------------
# Page configuration
# -------------------------
st.set_page_config(page_title="Andrew's Training Dashboard", layout="wide")
st.title("Andrew's Training Dashboard")
st.markdown("Visualize your TRIMP (Training Impulse) scores by activity and over time.")

# -------------------------
# Load CSV
# -------------------------

csv_path = os.path.join(os.path.dirname(__file__), "data", "activity_data_with_intensity.csv")
df = pd.read_csv(csv_path)

# -------------------------
# Clean column names
# -------------------------
df.columns = df.columns.str.strip().str.lower().str.replace(' ', '_').str.replace('(', '').str.replace(')', '')

# Map columns to friendly names
df['date'] = pd.to_datetime(df['start_date_local_formatted'], format="%b %d, %Y %I:%M %p")
df['activity_type'] = df['sport_type']
df['distance'] = df['distance_miles']
df['avg_hr'] = df['average_heartrate']
df['intensity'] = df['trimp_score']

# -------------------------
# Sidebar filters
# -------------------------
st.sidebar.header("Filters")
activity_types = df['activity_type'].unique()
selected_activities = st.sidebar.multiselect(
    "Select Activity Type", activity_types, default=activity_types
)

# Default date range = last 8 weeks
default_end = df['date'].max()
default_start = default_end - pd.Timedelta(days=56)

date_range = st.sidebar.date_input(
    "Select Date Range",
    [default_start.date(), default_end.date()]
)
# -------------------------
# Show last data update timestamp in sidebar
# -------------------------
csv_path = os.path.join(os.path.dirname(__file__), "data", "activity_data_with_intensity.csv")
if os.path.exists(csv_path):
    # Get last modified time of CSV
    last_modified_ts = os.path.getmtime(csv_path)
    last_modified_dt = datetime.fromtimestamp(last_modified_ts)
    # Display nicely in sidebar
    st.sidebar.markdown(f"**Data last updated:** {last_modified_dt.strftime('%Y-%m-%d %H:%M:%S')}")
else:
    st.sidebar.markdown("**Data last updated:** No data file found")
    
# -------------------------
# Filter dataframe (include full end date)
# -------------------------
start_dt = pd.to_datetime(date_range[0])
end_dt = pd.to_datetime(date_range[1]) + pd.Timedelta(days=1)

df_filtered = df[
    (df['activity_type'].isin(selected_activities)) &
    (df['date'] >= start_dt) &
    (df['date'] < end_dt)
].copy()

# -------------------------
# Compute weekly and monthly TRIMP totals
# -------------------------
if not df_filtered.empty:
    # Weekly totals
    df_filtered['week'] = df_filtered['date'].dt.to_period('W').apply(lambda r: r.start_time)
    df_weekly_total = df_filtered.groupby('week', as_index=False, observed=False)['intensity'].sum()
    df_weekly_total['rolling_avg'] = df_weekly_total['intensity'].rolling(window=8, min_periods=1).mean()
    avg_weekly_trimp = round(df_weekly_total['intensity'].mean(), 1)

    # Monthly totals
    df_filtered['year_month'] = df_filtered['date'].dt.to_period('M').apply(lambda r: r.start_time)
    df_monthly_total = df_filtered.groupby('year_month', as_index=False, observed=False)['intensity'].sum()
    df_monthly_total['rolling_avg'] = df_monthly_total['intensity'].rolling(window=2, min_periods=1).mean()

else:
    avg_weekly_trimp = 0
    df_weekly_total = pd.DataFrame()
    df_monthly_total = pd.DataFrame()

# -------------------------
# Helper functions
# -------------------------
def get_contrast_color(color_str):
    if not color_str:
        return "white"
    if color_str.startswith("rgb"):
        nums = re.findall(r"[\d.]+", color_str)
        if len(nums) >= 3:
            r, g, b = [float(n) for n in nums[:3]]
            brightness = (r * 299 + g * 587 + b * 114) / 1000
            return "black" if brightness > 160 else "white"
    if color_str.startswith("#"):
        hex_color = color_str.lstrip("#")
        if len(hex_color) == 6:
            r, g, b = tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
            brightness = (r * 299 + g * 587 + b * 114) / 1000
            return "black" if brightness > 160 else "white"
    return "white"

transparent_layout = dict(
    paper_bgcolor="rgba(0,0,0,0)",
    plot_bgcolor="rgba(0,0,0,0)",
    font=dict(color="white", family="Arial"),
    xaxis=dict(gridcolor="rgba(255,255,255,0.1)"),
    yaxis=dict(gridcolor="rgba(255,255,255,0.1)"),
    legend=dict(font=dict(color="white"))
)

# -------------------------
# Compute streaks
# -------------------------
if not df_filtered.empty:
    df_sorted = df_filtered.sort_values('date')
    df_sorted['date_only'] = df_sorted['date'].dt.date
    unique_dates = pd.Series(df_sorted['date_only'].unique())
    streak = 0
    max_streak = 0
    last_date = None
    for d in unique_dates:
        if last_date and (d - last_date).days == 1:
            streak += 1
        else:
            streak = 1
        max_streak = max(max_streak, streak)
        last_date = d
else:
    streak = 0
    max_streak = 0

# -------------------------
# Summary KPIs
# -------------------------
st.header("Summary Metrics")
col1, col2, col3, col4, col5, col6, col7, col8 = st.columns(8)

max_trimp = round(df_filtered['intensity'].max(), 1) if not df_filtered.empty else 0
longest_distance = round(df_filtered['distance'].max(), 1) if not df_filtered.empty else 0

col1.metric("Total Workouts", len(df_filtered))
col2.metric("Average TRIMP", round(df_filtered['intensity'].mean(), 1) if not df_filtered.empty else 0)
col3.metric("Average Weekly TRIMP", avg_weekly_trimp)
col4.metric("Total TRIMP", round(df_filtered['intensity'].sum(), 1) if not df_filtered.empty else 0)
col5.metric("Max TRIMP", max_trimp)
col6.metric("Longest Distance", longest_distance)
col7.metric("Current Streak", streak)
col8.metric("Max Streak", max_streak)

# -------------------------
# Weekly Workout Count (stacked bar + total number on top)
# -------------------------
st.header("Weekly Workout Count")
if not df_filtered.empty:
    df_weekly_count = df_filtered.groupby(['week','activity_type'], as_index=False, observed=False)['name'].count()
    df_weekly_count.rename(columns={'name':'count'}, inplace=True)

    # Total workouts per week
    df_weekly_total_count = df_filtered.groupby('week', as_index=False, observed=False)['name'].count()
    df_weekly_total_count.rename(columns={'name':'total'}, inplace=True)
    total_dict = dict(zip(df_weekly_total_count['week'], df_weekly_total_count['total']))

    color_sequence = px.colors.qualitative.Set2
    color_map = {act: color_sequence[i % len(color_sequence)] for i, act in enumerate(df_filtered['activity_type'].unique())}

    fig_count = px.bar(
        df_weekly_count,
        x='week',
        y='count',
        color='activity_type',
        color_discrete_map=color_map,
        title="Weekly Workout Count by Activity Type"
    )

    # Add 3-month rolling average of weekly total workouts
    if len(df_weekly_total_count) >= 1:
        try:
            df_weekly_total_count_sorted = df_weekly_total_count.sort_values('week')
            s_total = df_weekly_total_count_sorted.set_index('week')['total']
            rolling_3mo_avg = s_total.rolling('90D', min_periods=1).mean()
            fig_count.add_trace(
                go.Scatter(
                    x=rolling_3mo_avg.index,
                    y=rolling_3mo_avg.values,
                    mode='lines+markers',
                    name='3-Month Rolling Avg',
                    line=dict(color='magenta', width=3, dash='dot')
                )
            )
        except Exception:
            rolling_3mo_avg = None

    # Add total number annotation on top of each stacked bar
    for week, total in total_dict.items():
        fig_count.add_annotation(
            x=week,
            y=total + 0.3,
            text=str(total),
            showarrow=False,
            font=dict(color="white", size=12),
            align="center"
        )

    fig_count.update_layout(**transparent_layout, bargap=0.2)
    st.plotly_chart(fig_count, use_container_width=True)

    # Display current workouts/week average (latest 3-month rolling value)
    try:
        if 'rolling_3mo_avg' in locals() and rolling_3mo_avg is not None and len(rolling_3mo_avg) > 0:
            current_avg = float(rolling_3mo_avg.iloc[-1])
            st.caption(f"Current 3-month rolling workouts/week average: {current_avg:.2f}")
    except Exception:
        pass

# -------------------------
# Total TRIMP by Week (stacked + rolling average)
# -------------------------
st.header("Total Intensity by Week")
if not df_filtered.empty:
    df_weekly_type = df_filtered.groupby(['week','activity_type'], as_index=False, observed=False)['intensity'].sum()
    fig_weekly = px.bar(
        df_weekly_type,
        x='week',
        y='intensity',
        color='activity_type',
        color_discrete_map=color_map,
        title="Total TRIMP by Week (Stacked + Rolling Average)"
    )

    # Add rolling average line
    fig_weekly.add_trace(
        go.Scatter(
            x=df_weekly_total['week'],
            y=df_weekly_total['rolling_avg'],
            mode='lines+markers',
            name='2-Month Rolling Avg',
            line=dict(color='magenta', width=3, dash='dot')
        )
    )
    fig_weekly.update_layout(**transparent_layout, bargap=0.2)
    st.plotly_chart(fig_weekly, use_container_width=True)

# -------------------------
# Total TRIMP by Month
# -------------------------
st.header("Total Intensity by Month")
if not df_filtered.empty:
    # Aggregate intensity by month and activity type
    df_monthly_type = df_filtered.groupby(['year_month','activity_type'], as_index=False, observed=False)['intensity'].sum()

    # Convert year_month to string for x-axis
    df_monthly_type['month_label'] = df_monthly_type['year_month'].dt.strftime('%b %Y')
    df_monthly_total['month_label'] = df_monthly_total['year_month'].dt.strftime('%b %Y')

    # Sort months chronologically
    month_order = df_monthly_type['month_label'].drop_duplicates().tolist()
    df_monthly_type['month_label'] = pd.Categorical(df_monthly_type['month_label'], categories=month_order, ordered=True)
    df_monthly_total['month_label'] = pd.Categorical(df_monthly_total['month_label'], categories=month_order, ordered=True)

    # Stacked bar chart by month
    fig_monthly = px.bar(
        df_monthly_type,
        x='month_label',
        y='intensity',
        color='activity_type',
        color_discrete_map=color_map,
        title="Total TRIMP by Month (Stacked + 2-Month Rolling Average)"
    )

    # Add rolling average line
    fig_monthly.add_trace(
        go.Scatter(
            x=df_monthly_total['month_label'],
            y=df_monthly_total['rolling_avg'],
            mode='lines+markers',
            name='2-Month Rolling Avg',
            line=dict(color='magenta', width=3, dash='dot')
        )
    )

    fig_monthly.update_layout(**transparent_layout, bargap=0.2)
    st.plotly_chart(fig_monthly, use_container_width=True)

# -------------------------
# Daily TRIMP Heatmap
# -------------------------
st.header("Daily TRIMP Heatmap")
if not df_filtered.empty:
    df_filtered['day'] = df_filtered['date'].dt.day
    df_filtered['month'] = df_filtered['date'].dt.strftime('%b')

    # Only include filtered months in chronological order
    month_order = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    filtered_months = [m for m in month_order if m in df_filtered['month'].unique()]
    df_filtered['month'] = pd.Categorical(df_filtered['month'], categories=filtered_months, ordered=True)

    df_daily_heatmap = df_filtered.groupby(['month','day'], as_index=False, observed=False)['intensity'].sum()
    heatmap_pivot = df_daily_heatmap.pivot(index='month', columns='day', values='intensity').fillna(0)

    fig_heatmap = px.imshow(
        heatmap_pivot,
        labels=dict(x="Day", y="Month", color="TRIMP"),
        text_auto=True,
        color_continuous_scale='Viridis'
    )
    fig_heatmap.update_layout(**transparent_layout)
    st.plotly_chart(fig_heatmap, use_container_width=True)

# -------------------------
# Run Pace and TRIMP Breakdown (side by side)
# -------------------------
st.header("Run Pace and Activity Breakdown")
col_left, col_right = st.columns([2, 1], gap="large")

with col_left:
    if not df_filtered.empty:
        # Subset to running-related activities while respecting the date filter
        df_runs = df_filtered[df_filtered['activity_type'].str.contains('Run', case=False, na=False)].copy()

        if not df_runs.empty:
            # Ensure pace exists; if missing, compute from moving time and distance
            if 'pace_min_per_mile' not in df_runs.columns:
                if {'moving_time_minutes','distance_miles'}.issubset(df_runs.columns):
                    df_runs['pace_min_per_mile'] = (
                        pd.to_numeric(df_runs['moving_time_minutes'], errors='coerce') /
                        pd.to_numeric(df_runs['distance_miles'], errors='coerce')
                    )
                else:
                    # As a last resort, try generic names set earlier
                    if {'moving_time_minutes','distance'}.issubset(df_runs.columns):
                        df_runs['pace_min_per_mile'] = (
                            pd.to_numeric(df_runs['moving_time_minutes'], errors='coerce') /
                            pd.to_numeric(df_runs['distance'], errors='coerce')
                        )

            # Ensure a numeric distance column for size encoding
            if 'distance' not in df_runs.columns and 'distance_miles' in df_runs.columns:
                df_runs['distance'] = df_runs['distance_miles']

            # Drop rows without valid pace or distance
            df_runs = df_runs.dropna(subset=['pace_min_per_mile', 'distance'])
            df_runs = df_runs[(df_runs['distance'] > 0) & (df_runs['pace_min_per_mile'] > 0)]

            if not df_runs.empty:
                # Build scatter: date vs pace, bubble size by distance
                hover_cols = {
                    'name': True,
                    'distance': ':.2f',
                    'avg_hr': True
                }
                # Include formatted pace in hover if present
                if 'pace_formatted' in df_runs.columns:
                    hover_cols['pace_formatted'] = True
                else:
                    hover_cols['pace_min_per_mile'] = ':.2f'

                fig_runs = px.scatter(
                    df_runs,
                    x='date',
                    y='pace_min_per_mile',
                    size='distance',
                    color='distance',
                    color_continuous_scale='Turbo',
                    hover_data=hover_cols,
                    title='Run Pace Over Time (bubble size = distance)'
                )

                # Faster pace is smaller minutes; invert y-axis so faster appears higher
                fig_runs.update_yaxes(autorange='reversed', title_text='Pace (min/mi)')
                fig_runs.update_xaxes(title_text='Date')

                # Add a 21-day rolling median pace line for context
                try:
                    tmp = df_runs[['date','pace_min_per_mile']].dropna().sort_values('date')
                    tmp = tmp.set_index('date').asfreq('D')  # daily frequency to smooth gaps
                    roll_med = tmp['pace_min_per_mile'].rolling('21D', min_periods=1).median()
                    fig_runs.add_trace(
                        go.Scatter(
                            x=roll_med.index,
                            y=roll_med.values,
                            mode='lines',
                            name='21-day rolling median',
                            line=dict(color='magenta', width=3, dash='dot')
                        )
                    )
                except Exception:
                    pass

                fig_runs.update_layout(**transparent_layout)
                st.plotly_chart(fig_runs, use_container_width=True)
            else:
                st.info('No run entries with valid pace and distance in the selected range.')
        else:
            st.info('No runs in current filters. Include Run in Activity Type or adjust dates.')
    else:
        st.info('No data in selected filters.')

with col_right:
    if not df_filtered.empty:
        df_type = df_filtered.groupby('activity_type', as_index=False)['intensity'].sum()
        fig_pie = px.pie(
            df_type,
            names='activity_type',
            values='intensity',
            hole=0.4,
            color_discrete_sequence=px.colors.qualitative.Set2
        )

        # Donut with inside labels only
        fig_pie.update_traces(textposition='inside', textinfo='percent+label', insidetextorientation='auto')

        # Contrast-aware text color (fallbacks to white)
        for i, trace in enumerate(fig_pie.data):
            color = trace.marker.colors
            contrast_color = get_contrast_color(color)
            trace.textposition = 'inside'
            trace.textfont = dict(color=contrast_color, size=14)

        fig_pie.update_layout(**transparent_layout)
        st.plotly_chart(fig_pie, use_container_width=True)
    else:
        st.info("No workouts in selected filters.")

# --- Activity Details Section ---
st.markdown("### 🏃 Activity Details")

if not df_filtered.empty:

    # Convert start date to datetime with explicit format
    if "start_date_local_formatted" in df_filtered.columns:
        df_filtered["Date_dt"] = pd.to_datetime(
            df_filtered["start_date_local_formatted"],
            format="%b %d, %Y %I:%M %p",
            errors="coerce"
        )
    else:
        df_filtered["Date_dt"] = pd.NaT

    # Sort by datetime descending (newest first)
    df_sorted = df_filtered.sort_values("Date_dt", ascending=False)

    # Map CSV column names to user-friendly names
    rename_map = {
        "start_date_local_formatted": "Date",
        "name": "Activity Name",
        "sport_type": "Sport Type",
        "distance_miles": "Distance (mi)",
        "moving_time_minutes": "Moving Time (min)",
        "moving_time": "Moving Time (min)",
        "pace_min_per_mile": "Pace (min/mi)",
        "pace_formatted": "Pace",
        "elevation_gain_feet": "Elevation Gain (ft)",
        "elevation_gain": "Elevation Gain (ft)",
        "average_heartrate": "Avg HR",
        "max_heartrate": "Max HR",
        "hr_ratio_0-1": "HR Ratio",
        "hr_zone_1-5": "HR Zone",
        "trimp_score": "TRIMP",
        "trimp": "TRIMP",
        "id": "Activity ID"
    }

    # Keep only columns that exist
    existing_cols = [col for col in rename_map if col in df_sorted.columns]
    df_display = df_sorted[existing_cols].rename(columns={k: rename_map[k] for k in existing_cols})

    # --- Filter by Activity Name ---
    search_term = st.text_input("🔍 Filter by Activity Name (type any part of the name):")
    if search_term:
        df_display = df_display[df_display["Activity Name"].str.contains(search_term, case=False, na=False)]

    # Display dataframe
    st.dataframe(df_display, hide_index=True)

    # CSV download button
    csv = df_display.to_csv(index=False).encode("utf-8")
    st.download_button(
        "📥 Download Table as CSV",
        csv,
        "activity_details.csv",
        "text/csv"
    )

else:
    st.info("No activities to display for the selected filters.")
