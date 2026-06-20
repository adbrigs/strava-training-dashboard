# 💪 Strava Strength Training Intensity Visualizer

A Python project that connects to the **Strava API**, retrieves your **weight training and workout data**, computes a custom **intensity score**, and visualizes trends over time using **Streamlit** and **Plotly**.

---

## 🚀 Features

- Connects to your Strava account via OAuth2
- Pulls "WeightTraining" and "Workout" activities automatically
- Calculates a custom **Effort Score** based on:
  - Average heart rate (% of max HR)
  - Session density (moving vs. total time)
- Visualizes:
  - Daily and weekly intensity trends
  - Average intensity
