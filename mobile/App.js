import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, Platform, KeyboardAvoidingView,
  StatusBar, StyleSheet, BackHandler
} from 'react-native';
import { WebView } from 'react-native-webview';

// ─── CHANGE THIS TO YOUR WiFi IP ─────────────────────────────────────────────
const API_BASE = 'http://192.168.14.171:5000';
// ─────────────────────────────────────────────────────────────────────────────

const C = {
  bg: '#080d12', surface: '#0c1520', border: '#1a2a3a',
  green: '#00e5a0', blue: '#4fc3f7', yellow: '#f5c518',
  red: '#ff4d6d', purple: '#a78bfa', text: '#dce8f5',
  muted: '#6a7f96', dark: '#141f2d', card: '#0f1c2b',
  orange: '#ff9f43', teal: '#26de81', pink: '#f472b6',
};

const PREFS = [
  { key: 'comfort',      emoji: '😌', label: 'Comfort',  color: C.green },
  { key: 'fastest',      emoji: '⚡', label: 'Fastest',  color: C.yellow },
  { key: 'shortest',     emoji: '📏', label: 'Shortest', color: C.blue },
  { key: 'balanced',     emoji: '⚖️', label: 'Balanced', color: C.purple },
  { key: 'women_safety', emoji: '🛡️', label: 'Safety',   color: C.pink },
];

const TOMTOM_KEY = 'KcNgwEck8yx2pd3aUoCzsjJEGHv8AnSA';

// ─── Map HTML with GPS Navigation ────────────────────────────────────────────
function buildMapHtml(routes, bestIdx, srcCoord, dstCoord, preference) {
  const pref = PREFS.find(p => p.key === preference) || PREFS[0];
  const bestColor = pref.color;
  const altColors = ['#6c8ebf', '#f5c518'];

  const routeData = JSON.stringify(routes.map((r, i) => ({
    geometry: r.geometry,
    isBest: r.index === bestIdx,
    label: `Route ${i + 1}`,
    score: r.comfort_score,
    dist: r.distance_km,
    dur: r.duration_label,
    turns: r.features?.turn_count || 0,
    signals: r.features?.signal_count || 0,
    safety: Math.round(r.features?.women_safety_score || 0),
    color: r.index === bestIdx ? bestColor : (altColors[i] || altColors[0]),
  })));

  const bestRoute = routes.find(r => r.index === bestIdx);
  const stepsJson = JSON.stringify(
    (bestRoute?.steps || []).map(s => s.message).filter(Boolean)
  );

  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
html,body,#map { height:100%; width:100%; background:#080d12; }
.leaflet-tile { filter:brightness(.85) saturate(.7) hue-rotate(180deg) invert(1) hue-rotate(180deg); }
.leaflet-control-zoom a { background:#0f1c2b!important; color:#dce8f5!important; border-color:#1a2a3a!important; }

#turnBar {
  position:absolute; top:0; left:0; right:0; z-index:1000;
  background:rgba(12,21,32,0.97);
  border-bottom:2px solid ${bestColor};
  padding:12px 14px 10px;
  display:flex; align-items:center; gap:10px;
  min-height:64px;
}
#turnIcon { font-size:28px; flex-shrink:0; }
#turnInfo { flex:1; }
#turnText { font-family:-apple-system,sans-serif; font-size:14px; font-weight:700; color:#f1f5f9; line-height:1.3; }
#turnSub { font-size:11px; color:#6a7f96; margin-top:2px; }
#turnRight { flex-shrink:0; text-align:right; }
#turnDist { font-size:14px; color:${bestColor}; font-weight:800; }
#turnDistSub { font-size:10px; color:#6a7f96; margin-top:1px; }

#gpsBtn {
  position:absolute; top:76px; right:12px; z-index:1000;
  background:rgba(12,21,32,0.95); border:1.5px solid ${bestColor};
  border-radius:12px; padding:9px 14px;
  font-family:-apple-system,sans-serif;
  font-size:13px; font-weight:700; color:${bestColor};
  cursor:pointer;
}
#gpsBtn.active { background:${bestColor}25; }

#recenterBtn {
  position:absolute; top:126px; right:12px; z-index:1000;
  background:rgba(12,21,32,0.95); border:1.5px solid #1a2a3a;
  border-radius:12px; padding:9px 14px;
  font-family:-apple-system,sans-serif;
  font-size:13px; font-weight:700; color:#dce8f5;
  cursor:pointer; display:none;
}

