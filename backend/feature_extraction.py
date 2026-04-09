from datetime import datetime


def get_road_type_score(instructions):
    if not instructions:
        return 0.70
    scores = []
    for instr in instructions:
        street = (instr.get("street", "") or "").lower()
        road_numbers = " ".join(instr.get("roadNumbers", []) or []).lower()
        # TomTom also uses 'currentRoadName' and 'nextRoadName'
        road_name = (instr.get("currentRoadName", "") or "").lower()
        combined = street + " " + road_numbers + " " + road_name
        if any(k in combined for k in ["motorway", "expressway", "highway", "nh ", "sh ", "outer ring", "inner ring", "orr", "irr"]):
            scores.append(1.0)
        elif any(k in combined for k in ["primary", "arterial", "main", "ring road", "bypass", "flyover"]):
            scores.append(0.85)
        elif any(k in combined for k in ["secondary", "collector", "cross road"]):
            scores.append(0.70)
        elif any(k in combined for k in ["residential", "colony", "nagar", "layout", "street"]):
            scores.append(0.55)
        elif any(k in combined for k in ["service", "lane", "gali", "path"]):
            scores.append(0.35)
        else:
            scores.append(0.65)
    return round(sum(scores) / len(scores), 3) if scores else 0.70


def analyze_instructions(instructions):
    turn_count = 0
    sharp_turn_count = 0
    u_turn_count = 0
    intersection_count = 0
    signal_count = 0
    roundabout_count = 0
    lane_change_count = 0
    road_names = set()

    for instr in instructions:
        # TomTom uses 'maneuver' as the primary field for instruction type
        # 'message' may be empty — check maneuver codes directly
        msg = (instr.get("message", "") or "").lower()
        maneuver = (instr.get("maneuver", "") or "").lower()
        point_type = (instr.get("instructionType", "") or "").lower()
        street = (instr.get("street", "") or "").strip()

        if street:
            road_names.add(street.lower())

        # Combine all fields for matching
        combined = msg + " " + maneuver

        # TomTom maneuver codes reference:
        # TURN_LEFT, TURN_RIGHT, KEEP_LEFT, KEEP_RIGHT, BEAR_LEFT, BEAR_RIGHT
        # MAKE_UTURN, ENTER_ROUNDABOUT, FOLLOW_ROAD, ARRIVE, DEPART
        # MOTORWAY_EXIT_LEFT, MOTORWAY_EXIT_RIGHT, TAKE_FERRY
        # SHARP_LEFT, SHARP_RIGHT

        if any(k in combined for k in ["uturn", "u_turn", "u-turn", "make_uturn"]):
            u_turn_count += 1
            turn_count += 1

        elif any(k in combined for k in ["roundabout", "traffic_circle", "enter_roundabout", "rotary"]):
            roundabout_count += 1
            intersection_count += 1

        elif any(k in combined for k in ["sharp_left", "sharp_right", "sharp left", "sharp right"]):
            sharp_turn_count += 1
            turn_count += 1
            intersection_count += 1

        elif any(k in combined for k in [
            "turn_left", "turn_right", "turn left", "turn right",
            "keep_left", "keep_right", "keep left", "keep right",
            "bear_left", "bear_right", "bear left", "bear right",
            "slight_left", "slight_right",
            "left", "right"  # catch-all for TomTom short codes
        ]):
            # Only count if it's actually a direction instruction
            if maneuver and maneuver not in ["follow_road", "depart", "arrive", "waypoint_reached"]:
                turn_count += 1
                intersection_count += 1

        elif any(k in combined for k in ["fork", "merge", "junction", "motorway_exit", "exit", "ramp", "take_exit"]):
            intersection_count += 1
            lane_change_count += 1

        # Signal estimation
        if any(k in combined for k in ["traffic_light", "traffic light", "signal", "crossroad", "cross_road"]):
            signal_count += 1

    # If still 0 turns (TomTom returned no maneuver text), estimate from instruction count
    total_instructions = len(instructions)
    if turn_count == 0 and total_instructions > 2:
        # Estimate: roughly 60% of instructions (excluding depart/arrive) are turns
        navigating = max(0, total_instructions - 2)
        turn_count = int(navigating * 0.6)
        sharp_turn_count = int(turn_count * 0.1)
        intersection_count = int(navigating * 0.8)

    estimated_signals = max(signal_count, int(intersection_count * 0.35))

    return {
        "turn_count": turn_count,
        "sharp_turn_count": sharp_turn_count,
        "u_turn_count": u_turn_count,
        "intersection_count": intersection_count,
        "signal_count": estimated_signals,
        "roundabout_count": roundabout_count,
        "lane_change_count": lane_change_count,
        "road_segment_count": len(road_names),
    }


