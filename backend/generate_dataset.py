import numpy as np
import pandas as pd

np.random.seed(42)
N = 5000

road_type_scores = np.random.choice([0.35, 0.55, 0.70, 0.85, 1.0], N, p=[0.05, 0.20, 0.25, 0.30, 0.20])
avg_speed_kmh = np.random.uniform(10, 100, N)
turn_count = np.random.randint(0, 80, N)
elevation_gain_m = np.random.uniform(0, 300, N)
weather_score = np.random.uniform(0.0, 1.0, N)
time_of_day_score = np.random.choice([0.4, 0.75, 0.95], N, p=[0.2, 0.6, 0.2])
distance_km = np.random.uniform(1, 50, N)
sharp_turn_count = np.random.randint(0, 20, N)
u_turn_count = np.random.randint(0, 5, N)
intersection_count = turn_count + np.random.randint(0, 15, N)
signal_count = (intersection_count * np.random.uniform(0.2, 0.5, N)).astype(int)
roundabout_count = np.random.randint(0, 8, N)
lane_change_count = np.random.randint(0, 10, N)
traffic_density_score = np.random.uniform(0.2, 1.0, N)

comfort = (
    0.20 * road_type_scores * 100 +
    0.15 * np.minimum(avg_speed_kmh / 80, 1) * 100 +
    0.12 * np.maximum(0, 1 - turn_count / 60) * 100 +
    0.08 * np.maximum(0, 1 - sharp_turn_count / 15) * 100 +
    0.05 * np.maximum(0, 1 - u_turn_count / 4) * 100 +
    0.08 * np.maximum(0, 1 - intersection_count / 50) * 100 +
    0.05 * np.maximum(0, 1 - signal_count / 20) * 100 +
    0.05 * np.maximum(0, 1 - elevation_gain_m / 200) * 100 +
    0.08 * weather_score * 100 +
    0.06 * time_of_day_score * 100 +
    0.08 * traffic_density_score * 100
) + np.random.normal(0, 2.5, N)

comfort = np.clip(comfort, 0, 100)

df = pd.DataFrame({
    "road_type_score": road_type_scores,
    "avg_speed_kmh": avg_speed_kmh,
    "turn_count": turn_count,
    "elevation_gain_m": elevation_gain_m,
    "weather_score": weather_score,
    "time_of_day_score": time_of_day_score,
    "distance_km": distance_km,
    "sharp_turn_count": sharp_turn_count,
    "u_turn_count": u_turn_count,
    "intersection_count": intersection_count,
    "signal_count": signal_count,
    "roundabout_count": roundabout_count,
    "lane_change_count": lane_change_count,
    "traffic_density_score": traffic_density_score,
    "comfort_score": comfort
})

df.to_csv("dataset.csv", index=False)
print(f"✅ Dataset generated: {len(df)} rows → dataset.csv")
print(f"   Comfort score range: {comfort.min():.1f} – {comfort.max():.1f}")