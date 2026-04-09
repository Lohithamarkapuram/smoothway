# SmoothWay

SmoothWay is an ML-powered route recommendation app that goes beyond fastest-path navigation and tries to recommend a route that feels more comfortable to drive.

It combines:
- a Flask backend for route scoring and API integration
- a React Native + Expo mobile app for search, route selection, and navigation
- a machine learning model that predicts route comfort from engineered route features

## What It Does

SmoothWay compares multiple route alternatives between a source and destination and recommends the best route based on the selected preference:

- `Comfort`
- `Fastest`
- `Shortest`
- `Balanced`
- `Women Safety`

The system evaluates route quality using factors such as:
- road type
- average speed
- turn count
- elevation gain
- traffic delay
- weather conditions
- time of day
- POI density and lighting proxies for women-safety estimation

## Tech Stack

### Backend
- Python
- Flask
- scikit-learn
- pandas
- NumPy
- TomTom APIs
- OpenWeatherMap API

### Mobile
- React Native
- Expo SDK 51
- react-native-webview
- Leaflet map inside WebView

### Model
- Random Forest Regressor
- StandardScaler
- Synthetic dataset with 5000 route samples

## Project Structure

```text
smoothway/
|- backend/
|  |- app.py
|  |- feature_extraction.py
|  |- generate_dataset.py
|  |- train_model.py
|  |- dataset.csv
|  |- model.joblib
|  \- scaler.joblib
|- mobile/
|  |- App.js
|  |- package.json
|  \- index.js
\- README.md
```

## How It Works

1. The user enters source and destination in the mobile app.
2. The backend geocodes those locations using TomTom Search.
3. TomTom Routing returns multiple route alternatives.
4. The backend extracts route features from each alternative.
5. Weather and safety-related context are added.
6. The ML model predicts a comfort score for each route.
7. Routes are ranked based on the selected preference.
8. The best route is displayed in the mobile app with map and navigation details.

## Setup

### 1. Backend Setup

```bash
cd backend
pip install -r requirements.txt
python generate_dataset.py
python train_model.py
python app.py
```

Expected output after training:

```text
MAE: X.XX
R²:  0.XXXX
Saved model.joblib and scaler.joblib
 * Running on http://0.0.0.0:5000
```

### 2. Find Your Local IP Address

The mobile app talks to the backend over your Wi-Fi network, so you need your laptop's local IP.

#### Windows

```bash
ipconfig
```

Look for the `IPv4 Address` under your Wi-Fi adapter.

#### Mac / Linux

```bash
ifconfig
```

### 3. Update the Mobile API Base URL

Open `mobile/App.js` and update:

```js
const API_BASE = 'http://YOUR_WIFI_IP:5000';
```

Example:

```js
const API_BASE = 'http://192.168.1.105:5000';
```

### 4. Mobile App Setup

```bash
cd mobile
npm install --legacy-peer-deps
npx expo start
```

Then scan the QR code using **Expo Go SDK 51**.

## Requirements

- Your phone and laptop must be on the same Wi-Fi network
- The backend must be running before searching routes
- Expo Go should match SDK 51 for best compatibility

## API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/health` | Check server and model availability |
| `POST` | `/recommend` | Get ranked route recommendations |
| `POST` | `/predict` | Run direct model inference |

## Model Details

- Model: `RandomForestRegressor`
- Trees: `200`
- Max depth: `12`
- Core input features:
  - road type score
  - average speed
  - turn count
  - elevation gain
  - weather score
  - time-of-day score
  - distance
- Output: comfort score on a `0-100` scale

## Data Sources

- **TomTom Search API** for geocoding
- **TomTom Routing API** for alternative routes and traffic-aware route summaries
- **TomTom Nearby Search API** for POI density estimation
- **OpenWeatherMap API** for weather context

## Current Limitations

- The model is trained on synthetic data
- Route comfort is estimated, not directly crowd-labeled
- Women safety scoring is heuristic and context-based
- The app currently expects local-network backend access during development

## Future Improvements

- real user feedback-based comfort training
- cloud deployment of the backend
- personalized user preference learning
- better safety datasets
- rerouting during live navigation
- production-ready Android/iOS packaging

## Note

This repository currently contains local-development style configuration and generated model artifacts. Before production or public demo use, API key handling and environment configuration should be cleaned up and secured.
