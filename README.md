# SmoothWay — ML-Powered Comfort Route Recommendation App

## Quick Setup

### Step 1: Backend Setup

```bash
cd backend
pip install -r requirements.txt
python generate_dataset.py   # Run once — creates dataset.csv
python train_model.py        # Run once — creates model.joblib + scaler.joblib
python app.py                # Keep running on port 5000
```

You should see:
```
MAE: X.XX
R²:  0.XXXX
Saved model.joblib and scaler.joblib
 * Running on http://0.0.0.0:5000
```

### Step 2: Get Your WiFi IP

**Windows:**
```
ipconfig
```
Look for: IPv4 Address under Wi-Fi (e.g. 192.168.1.105)

**Mac/Linux:**
```
ifconfig | grep "inet "
```

### Step 3: Update API_BASE in mobile/App.js

Open `mobile/App.js` and change line 12:
```js
const API_BASE = 'http://YOUR_WIFI_IP:5000';
```
e.g. `const API_BASE = 'http://192.168.1.105:5000';`

### Step 4: Mobile App Setup

```bash
cd mobile
npm install --legacy-peer-deps
npx expo start
```

Scan the QR code with Expo Go SDK 51 on your phone.

> ⚠️ IMPORTANT: You must use Expo Go SDK 51, NOT the latest version.
> Download: https://expo.dev/go?sdkVersion=51&platform=android&device=true

### Requirements
- Your phone and PC must be on the **same WiFi network**
- Backend must be running before you search for routes

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Check server & model status |
| POST | /recommend | Get route recommendations |
| POST | /predict | Direct ML inference |

## ML Model

- Algorithm: RandomForestRegressor (200 trees, max depth 12)
- Input: 7 comfort features (road type, speed, turns, elevation, weather, time, distance)
- Output: Comfort score 0–100
- Training: 5000 synthetic samples

## APIs Used
- **TomTom Routing API** — Real-time traffic routes
- **TomTom Fuzzy Search** — Geocoding (places, landmarks, colleges)
- **OpenWeatherMap** — Live weather at route midpoint
