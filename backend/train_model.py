import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_absolute_error, r2_score
import joblib

df = pd.read_csv("dataset.csv")

FEATURES = ["road_type_score", "avg_speed_kmh", "turn_count",
            "elevation_gain_m", "weather_score", "time_of_day_score", "distance_km"]
TARGET = "comfort_score"

X = df[FEATURES].values
y = df[TARGET].values

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)

model = RandomForestRegressor(n_estimators=200, max_depth=12, random_state=42, n_jobs=-1)
model.fit(X_train_scaled, y_train)

y_pred = model.predict(X_test_scaled)
mae = mean_absolute_error(y_test, y_pred)
r2 = r2_score(y_test, y_pred)

print(f"MAE: {mae:.2f}")
print(f"R²:  {r2:.4f}")

joblib.dump(model, "model.joblib")
joblib.dump(scaler, "scaler.joblib")
print("Saved model.joblib and scaler.joblib")
