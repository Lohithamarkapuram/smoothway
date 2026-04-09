from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import joblib
import requests
import os
import math
from feature_extraction import extract_features

app = Flask(__name__)
CORS(app)

TOMTOM_KEY = "KcNgwEck8yx2pd3aUoCzsjJEGHv8AnSA"
OWM_KEY = "bd5e378503939ddaee76f12ad7a97608"

MODEL_PATH = "model.joblib"
SCALER_PATH = "scaler.joblib"

model = None
scaler = None

def load_model():
    global model, scaler
    if os.path.exists(MODEL_PATH) and os.path.exists(SCALER_PATH):
        model = joblib.load(MODEL_PATH)
        scaler = joblib.load(SCALER_PATH)
        print("Model loaded.")
    else:
        print("WARNING: model.joblib not found. Run train_model.py first.")

load_model()

FEATURES = ["road_type_score", "avg_speed_kmh", "turn_count",
            "elevation_gain_m", "weather_score", "time_of_day_score", "distance_km"]


def encode_polyline(points):
    result = []
    prev_lat = prev_lon = 0
    for point in points:
        lat = int(round(point.get("latitude", point.get("lat", 0)) * 1e5))
        lon = int(round(point.get("longitude", point.get("lon", 0)) * 1e5))
        for value in [lat - prev_lat, lon - prev_lon]:
            value = value << 1
            if value < 0:
                value = ~value
            while value >= 0x20:
                result.append(chr((0x20 | (value & 0x1f)) + 63))
                value >>= 5
            result.append(chr(value + 63))
        prev_lat, prev_lon = lat, lon
    return "".join(result)


def geocode(query):
    url = f"https://api.tomtom.com/search/2/search/{requests.utils.quote(query)}.json"
    params = {"key": TOMTOM_KEY, "limit": 1, "countrySet": "IN", "language": "en-GB"}
    try:
        r = requests.get(url, params=params, timeout=8)
        data = r.json()
        if data.get("results"):
            pos = data["results"][0]["position"]
            addr = data["results"][0].get("address", {})
            display = addr.get("freeformAddress", query)
            return {"lat": pos["lat"], "lon": pos["lon"], "display": display}
    except Exception as e:
        print(f"Geocode error: {e}")
    return None


def get_weather(lat, lon):
    url = "https://api.openweathermap.org/data/2.5/weather"
    params = {"lat": lat, "lon": lon, "appid": OWM_KEY, "units": "metric"}
    try:
        r = requests.get(url, params=params, timeout=6)
        data = r.json()
        weather = data.get("weather", [{}])[0]
        wind = data.get("wind", {})
        main = data.get("main", {})
        return {
            "temp_c": round(main.get("temp", 0), 1),
            "description": weather.get("description", ""),
            "icon": weather.get("icon", "01d"),
            "wind_ms": round(wind.get("speed", 0), 1),
            "city": data.get("name", ""),
            "condition_id": weather.get("id", 800)
        }
    except Exception as e:
        print(f"Weather error: {e}")
        return {"temp_c": 28, "description": "clear sky", "icon": "01d", "wind_ms": 2, "city": "", "condition_id": 800}


def get_routes(src_lat, src_lon, dst_lat, dst_lon):
    coord_str = f"{src_lat},{src_lon}:{dst_lat},{dst_lon}"
    url = f"https://api.tomtom.com/routing/1/calculateRoute/{coord_str}/json"
    params = {
        "key": TOMTOM_KEY,
        "traffic": "true",
        "travelMode": "car",
        "routeType": "fastest",
        "maxAlternatives": 2,
        "instructionsType": "text",
        "language": "en-GB",
        "computeTravelTimeFor": "all",
        "sectionType": "traffic",
        "report": "effectiveSettings"
    }
    try:
        r = requests.get(url, params=params, timeout=15)
        data = r.json()
        routes = data.get("routes", [])

        # DEBUG — print raw structure
        if routes:
            route = routes[0]
            legs = route.get("legs", [])
            print(f"[DEBUG] Route keys: {list(route.keys())}")
            print(f"[DEBUG] Legs count: {len(legs)}")
            if legs:
                leg = legs[0]
                print(f"[DEBUG] Leg keys: {list(leg.keys())}")
                instructions = leg.get("instructions", [])
                print(f"[DEBUG] Instructions count: {len(instructions)}")
                if instructions:
                    print(f"[DEBUG] First instruction: {instructions[0]}")
                else:
                    print(f"[DEBUG] NO instructions in leg!")
                    # Check if guidance is at route level
                    guidance = route.get("guidance", {})
                    print(f"[DEBUG] Route guidance keys: {list(guidance.keys()) if guidance else 'none'}")
                    instructions_top = guidance.get("instructions", [])
                    print(f"[DEBUG] Guidance instructions count: {len(instructions_top)}")
                    if instructions_top:
                        print(f"[DEBUG] First guidance instruction: {instructions_top[0]}")

        return routes
    except Exception as e:
        print(f"Routing error: {e}")
        return []