def get_weather_score(weather_data):
    if not weather_data:
        return 0.75
    condition_id = weather_data.get("condition_id", 800)
    wind_ms = weather_data.get("wind_ms", 0)
    if condition_id == 800:
        base = 1.0
    elif 801 <= condition_id <= 804:
        base = 0.8
    elif 300 <= condition_id < 400:
        base = 0.6
    elif 500 <= condition_id < 600:
        base = 0.4
    elif 200 <= condition_id < 300:
        base = 0.2
    elif 600 <= condition_id < 700:
        base = 0.3
    else:
        base = 0.7
    wind_penalty = max(0, 1 - wind_ms / 20)
    return round(base * wind_penalty, 3)


def get_time_of_day_score():
    hour = datetime.now().hour
    if 7 <= hour <= 9 or 17 <= hour <= 19:
        return 0.4
    elif hour >= 22 or hour <= 5:
        return 0.95
    else:
        return 0.75


def get_traffic_density_score(summary):
    travel_time = summary.get("travelTimeInSeconds", 1)
    traffic_delay = summary.get("trafficDelayInSeconds", 0)
    no_traffic_time = summary.get("noTrafficTravelTimeInSeconds", travel_time)
    if no_traffic_time <= 0:
        no_traffic_time = travel_time
    delay_ratio = traffic_delay / max(no_traffic_time, 1)
    score = max(0.2, 1.0 - delay_ratio * 1.6)
    return round(score, 3)

import requests as req

TOMTOM_KEY = "KcNgwEck8yx2pd3aUoCzsjJEGHv8AnSA"

def get_poi_density_score(lat, lon, radius=500):
    """
    Query TomTom POI search around a point.
    More POIs = more populated = safer for women.
    """
    try:
        url = f"https://api.tomtom.com/search/2/nearbySearch/.json"
        params = {
            "key": TOMTOM_KEY,
            "lat": lat,
            "lon": lon,
            "radius": radius,
            "limit": 50,
            "categorySet": "7315,7332,9361,9362,7321,9663,7374",
            # 7315=restaurant, 7332=shop, 9361=hospital,
            # 9362=pharmacy, 7321=petrol, 9663=police, 7374=school
        }
        r = req.get(url, params=params, timeout=5)
        data = r.json()
        count = len(data.get("results", []))
        # 0 POIs = 0.2, 10+ POIs = 0.7, 30+ POIs = 1.0
        score = min(1.0, 0.2 + (count / 30) * 0.8)
        return round(score, 3), count
    except:
        return 0.5, 0


def get_lighting_score(road_type_score):
    """
    Estimate street lighting from road type.
    Highways and main roads are better lit.
    """
    if road_type_score >= 0.85:
        return 0.95   # highway/primary — well lit
    elif road_type_score >= 0.70:
        return 0.75   # secondary — mostly lit
    elif road_type_score >= 0.55:
        return 0.50   # residential — partially lit
    else:
        return 0.25   # service/lane — poorly lit


def get_safety_time_score():
    """
    Time of day safety score for women.
    Daytime = safest, late night = least safe.
    """
    hour = datetime.now().hour
    if 6 <= hour <= 20:
        return 1.0    # daytime — very safe
    elif 20 <= hour <= 22:
        return 0.65   # evening — moderate
    elif 22 <= hour <= 23:
        return 0.35   # late evening — risky
    else:
        return 0.20   # midnight to 6am — avoid


