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
# TRIMP Breakdown by Activity Type (Pie Chart)
# -------------------------
st.header("TRIMP Breakdown by Activity Type")
if not df_filtered.empty:
    df_type = df_filtered.groupby('activity_type', as_index=False)['intensity'].sum()
    fig_pie = px.pie(
        df_type,
        names='activity_type',
        values='intensity',
        hole=0.4,
        color_discrete_sequence=px.colors.qualitative.Set2
    )

    # Center labels and contrast-aware colors
    for i, trace in enumerate(fig_pie.data):
        color = trace.marker.colors
        contrast_color = get_contrast_color(color)
        trace.textposition = 'inside'
        trace.textfont = dict(color=contrast_color, size=14)

    fig_pie.update_layout(**transparent_layout)
    st.plotly_chart(fig_pie, use_container_width=True)
else:
    st.info("No workouts in selected filters.")