def predict_comfort(features_dict):
    if model is None:
        # Fallback formula
        f = features_dict
        score = (
            0.25 * f["road_type_score"] * 100 +
            0.20 * min(f["avg_speed_kmh"] / 80, 1) * 100 +
            0.15 * max(0, 1 - f["turn_count"] / 60) * 100 +
            0.15 * max(0, 1 - f["elevation_gain_m"] / 200) * 100 +
            0.15 * f["weather_score"] * 100 +
            0.10 * f["time_of_day_score"] * 100
        )
        return round(score, 1)
    X = np.array([[features_dict[f] for f in FEATURES]])
    X_scaled = scaler.transform(X)
    score = model.predict(X_scaled)[0]
    return round(float(np.clip(score, 0, 100)), 1)


def duration_label(seconds):
    m = int(seconds // 60)
    if m < 60:
        return f"{m} min"
    h = m // 60
    rem = m % 60
    return f"{h}h {rem}m"


def traffic_label(delay_sec):
    m = int(delay_sec // 60)
    if m <= 0:
        return "No delay"
    if m < 60:
        return f"+{m} min delay"
    return f"+{m//60}h {m%60}m delay"


def road_type_label(score):
    if score >= 0.95:
        return "highway"
    elif score >= 0.82:
        return "primary road"
    elif score >= 0.65:
        return "secondary road"
    elif score >= 0.50:
        return "residential road"
    else:
        return "service road"


def generate_comparison(best, others):
    comparisons = []
    for alt in others:
        bullets = []

        # Turn count
        bt = best["features"]["turn_count"]
        at = alt["features"]["turn_count"]
        diff_t = at - bt
        if abs(diff_t) <= 2:
            bullets.append({"icon": "↩️", "good": None,
                            "text": f"Similar turns: Route 1 has {bt} vs Route {alt['index']+1}'s {at}"})
        elif diff_t > 0:
            bullets.append({"icon": "↩️", "good": True,
                            "text": f"Route 1 has {bt} turns vs {at} — {diff_t} fewer direction changes, smoother ride"})
        else:
            bullets.append({"icon": "↩️", "good": False,
                            "text": f"Route 1 has {bt} turns vs {at} — {abs(diff_t)} more direction changes"})

        # Road type
        br = best["features"]["road_type_score"]
        ar = alt["features"]["road_type_score"]
        if abs(br - ar) < 0.05:
            bullets.append({"icon": "🛣️", "good": None,
                            "text": f"Similar road quality: both use {road_type_label(br)}"})
        elif br > ar:
            bullets.append({"icon": "🛣️", "good": True,
                            "text": f"Route 1 uses {road_type_label(br)} vs {road_type_label(ar)} — better surface, less wear"})
        else:
            bullets.append({"icon": "🛣️", "good": False,
                            "text": f"Route 1 uses {road_type_label(br)} vs {road_type_label(ar)} — lower road quality"})

        # Speed
        bs = best["features"]["avg_speed_kmh"]
        as_ = alt["features"]["avg_speed_kmh"]
        diff_s = bs - as_
        if abs(diff_s) < 3:
            bullets.append({"icon": "🚗", "good": None,
                            "text": f"Similar traffic flow: both around {int((bs+as_)/2)} km/h average"})
        elif diff_s > 0:
            bullets.append({"icon": "🚗", "good": True,
                            "text": f"Route 1 averages {bs:.0f} km/h vs {as_:.0f} km/h — better traffic flow"})
        else:
            bullets.append({"icon": "🚗", "good": False,
                            "text": f"Route 1 averages {bs:.0f} km/h vs {as_:.0f} km/h — slower traffic"})

        # Duration
        bd = best["duration_sec"]
        ad = alt["duration_sec"]
        diff_m = int(abs(ad - bd) // 60)
        if diff_m < 2:
            bullets.append({"icon": "⏱️", "good": None,
                            "text": f"Similar travel time: {duration_label(bd)} vs {duration_label(ad)}"})
        elif ad > bd:
            bullets.append({"icon": "⏱️", "good": True,
                            "text": f"Route 1 takes {duration_label(bd)} vs {duration_label(ad)} with live traffic — saves {diff_m} min"})
        else:
            bullets.append({"icon": "⏱️", "good": False,
                            "text": f"Route 1 takes {duration_label(bd)} vs {duration_label(ad)} — {diff_m} min longer"})

        # Distance
        bdk = best["distance_km"]
        adk = alt["distance_km"]
        diff_d = round(abs(bdk - adk), 1)
        if diff_d < 0.5:
            bullets.append({"icon": "📏", "good": None,
                            "text": f"Similar distance: {bdk} km vs {adk} km"})
        elif bdk < adk:
            bullets.append({"icon": "📏", "good": True,
                            "text": f"Route 1 is {bdk} km vs {adk} km — {diff_d} km shorter"})
        else:
            bullets.append({"icon": "📏", "good": False,
                            "text": f"Route 1 is {bdk} km vs {adk} km — {diff_d} km longer than Route {alt['index']+1}"})

        # Elevation
        be = best["features"]["elevation_gain_m"]
        ae = alt["features"]["elevation_gain_m"]
        diff_e = round(abs(ae - be), 0)
        if diff_e < 5:
            bullets.append({"icon": "⛰️", "good": None,
                            "text": f"Similar elevation: both climb ~{int(be)}m"})
        elif be < ae:
            bullets.append({"icon": "⛰️", "good": True,
                            "text": f"Route 1 climbs {int(be)}m vs {int(ae)}m — {int(diff_e)}m less uphill, easier on engine"})
        else:
            bullets.append({"icon": "⛰️", "good": False,
                            "text": f"Route 1 climbs {int(be)}m vs {int(ae)}m — {int(diff_e)}m more uphill"})

        # Women safety
        bsafe = best["features"].get("women_safety_score", 0)
        asafe = alt["features"].get("women_safety_score", 0)
        diff_safe = round(bsafe - asafe, 1)
        bpoi = best["features"].get("poi_count", 0)
        apoi = alt["features"].get("poi_count", 0)
        if abs(diff_safe) < 3:
            bullets.append({"icon": "🛡️", "good": None,
                "text": f"Similar safety: both score ~{int(bsafe)} ({bpoi} vs {apoi} nearby places)"})
        elif diff_safe > 0:
            bullets.append({"icon": "🛡️", "good": True,
                "text": f"Safer route: {int(bsafe)} vs {int(asafe)} safety score — {bpoi} vs {apoi} nearby places"})
        else:
            bullets.append({"icon": "🛡️", "good": False,
                "text": f"Less safe: {int(bsafe)} vs {int(asafe)} safety score"})
        # Weather & time (shared)
        ws = best["features"]["weather_score"]
        bullets.append({"icon": "🌤️", "good": None,
                        "text": f"Weather comfort score: {int(ws*100)}% today"})

        ts = best["features"]["time_of_day_score"]
        if ts <= 0.4:
            tlabel = "Rush hour (low comfort)"
        elif ts >= 0.9:
            tlabel = "Off-peak (high comfort)"
        else:
            tlabel = "Moderate traffic time"
        bullets.append({"icon": "🕐", "good": None,
                        "text": f"{tlabel} ({int(ts*100)}% time score)"})

        score_diff = round(best["comfort_score"] - alt["comfort_score"], 1)
        comparisons.append({
            "vs_route": alt["index"],
            "vs_label": f"Route {alt['index']+1}",
            "vs_score": alt["comfort_score"],
            "score_diff": score_diff,
            "bullets": bullets
        })

    return comparisons


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "model_loaded": model is not None,
        "model_info": {
            "type": "RandomForestRegressor",
            "features": FEATURES,
            "n_estimators": 200 if model else 0
        }
    })


@app.route("/predict", methods=["POST"])
def predict():
    data = request.get_json()
    try:
        features = {f: float(data[f]) for f in FEATURES}
        score = predict_comfort(features)
        return jsonify({"comfort_score": score})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/recommend", methods=["POST"])
def recommend():
    data = request.get_json()

    # Resolve source
    src_coords = data.get("source_coords")
    if src_coords:
        src = src_coords
    else:
        src_text = data.get("source", "").strip()
        if not src_text:
            return jsonify({"error": "source and destination required"}), 400
        src = geocode(src_text)
        if not src:
            return jsonify({"error": f"Could not find location: {src_text}"}), 400

    # Resolve destination
    dst_coords = data.get("destination_coords")
    if dst_coords:
        dst = dst_coords
    else:
        dst_text = data.get("destination", "").strip()
        if not dst_text:
            return jsonify({"error": "source and destination required"}), 400
        dst = geocode(dst_text)
        if not dst:
            return jsonify({"error": f"Could not find location: {dst_text}"}), 400

    preference = data.get("preference", "comfort")

    # Get weather at midpoint
    mid_lat = (src["lat"] + dst["lat"]) / 2
    mid_lon = (src["lon"] + dst["lon"]) / 2
    weather = get_weather(mid_lat, mid_lon)

    # Get routes
    raw_routes = get_routes(src["lat"], src["lon"], dst["lat"], dst["lon"])
    if not raw_routes:
        return jsonify({"error": "No routes found between these locations"}), 400

    # Process routes
    processed = []
    for i, route in enumerate(raw_routes):
        summary = route.get("summary", {})
        legs = route.get("legs", [])

        all_points = []
        all_instructions = []
        for leg in legs:
            all_points.extend(leg.get("points", []))
        guidance = route.get("guidance", {})
        all_instructions = guidance.get("instructions", [])

        features = extract_features(route, weather)
        comfort = predict_comfort(features)

        geometry = encode_polyline(all_points)
        steps = [{"message": ins.get("message", ""), "street": ins.get("street", "")}
                 for ins in all_instructions[:30]]

        processed.append({
            "index": i,
            "preference": preference,
            "distance_km": features["distance_km"],
            "duration_sec": summary.get("travelTimeInSeconds", 0),
            "duration_label": duration_label(summary.get("travelTimeInSeconds", 0)),
            "traffic_delay_sec": summary.get("trafficDelayInSeconds", 0),
            "traffic_delay_label": traffic_label(summary.get("trafficDelayInSeconds", 0)),
            "comfort_score": comfort,
            "features": features,
            "geometry": geometry,
            "steps": steps
        })

    # Select best based on preference
    if preference == "comfort":
        best = max(processed, key=lambda r: r["comfort_score"])
    elif preference == "fastest":
        best = min(processed, key=lambda r: r["duration_sec"])
    elif preference == "shortest":
        best = min(processed, key=lambda r: r["distance_km"])
    elif preference == "women_safety":
        best = max(processed, key=lambda r: r["features"].get("women_safety_score", 0))
    else:  # balanced
        max_dur = max(r["duration_sec"] for r in processed) or 1
        best = max(processed, key=lambda r: r["comfort_score"] * 0.5 + (1 - r["duration_sec"] / max_dur) * 50)
    best_idx = best["index"]
    others = [r for r in processed if r["index"] != best_idx]

    comparison = generate_comparison(best, others)

    return jsonify({
        "source": src,
        "destination": dst,
        "weather": weather,
        "routes": processed,
        "best_route": best,
        "comparison": comparison,
        "model_info": {
            "type": "RandomForestRegressor",
            "features": FEATURES,
            "n_estimators": 200
        }
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