def compute_women_safety_score(road_type_score, poi_score, time_score, poi_count):
    """
    Weighted safety score 0-100.
    """
    lighting_score = get_lighting_score(road_type_score)
    score = (
        0.35 * poi_score * 100 +          # crowd/POI density
        0.30 * road_type_score * 100 +    # road type (main = safer)
        0.20 * lighting_score * 100 +     # lighting estimate
        0.15 * time_score * 100           # time of day
    )
    return round(score, 1), lighting_score

def extract_features(route, weather_data=None):
    summary = route.get("summary", {})
    legs = route.get("legs", [])
    distance_km = summary.get("lengthInMeters", 0) / 1000.0
    duration_sec = max(summary.get("travelTimeInSeconds", 1), 1)

    all_instructions = []
    for leg in legs:
        all_instructions.extend(leg.get("instructions", []))
    if not all_instructions:
        guidance = route.get("guidance", {})
        all_instructions = guidance.get("instructions", [])
    # Debug print to see what TomTom actually returns
    if all_instructions:
        sample = all_instructions[0]
        print(f"[DEBUG] Sample instruction keys: {list(sample.keys())}")
        print(f"[DEBUG] Sample instruction: {sample}")
        print(f"[DEBUG] Total instructions: {len(all_instructions)}")

    road_type_score = get_road_type_score(all_instructions)
    avg_speed_kmh = min((distance_km / (duration_sec / 3600)), 120)
    maneuver_data = analyze_instructions(all_instructions)

    elevation_gain_m = summary.get("elevationGain", None)
    if elevation_gain_m is None:
        elevation_gain_m = distance_km * 1.8

    weather_score = get_weather_score(weather_data)
    time_of_day_score = get_time_of_day_score()
    traffic_density_score = get_traffic_density_score(summary)

    print(f"[DEBUG] Extracted: turns={maneuver_data['turn_count']}, intersections={maneuver_data['intersection_count']}, signals={maneuver_data['signal_count']}")
    # Women safety features
    # Use route midpoint for POI lookup
    all_points = []
    for leg in legs:
        all_points.extend(leg.get("points", []))
    if all_points:
        mid = all_points[len(all_points) // 2]
        mid_lat = mid.get("latitude", 0)
        mid_lon = mid.get("longitude", 0)
    else:
        mid_lat, mid_lon = 0, 0

    safety_time_score = get_safety_time_score()
    poi_score, poi_count = get_poi_density_score(mid_lat, mid_lon)
    lighting_score = get_lighting_score(road_type_score)
    women_safety_score, _ = compute_women_safety_score(
        road_type_score, poi_score, safety_time_score, poi_count
    )
    return {
        "road_type_score": round(road_type_score, 3),
        "avg_speed_kmh": round(avg_speed_kmh, 2),
        "turn_count": maneuver_data["turn_count"],
        "elevation_gain_m": round(float(elevation_gain_m), 1),
        "weather_score": round(weather_score, 3),
        "time_of_day_score": round(time_of_day_score, 2),
        "distance_km": round(distance_km, 2),
        "sharp_turn_count": maneuver_data["sharp_turn_count"],
        "u_turn_count": maneuver_data["u_turn_count"],
        "intersection_count": maneuver_data["intersection_count"],
        "signal_count": maneuver_data["signal_count"],
        "roundabout_count": maneuver_data["roundabout_count"],
        "lane_change_count": maneuver_data["lane_change_count"],
        "road_segment_count": maneuver_data["road_segment_count"],
        "traffic_density_score": round(traffic_density_score, 3),
        "traffic_delay_sec": summary.get("trafficDelayInSeconds", 0),
        "women_safety_score": women_safety_score,
        "poi_density_score": round(poi_score, 3),
        "poi_count": poi_count,
        "lighting_score": round(lighting_score, 3),
        "safety_time_score": round(safety_time_score, 2),
    }