.pills { position:absolute; bottom:16px; left:0; right:0; display:flex; gap:8px; padding:0 12px; overflow-x:auto; z-index:999; scrollbar-width:none; }
.pills::-webkit-scrollbar { display:none; }
.pill { flex-shrink:0; background:rgba(12,21,32,0.95); border-radius:14px; padding:10px 14px; border:1.5px solid #1a2a3a; font-family:-apple-system,sans-serif; color:#dce8f5; font-size:12px; text-align:center; min-width:120px; }
.pill.best { border-color:${bestColor}; }
.pill-score { font-size:20px; font-weight:800; margin-bottom:2px; }
.pill-label { font-size:10px; color:#6a7f96; }
.pill-info { font-size:11px; color:#dce8f5; margin-top:3px; }
.pill-meta { font-size:10px; color:#6a7f96; margin-top:2px; }

.live-dot { width:20px; height:20px; border-radius:50%; background:#38bdf8; border:3px solid white; box-shadow:0 0 0 6px rgba(56,189,248,0.2); }
</style>
</head><body>
<div id="map"></div>

<div id="turnBar">
  <div id="turnIcon">🧭</div>
  <div id="turnInfo">
    <div id="turnText">Tap Start GPS to begin navigation</div>
    <div id="turnSub">${bestRoute?.distance_km || 0}km · ${bestRoute?.duration_label || ''} · ${(bestRoute?.steps || []).length} steps</div>
  </div>
  <div id="turnRight">
    <div id="turnDist"></div>
    <div id="turnDistSub"></div>
  </div>
</div>

<button id="gpsBtn" onclick="toggleGPS()">📍 Start GPS</button>
<button id="recenterBtn" onclick="recenter()">🎯 Recenter</button>

<div class="pills" id="pills"></div>

<script>
var map = L.map('map', {zoomControl:true, attributionControl:false});
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

function decodePoly(enc) {
  var pts=[],i=0,lat=0,lng=0;
  while(i<enc.length){
    var b,s=0,r=0;
    do{b=enc.charCodeAt(i++)-63;r|=(b&31)<<s;s+=5}while(b>=32);
    lat+=r&1?~(r>>1):(r>>1); s=0; r=0;
    do{b=enc.charCodeAt(i++)-63;r|=(b&31)<<s;s+=5}while(b>=32);
    lng+=r&1?~(r>>1):(r>>1);
    pts.push([lat/1e5,lng/1e5]);
  }
  return pts;
}

function distM(a,b) {
  var R=6371000,dLat=(b[0]-a[0])*Math.PI/180,dLon=(b[1]-a[1])*Math.PI/180;
  var x=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(a[0]*Math.PI/180)*Math.cos(b[0]*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
  return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}

function fmtDist(m) { return m<1000?Math.round(m)+'m':(m/1000).toFixed(1)+'km'; }

function turnIcon(msg) {
  if(!msg) return '⬆️';
  var m=msg.toLowerCase();
  if(m.includes('u-turn')||m.includes('uturn')) return '🔄';
  if(m.includes('sharp left')) return '↰';
  if(m.includes('sharp right')) return '↱';
  if(m.includes('turn left')||m.includes('bear left')||m.includes('keep left')) return '⬅️';
  if(m.includes('turn right')||m.includes('bear right')||m.includes('keep right')) return '➡️';
  if(m.includes('roundabout')) return '⭕';
  if(m.includes('exit')) return '↗️';
  if(m.includes('arrive')||m.includes('destination')||m.includes('reached')) return '🏁';
  if(m.includes('depart')||m.includes('leave')||m.includes('start')) return '🚦';
  if(m.includes('fork')) return '⬆️';
  if(m.includes('merge')) return '↗️';
  if(m.includes('motorway')||m.includes('highway')) return '🛣️';
  return '⬆️';
}

// Draw routes
var routeData = ${routeData};
var bestPoints = [];
var allBounds = [];

routeData.filter(r=>!r.isBest).forEach(function(rt) {
  if(!rt.geometry) return;
  var pts=decodePoly(rt.geometry); if(!pts.length) return;
  pts.forEach(function(p){allBounds.push(p);});
  L.polyline(pts,{color:rt.color,weight:5,opacity:0.6,dashArray:'12,6'})
    .addTo(map).bindTooltip(rt.label+' · Score: '+rt.score,{sticky:true});
});

routeData.filter(r=>r.isBest).forEach(function(rt) {
  if(!rt.geometry) return;
  var pts=decodePoly(rt.geometry); if(!pts.length) return;
  pts.forEach(function(p){allBounds.push(p);});
  bestPoints=pts;
  L.polyline(pts,{color:rt.color,weight:16,opacity:0.08}).addTo(map);
  L.polyline(pts,{color:rt.color,weight:7,opacity:1})
    .addTo(map).bindTooltip('★ '+rt.label+' · Score: '+rt.score,{sticky:true});
});

// Pills
routeData.forEach(function(rt) {
  var pill=document.createElement('div');
  pill.className='pill'+(rt.isBest?' best':'');
  var sc=rt.isBest?rt.color:'#f5c518';
  pill.innerHTML='<div class="pill-score" style="color:'+sc+'">'+rt.score+'</div>'
    +'<div class="pill-label">'+(rt.isBest?'★ BEST · ':'')+rt.label+'</div>'
    +'<div class="pill-info">'+rt.dist+'km · '+rt.dur+'</div>'
    +'<div class="pill-meta">↩️'+rt.turns+' · 🚦'+rt.signals+'</div>'
    +'<div class="pill-meta">🛡️ '+rt.safety+'</div>';
  document.getElementById('pills').appendChild(pill);
});

// Markers
function mkIcon(color,letter) {
  return L.divIcon({className:'',html:'<div style="width:28px;height:28px;border-radius:50%;background:'+color+';border:3px solid '+color+';display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;font-family:system-ui;color:white;">'+letter+'</div>',iconSize:[28,28],iconAnchor:[14,14]});
}
L.marker([${srcCoord.lat},${srcCoord.lon}],{icon:mkIcon('${C.blue}','A')}).addTo(map).bindPopup('${(srcCoord.display||'Start').replace(/'/g,"\\'").substring(0,50)}');
L.marker([${dstCoord.lat},${dstCoord.lon}],{icon:mkIcon('${C.red}','B')}).addTo(map).bindPopup('${(dstCoord.display||'End').replace(/'/g,"\\'").substring(0,50)}');

if(allBounds.length>0) map.fitBounds(allBounds,{padding:[80,40]});

// GPS
var steps=${stepsJson};
var currentStep=0, gpsActive=false, watchId=null, liveMarker=null, liveCircle=null, followMode=true;

var liveDotIcon=L.divIcon({className:'',html:'<div class="live-dot"></div>',iconSize:[20,20],iconAnchor:[10,10]});

function toggleGPS() {
  if(gpsActive) stopGPS(); else startGPS();
}

function startGPS() {
  if(!navigator.geolocation){
    document.getElementById('turnText').textContent='GPS not supported';
    return;
  }
  gpsActive=true; currentStep=0; followMode=true;
  document.getElementById('gpsBtn').textContent='⏹ Stop GPS';
  document.getElementById('gpsBtn').classList.add('active');
  document.getElementById('recenterBtn').style.display='none';
  document.getElementById('turnSub').textContent='Acquiring GPS...';
  updateTurnBar();

  watchId=navigator.geolocation.watchPosition(onPos, onErr,
    {enableHighAccuracy:true, maximumAge:1500, timeout:15000});
}

function stopGPS() {
  gpsActive=false;
  if(watchId!==null){navigator.geolocation.clearWatch(watchId);watchId=null;}
  document.getElementById('gpsBtn').textContent='📍 Start GPS';
  document.getElementById('gpsBtn').classList.remove('active');
  document.getElementById('recenterBtn').style.display='none';
  document.getElementById('turnText').textContent='GPS stopped';
  document.getElementById('turnDist').textContent='';
  document.getElementById('turnDistSub').textContent='';
  document.getElementById('turnSub').textContent='Tap Start GPS to resume';
}

function recenter() {
  if(liveMarker){ map.setView(liveMarker.getLatLng(), Math.max(map.getZoom(),16)); }
  followMode=true;
  document.getElementById('recenterBtn').style.display='none';
}

function onPos(pos) {
  var lat=pos.coords.latitude, lon=pos.coords.longitude, acc=Math.round(pos.coords.accuracy);
  var latlng=[lat,lon];

  if(!liveMarker){
    liveMarker=L.marker(latlng,{icon:liveDotIcon,zIndexOffset:2000}).addTo(map);
  } else { liveMarker.setLatLng(latlng); }

  if(liveCircle) map.removeLayer(liveCircle);
  liveCircle=L.circle(latlng,{radius:acc,color:'#38bdf8',fillColor:'#38bdf8',fillOpacity:0.07,weight:1}).addTo(map);

  if(followMode) map.setView(latlng, Math.max(map.getZoom(),16));

  // Find nearest point on route
  var minDist=Infinity, nearestIdx=0;
  for(var i=0;i<bestPoints.length;i++){
    var d=distM(latlng,bestPoints[i]);
    if(d<minDist){minDist=d;nearestIdx=i;}
  }

  // Advance step
  if(steps.length>0 && currentStep<steps.length-1){
    var progress=nearestIdx/Math.max(bestPoints.length-1,1);
    var expected=Math.floor(progress*steps.length);
    if(expected>currentStep){
      currentStep=Math.min(expected,steps.length-1);
      updateTurnBar();
    }
  }

  // Destination distance
  var destDist=distM(latlng,[${dstCoord.lat},${dstCoord.lon}]);
  document.getElementById('turnDist').textContent=fmtDist(destDist);
  document.getElementById('turnDistSub').textContent='to destination';
  document.getElementById('turnSub').textContent='Step '+(currentStep+1)+' of '+steps.length+' · ±'+acc+'m';

  // Off route warning
  if(minDist>100 && bestPoints.length>0){
    document.getElementById('turnSub').textContent='⚠️ Off route · '+Math.round(minDist)+'m away';
  }

  // Arrived
  if(destDist<40){
    document.getElementById('turnIcon').textContent='🏁';
    document.getElementById('turnText').textContent='You have arrived!';
    document.getElementById('turnSub').textContent='Destination reached 🎉';
    document.getElementById('turnDist').textContent='';
    stopGPS();
  }
}

function onErr(err) {
  if (err.code === 1) {
    document.getElementById('turnIcon').textContent='⚙️';
    document.getElementById('turnText').textContent='Allow location in Settings → Apps → Expo Go → Permissions → Location';
    document.getElementById('turnSub').textContent='Tap Stop GPS then go to phone Settings';
  } else if (err.code === 2) {
    document.getElementById('turnIcon').textContent='📡';
    document.getElementById('turnText').textContent='GPS signal not available — move to open area';
    document.getElementById('turnSub').textContent='Retrying...';
    setTimeout(function(){ if(gpsActive) startGPS(); }, 5000);
  } else {
    document.getElementById('turnIcon').textContent='⏱️';
    document.getElementById('turnText').textContent='GPS timeout — retrying...';
    document.getElementById('turnSub').textContent='Make sure location is enabled';
    setTimeout(function(){ if(gpsActive) startGPS(); }, 3000);
  }
}

function updateTurnBar() {
  if(steps.length===0){
    document.getElementById('turnText').textContent='Follow the highlighted route';
    document.getElementById('turnIcon').textContent='🧭';
    return;
  }
  var msg=steps[currentStep]||'Continue straight';
  document.getElementById('turnIcon').textContent=turnIcon(msg);
  document.getElementById('turnText').textContent=msg;
}

map.on('dragstart',function(){
  followMode=false;
  if(gpsActive) document.getElementById('recenterBtn').style.display='block';
});
</script>
</body></html>`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function comfortLabel(score) {
  if (score >= 75) return { label: 'Excellent', color: C.green };
  if (score >= 55) return { label: 'Moderate', color: C.yellow };
  return { label: 'Poor', color: C.red };
}

function safetyLabel(score) {
  if (score >= 70) return { label: 'Very Safe', color: C.green };
  if (score >= 50) return { label: 'Moderately Safe', color: C.yellow };
  return { label: 'Use Caution', color: C.red };
}

function weatherEmoji(desc) {
  if (!desc) return '🌤';
  const d = desc.toLowerCase();
  if (d.includes('thunder')) return '⛈';
  if (d.includes('rain') || d.includes('drizzle')) return '🌧';
  if (d.includes('snow')) return '❄️';
  if (d.includes('cloud')) return '☁️';
  if (d.includes('mist') || d.includes('fog')) return '🌫';
  return '☀️';
}

// ─── Components ───────────────────────────────────────────────────────────────
function StatBox({ icon, label, value, color = C.text, sub }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

function ScoreRing({ score, size = 64, color }) {
  const c = color || (score >= 75 ? C.green : score >= 55 ? C.yellow : C.red);
  return (
    <View style={[styles.ring, { width: size, height: size, borderColor: c }]}>
      <Text style={[styles.ringScore, { color: c, fontSize: size * 0.28 }]}>{score}</Text>
      <Text style={[styles.ringLabel, { fontSize: size * 0.14 }]}>/ 100</Text>
    </View>
  );
}

function FeatureBar({ label, value, color = C.green, icon }) {
  return (
    <View style={styles.featureBarRow}>
      <Text style={styles.featureBarIcon}>{icon}</Text>
      <Text style={styles.featureBarLabel}>{label}</Text>
      <View style={styles.featureBarTrack}>
        <View style={[styles.featureBarFill, { width: `${Math.min(value, 100)}%`, backgroundColor: color }]} />
      </View>
      <Text style={[styles.featureBarValue, { color }]}>{Math.round(value)}%</Text>
    </View>
  );
}

function RouteStatsGrid({ features, duration_label, distance_km, traffic_delay_label }) {
  const f = features;
  return (
    <View>
      <View style={styles.statsGrid}>
        <StatBox icon="📏" label="Distance" value={`${distance_km} km`} color={C.blue} />
        <StatBox icon="⏱" label="Duration" value={duration_label} color={C.green} />
        <StatBox icon="🚗" label="Avg Speed" value={`${Math.round(f.avg_speed_kmh)} km/h`} color={C.yellow} />
        <StatBox icon="🚦" label="Traffic" value={traffic_delay_label} color={traffic_delay_label === 'No delay' ? C.green : C.red} />
      </View>
      <Text style={styles.statsRowLabel}>Navigation Complexity</Text>
      <View style={styles.statsGrid}>
        <StatBox icon="↩️" label="Turns" value={f.turn_count} color={f.turn_count > 20 ? C.red : f.turn_count > 10 ? C.yellow : C.green} />
        <StatBox icon="⚠️" label="Sharp Turns" value={f.sharp_turn_count} color={f.sharp_turn_count > 5 ? C.red : C.yellow} />
        <StatBox icon="🔄" label="U-Turns" value={f.u_turn_count} color={f.u_turn_count > 2 ? C.red : C.green} />
        <StatBox icon="🔀" label="Junctions" value={f.intersection_count} color={f.intersection_count > 15 ? C.red : C.yellow} />
      </View>
      <Text style={styles.statsRowLabel}>Road Conditions</Text>
      <View style={styles.statsGrid}>
        <StatBox icon="🚦" label="Signals" value={`~${f.signal_count}`} color={f.signal_count > 10 ? C.red : C.yellow} sub="estimated" />
        <StatBox icon="⭕" label="Roundabouts" value={f.roundabout_count} color={C.purple} />
        <StatBox icon="🛤" label="Road Changes" value={f.road_segment_count} color={C.blue} />
        <StatBox icon="⛰️" label="Elevation" value={`${Math.round(f.elevation_gain_m)}m`} color={C.purple} sub="gain" />
      </View>
      <Text style={[styles.statsRowLabel, { color: C.pink }]}>🛡️ Women Safety</Text>
      <View style={styles.statsGrid}>
        <StatBox icon="🛡️" label="Safety Score" value={Math.round(f.women_safety_score || 0)} color={safetyLabel(f.women_safety_score || 0).color} />
        <StatBox icon="🏪" label="Nearby Places" value={f.poi_count || 0} color={C.blue} sub="shops/hospitals" />
        <StatBox icon="💡" label="Lighting" value={`${Math.round((f.lighting_score || 0) * 100)}%`} color={C.yellow} />
        <StatBox icon="🕐" label="Time Safety" value={`${Math.round((f.safety_time_score || 0) * 100)}%`} color={f.safety_time_score >= 0.8 ? C.green : C.red} />
      </View>
    </View>
  );
}

function RouteCard({ route, isBest, preference }) {
  const [expanded, setExpanded] = useState(isBest);
  const f = route.features;
  const cl = comfortLabel(route.comfort_score);
  const pref = PREFS.find(p => p.key === preference) || PREFS[0];
  const isSafety = preference === 'women_safety';
  const mainScore = isSafety ? Math.round(f.women_safety_score || 0) : route.comfort_score;

  return (
    <View style={[styles.card,
      isBest && !isSafety && { borderColor: C.green, borderWidth: 1.5 },
      isBest && isSafety && { borderColor: C.pink, borderWidth: 1.5 },
    ]}>
      <TouchableOpacity style={styles.cardHeader} onPress={() => setExpanded(!expanded)} activeOpacity={0.7}>
        <ScoreRing score={mainScore} size={62} color={isBest ? pref.color : undefined} />
        <View style={styles.cardHeaderInfo}>
          <View style={styles.row}>
            <Text style={styles.routeTitle}>Route {route.index + 1}</Text>
            {isBest && (
              <View style={[styles.bestBadge, isSafety && { borderColor: C.pink + '40', backgroundColor: C.pink + '20' }]}>
                <Text style={[styles.bestBadgeText, isSafety && { color: C.pink }]}>
                  {isSafety ? '🛡️ SAFEST' : '★ BEST'}
                </Text>
              </View>
            )}
          </View>
          <Text style={[styles.comfortLabel, { color: cl.color }]}>{cl.label} Comfort</Text>
          {isSafety && <Text style={[styles.comfortLabel, { color: C.pink }]}>🛡️ {safetyLabel(f.women_safety_score || 0).label}</Text>}
          <View style={[styles.row, { marginTop: 5, flexWrap: 'wrap', gap: 6 }]}>
            <Text style={styles.quickStat}>📏 {route.distance_km}km</Text>
            <Text style={styles.quickStat}>⏱ {route.duration_label}</Text>
            <Text style={styles.quickStat}>↩️ {f.turn_count} turns</Text>
            <Text style={styles.quickStat}>🚦 ~{f.signal_count} signals</Text>
          </View>
          <View style={[styles.row, { marginTop: 3, flexWrap: 'wrap', gap: 6 }]}>
            <Text style={styles.quickStat}>🔀 {f.intersection_count} junctions</Text>
            <Text style={styles.quickStat}>🛡️ Safety: {Math.round(f.women_safety_score || 0)}</Text>
            <Text style={styles.quickStat}>🏪 {f.poi_count || 0} places</Text>
          </View>
        </View>
        <Text style={[styles.expandIcon, { color: C.muted }]}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {expanded && (
        <>
          <View style={styles.divider} />
          <RouteStatsGrid features={f} duration_label={route.duration_label} distance_km={route.distance_km} traffic_delay_label={route.traffic_delay_label} />
          <View style={styles.divider} />
          <Text style={styles.sectionTitle}>COMFORT BREAKDOWN</Text>
          <FeatureBar icon="🛣️" label="Road Quality" value={f.road_type_score * 100} color={C.green} />
          <FeatureBar icon="🚗" label="Speed Flow" value={Math.min(f.avg_speed_kmh / 80, 1) * 100} color={C.blue} />
          <FeatureBar icon="↩️" label="Turn Smoothness" value={Math.max(0, 1 - f.turn_count / 60) * 100} color={C.yellow} />
          <FeatureBar icon="⚠️" label="Sharp Turn Score" value={Math.max(0, 1 - (f.sharp_turn_count || 0) / 15) * 100} color={C.orange} />
          <FeatureBar icon="🔀" label="Junction Score" value={Math.max(0, 1 - (f.intersection_count || 0) / 50) * 100} color={C.teal} />
          <FeatureBar icon="🚦" label="Signal Score" value={Math.max(0, 1 - (f.signal_count || 0) / 20) * 100} color={C.yellow} />
          <FeatureBar icon="⛰️" label="Elevation Ease" value={Math.max(0, 1 - f.elevation_gain_m / 200) * 100} color={C.purple} />
          <FeatureBar icon="🌤️" label="Weather" value={f.weather_score * 100} color={C.green} />
          <FeatureBar icon="🕐" label="Time of Day" value={f.time_of_day_score * 100} color={C.muted} />
          <FeatureBar icon="🚗" label="Traffic Density" value={(f.traffic_density_score || 0.7) * 100} color={C.blue} />
          <View style={styles.divider} />
          <Text style={[styles.sectionTitle, { color: C.pink }]}>🛡️ WOMEN SAFETY BREAKDOWN</Text>
          <FeatureBar icon="🛡️" label="Overall Safety" value={f.women_safety_score || 0} color={C.pink} />
          <FeatureBar icon="🏪" label="POI Density" value={(f.poi_density_score || 0) * 100} color={C.purple} />
          <FeatureBar icon="💡" label="Lighting Est." value={(f.lighting_score || 0) * 100} color={C.yellow} />
          <FeatureBar icon="🕐" label="Time Safety" value={(f.safety_time_score || 0) * 100} color={C.orange} />
          {route.steps && route.steps.length > 0 && (
            <>
              <View style={styles.divider} />
              <Text style={styles.sectionTitle}>TURN-BY-TURN</Text>
              {route.steps.slice(0, 8).map((step, si) => (
                <View key={si} style={styles.stepRow}>
                  <Text style={styles.stepNum}>{si + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.stepMsg}>{step.message}</Text>
                    {step.street ? <Text style={styles.stepStreet}>on {step.street}</Text> : null}
                  </View>
                </View>
              ))}
              {route.steps.length > 8 && <Text style={styles.moreSteps}>+ {route.steps.length - 8} more steps</Text>}
            </>
          )}
        </>
      )}
    </View>
  );
}

function ComparisonPanel({ comparison, bestRoute, preference }) {
  const pref = PREFS.find(p => p.key === preference) || PREFS[0];
  const isSafety = preference === 'women_safety';
  return (
    <View style={[styles.card, isSafety && { borderColor: C.pink + '60', borderWidth: 1 }]}>
      <Text style={[styles.compTitle, isSafety && { color: C.pink }]}>
        {isSafety ? `🛡️ WHY ROUTE ${bestRoute.index + 1} IS SAFEST` : `WHY ROUTE ${bestRoute.index + 1} IS BEST`}
      </Text>
      {comparison.map((comp, ci) => (
        <View key={ci} style={ci > 0 ? styles.compSeparator : null}>
          <View style={styles.compHeader}>
            <Text style={styles.compVsLabel}>vs {comp.vs_label}</Text>
            <View style={[styles.scoreDiffBadge, { backgroundColor: comp.score_diff >= 0 ? C.green + '22' : C.red + '22' }]}>
              <Text style={[styles.scoreDiffText, { color: comp.score_diff >= 0 ? C.green : C.red }]}>
                {comp.score_diff >= 0 ? '+' : ''}{comp.score_diff} pts
              </Text>
            </View>
          </View>
          {comp.bullets.map((b, bi) => (
            <View key={bi} style={styles.bulletRow}>
              <Text style={styles.bulletIcon}>{b.icon}</Text>
              <Text style={styles.bulletText}>{b.text}</Text>
              <Text style={styles.bulletStatus}>{b.good === true ? '✅' : b.good === false ? '❌' : '➖'}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function BestRouteBanner({ route, weather, preference }) {
  const cl = comfortLabel(route.comfort_score);
  const sl = safetyLabel(route.features?.women_safety_score || 0);
  const f = route.features;
  const wEmoji = weatherEmoji(weather?.description);
  const pref = PREFS.find(p => p.key === preference) || PREFS[0];
  const isSafety = preference === 'women_safety';
  return (
    <View style={[styles.card, isSafety ? styles.safetyBestBanner : styles.bestBanner]}>
      <View style={styles.bestBannerTop}>
        <ScoreRing score={isSafety ? Math.round(f?.women_safety_score || 0) : route.comfort_score} size={82} color={isSafety ? C.pink : C.green} />
        <View style={{ flex: 1, marginLeft: 16 }}>
          <Text style={[styles.bestBannerLabel, isSafety && { color: C.pink }]}>
            {isSafety ? '🛡️ SAFEST ROUTE FOR WOMEN' : `${pref.emoji} BEST ${pref.label.toUpperCase()} ROUTE`}
          </Text>
          <Text style={styles.bestRouteNum}>Route {route.index + 1}</Text>
          <Text style={[styles.comfortLabelLg, { color: cl.color }]}>{cl.label} Comfort</Text>
          {isSafety && <Text style={[styles.comfortLabelLg, { color: C.pink }]}>{sl.label} · Score {Math.round(f?.women_safety_score || 0)}/100</Text>}
          <View style={[styles.row, { marginTop: 8, flexWrap: 'wrap', gap: 8 }]}>
            <Text style={styles.bestMetaChip}>📏 {route.distance_km} km</Text>
            <Text style={styles.bestMetaChip}>⏱ {route.duration_label}</Text>
            <Text style={styles.bestMetaChip}>🚗 {Math.round(f?.avg_speed_kmh || 0)} km/h</Text>
          </View>
          <View style={[styles.row, { marginTop: 6, flexWrap: 'wrap', gap: 8 }]}>
            <Text style={styles.bestMetaChip}>↩️ {f?.turn_count || 0} turns</Text>
            <Text style={styles.bestMetaChip}>🚦 ~{f?.signal_count || 0} signals</Text>
            <Text style={styles.bestMetaChip}>🔀 {f?.intersection_count || 0} junctions</Text>
          </View>
          {isSafety && (
            <View style={styles.safetyInfoRow}>
              <Text style={styles.safetyInfoText}>🏪 {f?.poi_count || 0} nearby places · 💡 {Math.round((f?.lighting_score || 0) * 100)}% lighting</Text>
            </View>
          )}
          {route.traffic_delay_label !== 'No delay' && (
            <View style={styles.trafficBadge}>
              <Text style={styles.trafficBadgeText}>🚦 {route.traffic_delay_label}</Text>
            </View>
          )}
        </View>
      </View>
      {weather && (
        <View style={styles.weatherRow}>
          <Text style={styles.weatherText}>
            {wEmoji} {weather.temp_c}°C · Feels {weather.feels_like_c}°C · {weather.description}
            {weather.city ? ` · ${weather.city}` : ''} · 💨 {weather.wind_ms}m/s · 💧 {weather.humidity}%
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [source, setSource] = useState('');
  const [destination, setDestination] = useState('');
  const [preference, setPreference] = useState('comfort');
  const [loading, setLoading] = useState(false);
  const [locLoading, setLocLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [showMap, setShowMap] = useState(false);
  const [srcSuggestions, setSrcSuggestions] = useState([]);
  const [dstSuggestions, setDstSuggestions] = useState([]);
  const [srcCoords, setSrcCoords] = useState(null);
  const [dstCoords, setDstCoords] = useState(null);

  const srcTimer = useRef(null);
  const dstTimer = useRef(null);

  const fetchSuggestions = useCallback(async (query, setter) => {
    if (!query || query.length < 3) { setter([]); return; }
    try {
      const r = await fetch(`https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json?key=${TOMTOM_KEY}&limit=5&countrySet=IN&language=en-GB`);
      const data = await r.json();
      setter((data.results || []).map(item => ({
        display: item.address?.freeformAddress || item.poi?.name || query,
        lat: item.position?.lat, lon: item.position?.lon,
      })));
    } catch { setter([]); }
  }, []);

  // ── Use My Location via hidden WebView GPS ───────────────────────────────────
  const useMyLocation = async () => {
    setLocLoading(true);
    setError('');
    try {
      // Request permission using expo-location
      const Location = require('expo-location');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Location permission denied. Go to Settings → Apps → Expo Go → Permissions → Location → Allow.');
        setLocLoading(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const lat = loc.coords.latitude;
      const lon = loc.coords.longitude;
      // Reverse geocode with TomTom
      const url = `https://api.tomtom.com/search/2/reverseGeocode/${lat},${lon}.json?key=${TOMTOM_KEY}&language=en-GB`;
      const r = await fetch(url);
      const json = await r.json();
      const addr = json?.addresses?.[0]?.address;
      const display = addr?.freeformAddress || `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
      setSource(display);
      setSrcCoords({ lat, lon, display });
      setSrcSuggestions([]);
    } catch (e) {
      setError('Could not get location. Please type your address manually.');
    }
    setLocLoading(false);
  };

  const onSrcChange = (t) => {
    setSource(t); setSrcCoords(null);
    clearTimeout(srcTimer.current);
    srcTimer.current = setTimeout(() => fetchSuggestions(t, setSrcSuggestions), 400);
  };
  const onDstChange = (t) => {
    setDestination(t); setDstCoords(null);
    clearTimeout(dstTimer.current);
    dstTimer.current = setTimeout(() => fetchSuggestions(t, setDstSuggestions), 400);
  };
  const selectSrc = (s) => { setSource(s.display); setSrcCoords({ lat: s.lat, lon: s.lon, display: s.display }); setSrcSuggestions([]); };
  const selectDst = (s) => { setDestination(s.display); setDstCoords({ lat: s.lat, lon: s.lon, display: s.display }); setDstSuggestions([]); };

  const findRoute = async () => {
    if (!source.trim() && !srcCoords) { setError('Please enter a source location'); return; }
    if (!destination.trim() && !dstCoords) { setError('Please enter a destination'); return; }
    setLoading(true); setError(''); setResult(null);
    try {
      const body = { preference };
      if (srcCoords) body.source_coords = srcCoords; else body.source = source;
      if (dstCoords) body.destination_coords = dstCoords; else body.destination = destination;
      const r = await fetch(`${API_BASE}/recommend`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error || 'Something went wrong'); return; }
      setResult(data);
    } catch { setError(`Can't reach server. Check API_BASE (${API_BASE})`); }
    finally { setLoading(false); }
  };

  const activePref = PREFS.find(p => p.key === preference) || PREFS[0];

  // Handle hardware back button / swipe back on Android
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showMap) { setShowMap(false); return true; }
      return false;
    });
    return () => handler.remove();
  }, [showMap]);

  if (showMap && result) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        <WebView
          source={{ html: buildMapHtml(result.routes, result.best_route.index, result.source, result.destination, preference) }}
          style={{ flex: 1 }}
          javaScriptEnabled
          domStorageEnabled
          originWhitelist={['*']}
          geolocationEnabled={true}
        />

      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <View style={styles.row}>
              <Text style={styles.logo}>🛣️</Text>
              <Text style={styles.appName}>SmoothWay</Text>
            </View>
            <Text style={styles.tagline}>ML-POWERED COMFORT & SAFETY ROUTING</Text>
          </View>
          {result?.weather && (
            <View style={styles.weatherBadge}>
              <Text style={styles.weatherBadgeText}>{weatherEmoji(result.weather.description)} {result.weather.temp_c}°C</Text>
            </View>
          )}
        </View>

        {/* Search Card */}
        <View style={styles.card}>

          {/* FROM field */}
          <View style={styles.inputGroup}>
            <View style={[styles.inputDot, { backgroundColor: C.blue }]} />
            <View style={{ flex: 1 }}>
              <View style={styles.inputWithBtn}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="From — type or use current location"
                  placeholderTextColor={C.muted}
                  value={source}
                  onChangeText={onSrcChange}
                />
                {/* Use My Location Button */}
                <TouchableOpacity
                  style={[styles.myLocBtn, srcCoords && { borderColor: C.blue, backgroundColor: C.blue + '15' }]}
                  onPress={useMyLocation}
                  disabled={locLoading}
                >
                  {locLoading
                    ? <ActivityIndicator size="small" color={C.blue} />
                    : <Text style={[styles.myLocBtnText, srcCoords && { color: C.blue }]}>
                        {srcCoords ? '📍' : '📍'}
                      </Text>
                  }
                </TouchableOpacity>
              </View>
              {/* Location status */}
              {srcCoords && (
                <Text style={styles.locStatus}>📍 Using: {source}</Text>
              )}
              {srcSuggestions.length > 0 && (
                <View style={styles.dropdown}>
                  {srcSuggestions.map((s, i) => (
                    <TouchableOpacity key={i} style={styles.dropItem} onPress={() => selectSrc(s)}>
                      <Text style={styles.dropText} numberOfLines={1}>📍 {s.display}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </View>

          <View style={styles.routeLine} />

          {/* TO field */}
          <View style={styles.inputGroup}>
            <View style={[styles.inputDot, { backgroundColor: C.red }]} />
            <View style={{ flex: 1 }}>
              <TextInput
                style={styles.input}
                placeholder="To — where do you want to go?"
                placeholderTextColor={C.muted}
                value={destination}
                onChangeText={onDstChange}
              />
              {dstSuggestions.length > 0 && (
                <View style={styles.dropdown}>
                  {dstSuggestions.map((s, i) => (
                    <TouchableOpacity key={i} style={styles.dropItem} onPress={() => selectDst(s)}>
                      <Text style={styles.dropText} numberOfLines={1}>📍 {s.display}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </View>

          <View style={styles.divider} />

          {/* Preferences */}
          <View style={styles.prefRow}>
            {PREFS.slice(0, 4).map(p => (
              <TouchableOpacity key={p.key}
                style={[styles.prefBtn, preference === p.key && { borderColor: p.color, backgroundColor: p.color + '15' }]}
                onPress={() => setPreference(p.key)}>
                <Text style={styles.prefEmoji}>{p.emoji}</Text>
                <Text style={[styles.prefText, preference === p.key && { color: p.color }]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.safetyPrefBtn, preference === 'women_safety' && { borderColor: C.pink, backgroundColor: C.pink + '15' }]}
            onPress={() => setPreference('women_safety')}>
            <Text style={styles.prefEmoji}>🛡️</Text>
            <Text style={[styles.safetyPrefText, preference === 'women_safety' && { color: C.pink }]}>
              Women Safety — More people, better lit roads
            </Text>
          </TouchableOpacity>

          {!!error && <View style={styles.errorBox}><Text style={styles.errorText}>⚠️ {error}</Text></View>}

          <TouchableOpacity
            style={[styles.findBtn, { backgroundColor: activePref.color }, loading && { opacity: 0.6 }]}
            onPress={findRoute} disabled={loading}>
            {loading
              ? <ActivityIndicator color={C.bg} />
              : <Text style={styles.findBtnText}>{activePref.emoji}  Find {activePref.label} Route</Text>
            }
          </TouchableOpacity>
        </View>

        {/* Results */}
        {result && (
          <>
            <TouchableOpacity style={[styles.mapBtn, { borderColor: activePref.color + '80' }]} onPress={() => setShowMap(true)}>
              <Text style={[styles.mapBtnText, { color: activePref.color }]}>🗺  View on Map + GPS Navigation</Text>
            </TouchableOpacity>

            <BestRouteBanner route={result.best_route} weather={result.weather} preference={preference} />

            {result.comparison?.length > 0 && (
              <ComparisonPanel comparison={result.comparison} bestRoute={result.best_route} preference={preference} />
            )}

            <Text style={styles.sectionHeader}>ALL ROUTES</Text>
            {result.routes.map(route => (
              <RouteCard key={route.index} route={route}
                isBest={route.index === result.best_route.index}
                preference={preference} />
            ))}

            <View style={styles.modelInfo}>
              <Text style={styles.modelInfoText}>
                🤖 {result.model_info?.type} · {result.model_info?.n_estimators} trees · {result.model_info?.features?.length} features
              </Text>
            </View>
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingTop: Platform.OS === 'android' ? 48 : 60 },
  row: { flexDirection: 'row', alignItems: 'center' },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  logo: { fontSize: 26, marginRight: 8 },
  appName: { fontSize: 26, fontWeight: '800', color: C.green, letterSpacing: 0.5 },
  tagline: { fontSize: 9, color: C.muted, letterSpacing: 1.5, marginTop: 2 },
  weatherBadge: { backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 6 },
  weatherBadgeText: { color: C.text, fontSize: 13, fontWeight: '600' },

  card: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 14 },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 14 },

  inputGroup: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  inputDot: { width: 12, height: 12, borderRadius: 6, marginTop: 14 },
  inputWithBtn: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { backgroundColor: C.surface, color: C.text, borderRadius: 10, borderWidth: 1, borderColor: C.border, padding: 12, fontSize: 14 },

  myLocBtn: {
    backgroundColor: C.surface, borderRadius: 10, borderWidth: 1,
    borderColor: C.border, padding: 12, alignItems: 'center', justifyContent: 'center',
    width: 46, height: 46,
  },
  myLocBtnText: { fontSize: 18, color: C.muted },
  locStatus: { fontSize: 11, color: C.blue, marginTop: 4, marginLeft: 2 },

  routeLine: { width: 2, height: 14, backgroundColor: C.border, marginLeft: 5, marginVertical: 2 },
  dropdown: { backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.border, marginTop: 4, zIndex: 999 },
  dropItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  dropText: { color: C.text, fontSize: 13 },

  prefRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  prefBtn: { flex: 1, backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.border, padding: 10, alignItems: 'center' },
  prefEmoji: { fontSize: 16, marginBottom: 2 },
  prefText: { color: C.muted, fontSize: 11, fontWeight: '600' },
  safetyPrefBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 14, gap: 10 },
  safetyPrefText: { color: C.muted, fontSize: 12, fontWeight: '600', flex: 1 },

  errorBox: { backgroundColor: C.red + '20', borderRadius: 10, borderWidth: 1, borderColor: C.red + '40', padding: 12, marginBottom: 12 },
  errorText: { color: C.red, fontSize: 13 },
  findBtn: { borderRadius: 12, padding: 16, alignItems: 'center' },
  findBtnText: { color: C.bg, fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },

  mapBtn: { borderRadius: 12, borderWidth: 1.5, padding: 14, alignItems: 'center', marginBottom: 14, backgroundColor: C.card },
  mapBtnText: { fontSize: 15, fontWeight: '700' },

  bestBanner: { borderColor: C.green, borderWidth: 1.5 },
  safetyBestBanner: { borderColor: C.pink, borderWidth: 1.5 },
  bestBannerTop: { flexDirection: 'row', alignItems: 'flex-start' },
  bestBannerLabel: { fontSize: 11, color: C.green, fontWeight: '800', letterSpacing: 2 },
  bestRouteNum: { fontSize: 22, color: C.text, fontWeight: '800', marginTop: 2 },
  comfortLabelLg: { fontSize: 15, fontWeight: '700', marginTop: 2 },
  bestMetaChip: { color: C.muted, fontSize: 12 },
  safetyInfoRow: { backgroundColor: C.pink + '15', borderRadius: 8, padding: 8, marginTop: 8 },
  safetyInfoText: { color: C.pink, fontSize: 12, fontWeight: '600' },
  trafficBadge: { backgroundColor: C.yellow + '20', borderRadius: 8, borderWidth: 1, borderColor: C.yellow + '40', paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start', marginTop: 6 },
  trafficBadgeText: { color: C.yellow, fontSize: 12, fontWeight: '600' },
  weatherRow: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border },
  weatherText: { color: C.muted, fontSize: 12, lineHeight: 18 },

  ring: { borderRadius: 999, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  ringScore: { fontWeight: '800' },
  ringLabel: { color: C.muted },

  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardHeaderInfo: { flex: 1 },
  expandIcon: { fontSize: 12, marginTop: 4 },
  routeTitle: { fontSize: 17, color: C.text, fontWeight: '700' },
  bestBadge: { backgroundColor: C.green + '20', borderRadius: 6, borderWidth: 1, borderColor: C.green + '40', paddingHorizontal: 8, paddingVertical: 2, marginLeft: 8 },
  bestBadgeText: { color: C.green, fontSize: 11, fontWeight: '700' },
  comfortLabel: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  quickStat: { color: C.muted, fontSize: 11 },

  statsRowLabel: { color: C.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8, marginTop: 4 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  statBox: { flex: 1, minWidth: '22%', backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.border, padding: 10, alignItems: 'center' },
  statIcon: { fontSize: 16, marginBottom: 4 },
  statValue: { fontSize: 14, fontWeight: '800', color: C.text },
  statLabel: { fontSize: 9, color: C.muted, marginTop: 2, textAlign: 'center' },
  statSub: { fontSize: 8, color: C.muted, fontStyle: 'italic' },

  sectionTitle: { color: C.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 10 },
  featureBarRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 7, gap: 6 },
  featureBarIcon: { fontSize: 12, width: 18 },
  featureBarLabel: { color: C.muted, fontSize: 10, width: 100 },
  featureBarTrack: { flex: 1, height: 5, backgroundColor: C.border, borderRadius: 3, overflow: 'hidden' },
  featureBarFill: { height: '100%', borderRadius: 3 },
  featureBarValue: { fontSize: 10, width: 34, textAlign: 'right', fontWeight: '600' },

  stepRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8, gap: 10 },
  stepNum: { color: C.green, fontSize: 11, fontWeight: '700', width: 18, marginTop: 1 },
  stepMsg: { color: C.text, fontSize: 12, lineHeight: 17 },
  stepStreet: { color: C.muted, fontSize: 11, marginTop: 1 },
  moreSteps: { color: C.muted, fontSize: 11, textAlign: 'center', marginTop: 4 },

  compTitle: { color: C.green, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 14 },
  compHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  compVsLabel: { color: C.text, fontSize: 14, fontWeight: '700' },
  scoreDiffBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  scoreDiffText: { fontSize: 13, fontWeight: '700' },
  compSeparator: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.border },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8, gap: 8 },
  bulletIcon: { fontSize: 14, width: 22 },
  bulletText: { flex: 1, color: C.text, fontSize: 12, lineHeight: 17 },
  bulletStatus: { fontSize: 13, width: 20 },

  sectionHeader: { color: C.muted, fontSize: 11, fontWeight: '700', letterSpacing: 2, marginBottom: 10 },
  modelInfo: { alignItems: 'center', marginTop: 8 },
  modelInfoText: { color: C.muted, fontSize: 11 },

});