(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }
  var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------- Costanti ---------- */
  var SC = 0.43;            // scala degli oggetti verticali (pali, destinazione)
  var CAR_SC = 0.45;        // scala del mezzo
  var HC = 75;              // altezza della camera in metri
  var NEAR = 6;             // piano vicino della camera
  var VIEW = 520;           // raggio di disegno in metri
  var H_SCALE = 1.3;        // esagerazione dell'altezza degli edifici
  var CELL_DLAT = 0.004, CELL_DLON = 0.0055;   // celle di dati di circa 450 m
  var SIM_V = 13.9;         // 50 km/h in simulazione
  var OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://ovp.dresel.systems/api/interpreter'];
  var OSRM = ['https://router.project-osrm.org', 'https://routing.openstreetmap.de/routed-car'];
  var PHOTON = 'https://photon.komoot.io/api/';
  var NOMINATIM = 'https://nominatim.openstreetmap.org/search';
  var DEMO = { lat: 45.4642, lon: 9.19 };      // Milano, Duomo
  var STORE_KEY = 'nightrider.app.prefs';
  var LAST_KEY = 'nightrider.app.last';
  var HW = {
    motorway: [2, 17, 5], trunk: [2, 15, 4], primary: [1, 14, 3], secondary: [1, 12, 2], tertiary: [1, 10, 1],
    unclassified: [0, 7, 0], residential: [0, 6, 0], living_street: [0, 5, 0], service: [0, 3.5, 0],
    motorway_link: [2, 9, 5], trunk_link: [1, 9, 4], primary_link: [1, 9, 3], secondary_link: [1, 8, 2], tertiary_link: [0, 7, 1]
  };
  var HW_RE = '^(' + Object.keys(HW).join('|') + ')$';

  var css = getComputedStyle(document.documentElement);
  function tok(n, d) { var v = css.getPropertyValue(n).trim(); return v || d; }
  var C = {
    bg: tok('--bg', '#07060d'), cyan: tok('--cyan', '#19e3ff'), mag: tok('--magenta', '#ff2e88'),
    yel: tok('--yellow', '#f7e733'), ok: tok('--ok', '#3ddc97'), panel: tok('--panel', '#110c20')
  };
  var ROAD_MINOR = '#2a2050', ROAD_MAJOR = '#3a2c6e', ROAD_MOTORWAY = '#473582';
  // bordo neon per tipo di strada: autostrada fucsia, extraurbana principale ambra, statali ciano, provinciali viola chiaro
  var EDGE = [null, '#5a4aa8', '#12a0b8', '#19e3ff', '#ffb020', '#ff2bd6'];
  var LX = -0.6, LY = -0.8;

  var THEMES = {
    fuchsia: { dark: [58, 4, 40], light: [222, 22, 144], roof: '#f0289e', edge: '#ffa6e8', glint: '#ff9be6', glow: '#ff2ec8', win: 'rgba(255,150,225,0.28)' },
    cyan: { dark: [4, 38, 58], light: [20, 170, 214], roof: '#17b8e6', edge: '#9cefff', glint: '#9be8ff', glow: '#19e3ff', win: 'rgba(150,235,255,0.28)' },
    amber: { dark: [58, 26, 4], light: [232, 140, 22], roof: '#f2a21e', edge: '#ffd89a', glint: '#ffe0a8', glow: '#ffa51e', win: 'rgba(255,215,150,0.28)' }
  };
  var TH = THEMES.fuchsia, WALLS = [];
  function mix(a, b, t) {
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * t) + ',' + Math.round(a[1] + (b[1] - a[1]) * t) + ',' + Math.round(a[2] + (b[2] - a[2]) * t) + ')';
  }
  function buildWalls() {
    WALLS = [];
    for (var i = 0; i <= 7; i++) WALLS.push(mix(TH.dark, TH.light, 0.18 + (i / 7) * 0.82));
  }
  function bgA(a) { return 'rgba(7,6,13,' + a + ')'; }
  function hsh(a, b) { var x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); }

  /* ---------- Preferenze ---------- */
  function detectLang() { var n = String(navigator.language || 'it').slice(0, 2).toLowerCase(); return ['it', 'en', 'es', 'fr', 'de'].indexOf(n) >= 0 ? n : 'en'; }
  var DEFAULTS = {
    routeType: 'fast', avoidHighway: false, avoidToll: false, avoidFerry: false, avoidUnpaved: false, roadRefs: true,
    carIcon: 'arrow', carColor: '#f7e733',
    voice: true, voiceTurn: true, voiceCam: true, voiceName: '', voiceStyle: 'natural', volume: 0.9,
    cams: true, gloss: true, theme: 'fuchsia', tilt: 0.6, view2d: false,
    lang: detectLang(), persona: 'cyber', roadNames: true, pois: true, voiceAll: false, ttKey: '', hereKey: '', liveInc: true,
    units: 'km', wake: true, simMult: 3,
    quick: ['fuel', 'food', 'cafe', 'hotel', 'mech']
  };
  var QCATS = [
    { id: 'fuel', sym: 'q-fuel', lbl: 'qFuel', q: '["amenity"="fuel"]' },
    { id: 'food', sym: 'q-food', lbl: 'qFood', q: '["amenity"~"^(restaurant|fast_food)$"]' },
    { id: 'cafe', sym: 'q-cafe', lbl: 'qBar', q: '["amenity"~"^(cafe|bar|pub)$"]' },
    { id: 'parking', sym: 'q-park', lbl: 'qPark', q: '["amenity"="parking"]["access"!~"^(private|customers)$"]' },
    { id: 'charge', sym: 'q-charge', lbl: 'qCharge', q: '["amenity"="charging_station"]' },
    { id: 'health', sym: 'q-health', lbl: 'qPharm', q: '["amenity"="pharmacy"]' },
    { id: 'hotel', sym: 'q-hotel', lbl: 'qHotel', q: '["tourism"~"^(hotel|motel|guest_house|hostel)$"]' },
    { id: 'mech', sym: 'q-mech', lbl: 'qMech', q: '["shop"~"^(car_repair|tyres)$"]' },
    { id: 'shop', sym: 'q-shop', lbl: 'qShop', q: '["shop"~"^(supermarket|convenience|bakery|mall)$"]' },
    { id: 'money', sym: 'q-money', lbl: 'qMoney', q: '["amenity"~"^(bank|atm)$"]' },
    { id: 'sight', sym: 'q-sight', lbl: 'qSight', q: '["tourism"~"^(attraction|museum|viewpoint)$"]' }
  ];
  var prefs = {};
  function resetPrefs() { for (var k in DEFAULTS) prefs[k] = Array.isArray(DEFAULTS[k]) ? DEFAULTS[k].slice() : DEFAULTS[k]; }
  resetPrefs();
  try {
    var saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (saved && typeof saved === 'object') for (var sk in DEFAULTS) if (sk in saved && typeof saved[sk] === typeof DEFAULTS[sk]) prefs[sk] = saved[sk];
  } catch (e) {}
  function savePrefs() { try { localStorage.setItem(STORE_KEY, JSON.stringify(prefs)); } catch (e) {} }

  /* ---------- Lingua ---------- */
  var NRL = window.NRL;
  function langInfo() { for (var i = 0; i < NRL.langs.length; i++) if (NRL.langs[i].id === prefs.lang) return NRL.langs[i]; return NRL.langs[0]; }
  function t(key) {
    var d = NRL.ui[prefs.lang] || NRL.ui.it, v = d[key];
    if (v === undefined) v = NRL.ui.it[key];
    if (v === undefined) v = key;
    for (var i = 1; i < arguments.length; i++) v = v.split('{' + (i - 1) + '}').join(arguments[i]);
    return v;
  }
  function fill(str, o) { for (var k in o) str = str.split('{' + k + '}').join(o[k]); return str; }
  function applyLang() {
    document.documentElement.lang = prefs.lang;
    var n = document.querySelectorAll('[data-i18n]'), i, el;
    for (i = 0; i < n.length; i++) { el = n[i]; el.textContent = t(el.getAttribute('data-i18n')); }
    n = document.querySelectorAll('[data-i18n-aria]');
    for (i = 0; i < n.length; i++) { el = n[i]; el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria'))); }
    n = document.querySelectorAll('[data-i18n-ph]');
    for (i = 0; i < n.length; i++) { el = n[i]; el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph'))); }
    var title = $('endBtn'); if (title) title.title = t('endAria');
    $('menuBtn').title = t('menuAria');
    if (typeof renderQuick === 'function' && typeof POI_COL !== 'undefined') renderQuick();
  }

  /* ---------- Proiezione locale ---------- */
  var ORG = null;
  /* proiezione di Mercatore ridotta alla scala del punto d'origine: in metri vicino all'origine e senza deformazioni di forma in qualsiasi punto del mondo */
  var RE = 6378137;
  function mercY(lat) { return Math.log(Math.tan(Math.PI / 4 + Math.max(-85, Math.min(85, lat)) * Math.PI / 360)); }
  function setOrigin(lat, lon) { ORG = { lat: lat, lon: lon, c0: Math.cos(lat * Math.PI / 180), m0: mercY(lat) }; }
  function toXY(lat, lon) {
    var dl = ((lon - ORG.lon + 540) % 360 + 360) % 360 - 180;
    return { x: dl * Math.PI / 180 * RE * ORG.c0, y: -(mercY(lat) - ORG.m0) * RE * ORG.c0 };
  }
  function toLL(x, y) { return { lat: (2 * Math.atan(Math.exp(ORG.m0 - y / (RE * ORG.c0))) - Math.PI / 2) * 180 / Math.PI, lon: ORG.lon + x / (RE * ORG.c0) * 180 / Math.PI }; }
  function bearingToPhi(deg) { var r = deg * Math.PI / 180; return Math.atan2(-Math.cos(r), Math.sin(r)); }

  /* ---------- Unità ---------- */
  function spd(kmh) { return prefs.units === 'mi' ? kmh * 0.621371 : kmh; }
  function limitDisp(l) { return prefs.units === 'mi' ? Math.round(l * 0.621371 / 5) * 5 : l; }
  function fmtDist(m) {
    if (prefs.units === 'mi') {
      var mi = m / 1609.34;
      if (mi >= 0.2) return mi.toFixed(1).replace('.', (NRL.say[prefs.lang] || NRL.say.it).dec) + ' mi';
      var ft = m * 3.28084;
      return ft < 25 ? '0 ft' : Math.max(50, Math.round(ft / 50) * 50) + ' ft';
    }
    if (m >= 995) return (m / 1000).toFixed(1).replace('.', (NRL.say[prefs.lang] || NRL.say.it).dec) + ' km';
    return m < 5 ? '0 m' : Math.max(10, Math.round(m / 10) * 10) + ' m';
  }
  function spokenDist(m) {
    var u = NRL.say[prefs.lang] || NRL.say.it, dec = u.dec;
    if (prefs.units === 'mi') {
      var mi = m / 1609.34;
      if (mi >= 0.2) return mi.toFixed(1).replace('.', dec) + ' ' + u.mi;
      return Math.max(50, Math.round(m * 3.28084 / 50) * 50) + ' ' + u.ft;
    }
    if (m >= 975) { var kmTxt = (m / 1000).toFixed(1); return kmTxt === '1.0' ? u.oneKm : kmTxt.replace('.', dec) + ' ' + u.km; }
    return Math.max(50, Math.round(m / 50) * 50) + ' ' + u.m;
  }
  function fmtDur(s) {
    var m = Math.max(1, Math.round(s / 60));
    if (m < 60) return m + ' ' + t('min');
    var h = Math.floor(m / 60);
    return h + ' ' + t('hour') + ' ' + (m % 60 < 10 ? '0' : '') + (m % 60) + ' ' + t('min');
  }
  function clockAfter(s) { return new Date(Date.now() + s * 1000).toLocaleTimeString(langInfo().bcp, { hour: '2-digit', minute: '2-digit' }); }

  /* ---------- Rete ---------- */
  function fetchJson(url, init, ms) {
    return new Promise(function (resolve, reject) {
      var ctl = window.AbortController ? new AbortController() : null;
      var done = false;
      var timer = setTimeout(function () { if (done) return; done = true; if (ctl) ctl.abort(); reject(new Error('timeout')); }, ms || 15000);
      init = init || {};
      if (ctl) init.signal = ctl.signal;
      fetch(url, init).then(function (r) {
        r.json().then(function (j) {
          if (done) return; done = true; clearTimeout(timer);
          if (!r.ok) { var e = new Error('http ' + r.status); e.status = r.status; e.body = j; reject(e); } else resolve(j);
        }, function () {
          if (done) return; done = true; clearTimeout(timer);
          var e = new Error('json'); e.status = r.status; reject(e);
        });
      }, function (err) { if (done) return; done = true; clearTimeout(timer); reject(err); });
    });
  }

  /* ---------- Voce ---------- */
  var synth = window.speechSynthesis || null;
  var voices = [];
  var voiceSel = $('voiceSel');
  var VSTYLES = { natural: { rate: 1, pitch: 1 }, soft: { rate: 0.94, pitch: 0.97 } };
  function voiceScore(v) {
    var n = v.name.toLowerCase(), s = 0;
    if (/natural|neural|online/.test(n)) s += 12;
    if (/premium|enhanced|avanzata|siri/.test(n)) s += 10;
    if (/google/.test(n)) s += 6;
    if (/elsa|isabella|alice|federica|paola|lucia|silvia|carla|female|donna/.test(n)) s += 3;
    if (/luca|cosimo|diego|\bmale\b|uomo/.test(n)) s -= 3;
    if (/compact|espeak/.test(n)) s -= 8;
    if (v.localService === false) s += 2;
    return s;
  }
  function isNatural(v) { return /natural|neural|premium|enhanced|avanzata|siri|google/i.test(v.name); }
  function bestVoice() { return voices.length ? voices[0] : null; }
  function updateVoiceInfo() {
    var info = $('voiceInfo');
    if (!synth) { info.textContent = ''; return; }
    var v = voices.filter(function (x) { return x.name === prefs.voiceName; })[0] || bestVoice(), cnt = 0;
    try { cnt = (synth.getVoices() || []).length; } catch (e) {}
    info.textContent = (v ? t('voiceUse', v.name + (isNatural(v) ? t('voiceNat') : '')) : t('voiceNone')) + (cnt ? ' ' + t('voiceCount', cnt) : '');
  }
  function fillVoices() {
    if (!synth) return;
    var pre = langInfo().id;
    try {
      var all = synth.getVoices() || [];
      voices = all.filter(function (v) { return prefs.voiceAll || String(v.lang || '').toLowerCase().replace('_', '-').indexOf(pre) === 0; });
      voices.sort(function (a, b) {
        var la = String(a.lang || '').toLowerCase().indexOf(pre) === 0 ? 1 : 0, lb = String(b.lang || '').toLowerCase().indexOf(pre) === 0 ? 1 : 0;
        return (lb - la) || (voiceScore(b) - voiceScore(a));
      });
    } catch (e) { voices = []; }
    voiceSel.innerHTML = '';
    var o = document.createElement('option'); o.value = ''; o.textContent = t('voiceAuto'); voiceSel.appendChild(o);
    voices.forEach(function (v) {
      var op = document.createElement('option'); op.value = v.name;
      op.textContent = v.name + (prefs.voiceAll ? ' (' + v.lang + ')' : '') + (isNatural(v) ? t('voiceNat') : ''); voiceSel.appendChild(op);
    });
    voiceSel.value = prefs.voiceName;
    if (voiceSel.value !== prefs.voiceName) voiceSel.value = '';
    updateVoiceInfo();
  }
  if (synth) {
    fillVoices();
    if (synth.addEventListener) synth.addEventListener('voiceschanged', fillVoices);
    try { if (synth.onvoiceschanged === null || synth.onvoiceschanged === undefined) synth.onvoiceschanged = fillVoices; } catch (e) {}
  } else {
    $('voiceNote').hidden = false; voiceSel.disabled = true; $('vol').disabled = true; $('testVoice').disabled = true; $('refreshVoices').disabled = true;
  }
  function speak(text, force) {
    if (!synth || (!prefs.voice && !force)) return;
    try {
      synth.cancel();
      var u = new SpeechSynthesisUtterance(text);
      var st = VSTYLES[prefs.voiceStyle] || VSTYLES.natural;
      var v0 = voices.filter(function (x) { return x.name === prefs.voiceName; })[0] || bestVoice();
      u.lang = (v0 && v0.lang) || langInfo().bcp; u.volume = prefs.volume; u.rate = st.rate; u.pitch = st.pitch;
      if (v0) u.voice = v0;
      synth.speak(u);
    } catch (e) {}
  }
  function unlockSpeech() {
    if (!synth) return;
    try { var u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u); } catch (e) {}
  }
  function testSpeak() { speak(t('testPhrase'), true); }

  /* ---------- Edifici, strade e autovelox da OpenStreetMap ---------- */
  var cells = {}, cellList = [], queue = [], loading = false, SEEN = {}, CAMS = {}, camList = [], netErr = 0;
  function cellKey(i, j) { return i + ',' + j; }
  function cellOf(lat, lon) { return { i: Math.floor(lon / CELL_DLON), j: Math.floor(lat / CELL_DLAT) }; }

  function parseMax(v) {
    if (!v) return 0;
    var s = String(v).toLowerCase();
    var m = s.match(/^(\d{2,3})\s*(mph)?$/);
    if (m) { var n = +m[1]; return m[2] ? Math.round(n * 1.609) : n; }
    if (/urban/.test(s)) return 50;
    if (/rural/.test(s)) return 90;
    if (/motorway/.test(s)) return 130;
    return 0;
  }
  function bHeight(t, id) {
    var h = parseFloat(t.height);
    if (h > 0) return Math.min(h, 250);
    var l = parseFloat(t['building:levels']);
    if (l > 0) return Math.min(l * 3.2 + 1, 250);
    var r = hsh(id % 1000, Math.floor(id / 1000) % 97);
    return 7 + Math.pow(r, 2) * 18;
  }
  function makeBuilding(e) {
    var g = e.geometry, n = g.length;
    if (g[0].lat === g[n - 1].lat && g[0].lon === g[n - 1].lon) n--;
    if (n < 3) return null;
    var xs = [], ys = [], A = 0, cx = 0, cy = 0, i, j;
    for (i = 0; i < n; i++) { var p = toXY(g[i].lat, g[i].lon); xs.push(p.x); ys.push(p.y); }
    for (i = 0; i < n; i++) { j = (i + 1) % n; A += xs[i] * ys[j] - xs[j] * ys[i]; cx += xs[i]; cy += ys[i]; }
    A /= 2;
    if (Math.abs(A) < 10 || Math.abs(A) > 60000) return null;
    cx /= n; cy /= n;
    var r = 0;
    for (i = 0; i < n; i++) r = Math.max(r, Math.hypot(xs[i] - cx, ys[i] - cy));
    return { xs: xs, ys: ys, n: n, cx: cx, cy: cy, sg: A > 0 ? 1 : -1, h: bHeight(e.tags || {}, e.id) * H_SCALE, r: r };
  }
  // Douglas-Peucker: linee più dritte e regolari, meno spigoli
  function simplifyPts(xs, ys, tol) {
    var n = xs.length, keep = new Array(n), st = [[0, n - 1]], i;
    for (i = 0; i < n; i++) keep[i] = false;
    keep[0] = keep[n - 1] = true;
    if (Math.hypot(xs[0] - xs[n - 1], ys[0] - ys[n - 1]) < 3 && n > 4) { var mid = n >> 1; keep[mid] = true; st = [[0, mid], [mid, n - 1]]; }   // anello chiuso (rotonda): si divide in due metà
    while (st.length) {
      var se = st.pop(), a = se[0], b = se[1], dmax = 0, im = -1;
      var dx = xs[b] - xs[a], dy = ys[b] - ys[a], l = Math.hypot(dx, dy) || 1e-9;
      for (i = a + 1; i < b; i++) {
        var d = Math.abs((xs[i] - xs[a]) * dy - (ys[i] - ys[a]) * dx) / l;
        if (d > dmax) { dmax = d; im = i; }
      }
      if (dmax > tol && im > 0) { keep[im] = true; st.push([a, im], [im, b]); }
    }
    var ox = [], oy = [];
    for (i = 0; i < n; i++) if (keep[i]) { ox.push(xs[i]); oy.push(ys[i]); }
    return [ox, oy];
  }
  function makeRoad(e) {
    var t = e.tags || {}, def = HW[t.highway];
    if (!def) return null;
    if (t.area === 'yes') return null;
    var g = e.geometry, xs = [], ys = [], minx = 1e12, maxx = -1e12, miny = 1e12, maxy = -1e12;
    for (var i = 0; i < g.length; i++) {
      var p = toXY(g[i].lat, g[i].lon);
      xs.push(p.x); ys.push(p.y);
      if (p.x < minx) minx = p.x; if (p.x > maxx) maxx = p.x;
      if (p.y < miny) miny = p.y; if (p.y > maxy) maxy = p.y;
    }
    var closed = xs.length >= 5 && Math.hypot(xs[0] - xs[xs.length - 1], ys[0] - ys[xs.length - 1]) < 3;
    if (xs.length > 3) { var sp = simplifyPts(xs, ys, closed ? 0.5 : Math.max(1.8, def[1] * 1.25 * 0.2)); xs = sp[0]; ys = sp[1]; }
    minx = 1e12; maxx = -1e12; miny = 1e12; maxy = -1e12;
    for (i = 0; i < xs.length; i++) { if (xs[i] < minx) minx = xs[i]; if (xs[i] > maxx) maxx = xs[i]; if (ys[i] < miny) miny = ys[i]; if (ys[i] > maxy) maxy = ys[i]; }
    var li = 0, ll = 0;
    for (i = 0; i < xs.length - 1; i++) { var sl = Math.hypot(xs[i + 1] - xs[i], ys[i + 1] - ys[i]); if (sl > ll) { ll = sl; li = i; } }
    return { xs: xs, ys: ys, cls: def[0], k: def[2], lk: /_link$/.test(t.highway), tn: t.brunnel === 'tunnel', br: t.brunnel === 'bridge', ow: t.oneway === 'yes' ? 1 : t.oneway === '-1' ? -1 : 0, ring: closed && maxx - minx < 90 && maxy - miny < 90 && maxx - minx > 6, w: def[1] * 1.25, nm: t.name || '', li: li, ll: ll, ms: parseMax(t.maxspeed), minx: minx, maxx: maxx, miny: miny, maxy: maxy };
  }
  function addCam(e) {
    var id = 'n' + e.id;
    if (CAMS[id]) return;
    var p = toXY(e.lat, e.lon);
    var c = { id: id, x: p.x, y: p.y, lat: e.lat, lon: e.lon, limit: parseMax((e.tags || {}).maxspeed) };
    CAMS[id] = c; camList.push(c);
  }
  function parseOsm(json) {
    var out = { b: [], r: [], n: 0 }, els = json.elements || [];
    for (var k = 0; k < els.length; k++) {
      var e = els[k], t = e.tags || {};
      if (e.type === 'node') { if (t.highway === 'speed_camera' || t.enforcement === 'maxspeed' || t.enforcement === 'average_speed' || t.enforcement === 'speed') addCam(e); continue; }
      if (e.type !== 'way' || !e.geometry || e.geometry.length < 2) continue;
      var id = 'w' + e.id;
      if (SEEN[id]) continue;
      if (t.building) {
        if (e.geometry.length < 4) continue;
        var bd = makeBuilding(e);
        if (bd) { SEEN[id] = 1; out.b.push(bd); }
      } else if (t.highway) {
        var rd = makeRoad(e);
        if (rd) { SEEN[id] = 1; out.r.push(rd); }
      }
    }
    fixRoundabouts(out.r);
    return out;
  }
  // le rotonde prendono il colore (e lo spessore) della strada più importante che vi entra
  var KW = [7, 10, 12, 14, 15, 17];
  function fixRoundabouts(rs) {
    var i, j, k, m;
    for (i = 0; i < rs.length; i++) {
      var ring = rs[i]; if (!ring.ring) continue;
      var best = ring.k;
      for (j = 0; j < rs.length; j++) {
        var o = rs[j];
        if (o === ring || o.ring || o.maxx < ring.minx - 8 || o.minx > ring.maxx + 8 || o.maxy < ring.miny - 8 || o.miny > ring.maxy + 8) continue;
        if (o.k <= best) continue;
        var near = false;
        for (k = 0; k < o.xs.length && !near; k++) for (m = 0; m < ring.xs.length; m++) if (Math.hypot(o.xs[k] - ring.xs[m], o.ys[k] - ring.ys[m]) < 7) { near = true; break; }
        if (near) best = o.k;
      }
      if (best > ring.k) { ring.k = best; ring.w = Math.max(ring.w, KW[best] * 1.25 * 0.85); }
      if (ring.k < 1) { ring.k = 1; }
    }
  }
  var gen = 0, inflight = 0, diag = [], reqN = 0, srvBad = [0, 0];
  var DATA_R = 430, CACHE_TTL = 14 * 24 * 3600 * 1000, CACHE_V = 3;
  var KEEP = ['building', 'height', 'building:levels', 'highway', 'maxspeed', 'area', 'enforcement', 'name'];

  /* Cache sul dispositivo (IndexedDB): la seconda volta nella stessa zona la mappa è subito pronta */
  var idbP = null;
  function openIdb() {
    if (!idbP) idbP = new Promise(function (resolve) {
      try {
        var rq = indexedDB.open('nightrider-cache', 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore('cells'); };
        rq.onsuccess = function () { resolve(rq.result); };
        rq.onerror = function () { resolve(null); };
        rq.onblocked = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
    return idbP;
  }
  function cacheGet(key) {
    return openIdb().then(function (db) {
      if (!db) return null;
      return new Promise(function (resolve) {
        try {
          var rq = db.transaction('cells', 'readonly').objectStore('cells').get(key);
          rq.onsuccess = function () { var v = rq.result; resolve(v && v.v === CACHE_V && Date.now() - v.t < CACHE_TTL ? v : null); };
          rq.onerror = function () { resolve(null); };
        } catch (e) { resolve(null); }
      });
    });
  }
  function cachePut(key, els) {
    openIdb().then(function (db) {
      if (!db) return;
      try { db.transaction('cells', 'readwrite').objectStore('cells').put({ v: CACHE_V, t: Date.now(), els: els }, key); } catch (e) {}
    });
  }
  function compactEls(els) {
    var out = [];
    for (var i = 0; i < els.length; i++) {
      var e = els[i], t = {}, tg = e.tags || {}, k, j;
      for (k = 0; k < KEEP.length; k++) if (tg[KEEP[k]] !== undefined) t[KEEP[k]] = tg[KEEP[k]];
      if (e.type === 'node') { out.push({ type: 'node', id: e.id, lat: e.lat, lon: e.lon, tags: t }); continue; }
      if (e.type !== 'way' || !e.geometry) continue;
      var flat = new Array(e.geometry.length * 2);
      for (j = 0; j < e.geometry.length; j++) { flat[2 * j] = e.geometry[j].lat; flat[2 * j + 1] = e.geometry[j].lon; }
      out.push({ type: 'way', id: e.id, tags: t, flat: flat });
    }
    return out;
  }
  function expandEls(c) {
    var out = [];
    for (var i = 0; i < c.length; i++) {
      var e = c[i];
      if (e.type === 'node') { out.push(e); continue; }
      var g = new Array(e.flat.length / 2);
      for (var j = 0; j < g.length; j++) g[j] = { lat: e.flat[2 * j], lon: e.flat[2 * j + 1] };
      out.push({ type: 'way', id: e.id, tags: e.tags, geometry: g });
    }
    return out;
  }

  /* ---------- Rete: tile vettoriali per strade ed edifici, Overpass solo per autovelox e limiti ---------- */
  var TILE_Z = 14, TILE_URL = 'https://tiles.openfreemap.org/planet/latest/{z}/{x}/{y}.pbf', TILE_HOST = 'tiles.openfreemap.org';
  var synthId = 100000000000, limWays = [], xcells = {}, xqueue = [], xInflight = 0;
  var XD_LAT = 0.008, XD_LON = 0.011;   // celle di circa 900 m per autovelox e limiti

  function hostOf(u) { return u.replace(/^https?:\/\//, '').split('/')[0]; }
  function logReq(host, kind, ms, res) {
    diag.unshift({ host: host, kind: kind, ms: ms, res: res });
    if (diag.length > 14) diag.length = 14;
  }

  /* Overpass: usato solo per autovelox e limiti. Due server a rotazione. */
  function overpass(q, kind) {
    var now = Date.now(), order = [], i;
    for (i = 0; i < OVERPASS.length; i++) order.push((reqN + i) % OVERPASS.length);
    reqN++;
    order.sort(function (a, b) { return ((srvBad[a] || 0) > now ? 1 : 0) - ((srvBad[b] || 0) > now ? 1 : 0); });
    order = order.slice(0, 3);
    var tmo = [12000, 16000, 20000];
    function attempt(k, lastErr) {
      if (k >= order.length) return Promise.reject(lastErr || new Error('overpass'));
      var si = order[k], t0 = Date.now();
      return fetchJson(OVERPASS[si], { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) }, tmo[k]).then(function (j) {
        logReq(hostOf(OVERPASS[si]), kind, Date.now() - t0, 'ok');
        return j;
      }, function (e) {
        srvBad[si] = Date.now() + 60000;
        logReq(hostOf(OVERPASS[si]), kind, Date.now() - t0, e && e.status ? 'errore ' + e.status : (e && e.message) || 'errore');
        return attempt(k + 1, e);
      });
    }
    return attempt(0);
  }
  function bboxStr(S, W, N, E) { return S.toFixed(6) + ',' + W.toFixed(6) + ',' + N.toFixed(6) + ',' + E.toFixed(6); }

  /* Decodifica dei tile vettoriali (formato Mapbox Vector Tile, protobuf) */
  function mvtDecode(buf) {
    var d = new Uint8Array(buf), p = 0, dv = new DataView(buf), layers = {};
    function vi() { var r = 0, m = 1, b; do { b = d[p++]; r += (b & 127) * m; m *= 128; } while (b & 128 && p < d.length); return r; }
    function str(s, e) { var o = ''; for (var i = s; i < e; i++) o += String.fromCharCode(d[i]); try { return decodeURIComponent(escape(o)); } catch (x) { return o; } }
    function skip(w) { if (w === 0) vi(); else if (w === 1) p += 8; else if (w === 5) p += 4; else if (w === 2) p += vi(); else p = d.length; }
    function readValue(s, e) {
      var v = null; p = s;
      while (p < e) {
        var tg = vi(), f = Math.floor(tg / 8), w = tg & 7;
        if (f === 1 && w === 2) { var l = vi(); v = str(p, p + l); p += l; }
        else if (f === 2 && w === 5) { v = dv.getFloat32(p, true); p += 4; }
        else if (f === 3 && w === 1) { v = dv.getFloat64(p, true); p += 8; }
        else if ((f === 4 || f === 5) && w === 0) v = vi();
        else if (f === 6 && w === 0) { var z = vi(); v = z % 2 ? -(z + 1) / 2 : z / 2; }
        else if (f === 7 && w === 0) v = !!vi();
        else skip(w);
      }
      return v;
    }
    function readFeature(s, e) {
      var ft = { tags: [], type: 0, gs: 0, ge: 0 }; p = s;
      while (p < e) {
        var tg = vi(), f = Math.floor(tg / 8), w = tg & 7;
        if (f === 2 && w === 2) { var l = vi(), end = p + l; while (p < end) ft.tags.push(vi()); }
        else if (f === 3 && w === 0) ft.type = vi();
        else if (f === 4 && w === 2) { var l2 = vi(); ft.gs = p; ft.ge = p + l2; p += l2; }
        else skip(w);
      }
      return ft;
    }
    function readLayer(s, e) {
      var L = { name: '', keys: [], vals: [], ext: 4096, feats: [] }; p = s;
      while (p < e) {
        var tg = vi(), f = Math.floor(tg / 8), w = tg & 7;
        if (w === 2) {
          var l = vi(), st = p, en = p + l;
          if (f === 1) L.name = str(st, en);
          else if (f === 2) { L.feats.push(readFeature(st, en)); }
          else if (f === 3) L.keys.push(str(st, en));
          else if (f === 4) L.vals.push(readValue(st, en));
          p = en;
        } else if (f === 5 && w === 0) L.ext = vi();
        else skip(w);
      }
      return L;
    }
    while (p < d.length) {
      var tg = vi(), f = Math.floor(tg / 8), w = tg & 7;
      if (f === 3 && w === 2) { var l = vi(), st = p; p = st + l; var L = readLayer(st, st + l); layers[L.name] = L; p = st + l; }
      else skip(w);
    }
    function props(L, ft) {
      var o = {};
      for (var i = 0; i + 1 < ft.tags.length; i += 2) o[L.keys[ft.tags[i]]] = L.vals[ft.tags[i + 1]];
      return o;
    }
    function geom(ft) {
      var out = [], cur = null, x = 0, y = 0; p = ft.gs;
      while (p < ft.ge) {
        var c = vi(), cmd = c & 7, cnt = Math.floor(c / 8);
        if (cmd === 7) continue;
        for (var i = 0; i < cnt; i++) {
          var dx = vi(), dy = vi();
          x += dx % 2 ? -(dx + 1) / 2 : dx / 2; y += dy % 2 ? -(dy + 1) / 2 : dy / 2;
          if (cmd === 1) { cur = [x, y]; out.push(cur); } else if (cur) cur.push(x, y);
        }
      }
      return out;
    }
    return { layers: layers, props: props, geom: geom };
  }

  var GROUND_BASE = '#0e0a1f';
  var GROUND_COL = { resid: '#15102d', comm: '#1c1236', ind: '#1b1c2b', amen: '#141a33', sand: '#251c28', farm: '#0f2219', grass: '#0b2723', wood: '#082a20', wet: '#0a2631', water: '#081b52' };
  var GROUND_ORDER = ['resid', 'comm', 'ind', 'amen', 'sand', 'farm', 'grass', 'wood', 'wet', 'water'];
  var LU_CLASS = { residential: 'resid', suburb: 'resid', neighbourhood: 'resid', commercial: 'comm', retail: 'comm', industrial: 'ind', railway: 'ind', garages: 'ind', quarry: 'ind', landfill: 'ind', cemetery: 'grass', park: 'grass', garden: 'grass', recreation_ground: 'grass', pitch: 'grass', playground: 'grass', golf_course: 'grass', school: 'amen', university: 'amen', college: 'amen', kindergarten: 'amen', hospital: 'amen', stadium: 'amen', zoo: 'amen', theme_park: 'amen', military: 'ind' };
  var LC_CLASS = { grass: 'grass', farmland: 'farm', wood: 'wood', forest: 'wood', sand: 'sand', wetland: 'wet' };
  var OMT_HW = { motorway: 'motorway', trunk: 'trunk', primary: 'primary', secondary: 'secondary', tertiary: 'tertiary', minor: 'residential', service: 'service' };
  function tileToEls(buf, tx, ty) {
    var T = mvtDecode(buf), els = [], n = Math.pow(2, TILE_Z), i, j, k;
    function pt(px, py, ext) {
      var yy = Math.PI * (1 - 2 * (ty + py / ext) / n);
      return { lat: Math.atan(Math.sinh(yy)) * 180 / Math.PI, lon: (tx + px / ext) / n * 360 - 180 };
    }
    var B = T.layers.building;
    if (B) for (i = 0; i < B.feats.length; i++) {
      var bf = B.feats[i];
      if (bf.type !== 3) continue;
      var bp = T.props(B, bf);
      if (bp.render_min_height > 0) continue;
      var rings = T.geom(bf), s0 = 0;
      for (j = 0; j < rings.length; j++) {
        var rg = rings[j], A = 0, m = rg.length / 2;
        if (m < 3) continue;
        for (k = 0; k < m; k++) { var k2 = (k + 1) % m; A += rg[2 * k] * rg[2 * k2 + 1] - rg[2 * k2] * rg[2 * k + 1]; }
        var sg = A > 0 ? 1 : -1;
        if (!s0) s0 = sg;
        if (sg !== s0) continue;          // i buchi interni non servono
        var g = [];
        for (k = 0; k < m; k++) g.push(pt(rg[2 * k], rg[2 * k + 1], B.ext));
        g.push(g[0]);
        var tg = { building: 'yes' };
        if (bp.render_height > 0 && bp.render_height !== 5) tg.height = bp.render_height;
        els.push({ type: 'way', id: synthId++, tags: tg, geometry: g });
      }
    }
    var R = T.layers.transportation;
    if (R) for (i = 0; i < R.feats.length; i++) {
      var rf = R.feats[i];
      if (rf.type !== 2) continue;
      var rp = T.props(R, rf), hw = OMT_HW[rp.class];
      if (!hw) continue;
      if (rp.ramp === 1 || rp.ramp === true) hw = hw === 'motorway' ? 'motorway_link' : hw === 'trunk' ? 'trunk_link' : hw + '_link';
      var lines = T.geom(rf);
      for (j = 0; j < lines.length; j++) {
        var ln = lines[j], g2 = [];
        if (ln.length < 4) continue;
        for (k = 0; k < ln.length; k += 2) g2.push(pt(ln[k], ln[k + 1], R.ext));
        els.push({ type: 'way', id: synthId++, tags: { highway: hw, name: rp.ref && !rp.name ? rp.ref : rp.name, brunnel: rp.brunnel || '', oneway: rp.oneway === -1 || rp.oneway === '-1' ? '-1' : rp.oneway ? 'yes' : '' }, geometry: g2 });
      }
    }
    // zone del terreno (campagna, parchi, industria, acqua) come poligoni piatti
    var ground = [], GL = [['landuse', LU_CLASS, 'class'], ['landcover', LC_CLASS, 'class'], ['water', null, '']];
    for (var gi = 0; gi < GL.length; gi++) {
      var GLy = T.layers[GL[gi][0]];
      if (!GLy) continue;
      for (i = 0; i < GLy.feats.length; i++) {
        var gf = GLy.feats[i];
        if (gf.type !== 3) continue;
        var key = GL[gi][1] ? GL[gi][1][T.props(GLy, gf)[GL[gi][2]]] : 'water';
        if (!key) continue;
        var grs = T.geom(gf), gs0 = 0;
        for (j = 0; j < grs.length; j++) {
          var gr = grs[j], gm = gr.length / 2, ga = 0;
          if (gm < 3) continue;
          for (k = 0; k < gm; k++) { var kk2 = (k + 1) % gm; ga += gr[2 * k] * gr[2 * kk2 + 1] - gr[2 * kk2] * gr[2 * k + 1]; }
          var gsg = ga > 0 ? 1 : -1;
          if (!gs0) gs0 = gsg;
          if (gsg !== gs0) continue;
          var xs = [], ys = [], lx = 1e9, ly = 1e9, mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9;
          for (k = 0; k < gm; k++) {
            var q = pt(gr[2 * k], gr[2 * k + 1], GLy.ext), w = toXY(q.lat, q.lon);
            if (Math.abs(w.x - lx) + Math.abs(w.y - ly) < 5 && k < gm - 1) continue;
            lx = w.x; ly = w.y; xs.push(w.x); ys.push(w.y);
            if (w.x < mnx) mnx = w.x; if (w.x > mxx) mxx = w.x; if (w.y < mny) mny = w.y; if (w.y > mxy) mxy = w.y;
          }
          if (xs.length >= 3) ground.push({ k: key, xs: xs, ys: ys, minx: mnx, maxx: mxx, miny: mny, maxy: mxy });
        }
      }
    }
    // nomi delle vie (livello transportation_name) e punti di interesse (livello poi)
    var labels = [], pois = [], NL = T.layers.transportation_name, PO = T.layers.poi;
    if (NL) for (i = 0; i < NL.feats.length; i++) {
      var nf = NL.feats[i]; if (nf.type !== 2) continue;
      var np = T.props(NL, nf), nkind = OMT_KIND[np['class']], nnm = np.name || np.ref;
      if (nkind === undefined || !nnm) continue;
      var nlines = T.geom(nf), best = null, bl = 0;
      for (j = 0; j < nlines.length; j++) {
        var nl = nlines[j], nlen = 0;
        for (k = 2; k < nl.length; k += 2) nlen += Math.hypot(nl[k] - nl[k - 2], nl[k + 1] - nl[k - 1]);
        if (nlen > bl) { bl = nlen; best = nl; }
      }
      if (!best || best.length < 4) continue;
      var nxy = [], cum = [0];
      for (k = 0; k < best.length; k += 2) { var nq = pt(best[k], best[k + 1], NL.ext), nw = toXY(nq.lat, nq.lon); nxy.push(nw); if (k) cum.push(cum[cum.length - 1] + Math.hypot(nw.x - nxy[nxy.length - 2].x, nw.y - nxy[nxy.length - 2].y)); }
      var tot = cum[cum.length - 1]; if (tot < 24) continue;
      var atLen = function (L) { var m = 1; while (m < cum.length - 1 && cum[m] < L) m++; var f = (L - cum[m - 1]) / Math.max(1e-6, cum[m] - cum[m - 1]); return { x: nxy[m - 1].x + (nxy[m].x - nxy[m - 1].x) * f, y: nxy[m - 1].y + (nxy[m].y - nxy[m - 1].y) * f }; };
      var half = Math.min(tot / 4, 30), pm = atLen(tot / 2), pa = atLen(tot / 2 - half), pb = atLen(tot / 2 + half), dl = Math.hypot(pb.x - pa.x, pb.y - pa.y) || 1;
      var nref = String(np.ref || '').split(';')[0].replace(/\s+/g, ' ').trim(), rps = [];
      if (nref && nref.length <= 6 && nkind >= 2) { var nrp = Math.max(1, Math.round(tot / 650)); for (var rq = 0; rq < nrp; rq++) rps.push(atLen((rq + 0.5) * tot / nrp)); }
      labels.push({ nm: nnm, x: pm.x, y: pm.y, ax: pa.x, ay: pa.y, bx: pb.x, by: pb.y, L: tot, k: nkind, ref: nref.length <= 6 ? nref : '', rps: rps });
    }
    if (PO) for (i = 0; i < PO.feats.length; i++) {
      var pf = PO.feats[i]; if (pf.type !== 1) continue;
      var pp = T.props(PO, pf), cat = poiCat(pp['class'], pp.subclass) || (pp.name ? 'biz' : '');
      if (!cat) continue;
      var pg = T.geom(pf); if (!pg.length) continue;
      var pq = pt(pg[0][0], pg[0][1], PO.ext), pw = toXY(pq.lat, pq.lon);
      pois.push({ x: pw.x, y: pw.y, c: cat, nm: pp.name || '', r: pp.rank || 99 });
    }
    return { els: els, ground: ground, labels: labels, pois: pois };
  }
  var OMT_KIND = { motorway: 5, trunk: 4, primary: 3, secondary: 2, tertiary: 1, minor: 0, service: 0 };
  function poiCat(c, sc) {
    if (c === 'car_repair' || sc === 'car_repair' || sc === 'tyres' || c === 'car_wash') return 'mech';
    if (c === 'fuel') return 'fuel';
    if (c === 'parking' || sc === 'parking') return 'parking';
    if (c === 'restaurant' || c === 'fast_food' || sc === 'restaurant' || sc === 'fast_food') return 'food';
    if (c === 'cafe' || c === 'bar' || c === 'pub' || sc === 'cafe' || sc === 'bar' || sc === 'pub' || c === 'ice_cream') return 'cafe';
    if (c === 'shop' || c === 'grocery' || c === 'clothing_store' || c === 'convenience' || c === 'supermarket' || c === 'bakery' || c === 'butcher' || c === 'florist' || sc === 'supermarket' || sc === 'convenience') return 'shop';
    if (c === 'hospital' || c === 'pharmacy' || c === 'doctors' || c === 'dentist' || c === 'clinic') return 'health';
    if (c === 'lodging' || sc === 'hotel') return 'hotel';
    if (c === 'bank' || c === 'atm') return 'money';
    if (c === 'charging_station' || sc === 'charging_station') return 'charge';
    if (c === 'attraction' || c === 'museum' || c === 'monument' || sc === 'attraction') return 'sight';
    return '';
  }

  function gunzip(buf) {
    var u = new Uint8Array(buf);
    if (u.length > 2 && u[0] === 0x1f && u[1] === 0x8b && window.DecompressionStream) {
      return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    }
    return Promise.resolve(buf);
  }
  function fetchTile(x, y, ms, zz) {
    return new Promise(function (resolve, reject) {
      var ctl = window.AbortController ? new AbortController() : null, done = false;
      var timer = setTimeout(function () { if (done) return; done = true; if (ctl) ctl.abort(); reject(new Error('timeout')); }, ms);
      function fail(e) { if (done) return; done = true; clearTimeout(timer); reject(e); }
      fetch(TILE_URL.replace('{z}', zz === undefined ? TILE_Z : zz).replace('{x}', x).replace('{y}', y), ctl ? { signal: ctl.signal } : {}).then(function (r) {
        if (r.status === 404 || r.status === 204) { if (!done) { done = true; clearTimeout(timer); resolve(new ArrayBuffer(0)); } return; }
        if (!r.ok) { var e = new Error('http ' + r.status); e.status = r.status; return fail(e); }
        return r.arrayBuffer().then(gunzip).then(function (b) { if (done) return; done = true; clearTimeout(timer); resolve(b); });
      }).catch(fail);
    });
  }
  function fetchTileRetry(x, y) {
    var t0 = Date.now();
    return fetchTile(x, y, 12000).then(function (b) { return b; }, function (e) {
      logReq(TILE_HOST, 'mappa', Date.now() - t0, e && e.status ? 'errore ' + e.status : (e && e.message) || 'errore');
      t0 = Date.now();
      return fetchTile(x, y, 20000);
    });
  }
  function tileOf(lat, lon) {
    var n = Math.pow(2, TILE_Z), r = lat * Math.PI / 180;
    return { x: Math.floor((lon + 180) / 360 * n), y: Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n) };
  }

  function refreshCellList() {
    cellList = [];
    for (var kk in cells) { var c = cells[kk]; if (c.sr === 'ok') cellList.push(c); }
  }
  function applyTile(cell, buf) {
    var tl = buf && buf.byteLength ? tileToEls(buf, cell.i, cell.j) : { els: [], ground: [] };
    var parsed = parseOsm({ elements: tl.els });
    cell.b = parsed.b; cell.r = parsed.r; cell.g = tl.ground; cell.l = tl.labels || []; cell.p = tl.pois || []; cell.sr = cell.sb = 'ok';
    refreshCellList();
  }
  function startTile(cell, g) {
    var t0 = Date.now(), key = 't:' + cell.i + ',' + cell.j;
    inflight++; cell.sr = cell.sb = 'loading';
    fetchTileRetry(cell.i, cell.j).then(function (buf) {
      if (g !== gen) return;
      logReq(TILE_HOST, 'mappa', Date.now() - t0, 'ok · ' + Math.round(buf.byteLength / 1024) + ' KB');
      try { applyTile(cell, buf); netErr = 0; cachePut(key, buf); }
      catch (e) { cell.sr = cell.sb = 'err'; cell.t = Date.now(); }
    }, function (e) {
      if (g !== gen) return;
      logReq(TILE_HOST, 'mappa', Date.now() - t0, e && e.status ? 'errore ' + e.status : (e && e.message) || 'errore');
      cell.sr = cell.sb = 'err'; cell.t = Date.now(); netErr++;
    }).then(function () { inflight--; pump(); });
  }
  function pump() {
    if (!ORG) return;
    while (inflight < 3 && queue.length) {
      var ll = toLL(car.x, car.y), cc = tileOf(ll.lat, ll.lon), bi = 0, bs = 1e9, k;
      for (k = 0; k < queue.length; k++) {
        var q = queue[k], ring = Math.max(Math.abs(q.cell.i - cc.x), Math.abs(q.cell.j - cc.y));
        if (ring < bs) { bs = ring; bi = k; }
      }
      var it = queue.splice(bi, 1)[0];
      if (it.gen !== gen) continue;
      startTile(it.cell, it.gen);
    }
  }
  function wantTile(tx, ty) {
    var key = tx + ',' + ty, cell = cells[key];
    if (!cell) cell = cells[key] = { i: tx, j: ty, b: [], r: [], sr: 'none', sb: 'none', t: 0 };
    if (cell.sr === 'ok' || cell.sr === 'queued' || cell.sr === 'loading') return;
    if (cell.sr === 'err' && Date.now() - cell.t < 8000) return;
    cell.sr = cell.sb = 'loading';
    var g = gen;
    cacheGet('t:' + key).then(function (hit) {
      if (g !== gen) return;
      if (hit && hit.els) { try { applyTile(cell, hit.els); return; } catch (e) {} }
      cell.sr = cell.sb = 'queued';
      queue.push({ cell: cell, gen: g });
      pump();
    });
  }

  /* Autovelox e limiti di velocità: da Overpass, in secondo piano, una richiesta alla volta */
  function applyExtra(els) {
    var parsed = parseOsm({ elements: els });
    for (var i = 0; i < parsed.r.length; i++) if (parsed.r[i].ms) limWays.push(parsed.r[i]);
  }
  function extraQuery(i, j) {
    var S = j * XD_LAT, W = i * XD_LON, bb = bboxStr(S, W, S + XD_LAT, W + XD_LON);
    return '[out:json][timeout:25];(node["highway"="speed_camera"](' + bb + ');node["enforcement"~"^(maxspeed|average_speed|speed)$"](' + bb + ');way["highway"~"' + HW_RE + '"]["maxspeed"](' + bb + '););out geom qt;';
  }
  function wantExtra(i, j) {
    var key = i + ',' + j, xc = xcells[key];
    if (xc && (xc.s === 'ok' || xc.s === 'loading' || xc.s === 'queued' || (xc.s === 'err' && Date.now() - xc.t < 60000))) return;
    xc = xcells[key] = { i: i, j: j, s: 'loading', t: 0 };
    var g = gen;
    cacheGet('x:' + key).then(function (hit) {
      if (g !== gen) return;
      if (hit && hit.els) { applyExtra(expandEls(hit.els)); xc.s = 'ok'; return; }
      xc.s = 'queued'; xqueue.push({ xc: xc, gen: g }); pumpExtra();
    });
  }
  function pumpExtra() {
    while (xInflight < 1 && xqueue.length) {
      var it = xqueue.shift();
      if (it.gen !== gen) continue;
      (function (xc, g) {
        xInflight++;
        overpass(extraQuery(xc.i, xc.j), 'autovelox').then(function (j) {
          if (g !== gen) return;
          var els = j.elements || [];
          applyExtra(els); xc.s = 'ok'; cachePut('x:' + xc.i + ',' + xc.j, compactEls(els));
        }, function () { if (g !== gen) return; xc.s = 'err'; xc.t = Date.now(); }).then(function () { xInflight--; pumpExtra(); });
      })(it.xc, it.gen);
    }
  }

  function wantAround(x, y, r) {
    var ll = toLL(x, y), nw = toLL(x - r, y - r), se = toLL(x + r, y + r), tx, ty, i, j;
    var dLat = (nw.lat - se.lat) / 2, dLon = (se.lon - nw.lon) / 2;
    var a = tileOf(nw.lat, nw.lon), b = tileOf(se.lat, se.lon);
    for (tx = a.x; tx <= b.x; tx++) for (ty = a.y; ty <= b.y; ty++) wantTile(tx, ty);
    var i0 = Math.floor((ll.lon - dLon) / XD_LON), i1 = Math.floor((ll.lon + dLon) / XD_LON);
    var j0 = Math.floor((ll.lat - dLat) / XD_LAT), j1 = Math.floor((ll.lat + dLat) / XD_LAT);
    for (i = i0; i <= i1; i++) for (j = j0; j <= j1; j++) wantExtra(i, j);
  }
  function ensureData() {
    if (!ORG) return;
    if (!myAdded) injectMyCams();
    wantAround(car.x, car.y, DATA_R);
    wantAround(car.x + Math.cos(phi) * 380, car.y + Math.sin(phi) * 380, 200);
    if (view.free) wantAround(view.fx, view.fy, Math.min(cm.R + 150, 1600));
    if (route && (state === 'nav' || state === 'preview')) {
      for (var d = prog.d; d < Math.min(route.total, prog.d + 1200); d += 250) { var p = pointAt(route, d); wantAround(p.x, p.y, 150); }
    }
    pump();
  }
  function dataStatus() {
    var done = 0, total = 0, bad = 0, k;
    for (k in cells) { total++; if (cells[k].sr === 'ok') done++; else if (cells[k].sr === 'err') bad++; }
    if (done + bad < total) return t('mapLoading', done, total - bad);
    if (bad && !done) return t('mapNoNet');
    return done ? t('mapOk') : '--';
  }
  function diagText() {
    if (!diag.length) return t('diagNone');
    return diag.map(function (d) { return d.host + ' · ' + d.kind + ' · ' + (d.ms / 1000).toFixed(1).replace('.', ',') + ' s · ' + d.res; }).join('\n');
  }

  /* ---------- Limite di velocità sotto l'auto ---------- */
  var limitNow = 0;
  function updateLimit() {
    var best = 0, bd = 20 * 20, x = car.x, y = car.y;
    for (var c = 0; c < 1; c++) {
      var rs = limWays;
      for (var r = 0; r < rs.length; r++) {
        var rd = rs[r];
        if (!rd.ms || x < rd.minx - 20 || x > rd.maxx + 20 || y < rd.miny - 20 || y > rd.maxy + 20) continue;
        for (var i = 0; i < rd.xs.length - 1; i++) {
          var ax = rd.xs[i], ay = rd.ys[i], dx = rd.xs[i + 1] - ax, dy = rd.ys[i + 1] - ay, l2 = dx * dx + dy * dy;
          var t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
          var ex = ax + dx * t - x, ey = ay + dy * t - y, dd = ex * ex + ey * ey;
          if (dd < bd) { bd = dd; best = rd.ms; }
        }
      }
    }
    limitNow = best;
  }

  /* ---------- Ricerca indirizzi ---------- */
  var results = $('results'), searchTimer = null, searchSeq = 0;
  function showResMsg(t) { results.innerHTML = ''; var li = document.createElement('li'); li.className = 'res-msg'; li.textContent = t; results.appendChild(li); }
  function searchPhoton(q) {
    var url = PHOTON + '?limit=6&q=' + encodeURIComponent(q);
    if (here) url += '&lat=' + here.lat.toFixed(4) + '&lon=' + here.lon.toFixed(4);
    return fetchJson(url, null, 10000).then(function (j) {
      return (j.features || []).filter(function (f) { return f.geometry && f.geometry.coordinates; }).map(function (f) {
        var p = f.properties || {}, street = p.street ? p.street + (p.housenumber ? ' ' + p.housenumber : '') : '';
        var title = p.name || street || p.city || 'Luogo';
        var sub = [p.name && street ? street : '', p.city || p.district || p.county || '', p.state || ''].filter(Boolean).join(', ');
        return { name: title, sub: sub, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] };
      });
    });
  }
  function searchNominatim(q) {
    var url = NOMINATIM + '?format=jsonv2&limit=6&accept-language=' + prefs.lang + '&q=' + encodeURIComponent(q);
    return fetchJson(url, null, 10000).then(function (j) {
      return (j || []).map(function (r) {
        var parts = String(r.display_name || '').split(',');
        return { name: parts[0] || 'Luogo', sub: parts.slice(1, 3).join(',').trim(), lat: parseFloat(r.lat), lon: parseFloat(r.lon) };
      });
    });
  }
  function doSearch(q) {
    var seq = ++searchSeq;
    showResMsg(t('searching'));
    searchPhoton(q).catch(function () { return []; }).then(function (list) {
      return list.length ? list : searchNominatim(q);
    }).then(function (list) {
      if (seq !== searchSeq) return;
      renderResults(list);
    }, function () {
      if (seq !== searchSeq) return;
      showResMsg('Ricerca non disponibile. Controlla la connessione e riprova.');
    });
  }
  function renderResults(list) {
    results.innerHTML = '';
    if (!list.length) { showResMsg(t('noResults')); return; }
    list.forEach(function (r) {
      var li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button'; b.className = 'res';
      var tb = document.createElement('b'); tb.textContent = r.name;
      var s = document.createElement('span'); s.textContent = r.sub || '';
      b.appendChild(tb); if (r.sub) b.appendChild(s);
      b.addEventListener('click', function () { chooseDest(r); });
      li.appendChild(b); results.appendChild(li);
    });
  }
  $('q').addEventListener('input', function () {
    var q = $('q').value.trim();
    clearTimeout(searchTimer);
    if (q.length < 3) { searchSeq++; results.innerHTML = ''; return; }
    searchTimer = setTimeout(function () { doSearch(q); }, 450);
  });
  $('searchForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var q = $('q').value.trim();
    clearTimeout(searchTimer);
    if (q.length >= 2) doSearch(q);
  });

  /* ---------- Percorso ---------- */
  /* Frasi di guida: stile (persona) e lingua; se manca una chiave si usa il Classico della stessa lingua */
  function phSets() {
    var lang = prefs.lang, pr = (lang === 'it' || lang === 'en') ? prefs.persona : 'classic';
    return [(NRL.ph[pr] && NRL.ph[pr][lang]) || null, NRL.ph.classic[lang] || NRL.ph.classic.it];
  }
  function getp(o, path) {
    var parts = path.split('.');
    for (var i = 0; i < parts.length; i++) { if (o == null) return null; o = o[parts[i]]; }
    return o == null ? null : o;
  }
  function pv(path, seed, raw) {
    var sets = phSets(), v = getp(sets[0], path);
    if (v == null) v = getp(sets[1], path);
    if (!raw && Array.isArray(v)) v = v[Math.abs(Math.round(seed || 0)) % v.length];
    return v;
  }
  function ordWord(n) {
    if (prefs.persona === 'hacker' && (prefs.lang === 'it' || prefs.lang === 'en')) return String(n);
    var list = pv('ord', 0, true) || [];
    return list[n - 1] || String(n);
  }
  function keepMan(type, mod) {
    if (type === 'depart' || type === 'new name' || type === 'notification' || type === 'exit roundabout' || type === 'exit rotary' || type === 'arrive') return false;
    if ((type === 'continue' || type === 'turn') && (!mod || mod === 'straight')) return false;
    return true;
  }
  function describe(m) {
    var mod = m.mod || '', sd = /left/.test(mod) ? 'left' : /right/.test(mod) ? 'right' : 'x', seed = Math.round(m.d || 0) + (m.type || '').length;
    var st = /^slight/.test(mod) ? 'slight' : /^sharp/.test(mod) ? 'sharp' : '';
    var icon = sd === 'right' ? 'right' : sd === 'left' ? 'left' : 'straight';
    switch (m.type) {
      case 'arrive': return { icon: 'arrive', text: pv('arrive.' + sd, seed) };
      case 'roundabout': case 'rotary': case 'roundabout turn':
        return { icon: 'round', text: m.exit ? fill(pv('round', seed), { n: ordWord(m.exit) }) : pv('roundX', seed) };
      case 'fork': return { icon: icon, text: pv('fork.' + sd, seed) };
      case 'merge': return { icon: icon, text: pv('merge.' + sd, seed) };
      case 'on ramp': return { icon: icon, text: pv('onramp.' + sd, seed) };
      case 'off ramp': return { icon: icon, text: pv('offramp.' + sd, seed) };
      case 'end of road': return { icon: icon, text: pv('endroad.' + sd, seed) };
      default:
        if (mod === 'uturn') return { icon: 'uturn', text: pv('turn.uturn', seed) };
        if (sd !== 'x') return { icon: icon, text: pv('turn.' + st + sd, seed) };
        return { icon: 'straight', text: pv('turn.straight', seed) };
    }
  }
  function leadText(man, m, speech) {
    var seed = Math.round(man.d || 0);
    return m < 35 ? pv('now', seed) : fill(pv('lead', seed), { d: speech ? spokenDist(m) : fmtDist(m) });
  }
  function maneuverPhrase(man, m) {
    var d = describe(man), seed = Math.round(man.d || 0);
    if (man.type === 'arrive') return m < 40 ? pv('arriveNow', seed) : leadText(man, m, true) + d.text + '.';
    var nm = man.name ? fill(pv('tail', 0), { name: man.name }) : '';
    return leadText(man, m, true) + d.text + nm + '.';
  }
  function buildRoute(r, dest) {
    var co = r.geometry.coordinates, pts = [], cum = [0], i;
    for (i = 0; i < co.length; i++) {
      var p = toXY(co[i][1], co[i][0]);
      pts.push(p);
      if (i) cum.push(cum[i - 1] + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y));
    }
    var total = cum[cum.length - 1], steps = [], sumD = 0;
    (r.legs || []).forEach(function (leg) { (leg.steps || []).forEach(function (s) { steps.push(s); sumD += s.distance || 0; }); });
    var k = sumD > 0 ? total / sumD : 1, acc = 0, man = [];
    for (i = 0; i < steps.length; i++) {
      var s = steps[i], m = s.maneuver || {}, d = acc * k;
      acc += s.distance || 0;
      if (m.type === 'arrive') { if (i === steps.length - 1) man.push({ d: total, type: 'arrive', mod: m.modifier || '', name: dest.name }); continue; }
      if (!keepMan(m.type, m.modifier)) continue;
      man.push({ d: d, type: m.type, mod: m.modifier || '', name: s.name || '', exit: m.exit });
    }
    if (!man.length || man[man.length - 1].type !== 'arrive') man.push({ d: total, type: 'arrive', mod: '', name: dest.name });
    var lo = [180, 90], hi = [-180, -90];
    for (i = 0; i < co.length; i++) {
      if (co[i][0] < lo[0]) lo[0] = co[i][0]; if (co[i][1] < lo[1]) lo[1] = co[i][1];
      if (co[i][0] > hi[0]) hi[0] = co[i][0]; if (co[i][1] > hi[1]) hi[1] = co[i][1];
    }
    return { pts: pts, cum: cum, total: total, man: man, dur: r.duration || total / 10, dist: r.distance || total, dest: dest, cams: [], bbox: [lo[1], lo[0], hi[1], hi[0]] };
  }
  function pickRoute(routes) {
    var fastest = 1e12, i;
    for (i = 0; i < routes.length; i++) fastest = Math.min(fastest, routes[i].duration);
    var best = routes[0], bv = 1e12;
    routes.forEach(function (r) {
      var v;
      if (prefs.routeType === 'short') { if (r.duration > fastest * 1.3) return; v = r.distance + r.duration * 0.001; }
      else v = r.duration;
      if (v < bv) { bv = v; best = r; }
    });
    return best;
  }
  /* Percorsi: si interrogano tutti i server insieme e si sceglie il migliore tra tutte le alternative */
  function getRoute(from, to, headingDeg, via) {
    via = via || [];
    var pts = [from].concat(via, [to]);
    function coordStr(arr) { return arr.map(function (q) { return q.lon.toFixed(6) + ',' + q.lat.toFixed(6); }).join(';'); }
    var ex = []; if (prefs.avoidHighway) ex.push('motorway'); if (prefs.avoidToll) ex.push('toll'); if (prefs.avoidFerry) ex.push('ferry');
    function one(srv, cs, extra) {
      var url = srv + '/route/v1/driving/' + cs + '?overview=full&geometries=geojson&steps=true&alternatives=' + (cs.split(';').length > 2 ? 'false' : '3') + extra;
      return fetchJson(url, null, 14000).then(function (j) {
        if (!j || j.code !== 'Ok' || !j.routes || !j.routes.length) { var e = new Error('noroute'); e.fatal = !!(j && j.code === 'NoRoute'); throw e; }
        return j.routes;
      });
    }
    function all(cs, extra) {
      return new Promise(function (resolve, reject) {
        var pending = OSRM.length, routes = [], fatal = 0, firstOk = 0, timer = null, finished = false, lastErr = null;
        function finish() {
          if (finished) return; finished = true; clearTimeout(timer);
          if (routes.length) resolve({ routes: routes }); else { var e = lastErr || new Error('route'); e.fatal = fatal === OSRM.length; reject(e); }
        }
        OSRM.forEach(function (srv) {
          one(srv, cs, extra).then(function (rs) {
            routes = routes.concat(rs);
            if (!firstOk) { firstOk = Date.now(); timer = setTimeout(finish, 1200); }
          }, function (e) { lastErr = e; if (e && e.fatal) fatal++; }).then(function () { if (--pending === 0) finish(); });
        });
      });
    }
    function bearFix() { var arr = [Math.round(headingDeg) + ',60']; for (var i = 1; i < pts.length; i++) arr.push(''); return '&bearings=' + arr.join(';'); }
    function attempt(extra) {
      return headingDeg != null ? all(coordStr(pts), extra + bearFix()).then(null, function () { return all(coordStr(pts), extra); }) : all(coordStr(pts), extra);
    }
    var mainP = attempt(ex.length ? '&exclude=' + ex.join(',') : '').then(function (j) { return { data: j, dropped: false }; }, function (e) {
      if (ex.length && !e.fatal) return attempt('').then(function (j) { return { data: j, dropped: true }; });
      throw e;
    });
    var nohwP = ex.indexOf('motorway') >= 0 ? Promise.resolve(null) : attempt('&exclude=motorway' + (prefs.avoidFerry ? ',ferry' : '')).then(function (j) {
      j.routes.forEach(function (r) { r._nohw = true; }); return j.routes;
    }, function () { return null; });
    var ttP = prefs.ttKey ? tomtomRoutes(from, to, via).catch(function () { return null; }) : Promise.resolve(null);
    return Promise.all([mainP.then(function (r) { return r; }, function (e) { return { err: e }; }), nohwP, ttP]).then(function (a) {
      var res = a[0];
      if (a[2] && a[2].length > 1) return { data: { routes: a[2] }, dropped: false, traffic: true };
      if (res.err) throw res.err;
      if (a[1]) res.data.routes = res.data.routes.concat(a[1]);
      if (a[2] && a[2].length) { res.data.routes = res.data.routes.concat(a[2]); }
      // se i percorsi davvero diversi sono meno di 3, se ne cercano altri passando da un punto laterale
      var uniq = distinctRoutes(res.data.routes);
      if (uniq.length >= 3) return res;
      var base = uniq[0], g = base.geometry.coordinates, m = Math.floor(g.length / 2), p0 = g[Math.max(0, m - 2)], p1 = g[Math.min(g.length - 1, m + 2)];
      var cl = Math.cos(g[m][1] * Math.PI / 180), dxm = (p1[0] - p0[0]) * cl, dym = p1[1] - p0[1], nl = Math.hypot(dxm, dym) || 1;
      var off = Math.max(500, Math.min(14000, base.distance * 0.2)) / 111320, tasks = [];
      [1, -1].forEach(function (sd) {
        var vp = { lon: g[m][0] + (-dym / nl) * off * sd / cl, lat: g[m][1] + (dxm / nl) * off * sd };
        var arr = [from, vp].concat(via, [to]);
        tasks.push(all(coordStr(arr), prefs.avoidFerry ? '&exclude=ferry' : '').then(function (j) { j.routes.forEach(function (r) { r._via = true; }); return j.routes; }, function () { return []; }));
      });
      return Promise.all(tasks).then(function (extra) {
        extra.forEach(function (rs) { res.data.routes = res.data.routes.concat(rs); });
        return res;
      });
    }).then(postFilter);
  }
  /* traghetti e strade non asfaltate: si scartano i percorsi che le contengono, se ne esiste almeno uno senza */
  function hasFerry(r) {
    var f = false;
    (r.legs || []).forEach(function (l) { (l.steps || []).forEach(function (st) { if (st.mode === 'ferry' || (st.maneuver && /ferry/.test(st.maneuver.type || ''))) f = true; }); });
    return f;
  }
  function unpavedFlags(routes) {
    // un'unica richiesta Overpass per percorso: vie non asfaltate (surface) o "track" entro 12 m dalla linea
    var jobs = routes.map(function (r) {
      var co = r.geometry.coordinates, n = co.length;
      if (r.distance > 250000 || n < 2) return Promise.resolve(false);
      var maxPts = 110, stepI = Math.max(1, Math.floor(n / maxPts)), pts = [], i;
      for (i = 0; i < n; i += stepI) pts.push(co[i][1].toFixed(5) + ',' + co[i][0].toFixed(5));
      pts.push(co[n - 1][1].toFixed(5) + ',' + co[n - 1][0].toFixed(5));
      var ar = 'around:12,' + pts.join(',');
      var q = '[out:json][timeout:15];(way(' + ar + ')["highway"]["surface"~"^(unpaved|gravel|dirt|ground|earth|sand|grass|mud|compacted|fine_gravel|pebblestone)$"];way(' + ar + ')["highway"="track"];);out ids 1;';
      return overpass(q, 'strade sterrate').then(function (j) { return !!(j && j.elements && j.elements.length); }, function () { return false; });
    });
    return Promise.race([Promise.all(jobs), new Promise(function (res) { setTimeout(function () { res(routes.map(function () { return false; })); }, 9000); })]);
  }
  function postFilter(res) {
    if (!res || !res.data || !res.data.routes) return res;
    var rs = res.data.routes;
    if (prefs.avoidFerry && !res.traffic) {
      var okF = rs.filter(function (r) { return !hasFerry(r); });
      if (okF.length) res.data.routes = okF; else if (rs.some(hasFerry)) res.ferryLeft = true;
    }
    if (!prefs.avoidUnpaved) return res;
    var cand = distinctRoutes(res.data.routes).slice(0, 5);
    return unpavedFlags(cand).then(function (fl) {
      var okU = cand.filter(function (r, i) { return !fl[i]; });
      if (okU.length && okU.length < cand.length) res.data.routes = okU;
      else if (!okU.length && fl.some(Boolean)) res.unpavedLeft = true;
      return res;
    });
  }
  /* TomTom (opzionale, con la chiave gratuita dell'utente): percorsi con traffico, convertiti nel formato OSRM */
  var TT_MAN = { DEPART: ['depart', ''], ARRIVE: ['arrive', ''], ARRIVE_LEFT: ['arrive', 'left'], ARRIVE_RIGHT: ['arrive', 'right'], TURN_LEFT: ['turn', 'left'], TURN_RIGHT: ['turn', 'right'], SHARP_LEFT: ['turn', 'sharp left'], SHARP_RIGHT: ['turn', 'sharp right'], BEAR_LEFT: ['turn', 'slight left'], BEAR_RIGHT: ['turn', 'slight right'], KEEP_LEFT: ['fork', 'left'], KEEP_RIGHT: ['fork', 'right'], MAKE_UTURN: ['turn', 'uturn'], ENTER_MOTORWAY: ['on ramp', ''], ENTER_FREEWAY: ['on ramp', ''], TAKE_EXIT: ['off ramp', ''], ROUNDABOUT_CROSS: ['roundabout', 'straight'], ROUNDABOUT_RIGHT: ['roundabout', 'right'], ROUNDABOUT_LEFT: ['roundabout', 'left'], ROUNDABOUT_BACK: ['roundabout', 'uturn'] };
  function tomtomRoutes(from, to, via) {
    var wp = [from].concat(via || [], [to]).map(function (q) { return q.lat.toFixed(6) + ',' + q.lon.toFixed(6); }).join(':');
    var url = 'https://api.tomtom.com/routing/1/calculateRoute/' + wp +
      '/json?key=' + encodeURIComponent(prefs.ttKey) + '&traffic=true&maxAlternatives=2&instructionsType=coded&travelMode=car&routeType=fastest&computeTravelTimeFor=all' + (prefs.avoidFerry ? '&avoid=ferries' : '') + (prefs.avoidUnpaved ? '&avoid=unpavedRoads' : '');
    var t0 = Date.now();
    return fetchJson(url, null, 12000).then(function (j) {
      logReq('api.tomtom.com', 'traffico', Date.now() - t0, 'ok');
      return (j.routes || []).map(function (r) {
        var co = [];
        (r.legs || []).forEach(function (l) { (l.points || []).forEach(function (p) { co.push([p.longitude, p.latitude]); }); });
        var ins = (r.guidance && r.guidance.instructions) || [], total = r.summary.lengthInMeters, steps = [];
        ins.forEach(function (it, i) {
          var m = TT_MAN[it.maneuver] || (/ROUNDABOUT/.test(it.maneuver) ? ['roundabout', 'right'] : ['continue', 'straight']);
          var nxt = i + 1 < ins.length ? ins[i + 1].routeOffsetInMeters : total;
          steps.push({ distance: Math.max(0, nxt - it.routeOffsetInMeters), name: it.street || '', maneuver: { type: m[0], modifier: m[1], exit: it.roundaboutExitNumber ? +it.roundaboutExitNumber : undefined } });
        });
        return { distance: total, duration: r.summary.travelTimeInSeconds, _delay: r.summary.trafficDelayInSeconds || 0, geometry: { type: 'LineString', coordinates: co }, legs: [{ steps: steps }] };
      }).filter(function (r) { return r.geometry.coordinates.length > 1; });
    }, function (e) { logReq('api.tomtom.com', 'traffico', Date.now() - t0, e && e.status ? 'errore ' + e.status : 'errore'); throw e; });
  }
  /* Alternative: scarta i duplicati e ne sceglie fino a 3 davvero diverse, etichettate per carattere */
  function nSteps(r) { var n = 0; (r.legs || []).forEach(function (l) { n += (l.steps || []).length; }); return n; }
  /* quota del percorso a che corre entro 60 m dal percorso b (0..1) */
  function geomShare(a, b) {
    var A = a.geometry.coordinates, B = b.geometry.coordinates, k = 40, hit = 0, i, j;
    for (i = 0; i < k; i++) {
      var p = A[Math.floor(i * (A.length - 1) / (k - 1))], best = 1e9, c = Math.cos(p[1] * Math.PI / 180);
      for (j = 0; j < B.length; j++) {
        var dx = (B[j][0] - p[0]) * c * 111320, dy = (B[j][1] - p[1]) * 111320, d = dx * dx + dy * dy;
        if (d < best) best = d;
      }
      if (best < 3600) hit++;
    }
    return hit / k;
  }
  function sameGeom(a, b) { return Math.abs(a.distance - b.distance) / Math.max(a.distance, 1) <= 0.05 && geomShare(a, b) >= 0.88; }
  function distinctRoutes(routes) {
    var sorted = routes.slice().sort(function (a, b) { return a.duration - b.duration; }), uniq = [];
    sorted.forEach(function (r) {
      for (var i = 0; i < uniq.length; i++) if (sameGeom(r, uniq[i])) { return; }
      uniq.push(r);
    });
    return uniq;
  }
  /* una alternativa compare solo se è davvero diversa E ha un motivo per esistere */
  function validAlts(uniq) {
    var f = uniq[0], out = [f];
    if (f.duration < 180) return out;
    var maxExtra = Math.min(2700, Math.max(420, f.duration * 0.3));
    uniq.slice(1).sort(function (a, b) { return a.duration - b.duration; }).forEach(function (r) {
      if (out.length >= 3) return;
      var extra = r.duration - f.duration;
      if (extra > maxExtra) return;
      var shorter = r.distance < f.distance * 0.97 && f.distance - r.distance > 400;
      var lessTraffic = (f._delay || 0) - (r._delay || 0) > 180;
      var nearEqual = extra <= Math.min(300, f.duration * 0.1);
      if (!(shorter || lessTraffic || r._nohw || nearEqual)) return;
      for (var i = 0; i < out.length; i++) if (geomShare(r, out[i]) >= 0.8 && geomShare(out[i], r) >= 0.8) return;
      out.push(r);
    });
    return out;
  }
  function makeAlts(routes, dest) {
    var uniq = distinctRoutes(routes), pick = validAlts(uniq), fastest = uniq[0], shortest = pick[0];
    pick.forEach(function (r) { if (r.distance < shortest.distance) shortest = r; });
    if (prefs.routeType === 'short' && shortest !== pick[0]) { pick.splice(pick.indexOf(shortest), 1); pick.unshift(shortest); }
    var colors = ['#19e3ff', '#ff2bd6', '#ffd23f'], used = {};
    return pick.map(function (r, i) {
      var key = 'altOther';
      if (r === fastest) key = 'altFast';
      else if (r === shortest && shortest.distance < fastest.distance * 0.97) key = 'altShort';
      else if (r._nohw) key = 'altNoHw';
      if (used[key]) key = 'altOther';
      used[key] = 1;
      var rt = buildRoute(r, dest);
      rt.turns = nSteps(r); rt.delay = r._delay || 0;
      return { rt: rt, key: key, color: colors[i % 3], fastDur: fastest.duration };
    });
  }
  var alts = { list: [], sel: 0 };
  function renderAlts() {
    var box = $('alts'); if (!box) return;
    var mini = $('altsMini'); mini.innerHTML = '';
    if (state === 'preview' && alts.list.length > 1) alts.list.forEach(function (a, i) {
      var c = document.createElement('button'); c.type = 'button'; c.className = 'chip'; c.style.setProperty('--c', a.color);
      c.setAttribute('aria-checked', i === alts.sel ? 'true' : 'false');
      c.innerHTML = '<span class="dot"></span><b class="lb"></b>';
      c.querySelector('b').textContent = t(a.key);
      c.addEventListener('click', function () { selectAlt(i); });
      mini.appendChild(c);
    });
    box.innerHTML = '';
    var lock = state === 'preview' && alts.list.length > 1 && alts.sel < 0;
    $('goBtn').disabled = lock; $('simBtn').disabled = lock;
    if (state !== 'preview' || alts.list.length < 2) { box.hidden = true; return; }
    box.hidden = false;
    alts.list.forEach(function (a, i) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'alt'; b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', i === alts.sel ? 'true' : 'false'); b.style.setProperty('--c', a.color);
      var dd = Math.round((a.rt.dur - a.fastDur) / 60), cmp = dd <= 0 ? t('altSame') : t('altPlus').replace('{0}', dd + ' min');
      var sub = fmtDist(a.rt.dist) + ' · ' + t('altTurns').replace('{0}', a.rt.turns) + (a.rt.cams.length ? ' · ' + a.rt.cams.length + ' ◎' : '');
      if (a.rt.delay > 60) sub += ' · ' + t('altTraffic').replace('{0}', fmtDur(a.rt.delay));
      b.innerHTML = '<span class="dot"></span><span><div class="lbl"></div><div class="sub"></div></span><span class="tm"></span>';
      b.querySelector('.lbl').textContent = t(a.key); b.querySelector('.sub').textContent = sub;
      b.querySelector('.tm').innerHTML = '';
      b.querySelector('.tm').appendChild(document.createTextNode(fmtDur(a.rt.dur)));
      var sm = document.createElement('small'); sm.textContent = i === 0 && dd <= 0 ? '' : cmp; b.querySelector('.tm').appendChild(sm);
      b.addEventListener('click', function () { selectAlt(i); });
      box.appendChild(b);
    });
  }
  function selectAlt(i) {
    if (!alts.list[i]) return;
    alts.sel = i; setRoute(alts.list[i].rt); showMeta(); routeCams(route); setSheet(true); renderAlts();
  }
  function setSheet(open) { $('previewPanel').classList.toggle('collapsed', !open); if (route && state === 'preview') showMeta(); }
  (function () {
    var pv = $('previewPanel'), y0 = null, t0 = 0;
    ['grab', 'pvTitle', 'altsMini', 'pvMeta'].forEach(function (id) {
      var el = $(id);
      el.addEventListener('pointerdown', function (e) { y0 = e.clientY; t0 = Date.now(); });
      el.addEventListener('pointerup', function (e) {
        if (y0 === null) return;
        var dy = e.clientY - y0, open = !pv.classList.contains('collapsed'); y0 = null;
        if (dy < -22) setSheet(true); else if (dy > 22) setSheet(false);
        else if (id === 'grab' && Date.now() - t0 < 500) setSheet(!open);
      });
      el.addEventListener('pointercancel', function () { y0 = null; });
    });
  })();
  /* tocco su un percorso sulla mappa: lo seleziona */
  function hitAlt(sx, sy) {
    var best = -1, bd = 30, k, i, world2 = world.on || worldBlend() >= 0.5;
    if (world2) { if (world.on) wXfWorld(); else wXfLocal(); }
    alts.list.forEach(function (a, ai) {
      var pts = a.rt.pts, step = Math.max(1, Math.floor(pts.length / 500)), px = null, py = null;
      for (i = 0; i < pts.length; i += step) {
        var q, ok = true;
        if (world2) { var ll = toLL(pts[i].x, pts[i].y), w = wScr(ll.lat, ll.lon); q = { x: w.x, y: w.y }; ok = w.vis; }
        else { var c = cam3(pts[i].x, pts[i].y, 0); if (c.D < NEAR * 2) ok = false; else q = scr(c); }
        if (ok && px !== null) {
          var vx = q.x - px, vy = q.y - py, l2 = vx * vx + vy * vy, tt = l2 ? Math.max(0, Math.min(1, ((sx - px) * vx + (sy - py) * vy) / l2)) : 0;
          var d = Math.hypot(sx - (px + vx * tt), sy - (py + vy * tt));
          if (d < bd) { bd = d; best = ai; }
        }
        if (ok) { px = q.x; py = q.y; } else px = null;
      }
    });
    return best;
  }
  function showMeta() {
    $('pvTitle').textContent = route.dest.name + (stops.length ? ' (+' + stops.length + ' ' + t('stopLbl').toLowerCase() + ')' : '');
    $('pvMeta').textContent = alts.list.length > 1 && alts.sel < 0 ? t('pickRoute') : fmtDur(route.dur) + ' · ' + fmtDist(route.dist) + metaDiff() + ' · ' + t('lArr') + ' ' + clockAfter(route.dur);
  }
  function metaDiff() {
    var a = alts.list[alts.sel]; if (!a || alts.list.length < 2) return '';
    var dd = Math.round((a.rt.dur - a.fastDur) / 60), fd = a.fastDist !== undefined ? a.fastDist : null;
    return dd > 0 ? ' · ' + t('altPlus').replace('{0}', dd + ' min') : (alts.sel === 0 || dd <= 0 ? ' · ' + t('altSame') : '');
  }
  var camDone = {};
  function routeCams(rt) {
    if (rt._camsReq) return Promise.resolve();
    rt._camsReq = true;
    var DL = 0.3, DN = 0.4, cellsSet = {}, list = [], step = Math.max(1, Math.floor(rt.pts.length / 400)), i;
    for (i = 0; i < rt.pts.length; i += step) {
      var ll = toLL(rt.pts[i].x, rt.pts[i].y), ci = Math.floor(ll.lon / DN), cj = Math.floor(ll.lat / DL), key = ci + ',' + cj;
      if (!cellsSet[key]) { cellsSet[key] = 1; list.push([ci, cj]); }
    }
    list = list.filter(function (c) { var k = c[0] + ',' + c[1]; if (camDone[k]) return false; camDone[k] = 1; return true; }).slice(0, 10);
    var pad = 0.002, idx = 0;
    function worker() {
      if (idx >= list.length) return Promise.resolve();
      var c = list[idx++], bb = bboxStr(c[1] * DL - pad, c[0] * DN - pad, (c[1] + 1) * DL + pad, (c[0] + 1) * DN + pad);
      var q = '[out:json][timeout:25];(node["highway"="speed_camera"](' + bb + ');node["enforcement"~"^(maxspeed|average_speed|speed)$"](' + bb + '););out body;';
      return overpass(q, 'autovelox').then(function (j) { parseOsm(j); attachCams(rt); }, function () {}).then(worker);
    }
    return Promise.all([worker(), worker()]).then(function () { attachCams(rt); alts.list.forEach(function (a) { attachCams(a.rt); }); renderAlts(); });
  }
  function attachCams(rt) {
    rt.cams = [];
    camList.forEach(function (c) {
      var pr = projectOnRoute(rt, c.x, c.y, 0, true);
      if (pr.dist < 30) rt.cams.push({ d: pr.d, cam: c });
    });
    rt.cams.sort(function (a, b) { return a.d - b.d; });
  }
  function pointAt(rt, dd) {
    dd = Math.max(0, Math.min(rt.total, dd));
    var lo = 0, hi = rt.cum.length - 2;
    while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (rt.cum[mid] <= dd) lo = mid; else hi = mid - 1; }
    var a = rt.pts[lo], b = rt.pts[lo + 1], len = rt.cum[lo + 1] - rt.cum[lo];
    var t = len ? (dd - rt.cum[lo]) / len : 0;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, hx: len ? (b.x - a.x) / len : 1, hy: len ? (b.y - a.y) / len : 0, idx: lo };
  }
  function projectOnRoute(rt, x, y, from, full) {
    var best = { dist: 1e12, d: 0, idx: 0 }, n = rt.pts.length - 1;
    function scan(a, b) {
      for (var i = a; i < b; i++) {
        var p = rt.pts[i], q = rt.pts[i + 1], dx = q.x - p.x, dy = q.y - p.y, l2 = dx * dx + dy * dy;
        var t = l2 ? Math.max(0, Math.min(1, ((x - p.x) * dx + (y - p.y) * dy) / l2)) : 0;
        var ex = p.x + dx * t - x, ey = p.y + dy * t - y, dd = Math.sqrt(ex * ex + ey * ey);
        if (dd < best.dist) { best.dist = dd; best.idx = i; best.d = rt.cum[i] + t * (rt.cum[i + 1] - rt.cum[i]); }
      }
    }
    if (full) { scan(0, n); return best; }
    scan(Math.max(0, from - 3), Math.min(n, from + 150));
    if (best.dist > 45) { best.dist = 1e12; scan(0, n); }
    return best;
  }

  /* ---------- Stato ---------- */
  var state = 'idle';
  var gps = null, gpsErr = '', here = null, demoPos = false, gpsSeen = 0;
  // senza segnale GPS (nessun fix da oltre 8 s, errore o permesso negato) l'icona diventa grigia
  function gpsLost() { return !sim.active && !demoPos && (!gps || performance.now() - gpsSeen > 8000 || gpsErr === 'denied' || gpsErr === 'na'); }
  var car = { x: 0, y: 0, has: false }, tgt = { x: 0, y: 0 }, phi = -Math.PI / 2, phiT = -Math.PI / 2;
  var speedMs = 0, lastFix = null, lastSave = 0, tgtD = 0, tgtSnap = false, fixT = 0;
  var route = null, prog = { d: 0, idx: 0, dist: 0 }, offSince = 0, lastReroute = 0, rerouting = false;
  var sim = { active: false, running: true, d: 0, timer: null };
  var spoken = {};
  var wl = null;

  function feed(f) {
    if (!ORG) setOrigin(f.lat, f.lon);
    var p = toXY(f.lat, f.lon), now = f.t || Date.now(), sp = f.speed, hd = f.heading, moved = 0;
    here = { lat: f.lat, lon: f.lon };
    if (lastFix) {
      var dx = p.x - lastFix.x, dy = p.y - lastFix.y, dt = (now - lastFix.t) / 1000;
      moved = Math.hypot(dx, dy);
      if (sp == null && dt > 0.2) sp = moved / dt;
      if (hd == null && moved > 4) hd = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
    }
    if (!lastFix || moved > 3 || now - lastFix.t > 4000) lastFix = { x: p.x, y: p.y, t: now };
    if (sp != null) speedMs += (sp - speedMs) * (f.sim ? 1 : 0.5);
    if (sp != null && sp < 0.6 && !f.sim) speedMs = Math.max(0, speedMs * 0.5);
    var snapped = false;
    if (route && (state === 'nav') ) {
      var pr = projectOnRoute(route, p.x, p.y, prog.idx);
      prog.idx = pr.idx; prog.dist = pr.dist;
      if (pr.dist < 45) {
        prog.d = pr.d; offSince = 0;
        var pa = pointAt(route, pr.d);
        if (pr.dist < 30) { tgt.x = pa.x; tgt.y = pa.y; snapped = true; tgtD = pr.d; }
        phiT = Math.atan2(pa.hy, pa.hx);
      } else if (!sim.active) {
        if (!offSince) offSince = now;
        if (now - offSince > 4000 && now - lastReroute > 12000) reroute();
      }
      if (stops.length) checkStops();
      checkReports();
      if (route.total - prog.d < 25) arrive();
    }
    if (!snapped) { tgt.x = p.x; tgt.y = p.y; }
    tgtSnap = snapped; fixT = performance.now();
    if (hd != null && (speedMs > 1.2 || f.sim) && !(snapped && route)) phiT = bearingToPhi(hd);
    if (!car.has) { car.x = tgt.x; car.y = tgt.y; car.has = true; phi = phiT; }
    if (!f.sim && now - lastSave > 10000) { lastSave = now; try { localStorage.setItem(LAST_KEY, JSON.stringify({ lat: f.lat, lon: f.lon })); } catch (e) {} }
  }

  /* ---------- GPS ---------- */
  function onFix(p) {
    var c = p.coords;
    gps = { lat: c.latitude, lon: c.longitude, acc: c.accuracy, t: p.timestamp };
    gpsSeen = performance.now();
    gpsErr = '';
    if (sim.active) return;
    if (demoPos) { demoPos = false; ORG = null; car.has = false; resetData(); }
    feed({ lat: c.latitude, lon: c.longitude, acc: c.accuracy, speed: (c.speed != null && !isNaN(c.speed)) ? c.speed : null, heading: (c.heading != null && !isNaN(c.heading)) ? c.heading : null, t: Date.now() });
  }
  function onGeoErr(err) {
    if (err && err.code === 1) gpsErr = 'denied';
    else if (err && err.code === 2) gpsErr = 'na';
    else gpsErr = 'wait';
    if (err && err.code === 1) $('demoBtn').hidden = false;
  }
  function startGPS() {
    if (!navigator.geolocation) { gpsErr = 'nosupport'; $('demoBtn').hidden = false; return; }
    navigator.geolocation.watchPosition(onFix, onGeoErr, { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
  }
  function resetData() { camDone = {}; gen++; cells = {}; cellList = []; queue = []; SEEN = {}; CAMS = {}; camList = []; limWays = []; xcells = {}; xqueue = []; myAdded = false; }

  /* ---------- Navigazione ---------- */
  var toastTimer = null;
  function toast(msg, ms) {
    var t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, ms || 4500);
  }
  function setState(s) {
    state = s;
    $('app').setAttribute('data-state', s);
    $('searchPanel').hidden = s !== 'idle';
    $('turnPanel').hidden = !(s === 'nav' || s === 'arrived');
    $('previewPanel').hidden = s !== 'preview';
    $('endBtn').hidden = s === 'idle';
    $('playBtn').hidden = !(sim.active && s === 'nav');
    var b = $('badge'); b.textContent = sim.active ? 'demo' : 'beta'; b.className = sim.active ? 'badge demo' : 'badge';
    if (s !== 'nav') $('alert').hidden = true;
    if (s !== 'nav' && s !== 'arrived') $('etaCard').hidden = true;
    if (s === 'nav' || s === 'preview') { openReport(false); if (s === 'preview') { clearCat(); } }
  }
  function movingHeading() {
    if (speedMs < 2.5 || sim.active) return null;
    return ((Math.atan2(Math.cos(phiT), -Math.sin(phiT)) * 180 / Math.PI) % 360 + 360) % 360;
  }
  var stops = [], pin = null;
  function showAlts(res, dest) {
    var list = makeAlts(res.data.routes, dest);
    alts = { list: list, sel: list.length > 1 ? -1 : 0 };
    setRoute(list[0].rt);
    if (res.ferryLeft) toast(t('ferryLeft'), 6000); else if (res.unpavedLeft) toast(t('unpavedLeft'), 6000);
    $('pvNote').textContent = (res.dropped ? t('dropped') : '') + (list.length < 2 ? t('oneRoute') + ' ' : '') + (res.traffic ? t('withTraffic') : t('noTraffic'));
    showPreview();
    routeCams(route);
    if (list.length > 1) list.forEach(function (a) { routeCams(a.rt); });
  }
  function chooseDest(r) {
    if (!here) { toast(t('needPos')); $('demoBtn').hidden = false; return; }
    var dest = { name: r.name, sub: r.sub, lat: r.lat, lon: r.lon };
    stops = []; closePin();
    results.innerHTML = ''; $('q').value = r.name;
    showResMsg(t('calcRoute'));
    getRoute(here, dest, movingHeading(), []).then(function (res) {
      showAlts(res, dest);
    }, function (e) {
      showResMsg(e && e.fatal ? t('noRoute') : t('srvDown'));
    });
  }
  /* Tappa aggiunta con il dito: ricalcolo con i punti intermedi */
  function recalcStops() {
    if (!route || !here) return;
    var dest = route.dest, wasNav = state === 'nav';
    toast(t('calcStop'));
    getRoute(here, dest, wasNav ? movingHeading() : null, stops.slice()).then(function (res) {
      if (wasNav) {
        var list = makeAlts(res.data.routes, dest);
        alts = { list: [], sel: 0 };
        setRoute(list[0].rt); routeCams(route);
      } else showAlts(res, dest);
    }, function () { toast(t('srvDown')); stops.pop(); });
  }
  function reverseGeo(lat, lon) {
    var lg = ['en', 'de', 'fr'].indexOf(prefs.lang) >= 0 ? prefs.lang : 'en';
    return fetchJson('https://photon.komoot.io/reverse?lon=' + lon.toFixed(6) + '&lat=' + lat.toFixed(6) + '&lang=' + lg, null, 7000).then(function (j) {
      var f = j && j.features && j.features[0], pr = f && f.properties;
      if (!pr) throw new Error('none');
      var nm = pr.name || ((pr.street || '') + (pr.housenumber ? ' ' + pr.housenumber : '')).trim() || pr.city || pr.district || '';
      var sub = [pr.city || pr.town || pr.village || '', pr.state || ''].filter(function (x) { return x && x !== nm; }).join(', ');
      if (!nm) throw new Error('none');
      return { name: nm, sub: sub };
    });
  }
  function screenToLL(sx, sy) {
    if (world.on) {
      if (world.z < WZ_GLOBE) return null;
      wXfWorld();
      var wp = 256 * Math.pow(2, WX.z), ex = sx - WX.sx, ey = sy - WX.sy, ca = Math.cos(WX.ang), sa = Math.sin(WX.ang);
      var u = ex * ca + ey * sa, v = -ex * sa + ey * ca;
      return { lat: latOfMy(Math.max(0.001, Math.min(0.999, WX.my + v / wp))), lon: lonOfMx(WX.mx + u / wp) };
    }
    if (worldBlend() >= 0.5) { wXfLocal(); var wp2 = 256 * Math.pow(2, WX.z), ex2 = sx - WX.sx, ey2 = sy - WX.sy, c2 = Math.cos(WX.ang), s2 = Math.sin(WX.ang); return { lat: latOfMy(WX.my + (-ex2 * s2 + ey2 * c2) / wp2), lon: lonOfMx(WX.mx + (ex2 * c2 + ey2 * s2) / wp2) }; }
    var g = groundAt(sx, sy);
    return g ? toLL(g.x, g.y) : null;
  }
  function openPin(ll) {
    pin = { lat: ll.lat, lon: ll.lon, name: ll.name || t('pinPlace'), sub: ll.sub || ll.lat.toFixed(4) + ', ' + ll.lon.toFixed(4) };
    $('pinTitle').textContent = pin.name; $('pinSub').textContent = pin.sub;
    closeRepInfo();
    $('pinStop').hidden = !(route && (state === 'preview' || state === 'nav'));
    $('pinCard').hidden = false;
    var mine = pin;
    if (ll.name) return;
    reverseGeo(ll.lat, ll.lon).then(function (r) {
      if (pin !== mine) return;
      pin.name = r.name; pin.sub = r.sub || pin.sub; $('pinTitle').textContent = pin.name; $('pinSub').textContent = pin.sub;
    }, function () {});
  }
  function closePin() { pin = null; var c = $('pinCard'); if (c) c.hidden = true; }
  Array.prototype.forEach.call(document.querySelectorAll('details.acc'), function (d) {
    d.addEventListener('toggle', function () { if (d.open) Array.prototype.forEach.call(document.querySelectorAll('details.acc'), function (o) { if (o !== d) o.open = false; }); });
  });
  $('pinX').addEventListener('click', closePin);
  $('pinGo').addEventListener('click', function () { if (pin) chooseDest({ name: pin.name, sub: pin.sub, lat: pin.lat, lon: pin.lon }); });
  $('pinStop').addEventListener('click', function () {
    if (!pin || !route) return;
    stops.push({ lat: pin.lat, lon: pin.lon, name: pin.name });
    closePin(); recalcStops();
  });

  /* ---------- Scorciatoie attività nella zona ---------- */
  var CATQ = {}, CATLBL = {};
  QCATS.forEach(function (q) { CATQ[q.id] = q.q; CATLBL[q.id] = q.lbl; });
  var catRes = null, catGen = 0;
  function llScr(lat, lon) {
    if (world.on || worldBlend() >= 1) { var w = wScr(lat, lon); return w.vis ? { x: w.x, y: w.y } : null; }
    var p = toXY(lat, lon), c = cam3(p.x, p.y, 0);
    if (c.D < NEAR * 2) return null;
    return scr(c);
  }
  function setQuickUI() {
    Array.prototype.forEach.call(document.querySelectorAll('#quick .qb'), function (b) { b.setAttribute('aria-pressed', catRes && catRes.cat === b.dataset.cat ? 'true' : 'false'); });
  }
  function clearCat() { catGen++; catRes = null; setQuickUI(); }
  function fitPoints(pts) {
    if (!pts.length || !ORG) return;
    var mnx = 1e12, mxx = -1e12, mny = 1e12, mxy = -1e12, i;
    pts.forEach(function (p) { var q = toXY(p.lat, p.lon); mnx = Math.min(mnx, q.x); mxx = Math.max(mxx, q.x); mny = Math.min(mny, q.y); mxy = Math.max(mxy, q.y); });
    var w = mxx - mnx, h = mxy - mny, mx = (mnx + mxx) / 2, my = (mny + mxy) / 2;
    world.on = false;
    view.free = true; view.fx = mx; view.fy = my; rcBtn.hidden = false;
    if (is2D()) {
      var hc = (Math.max(w * 1.4 / W, h * 1.4 / (H * 0.7)) + 0.0001) * Math.min(W * 1.25, H * 1.05);
      view.z2 = Math.min(ZMAX2 * 0.8, Math.max(ZMIN2, hc / (HC * 6)));
    } else view.z3 = Math.min(ZMAX3, Math.max(6, Math.hypot(w, h) / 130));   // vista quasi dall'alto per vedere tutti i punti
    touch();
  }
  function catSearch(cat) {
    if (catRes && catRes.cat === cat) { clearCat(); return; }
    if (!ORG || !car.has) { toast(t('gpsWaitLine')); return; }
    var my = ++catGen, ll = toLL(car.x, car.y), dLat = 0.025, dLon = 0.025 / Math.max(0.2, Math.cos(ll.lat * Math.PI / 180));
    catRes = { cat: cat, items: [], loading: true }; setQuickUI(); toast(t('qLoad'), 15000);
    var bb = bboxStr(ll.lat - dLat, ll.lon - dLon, ll.lat + dLat, ll.lon + dLon);
    function done(items) {
      if (my !== catGen) return;
      items.forEach(function (it) { it.d = Math.hypot(it.lat - ll.lat, (it.lon - ll.lon) * Math.cos(ll.lat * Math.PI / 180)); });
      items.sort(function (a, b) { return a.d - b.d; });
      items = items.slice(0, 60);
      catRes = { cat: cat, items: items };
      if (!items.length) { toast(t('qNone')); return; }
      $('toast').hidden = true;
      fitPoints(items.slice(0, 18).concat([{ lat: ll.lat, lon: ll.lon }]));
    }
    function fromCells() {
      var out = [], c, k;
      for (c = 0; c < cellList.length; c++) (cellList[c].p || []).forEach(function (q) {
        if (q.c !== cat) return;
        var p = toLL(q.x, q.y); out.push({ lat: p.lat, lon: p.lon, name: q.nm || '' });
      });
      return out;
    }
    overpass('[out:json][timeout:20];nwr' + CATQ[cat] + '(' + bb + ');out center tags 120;', 'attività').then(function (j) {
      var items = [], seen = {};
      (j.elements || []).forEach(function (e) {
        var la = e.lat !== undefined ? e.lat : e.center && e.center.lat, lo = e.lon !== undefined ? e.lon : e.center && e.center.lon;
        if (la === undefined || lo === undefined) return;
        var tg = e.tags || {}, key = la.toFixed(4) + ',' + lo.toFixed(4);
        if (seen[key]) return; seen[key] = 1;
        items.push({ lat: la, lon: lo, name: tg.name || tg.brand || tg.operator || '' });
      });
      done(items.length ? items : fromCells());
    }, function () { done(fromCells()); });
  }
  /* tasti rapidi sotto la barra di ricerca: li sceglie l'utente dal menù (massimo 5) */
  function renderQuick() {
    var box = $('quick'); box.innerHTML = '';
    prefs.quick.forEach(function (id) {
      var q = QCATS.filter(function (x) { return x.id === id; })[0]; if (!q) return;
      var b = document.createElement('button'); b.type = 'button'; b.className = 'qb'; b.dataset.cat = id; b.style.color = POI_COL[id] || '#ccc';
      b.setAttribute('aria-label', t(q.lbl)); b.title = t(q.lbl); b.setAttribute('aria-pressed', 'false');
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#' + q.sym + '"/></svg>';
      b.addEventListener('click', function () { catSearch(id); });
      box.appendChild(b);
    });
    box.hidden = !prefs.quick.length;
    setQuickUI();
    var pk = $('quickPick'); if (!pk) return;
    pk.innerHTML = '';
    QCATS.forEach(function (q) {
      var on = prefs.quick.indexOf(q.id) >= 0, b = document.createElement('button');
      b.type = 'button'; b.className = 'qpick'; b.style.setProperty('--c', POI_COL[q.id] || '#ccc'); b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#' + q.sym + '"/></svg><span></span>';
      b.querySelector('span').textContent = t(q.lbl);
      b.addEventListener('click', function () {
        var i = prefs.quick.indexOf(q.id);
        if (i >= 0) prefs.quick.splice(i, 1);
        else if (prefs.quick.length >= 5) { toast(t('qMax')); return; }
        else prefs.quick.push(q.id);
        if (catRes && prefs.quick.indexOf(catRes.cat) < 0) clearCat();
        savePrefs(); renderQuick();
      });
      pk.appendChild(b);
    });
    $('quickCount').textContent = prefs.quick.length + '/5';
  }
  function drawCat() {
    if (!catRes || !catRes.items.length) return;
    var placed = [], i, k;
    ctx.save();
    for (i = 0; i < catRes.items.length && placed.length < 45; i++) {
      var it = catRes.items[i], sp = llScr(it.lat, it.lon);
      if (!sp || sp.x < 6 || sp.x > W - 6 || sp.y < 40 || sp.y > H - 6) continue;
      var hit = false;
      for (k = 0; k < placed.length; k++) if (Math.abs(placed[k].x - sp.x) < 22 && Math.abs(placed[k].y - sp.y) < 22) { hit = true; break; }
      if (hit) continue;
      placed.push(sp);
      ctx.shadowColor = POI_COL[catRes.cat]; ctx.shadowBlur = 10;
      poiIcon(catRes.cat, sp.x, sp.y, 13);
      ctx.shadowBlur = 0;
      if (it.name && placed.length <= 22) {
        ctx.font = '700 11px Nunito, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        var nm = it.name.length > 22 ? it.name.slice(0, 21) + '…' : it.name;
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8,4,22,0.92)'; ctx.strokeText(nm, sp.x, sp.y + 16);
        ctx.fillStyle = '#efeaff'; ctx.fillText(nm, sp.x, sp.y + 16);
      }
    }
    ctx.restore();
  }
  function hitCat(sx, sy) {
    if (!catRes) return null;
    var best = null, bd = 26;
    catRes.items.forEach(function (it) { var sp = llScr(it.lat, it.lon); if (!sp) return; var d = Math.hypot(sp.x - sx, sp.y - sy); if (d < bd) { bd = d; best = it; } });
    return best;
  }

  /* ---------- Segnalazioni (salvate su questo dispositivo) ---------- */
  var REP = { traffic: ['#ffb020', '≡'], crash: ['#ff3b4e', '!'], obst: ['#f7e733', '▲'], cam: ['#ff2bd6', '●'], police: ['#19e3ff', '★'] };
  var REP_KEY = 'nightrider.app.reports', reports = [];
  try { reports = JSON.parse(localStorage.getItem(REP_KEY) || '[]').filter(function (r) { return r && Date.now() - r.ts < 3 * 3600e3; }); } catch (e) { reports = []; }
  reports.forEach(function (r, i) { if (!r.id) r.id = Date.now() + i + Math.random(); });
  function saveReports() { try { localStorage.setItem(REP_KEY, JSON.stringify(reports.slice(-80))); } catch (e) {} }
  function hereLL() { return ORG && car.has ? toLL(car.x, car.y) : null; }
  function openReport(open) {
    $('repCard').hidden = !open;
    if (open) { closePin(); closeRepInfo(); }
  }
  $('reportBtn').addEventListener('click', function () { openReport($('repCard').hidden); });
  $('repX').addEventListener('click', function () { openReport(false); });
  Array.prototype.forEach.call(document.querySelectorAll('#repCard .rb'), function (b) {
    b.addEventListener('click', function () {
      var ll = hereLL();
      if (!ll) { toast(t('gpsWaitLine')); return; }
      reports.push({ id: Date.now() + Math.random(), t: b.dataset.rep, lat: ll.lat, lon: ll.lon, ts: Date.now() }); saveReports();
      openReport(false); toast(t('repDone') + ': ' + t(({ traffic: 'repTraffic', crash: 'repCrash', obst: 'repObst', cam: 'repCam', police: 'repPolice' })[b.dataset.rep]));
      if (prefs.voice && state === 'nav') speak(t('repDone') + '.');
    });
  });
  var REPKEY = { traffic: 'repTraffic', crash: 'repCrash', obst: 'repObst', cam: 'repCam', police: 'repPolice' }, repSel = null, repAsked = {}, repAnn = {}, repAutoT = 0;
  function repName(r) { return t(REPKEY[r.t] || 'repAhead'); }
  function openRepInfo(r) {
    repSel = r; closePin();
    var mins = Math.max(0, Math.round((Date.now() - r.ts) / 60000));
    $('riTitle').textContent = repName(r);
    $('riSub').textContent = (mins < 1 ? t('repNow') : t('repAgo').replace('{0}', mins)) + (r.cf ? ' · ✓' + r.cf : '') + ' · ' + t('repAsk');
    $('repInfo').hidden = false; $('repCard').hidden = true;
  }
  function closeRepInfo() { repSel = null; $('repInfo').hidden = true; clearTimeout(repAutoT); }
  $('riX').addEventListener('click', closeRepInfo);
  $('riStill').addEventListener('click', function () { if (!repSel) return; repSel.ts = Date.now(); repSel.cf = (repSel.cf || 0) + 1; saveReports(); closeRepInfo(); toast(t('repStillMsg')); });
  $('riGone').addEventListener('click', function () {
    if (!repSel) return;
    reports = reports.filter(function (x) { return x !== repSel; }); saveReports(); closeRepInfo(); toast(t('repGoneMsg'));
    if (prefs.voice && state === 'nav') speak(t('repGoneMsg') + '.');
  });
  /* Traffico in tempo reale: incidenti, code, lavori e chiusure da TomTom e/o HERE (con le chiavi gratuite dell'utente) */
  var inc = { list: [] }, incT = 0, incBusy = false;
  function incNorm(t0) { return t0 === 'crash' || t0 === 'traffic' ? t0 : 'obst'; }
  var TT_INC = { 1: ['crash', 'incAcc'], 6: ['traffic', 'incJam'], 7: ['obst', 'incLane'], 8: ['obst', 'incClosed'], 9: ['obst', 'incWorks'], 14: ['obst', 'incBroken'] };
  var HERE_INC = { accident: ['crash', 'incAcc'], congestion: ['traffic', 'incJam'], roadClosure: ['obst', 'incClosed'], construction: ['obst', 'incWorks'], laneRestriction: ['obst', 'incLane'], plannedEvent: ['obst', 'incWorks'] };
  function midOf(g) {
    if (!g || !g.coordinates) return null;
    var c = g.coordinates; if (g.type === 'LineString') c = c[Math.floor(c.length / 2)];
    return c && c.length >= 2 ? { lon: c[0], lat: c[1] } : null;
  }
  function incTomTom(bb) {
    var t0 = Date.now(), f = '{incidents{type,geometry{type,coordinates},properties{iconCategory,magnitudeOfDelay,events{description},from,to,delay}}}';
    var url = 'https://api.tomtom.com/traffic/services/5/incidentDetails?key=' + encodeURIComponent(prefs.ttKey) + '&bbox=' + bb.w.toFixed(4) + ',' + bb.s.toFixed(4) + ',' + bb.e.toFixed(4) + ',' + bb.n.toFixed(4) + '&fields=' + encodeURIComponent(f) + '&language=' + (prefs.lang === 'it' ? 'it-IT' : 'en-GB') + '&timeValidityFilter=present';
    return fetch(url).then(function (r) { if (!r.ok) { var e = new Error('http'); e.status = r.status; throw e; } return r.json(); }).then(function (j) {
      logReq('api.tomtom.com', 'incidenti', Date.now() - t0, 'ok');
      var out = [];
      (j.incidents || []).forEach(function (x) {
        var p = x.properties || {}, m = midOf(x.geometry), ty = TT_INC[p.iconCategory];
        if (!m || !ty) return;
        if (p.iconCategory === 6 && (p.magnitudeOfDelay || 0) < 2) return;      // code leggere: inutili
        var ev = (p.events && p.events[0] && p.events[0].description) || '';
        out.push({ lat: m.lat, lon: m.lon, t: ty[0], k: ty[1], txt: ev, road: [p.from, p.to].filter(Boolean).join(' → '), delay: p.delay || 0, src: 'TomTom' });
      });
      return out;
    }, function (e) { logReq('api.tomtom.com', 'incidenti', Date.now() - t0, e && e.status ? 'errore ' + e.status : 'errore'); return []; });
  }
  function incHere(bb) {
    var t0 = Date.now();
    var url = 'https://data.traffic.hereapi.com/v7/incidents?in=bbox:' + bb.w.toFixed(4) + ',' + bb.s.toFixed(4) + ',' + bb.e.toFixed(4) + ',' + bb.n.toFixed(4) + '&locationReferencing=shape&lang=' + prefs.lang + '&apiKey=' + encodeURIComponent(prefs.hereKey);
    return fetch(url).then(function (r) { if (!r.ok) { var e = new Error('http'); e.status = r.status; throw e; } return r.json(); }).then(function (j) {
      logReq('data.traffic.hereapi.com', 'incidenti', Date.now() - t0, 'ok');
      var out = [];
      (j.results || []).forEach(function (x) {
        var d = x.incidentDetails || {}, ty = HERE_INC[d.type] || (d.roadClosed ? HERE_INC.roadClosure : null), lk = x.location && x.location.shape && x.location.shape.links;
        if (!ty || !lk || !lk.length) return;
        var pts = lk[Math.floor(lk.length / 2)].points || []; if (!pts.length) return;
        var pp = pts[Math.floor(pts.length / 2)];
        if (d.type === 'congestion' && d.criticality && d.criticality !== 'critical' && d.criticality !== 'major') return;
        out.push({ lat: pp.lat, lon: pp.lng, t: ty[0], k: ty[1], txt: (d.description && d.description.value) || '', road: (x.location.description && x.location.description.value) || '', delay: 0, src: 'HERE' });
      });
      return out;
    }, function (e) { logReq('data.traffic.hereapi.com', 'incidenti', Date.now() - t0, e && e.status ? 'errore ' + e.status : 'errore'); return []; });
  }
  function fetchIncidents() {
    if (incBusy || !ORG || !car.has || !prefs.liveInc || (!prefs.ttKey && !prefs.hereKey)) return;
    var ll = view.free ? toLL(view.fx, view.fy) : toLL(car.x, car.y), dla = 0.14, dlo = 0.14 / Math.max(0.2, Math.cos(ll.lat * Math.PI / 180));
    var bb = { s: ll.lat - dla, n: ll.lat + dla, w: ll.lon - dlo, e: ll.lon + dlo };
    incBusy = true;
    Promise.all([prefs.ttKey ? incTomTom(bb) : [], prefs.hereKey ? incHere(bb) : []]).then(function (r) {
      var all = r[0].concat(r[1]), out = [];
      all.forEach(function (a) {      // stesso evento da due fonti: se sono a meno di 120 m se ne tiene uno solo
        for (var i = 0; i < out.length; i++) if (out[i].t === a.t && Math.abs(out[i].lat - a.lat) < 0.0011 && Math.abs(out[i].lon - a.lon) < 0.0016) { if (!out[i].txt && a.txt) out[i].txt = a.txt; return; }
        out.push(a);
      });
      inc.list = out.slice(0, 80); incBusy = false;
    });
  }
  function incText(x) { return t(x.k) + (x.road ? ' · ' + x.road : '') + (x.delay > 120 ? ' · +' + fmtDur(x.delay) : '') + (x.txt && x.txt !== t(x.k) ? ' — ' + x.txt : '') + ' (' + x.src + ')'; }
  function hitInc(sx, sy) {
    var best = null, bd = 26;
    if (!prefs.liveInc) return null;
    inc.list.forEach(function (x) { var sp = llScr(x.lat, x.lon); if (!sp) return; var d = Math.hypot(sp.x - sx, sp.y - sy); if (d < bd) { bd = d; best = x; } });
    return best;
  }
  function drawInc() {
    if (!prefs.liveInc || !inc.list.length) return;
    for (var i = 0; i < inc.list.length; i++) {
      var x = inc.list[i], sp = llScr(x.lat, x.lon); if (!sp || sp.x < 0 || sp.x > W || sp.y < 30 || sp.y > H) continue;
      var d = REP[incNorm(x.t)];
      ctx.save();
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 11, 0, 6.2832); ctx.fillStyle = 'rgba(10,6,24,0.92)'; ctx.fill();
      ctx.setLineDash([4, 3]); ctx.lineWidth = 2.2; ctx.strokeStyle = d[0]; ctx.shadowColor = d[0]; ctx.shadowBlur = 8; ctx.stroke(); ctx.shadowBlur = 0; ctx.setLineDash([]);
      ctx.fillStyle = d[0]; ctx.font = '800 12px Nunito, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(d[1], sp.x, sp.y + 0.5);
      ctx.restore();
    }
  }
  function hitRep(sx, sy) {
    var best = null, bd = 28;
    reports.forEach(function (r) { var sp = llScr(r.lat, r.lon); if (!sp) return; var d = Math.hypot(sp.x - sx, sp.y - sy); if (d < bd) { bd = d; best = r; } });
    return best;
  }
  // in guida: avvisa quando si avvicina una segnalazione e chiede se c'è ancora
  function checkReports() {
    if (!reports.length || !car.has) return;
    for (var i = 0; i < reports.length; i++) {
      var r = reports[i]; if (Date.now() - r.ts > 3 * 3600e3) continue;
      var q = toXY(r.lat, r.lon), d = Math.hypot(q.x - car.x, q.y - car.y);
      if (d < 450 && !repAnn[r.id]) { repAnn[r.id] = 1; toast(t('repAheadV').replace('{0}', repName(r)).replace('{1}', fmtDist(d))); if (prefs.voice) speak(t('repAheadV').replace('{0}', repName(r)).replace('{1}', spokenDist(d))); }
      if (d < 70 && !repAsked[r.id] && $('repInfo').hidden) {
        repAsked[r.id] = 1; openRepInfo(r);
        clearTimeout(repAutoT); repAutoT = setTimeout(function () { if (repSel === r) closeRepInfo(); }, 12000);
      }
    }
  }
  function drawReports() {
    var now = Date.now(), i;
    for (i = 0; i < reports.length; i++) {
      var r = reports[i]; if (now - r.ts > 3 * 3600e3) continue;
      var sp = llScr(r.lat, r.lon); if (!sp || sp.x < 0 || sp.x > W || sp.y < 30 || sp.y > H) continue;
      var d = REP[r.t] || REP.obst;
      ctx.save();
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 12, 0, 6.2832); ctx.fillStyle = 'rgba(10,6,24,0.92)'; ctx.fill();
      ctx.lineWidth = 2.4; ctx.strokeStyle = d[0]; ctx.shadowColor = d[0]; ctx.shadowBlur = 10; ctx.stroke(); ctx.shadowBlur = 0;
      ctx.fillStyle = d[0]; ctx.font = '800 13px Nunito, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(d[1], sp.x, sp.y + 0.5);
      ctx.restore();
    }
  }
  function checkStops() {
    for (var i = 0; i < stops.length; i++) {
      var q = toXY(stops[i].lat, stops[i].lon);
      if (Math.hypot(q.x - car.x, q.y - car.y) < 40) {
        var nm = stops[i].name; stops.splice(i, 1);
        toast(t('stopReached') + ': ' + nm);
        if (prefs.voice) speak(t('stopReached') + '.');
        return;
      }
    }
  }
  function setRoute(rt) {
    route = rt; prog = { d: 0, idx: 0, dist: 0 }; spoken = {}; offSince = 0;
    attachCams(rt);
  }
  function showPreview() {
    showMeta();
    setState('preview');
    setSheet(alts.list.length < 2);
    renderAlts();
    fitRoute();
    ensureData();
  }
  function startNav(simMode) {
    if (!route) return;
    if (alts.list.length > 1 && alts.sel < 0) { toast(t('pickRoute')); return; }
    unlockSpeech();
    sim.active = !!simMode;
    prog = { d: 0, idx: 0, dist: 0 }; spoken = {}; offSince = 0;
    if (simMode) {
      sim.d = 0; sim.running = true;
      var p0 = pointAt(route, 0), ll = toLL(p0.x, p0.y);
      car.has = false; lastFix = null; speedMs = 0;
      feed({ lat: ll.lat, lon: ll.lon, speed: 0, heading: Math.atan2(p0.hx, -p0.hy) * 180 / Math.PI, t: Date.now(), sim: true });
      clearInterval(sim.timer); sim.timer = setInterval(simTick, 200);
    }
    recenter();
    setState('nav');
    updatePlayBtn();
    requestWake(true);
    if (prefs.voice && prefs.voiceTurn) {
      spoken.m0a = 1;
      if (route.man[0].d <= 150) spoken.m0b = 1;
      speak(pv('start', 0) + maneuverPhrase(route.man[0], Math.max(0, route.man[0].d)));
    }
  }
  function simTick() {
    if (!sim.active || !sim.running || !route || state !== 'nav') return;
    sim.d = Math.min(route.total, sim.d + SIM_V * 0.2 * prefs.simMult);
    var p = pointAt(route, sim.d), ll = toLL(p.x, p.y);
    feed({ lat: ll.lat, lon: ll.lon, speed: SIM_V, heading: (Math.atan2(p.hx, -p.hy) * 180 / Math.PI + 360) % 360, t: Date.now(), sim: true });
  }
  function endNav() {
    clearInterval(sim.timer); sim.active = false;
    route = null; prog = { d: 0, idx: 0, dist: 0 }; stops = []; closePin(); alts = { list: [], sel: 0 };
    requestWake(false);
    try { if (synth) synth.cancel(); } catch (e) {}
    setState('idle');
    $('q').value = ''; results.innerHTML = '';
    if (gps) { feed({ lat: gps.lat, lon: gps.lon, acc: gps.acc, speed: null, heading: null, t: Date.now() }); }
  }
  function arrive() {
    if (state !== 'nav') return;
    setState('arrived');
    if (prefs.voice) speak(pv('arrived', 0));
    requestWake(false);
    clearInterval(sim.timer);
  }
  function reroute() {
    if (rerouting || !route || !here) return;
    rerouting = true; lastReroute = Date.now();
    toast(t('rerouteToast')); speak(pv('reroute', Date.now() % 7));
    var dest = route.dest;
    getRoute(here, dest, movingHeading()).then(function (res) {
      alts = { list: [], sel: 0 };
      setRoute(makeAlts(res.data.routes, dest)[0].rt);
      routeCams(route);
      rerouting = false;
    }, function () { rerouting = false; toast(t('rerouteFail')); });
  }
  function requestWake(on) {
    try {
      if (on && prefs.wake && navigator.wakeLock) { navigator.wakeLock.request('screen').then(function (l) { wl = l; }, function () {}); }
      else if (wl) { wl.release(); wl = null; }
    } catch (e) {}
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && state === 'nav') requestWake(true); });

  /* ---------- Avvisi autovelox e annunci vocali ---------- */
  function camAhead() {
    if (!prefs.cams) return null;
    if (state === 'nav' && route) {
      for (var i = 0; i < route.cams.length; i++) {
        var c = route.cams[i], dd = c.d - prog.d;
        if (dd > -5 && dd < 450) return { id: c.cam.id, dist: Math.max(0, dd), limit: c.cam.limit };
      }
      return null;
    }
    if (state === 'idle' && speedMs > 4) {
      var hx = Math.cos(phiT), hy = Math.sin(phiT), best = null;
      for (var k = 0; k < camList.length; k++) {
        var cm = camList[k], dx = cm.x - car.x, dy = cm.y - car.y, dist = Math.hypot(dx, dy);
        if (dist > 350 || dist < 8) continue;
        if ((dx * hx + dy * hy) / dist < 0.82) continue;
        if (!best || dist < best.dist) best = { id: cm.id, dist: dist, limit: cm.limit };
      }
      return best;
    }
    return null;
  }
  function nextMan() {
    var m = route.man;
    for (var i = 0; i < m.length; i++) if (m[i].d > prog.d + 3) return { m: m[i], i: i };
    return { m: m[m.length - 1], i: m.length - 1 };
  }
  function announce(nm, cam) {
    if (!prefs.voice) return;
    var v = Math.max(speedMs, 6) * (sim.active ? prefs.simMult : 1);
    if (state === 'nav' && route && prefs.voiceTurn && state === 'nav') {
      var m = Math.max(0, nm.m.d - prog.d), far = Math.min(1500, Math.max(300, v * 28)), near = Math.max(90, v * 7);
      if (m <= near && !spoken['m' + nm.i + 'b']) { spoken['m' + nm.i + 'b'] = 1; spoken['m' + nm.i + 'a'] = 1; speak(maneuverPhrase(nm.m, m)); }
      else if (m <= far && !spoken['m' + nm.i + 'a']) { spoken['m' + nm.i + 'a'] = 1; speak(maneuverPhrase(nm.m, m)); }
    }
    if (cam && prefs.voiceCam && !spoken['c' + cam.id]) {
      spoken['c' + cam.id] = 1;
      speak(fill(pv('cam', cam.dist), { d: spokenDist(cam.dist) }) + (cam.limit ? fill(pv('camLimit', cam.dist), { l: limitDisp(cam.limit) }) : ''));
    }
  }

  /* ---------- Interfaccia ---------- */
  var ICONS = {
    right: '<svg viewBox="0 0 32 32"><path d="M9 29V17q0-7 7-7h9"/><path d="M19 3l7 7-7 7"/></svg>',
    left: '<svg viewBox="0 0 32 32"><path d="M23 29V17q0-7-7-7H7"/><path d="M13 3l-7 7 7 7"/></svg>',
    straight: '<svg viewBox="0 0 32 32"><path d="M16 29V6"/><path d="M9 13l7-7 7 7"/></svg>',
    uturn: '<svg viewBox="0 0 32 32"><path d="M10 29V14a6 6 0 0 1 12 0v6"/><path d="M17 15l5 6 5-6"/></svg>',
    round: '<svg viewBox="0 0 32 32"><circle cx="16" cy="19" r="6"/><path d="M16 29v-4"/><path d="M16 13V4"/><path d="M12 8l4-4 4 4"/></svg>',
    arrive: '<svg viewBox="0 0 32 32"><path d="M16 29S7 20 7 13a9 9 0 0 1 18 0c0 7-9 16-9 16z"/><circle cx="16" cy="13" r="3"/></svg>'
  };
  var PLAY_ICONS = {
    pause: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>'
  };
  var els = {};
  ['ticon', 'tstreet', 'voice', 'tdist', 'speed', 'speedBox', 'unit', 'limit', 'alert', 'alertText', 'gpsLine', 'l1', 'v1', 'l2', 'v2', 'l3', 'v3', 'playBtn'].forEach(function (id) { els[id] = $(id); });
  var lastIcon = '';
  function setRow(n, label, value, cls) {
    els['l' + n].textContent = label; els['v' + n].textContent = value; els['v' + n].className = cls || '';
    els['v' + n].parentNode.className = label ? '' : 'empty';
  }
  function updatePlayBtn() {
    var label = sim.running ? t('pauseSim') : t('resumeSim');
    els.playBtn.innerHTML = sim.running ? PLAY_ICONS.pause : PLAY_ICONS.play;
    els.playBtn.setAttribute('aria-label', label); els.playBtn.title = label;
  }
  function updateHUD() {
    var kmh = speedMs * 3.6, cam = null, nm = null;
    els.speed.textContent = String(Math.round(spd(kmh)));
    els.unit.textContent = prefs.units === 'mi' ? 'mph' : 'km/h';
    els.limit.style.visibility = limitNow > 0 ? 'visible' : 'hidden';
    els.limit.textContent = limitNow > 0 ? String(limitDisp(limitNow)) : '';
    els.limit.setAttribute('aria-label', limitNow > 0 ? t('limitAria', limitDisp(limitNow)) : t('limitUnknown'));
    els.speedBox.classList.toggle('over', limitNow > 0 && kmh > limitNow + 2);
    var gpsText = sim.active ? t('gpsSim') : gps ? '±' + Math.round(gps.acc) + ' m' : (demoPos ? t('gpsExample') : (gpsErr === 'denied' ? t('gpsDeniedS') : gpsErr === 'na' || gpsErr === 'nosupport' ? t('gpsNA') : t('gpsWaiting')));

    if (state === 'nav' || state === 'arrived') {
      nm = nextMan();
      var man = nm.m, ds = describe(man), m = Math.max(0, man.d - prog.d);
      if (state === 'arrived') {
        if (lastIcon !== 'arrive') { els.ticon.innerHTML = ICONS.arrive; lastIcon = 'arrive'; }
        els.tstreet.textContent = t('arrivedT'); els.voice.textContent = t('reached', route.dest.name); els.tdist.textContent = fmtDist(0);
      } else {
        if (lastIcon !== ds.icon) { els.ticon.innerHTML = ICONS[ds.icon]; lastIcon = ds.icon; }
        els.tstreet.textContent = man.type === 'arrive' ? route.dest.name : (man.name ? man.name : ds.text.charAt(0).toUpperCase() + ds.text.slice(1));
        els.voice.textContent = leadText(man, m, false) + ds.text + '.';
        els.tdist.textContent = fmtDist(m);
      }
      var rem = Math.max(0, route.total - prog.d), sec = route.dur * (rem / Math.max(1, route.total));
      setRow(1, t('lArr'), state === 'arrived' ? '--:--' : clockAfter(sec), 'arr');
      setRow(2, t('lLeft'), state === 'arrived' ? '0 ' + t('min') : fmtDur(sec));
      setRow(3, t('lDist'), fmtDist(rem));
      $('etaCard').hidden = false; $('etaT').textContent = state === 'arrived' ? '0 ' + t('min') : fmtDur(sec); $('etaD').textContent = fmtDist(rem); $('etaA').textContent = state === 'arrived' ? '' : clockAfter(sec);
      cam = state === 'nav' ? camAhead() : null;
    } else {
      setRow(1, t('lGps'), gpsText);
      setRow(2, t('lMap'), dataStatus());
      setRow(3, '', '');
      els.gpsLine.textContent = (gps && !gpsLost()) || sim.active ? '' : demoPos ? t('gpsUsingExample') : gpsErr === 'denied' ? t('gpsDenied') : gpsErr === 'nosupport' ? t('gpsNoSupport') : t('gpsWaitLine');
      els.gpsLine.hidden = !els.gpsLine.textContent;
      $('demoBtn').hidden = !!(gps || demoPos) || !(gpsErr === 'denied' || gpsErr === 'nosupport' || gpsErr === 'na' || performance.now() > 8000);
      cam = camAhead();
    }
    if (state === 'preview') { setRow(1, t('lGps'), gpsText); setRow(2, t('lMap'), dataStatus()); setRow(3, '', ''); }
    if (menuOpen) { var dg = $('diag'); if (dg) dg.textContent = diagText(); }
    els.alert.hidden = !cam;
    if (cam) els.alertText.innerHTML = t('camHud') + ' <span class="big">' + fmtDist(cam.dist) + '</span>' + (cam.limit ? ' · ' + t('limitWord') + ' <span class="big">' + limitDisp(cam.limit) + '</span> ' + (prefs.units === 'mi' ? 'mph' : 'km/h') : '');
    announce(nm, cam);
  }

  /* ---------- Menù ---------- */
  var sheet = $('sheet'), sheetPanel = $('sheetPanel'), menuBtn = $('menuBtn'), closeBtn = $('closeBtn'), menuOpen = false;
  function syncUI() {
    var nodes = sheet.querySelectorAll('[data-key]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i], key = el.dataset.key;
      if (el.getAttribute('role') === 'switch') el.setAttribute('aria-checked', String(!!prefs[key]));
      else if (el.getAttribute('role') === 'radio') el.setAttribute('aria-checked', String(String(prefs[key]) === el.dataset.val));
    }
    $('vol').value = prefs.volume; $('volOut').textContent = Math.round(prefs.volume * 100) + '%';
    $('tilt').value = prefs.tilt; $('tiltOut').textContent = Math.round(prefs.tilt * 180 / Math.PI) + '°';
    if (voiceSel.value !== prefs.voiceName) voiceSel.value = prefs.voiceName;
  }
  function sanitize() {
    if (['fast', 'short'].indexOf(prefs.routeType) < 0) prefs.routeType = 'fast';
    if (!THEMES[prefs.theme]) prefs.theme = 'fuchsia';
    if (!SHAPES[prefs.carIcon]) prefs.carIcon = 'arrow';
    if (!VSTYLES[prefs.voiceStyle]) prefs.voiceStyle = 'natural';
    if ([1, 3, 6].indexOf(prefs.simMult) < 0) prefs.simMult = 3;
    prefs.tilt = Math.min(1.25, Math.max(0.35, Number(prefs.tilt) || 0.6));
    prefs.volume = Math.min(1, Math.max(0, Number(prefs.volume)));
    if (prefs.units !== 'km' && prefs.units !== 'mi') prefs.units = 'km';
    if (['it', 'en', 'es', 'fr', 'de'].indexOf(prefs.lang) < 0) prefs.lang = 'en';
    if (NRL.personas.indexOf(prefs.persona) < 0) prefs.persona = 'cyber';
    if (!Array.isArray(prefs.quick)) prefs.quick = DEFAULTS.quick.slice();
    prefs.quick = prefs.quick.filter(function (c, i, a) { return QCATS.some(function (q) { return q.id === c; }) && a.indexOf(c) === i; }).slice(0, 5);
    prefs.hereKey = String(prefs.hereKey || '').replace(/[^A-Za-z0-9_\-]/g, '').slice(0, 100);
    prefs.ttKey = String(prefs.ttKey || '').replace(/[^A-Za-z0-9_\-]/g, '').slice(0, 80);
  }
  function applyPrefs() {
    sanitize();
    TH = THEMES[prefs.theme] || THEMES.fuchsia; buildWalls();
    PITCH = prefs.tilt;
    syncUI(); if (typeof syncMode === 'function') syncMode();
    $('ttKey').value = prefs.ttKey; $('hereKey').value = prefs.hereKey; langSel.value = prefs.lang; personaSel.value = prefs.persona;
  }
  function onPref(key) {
    savePrefs(); applyPrefs();
    if (key === 'voiceStyle') testSpeak();
    if (key === 'voiceAll') fillVoices();
    if (key === 'wake' && state === 'nav') requestWake(true);
  }
  sheet.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-key]') : null;
    if (el && sheet.contains(el) && el.tagName !== 'INPUT') {
      var key = el.dataset.key, role = el.getAttribute('role');
      if (role === 'switch') prefs[key] = !prefs[key];
      else if (el.dataset.val !== undefined) prefs[key] = (key === 'simMult') ? Number(el.dataset.val) : el.dataset.val;
      else return;
      onPref(key);
    }
  });
  sheet.addEventListener('input', function (e) {
    var el = e.target;
    if (el.tagName === 'INPUT' && el.dataset.key) { prefs[el.dataset.key] = parseFloat(el.value); onPref(el.dataset.key); }
  });
  voiceSel.addEventListener('change', function () { prefs.voiceName = voiceSel.value; savePrefs(); updateVoiceInfo(); testSpeak(); });
  $('testVoice').addEventListener('click', testSpeak);
  $('resetBtn').addEventListener('click', function () { resetPrefs(); savePrefs(); applyPrefs(); applyLang(); fillPersonas(); fillVoices(); renderAlts(); });
  $('refreshVoices').addEventListener('click', function () { fillVoices(); });

  /* lingua e stile delle indicazioni */
  var langSel = $('langSel'), personaSel = $('personaSel');
  NRL.langs.forEach(function (l) { var o = document.createElement('option'); o.value = l.id; o.textContent = l.name; langSel.appendChild(o); });
  function fillPersonas() {
    var names = { classic: 'pClassic', cyber: 'pCyber', fun: 'pFun', rocker: 'pRocker', hacker: 'pHacker' };
    personaSel.innerHTML = '';
    NRL.personas.forEach(function (id) { var o = document.createElement('option'); o.value = id; o.textContent = t(names[id]); personaSel.appendChild(o); });
    personaSel.value = prefs.persona;
  }
  langSel.addEventListener('change', function () {
    prefs.lang = langSel.value; prefs.voiceName = ''; savePrefs(); applyPrefs(); applyLang(); fillPersonas(); fillVoices(); updatePlayBtn(); renderAlts();
    testSpeak();
  });
  personaSel.addEventListener('change', function () { prefs.persona = personaSel.value; savePrefs(); testPersona(); });
  function testPersona() {
    speak(pv('start', 1) + maneuverPhrase({ type: 'turn', mod: 'right', d: 300, name: '' }, 300), true);
  }
  $('ttKey').addEventListener('change', function () { prefs.ttKey = $('ttKey').value.trim(); sanitize(); savePrefs(); $('ttKey').value = prefs.ttKey; incT = 0; });
  $('hereKey').addEventListener('change', function () { prefs.hereKey = $('hereKey').value.trim(); sanitize(); savePrefs(); $('hereKey').value = prefs.hereKey; incT = 0; });

  /* autovelox aggiunti da te (restano sul dispositivo) */
  var MYCAM_KEY = 'nightrider.app.mycams', myCams = [], myAdded = false;
  try { myCams = JSON.parse(localStorage.getItem(MYCAM_KEY) || '[]') || []; } catch (e) { myCams = []; }
  function saveMyCams() { try { localStorage.setItem(MYCAM_KEY, JSON.stringify(myCams)); } catch (e) {} }
  function injectMyCams() {
    if (!ORG) return;
    for (var i = 0; i < myCams.length; i++) addCam({ id: 'm' + i, lat: myCams[i].lat, lon: myCams[i].lon, tags: { maxspeed: myCams[i].limit ? String(myCams[i].limit) : '' } });
    myAdded = true;
  }
  $('reportCam').addEventListener('click', function () {
    if (!ORG || !car.has) { toast(t('reportNeedPos')); return; }
    var ll = toLL(car.x, car.y), lim = limitNow > 0 ? limitNow : 0;
    myCams.push({ lat: ll.lat, lon: ll.lon, limit: lim }); saveMyCams();
    addCam({ id: 'm' + (myCams.length - 1), lat: ll.lat, lon: ll.lon, tags: { maxspeed: lim ? String(lim) : '' } });
    toast(t('reportDone')); closeMenu();
  });
  $('reportClear').addEventListener('click', function () {
    myCams = []; saveMyCams();
    camList = camList.filter(function (c) { return c.id.charAt(0) !== 'm'; });
    for (var k in CAMS) if (k.charAt(0) === 'm') delete CAMS[k];
    toast(t('reportCleared'));
  });
  function openMenu() {
    if (menuOpen) return;
    menuOpen = true; sheet.hidden = false;
    requestAnimationFrame(function () { sheet.classList.add('open'); });
    closeBtn.focus();
  }
  function closeMenu() {
    if (!menuOpen) return;
    menuOpen = false; sheet.classList.remove('open');
    setTimeout(function () { if (!menuOpen) sheet.hidden = true; }, reduced ? 0 : 230);
    menuBtn.focus();
  }
  menuBtn.addEventListener('click', openMenu);
  closeBtn.addEventListener('click', closeMenu);
  $('scrim').addEventListener('click', closeMenu);
  document.addEventListener('keydown', function (e) {
    if (!menuOpen) return;
    if (e.key === 'Escape') { closeMenu(); return; }
    if (e.key === 'Tab') {
      var f = sheetPanel.querySelectorAll('button:not([disabled]), select:not([disabled]), input:not([disabled]), summary');
      if (!f.length) return;
      var first = f[0], lastEl = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
    }
  });

  $('goBtn').addEventListener('click', function () { startNav(!gps); });
  $('simBtn').addEventListener('click', function () { startNav(true); });
  $('cancelBtn').addEventListener('click', function () { stops = []; closePin(); route = null; alts = { list: [], sel: 0 }; setState('idle'); renderAlts(); });
  $('endBtn').addEventListener('click', endNav);
  els.playBtn.addEventListener('click', function () { sim.running = !sim.running; updatePlayBtn(); });
  $('demoBtn').addEventListener('click', function () {
    demoPos = true; resetData(); ORG = null; car.has = false; lastFix = null;
    feed({ lat: DEMO.lat, lon: DEMO.lon, speed: 0, heading: 0, t: Date.now(), sim: true });
    $('demoBtn').hidden = true;
  });

  /* ---------- Camera 3D ---------- */
  var cv = $('map'), ctx = cv.getContext('2d'), app = $('app');
  var W = 0, H = 0, dpr = 1, PITCH = prefs.tilt;
  var cm = { s: 0, Bk: 60, F: 500, cx: 0, cy: 0, cosT: 1, sinT: 0, fx: 1, fy: 0, rx: 0, ry: 1, Hc: HC, T: 0.6, R: VIEW };
  var fc = { x: 0, y: 0 };                                   // punto guardato dalla camera
  var view = { free: false, fx: 0, fy: 0, rot: 0, z3: 1, z2: 1, last: 0 };   // esplorazione con le dita
  var ZMIN3 = 0.4, ZMAX3 = 84, ZMIN2 = 0.12, ZMAX2 = 14;
  function is2D() { return !!prefs.view2d; }
  function setZoom(z, ax, ay) {
    if (world.on) {
      worldZoomTo(Math.log(WK / z) / Math.LN2, ax, ay);
      if (world.z > exitZnow()) exitWorld(false);
      return;
    }
    if (is2D()) { if (z > ZMAX2 && ORG && car.has) { enterWorld(); return; } view.z2 = Math.min(ZMAX2, Math.max(ZMIN2, z)); }
    else { if (z > ZMAX3 && ORG && car.has) { enterWorld(); return; } view.z3 = Math.min(ZMAX3, Math.max(ZMIN3, z)); }
  }
  function curZoom() { return world.on ? WK / Math.pow(2, world.z) : is2D() ? view.z2 : view.z3; }
  function smooth01(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }
  function setupCamera() {
    var d2 = is2D(), sf = d2 ? 1 : smooth01((view.z3 - 2) / 5);   // in 3D, allontanandosi la vista si raddrizza fino a diventare dall'alto
    cm.s = sf;
    cm.Hc = d2 ? HC * 6 * view.z2 : HC * view.z3;
    cm.T = sf > 0.995 ? Math.PI / 2 : PITCH + (Math.PI / 2 - PITCH) * sf;
    cm.cosT = Math.cos(cm.T); cm.sinT = Math.sin(cm.T);
    var cp = view.free ? view.rot : phi;
    cm.fx = Math.cos(cp); cm.fy = Math.sin(cp); cm.rx = -cm.fy; cm.ry = cm.fx;
    fc.x = view.free ? view.fx : car.x; fc.y = view.free ? view.fy : car.y;
    cm.F = Math.min(W * 1.25, H * 1.05);
    var off = (H * 0.68 - cm.cy) / cm.F;
    cm.Bk = sf > 0.995 ? -off * cm.Hc : cm.Hc / Math.tan(cm.T + Math.atan(off));
    var rFlat = Math.hypot(W, H) / cm.F * cm.Hc * 0.7;
    cm.R = d2 ? rFlat : (VIEW * view.z3) * (1 - sf) + rFlat * sf;
  }
  /* punto del terreno sotto un punto dello schermo */
  function groundAt(sx, sy) {
    var a = (cm.cy - sy) / cm.F, den = cm.sinT - a * cm.cosT;
    if (den <= 0.02) return null;
    var Yd = cm.Hc * (cm.cosT + a * cm.sinT) / den, D = Yd * cm.cosT + cm.Hc * cm.sinT;
    if (D <= 0 || D > cm.Hc * 12) return null;
    var X = (sx - cm.cx) / cm.F * D, Yf = Yd - cm.Bk;
    return { x: fc.x + Yf * cm.fx + X * cm.rx, y: fc.y + Yf * cm.fy + X * cm.ry };
  }

  function resize() {
    var b = app.getBoundingClientRect();
    W = b.width; H = b.height; dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(app);
  window.addEventListener('resize', resize);
  resize();

  function cam3(x, y, z) {
    var dx = x - fc.x, dy = y - fc.y;
    var X = dx * cm.rx + dy * cm.ry, Yd = dx * cm.fx + dy * cm.fy + cm.Bk, Z = z - cm.Hc;
    return { X: X, D: Yd * cm.cosT - Z * cm.sinT, U: Yd * cm.sinT + Z * cm.cosT };
  }
  function scr(c) { return { x: cm.cx + cm.F * c.X / c.D, y: cm.cy - cm.F * c.U / c.D }; }
  function clipNear(ps) {
    var out = [];
    for (var i = 0; i < ps.length; i++) {
      var a = ps[i], b = ps[(i + 1) % ps.length], ain = a.D >= NEAR, bin = b.D >= NEAR;
      if (ain) out.push(a);
      if (ain !== bin) { var t = (NEAR - a.D) / (b.D - a.D); out.push({ X: a.X + (b.X - a.X) * t, D: NEAR, U: a.U + (b.U - a.U) * t }); }
    }
    return out;
  }
  function addPoly(wp) {
    var cs = [], i;
    for (i = 0; i < wp.length; i++) cs.push(cam3(wp[i][0], wp[i][1], wp[i][2]));
    cs = clipNear(cs);
    if (cs.length < 3) return false;
    for (i = 0; i < cs.length; i++) { var s = scr(cs[i]); if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); }
    ctx.closePath();
    return true;
  }
  function fillPoly(wp, color) { ctx.beginPath(); if (addPoly(wp)) { ctx.fillStyle = color; ctx.fill(); } }
  function seg(ax, ay, bx, by, w, z) {
    var dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    var h = w / 2, nx = -dy * h, ny = dx * h;
    ax -= dx * h; ay -= dy * h; bx += dx * h; by += dy * h;
    return [[ax + nx, ay + ny, z], [bx + nx, by + ny, z], [bx - nx, by - ny, z], [ax - nx, ay - ny, z]];
  }

  function mir(p) { return p.map(function (q) { return [-q[0], q[1]]; }); }
  var SHAPES = {
    arrow: [{ p: [[0, 26], [14, -14], [0, -6], [-14, -14]], z: 8, c: 'car' }],
    car: [
      { p: [[-7, 29], [7, 29], [10, 26], [11, 18], [11.5, 8], [11.5, -10], [11, -22], [9, -27], [6, -29], [-6, -29], [-9, -27], [-11, -22], [-11.5, -10], [-11.5, 8], [-11, 18], [-10, 26]], z: 7, c: 'car' },
      { p: [[-13, 24], [-11, 24], [-11, 15], [-13, 15]], z: 5, c: 'rgba(6,5,14,0.95)' },
      { p: [[11, 24], [13, 24], [13, 15], [11, 15]], z: 5, c: 'rgba(6,5,14,0.95)' },
      { p: [[-13, -14], [-11, -14], [-11, -23], [-13, -23]], z: 5, c: 'rgba(6,5,14,0.95)' },
      { p: [[11, -14], [13, -14], [13, -23], [11, -23]], z: 5, c: 'rgba(6,5,14,0.95)' },
      { p: [[-8, 25], [8, 25], [9.5, 15], [-9.5, 15]], z: 8, c: 'rgba(255,255,255,0.14)' },
      { p: [[-8.6, 13], [8.6, 13], [10, 4.5], [-10, 4.5]], z: 10, c: 'rgba(12,10,30,0.88)' },
      { p: [[-9.2, 4.5], [9.2, 4.5], [9, -10], [-9, -10]], z: 11, c: 'rgba(255,255,255,0.2)' },
      { p: [[-9, -10], [9, -10], [7.6, -17], [-7.6, -17]], z: 10, c: 'rgba(12,10,30,0.88)' },
      { p: [[-15, 11], [-11.5, 11], [-11.5, 7.5], [-15, 8.5]], z: 9, c: 'car' },
      { p: [[15, 11], [11.5, 11], [11.5, 7.5], [15, 8.5]], z: 9, c: 'car' },
      { p: [[-9.5, 28.6], [-4, 29.2], [-4, 26.6], [-9.8, 25.8]], z: 9, c: '#fff6c8' },
      { p: [[9.5, 28.6], [4, 29.2], [4, 26.6], [9.8, 25.8]], z: 9, c: '#fff6c8' },
      { p: [[-9.2, -28], [-4, -29], [-4, -26.2], [-9.8, -25.6]], z: 9, c: '#ff2b4a' },
      { p: [[9.2, -28], [4, -29], [4, -26.2], [9.8, -25.6]], z: 9, c: '#ff2b4a' }
    ],
    moto: [
      { p: [[-2.4, 31], [2.4, 31], [2.8, 20], [2.8, -20], [2.4, -31], [-2.4, -31], [-2.8, -20], [-2.8, 20]], z: 6, c: 'car' },
      { p: [[-2.2, 31], [2.2, 31], [2.2, 20], [-2.2, 20]], z: 7, c: 'rgba(6,5,14,0.95)' },
      { p: [[-2.8, -17], [2.8, -17], [2.8, -31], [-2.8, -31]], z: 7, c: 'rgba(6,5,14,0.95)' },
      { p: [[-1.2, 19], [1.2, 19], [1.6, 10], [-1.6, 10]], z: 9, c: 'rgba(255,255,255,0.2)' },
      { p: [[-4.2, 12], [4.2, 12], [5.4, 3], [4.6, -6], [-4.6, -6], [-5.4, 3]], z: 10, c: 'car' },
      { p: [[-1.6, -4], [1.6, -4], [2.2, -14], [-2.2, -14]], z: 11, c: 'rgba(255,255,255,0.18)' },
      { p: [[-12, 14.5], [12, 14.5], [12.4, 12.2], [-12.4, 12.2]], z: 12, c: 'rgba(14,12,28,0.96)' },
      { p: [[-12.6, 15.4], [-10.4, 15.4], [-10.4, 11.6], [-12.6, 11.6]], z: 12, c: '#fff6c8' },
      { p: [[12.6, 15.4], [10.4, 15.4], [10.4, 11.6], [12.6, 11.6]], z: 12, c: '#fff6c8' },
      { p: [[-10.5, 13.4], [-6, 5.2], [-3.2, 6.2], [-7.2, 13.6]], z: 13, c: 'rgba(14,12,28,0.9)' },
      { p: [[10.5, 13.4], [6, 5.2], [3.2, 6.2], [7.2, 13.6]], z: 13, c: 'rgba(14,12,28,0.9)' },
      { p: [[-5.5, 5], [5.5, 5], [6.4, -3], [4.4, -9], [-4.4, -9], [-6.4, -3]], z: 14, c: 'rgba(14,12,28,0.92)' },
      { p: [[-3.4, -1], [-1.4, -3.4], [1.4, -3.4], [3.4, -1], [3.4, 1.6], [1.4, 3.6], [-1.4, 3.6], [-3.4, 1.6]], z: 17, c: '#ece8ff' },
      { p: [[-1.7, -29], [1.7, -29], [1.7, -31.4], [-1.7, -31.4]], z: 9, c: '#ff2b4a' }
    ]
  };
  function shapePts(pts, z) {
    return pts.map(function (p) {
      var vs = CAR_SC * Math.max(1, cm.Hc / (HC * 1.5 + (520 - HC * 1.5) * cm.s)), vx = Math.cos(phi), vy = Math.sin(phi);
      return [car.x + (p[0] * -vy + p[1] * vx) * vs, car.y + (p[0] * vx + p[1] * vy) * vs, z * vs];
    });
  }
  function drawVehicle() {
    var layers = SHAPES[prefs.carIcon] || SHAPES.arrow, k;
    fillPoly(shapePts(layers[0].p, 0), 'rgba(0,0,0,0.55)');
    var carCol = gpsLost() ? '#8d8aa0' : prefs.carColor;
    ctx.save(); ctx.shadowColor = carCol; ctx.shadowBlur = gpsLost() ? 8 : 22;
    ctx.beginPath();
    if (addPoly(shapePts(layers[0].p, layers[0].z))) { ctx.fillStyle = carCol; ctx.fill(); }
    ctx.restore();
    for (k = 1; k < layers.length; k++) fillPoly(shapePts(layers[k].p, layers[k].z), layers[k].c === 'car' ? carCol : layers[k].c);
    ctx.beginPath();
    if (addPoly(shapePts(layers[0].p, layers[0].z))) { ctx.lineWidth = 1.5; ctx.strokeStyle = C.bg; ctx.stroke(); }
  }

  function drawBuilding(b, near) {
    var n = b.n, h = b.h * (1 - cm.s * 0.97), k, i;
    var camx = fc.x - cm.fx * cm.Bk, camy = fc.y - cm.fy * cm.Bk;
    for (k = 0; k < n; k++) {
      var j = (k + 1) % n, ax = b.xs[k], ay = b.ys[k], bx = b.xs[j], by = b.ys[j];
      var dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
      if (len < 0.5) continue;
      var nx = b.sg > 0 ? dy / len : -dy / len, ny = b.sg > 0 ? -dx / len : dx / len;
      if ((camx - ax) * nx + (camy - ay) * ny <= 0) continue;
      var lit = Math.max(0, nx * LX + ny * LY);
      fillPoly([[ax, ay, 0], [bx, by, 0], [bx, by, h], [ax, ay, h]], WALLS[Math.round(lit * 7)]);
      if (near && prefs.gloss && h > 14 && len > 8) {
        ctx.globalAlpha = 0.18 + lit * 0.12;
        fillPoly([[ax + dx * 0.14, ay + dy * 0.14, h * 0.08], [ax + dx * 0.3, ay + dy * 0.3, h * 0.08], [ax + dx * 0.58, ay + dy * 0.58, h * 0.96], [ax + dx * 0.42, ay + dy * 0.42, h * 0.96]], TH.glint);
        ctx.globalAlpha = 1;
      }
      if (near && h > 9 && len > 6) {
        ctx.beginPath();
        for (i = 3; i < h - 2; i += 3.6) {
          var a = cam3(ax, ay, i), c = cam3(bx, by, i);
          if (a.D < NEAR || c.D < NEAR) continue;
          var sa = scr(a), sc = scr(c); ctx.moveTo(sa.x, sa.y); ctx.lineTo(sc.x, sc.y);
        }
        ctx.strokeStyle = TH.win; ctx.lineWidth = 1; ctx.stroke();
      }
    }
    var roof = [];
    for (k = 0; k < n; k++) roof.push([b.xs[k], b.ys[k], h]);
    ctx.beginPath();
    if (addPoly(roof)) {
      ctx.fillStyle = TH.roof; ctx.fill();
      if (near && h > 40) { ctx.save(); ctx.shadowColor = TH.glow; ctx.shadowBlur = 12; }
      ctx.lineWidth = 1.4; ctx.strokeStyle = TH.edge; ctx.stroke();
      if (near && h > 40) ctx.restore();
    }
  }
  function drawCam3(it, t) {
    var b = cam3(it.x, it.y, 0), tp = cam3(it.x, it.y, 28 * SC);
    if (b.D < NEAR || tp.D < NEAR) return;
    var sb = scr(b), st = scr(tp), rad = cm.F * 13 * SC / tp.D;
    ctx.globalAlpha = it.dim ? 0.6 : 1;
    ctx.strokeStyle = C.mag; ctx.lineWidth = Math.max(1, cm.F * 2.4 * SC / b.D); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sb.x, sb.y); ctx.lineTo(st.x, st.y); ctx.stroke();
    if (it.hot && !reduced) {
      var ph = ((t / 1000) % 1.2) / 1.2;
      ctx.globalAlpha = (1 - ph) * 0.8; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(st.x, st.y, rad * (1 + ph * 1.8), 0, 6.2832); ctx.stroke();
      ctx.globalAlpha = it.dim ? 0.6 : 1;
    }
    ctx.save(); ctx.shadowColor = C.mag; ctx.shadowBlur = it.dim ? 0 : 12;
    ctx.beginPath(); ctx.arc(st.x, st.y, rad, 0, 6.2832); ctx.fillStyle = C.panel; ctx.fill();
    ctx.lineWidth = Math.max(1.5, rad * 0.28); ctx.strokeStyle = C.mag; ctx.stroke();
    ctx.restore();
    if (rad > 5) {
      if (it.limit) {
        ctx.fillStyle = '#fff'; ctx.font = '800 ' + Math.round(rad * 0.95) + 'px Nunito, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(limitDisp(it.limit)), st.x, st.y + rad * 0.06);
      } else {
        ctx.beginPath(); ctx.arc(st.x, st.y, rad * 0.32, 0, 6.2832); ctx.fillStyle = C.mag; ctx.fill();
      }
    }
    ctx.globalAlpha = 1; ctx.lineCap = 'butt';
  }
  function drawDest(e) {
    var ex = e.x, ey = e.y, s = 18 * SC;
    ctx.beginPath();
    if (addPoly([[ex - s, ey, 0], [ex, ey - s, 0], [ex + s, ey, 0], [ex, ey + s, 0]])) { ctx.fillStyle = C.bg; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = C.yel; ctx.stroke(); }
    var b = cam3(ex, ey, 0), tp = cam3(ex, ey, 160 * SC);
    if (b.D < NEAR || tp.D < NEAR) return;
    var sb = scr(b), st = scr(tp), g = ctx.createLinearGradient(sb.x, sb.y, st.x, st.y);
    g.addColorStop(0, C.yel); g.addColorStop(1, 'rgba(247,231,51,0)');
    ctx.strokeStyle = g; ctx.lineWidth = Math.max(2, cm.F * 4 * SC / b.D);
    ctx.beginPath(); ctx.moveTo(sb.x, sb.y); ctx.lineTo(st.x, st.y); ctx.stroke();
  }

  var maxB = 650, frameAvg = 0.016;

  function draw(t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    var side = (W >= 900 && W / H >= 1.5) ? Math.min(430, W * 0.36) : 0;
    cm.cx = side + (W - side) / 2; cm.cy = H * 0.5;
    if (!ORG || !car.has) { overlays(side, t); return; }

    setupCamera();
    if (world.on) { drawWorld(t); drawPins(); overlays(side, t); return; }
    var wb = worldBlend();
    if (wb >= 1) { drawWorldOverlay(t, 1); drawPins(); overlays(side, t); return; }
    var d2 = cm.s > 0.97, zf = d2 ? 1 : view.z3, R = cm.R, i, j, k, c, x, y;

    // terreno: colore di base e zone (parchi, campagna, industria, acqua)
    ctx.beginPath(); pathXY([fc.x - R * 1.7, fc.x + R * 1.7, fc.x + R * 1.7, fc.x - R * 1.7], [fc.y - R * 1.7, fc.y - R * 1.7, fc.y + R * 1.7, fc.y + R * 1.7]);
    ctx.fillStyle = GROUND_BASE; ctx.fill();
    drawGround(R);

    // strade per tipo, dalla meno alla più importante: alone neon + bordo + corpo, tratti arrotondati.
    // La strada più importante copre le altre: agli incroci e nei tratti paralleli vince il suo colore.
    var vis = [[], [], [], [], [], []], visL = [[], [], [], [], [], []], visT = [[], [], [], [], [], []], visL2 = [[], [], [], [], [], []], visB = [[], [], [], [], [], []], V2 = R + 80 * Math.max(1, zf), wk = Math.max(1, cm.Hc / (420 + 230 * cm.s));
    for (c = 0; c < cellList.length; c++) {
      var rs = cellList[c].r;
      for (k = 0; k < rs.length; k++) {
        var rd = rs[k];
        if (rd.maxx < fc.x - V2 || rd.minx > fc.x + V2 || rd.maxy < fc.y - V2 || rd.miny > fc.y + V2) continue;
        (rd.tn ? visT : rd.lk ? visL : vis)[rd.k].push(rd);
      }
    }
    var colors = [ROAD_MINOR, ROAD_MAJOR, ROAD_MAJOR, ROAD_MAJOR, ROAD_MOTORWAY, ROAD_MOTORWAY];
    // proietta ogni strada in schermo con la larghezza esatta in ogni punto (prospettiva continua: niente scalini né "colli di bottiglia")
    function roadGeom(list) {
      var out = [], kk, ii;
      for (kk = 0; kk < list.length; kk++) {
        var r = list[kk], cur = null, pa = null;
        for (ii = 0; ii < r.xs.length; ii++) {
          var cc = cam3(r.xs[ii], r.ys[ii], 0);
          if (ii) {
            var q0 = pa, q1 = cc, ok = !(q0.D < NEAR && q1.D < NEAR);
            if (ok && (Math.abs(r.xs[ii] - fc.x) > V2 && Math.abs(r.ys[ii] - fc.y) > V2) && (Math.abs(r.xs[ii - 1] - fc.x) > V2 && Math.abs(r.ys[ii - 1] - fc.y) > V2)) ok = false;
            if (ok) {
              if (q0.D < NEAR || q1.D < NEAR) {
                var tt = (NEAR - q0.D) / (q1.D - q0.D);
                var mid = { X: q0.X + (q1.X - q0.X) * tt, D: NEAR, U: q0.U + (q1.U - q0.U) * tt };
                if (q0.D < NEAR) q0 = mid; else q1 = mid;
              }
              var s0 = scr(q0), s1 = scr(q1), k0 = r.w * wk * cm.F / q0.D, k1 = r.w * wk * cm.F / q1.D;
              if (!cur || cur.cont !== ii - 1 || q0 !== pa) { cur = { x: [s0.x], y: [s0.y], w: [k0], cont: 0 }; out.push(cur); }
              cur.x.push(s1.x); cur.y.push(s1.y); cur.w.push(k1); cur.cont = ii;
            } else cur = null;
          }
          pa = cc;
        }
      }
      return out;
    }
    var TAU = 6.283185307;
    function fillGeom(geo, sc, extra, color, alpha, flat) {
      ctx.beginPath();
      for (var gi = 0; gi < geo.length; gi++) {
        var g = geo[gi], n = g.x.length, i2;
        for (i2 = flat ? 1 : 0; i2 < (flat ? n - 1 : n); i2++) {      // i ponti hanno estremi dritti: la strada prosegue senza "salsicciotti"
          var rr = Math.max(0.5, (g.w[i2] * sc + extra) / 2);
          ctx.moveTo(g.x[i2] + rr, g.y[i2]); ctx.arc(g.x[i2], g.y[i2], rr, 0, TAU, true);
        }
        for (i2 = 0; i2 < n - 1; i2++) {
          var dx = g.x[i2 + 1] - g.x[i2], dy = g.y[i2 + 1] - g.y[i2], l = Math.sqrt(dx * dx + dy * dy);
          if (l < 0.05) continue;
          var nx = -dy / l, ny = dx / l, r0 = Math.max(0.5, (g.w[i2] * sc + extra) / 2), r1 = Math.max(0.5, (g.w[i2 + 1] * sc + extra) / 2);
          ctx.moveTo(g.x[i2] + nx * r0, g.y[i2] + ny * r0); ctx.lineTo(g.x[i2 + 1] + nx * r1, g.y[i2 + 1] + ny * r1);
          ctx.lineTo(g.x[i2 + 1] - nx * r1, g.y[i2 + 1] - ny * r1); ctx.lineTo(g.x[i2] - nx * r0, g.y[i2] - ny * r0); ctx.closePath();
        }
      }
      ctx.fillStyle = color; ctx.globalAlpha = alpha; ctx.fill();
    }
    ctx.save();
    // ordine: stradine, provinciali, rampe e svincoli, poi le strade principali: chi si immette cede il colore alla strada in cui entra
    // le gallerie stanno SOTTO a tutto (tenui, come ombre); i ponti e i viadotti stanno SOPRA a tutto
    // strade e rampe dello stesso tipo hanno lo stesso colore: si disegnano insieme (prima tutti i bordi, poi tutti i corpi),
    // così dove si sovrappongono resta solo il contorno esterno e non compaiono linee colorate incrociate
    var seq = [[[visT[0]], 0, 1], [[visT[1]], 1, 1], [[visT[2]], 2, 1], [[visT[3]], 3, 1], [[visT[4]], 4, 1], [[visT[5]], 5, 1],
      [[vis[0]], 0, 0], [[vis[1], visL[1]], 1, 0], [[vis[2], visL[2]], 2, 0], [[vis[3], visL[3]], 3, 0], [[vis[4], visL[4]], 4, 0], [[vis[5], visL[5]], 5, 0]];
    for (var qi = 0; qi < seq.length; qi++) {
      var kd = seq[qi][1], lst = seq[qi][0].length > 1 ? seq[qi][0][0].concat(seq[qi][0][1]) : seq[qi][0][0], gh = seq[qi][2] === 1 ? 0.3 : 1, fl = seq[qi][2] === 2;
      if (!lst.length) continue;
      if (kd === 0 && wk > 6) continue;           // da molto lontano le stradine sono solo rumore
      var geo = roadGeom(lst);
      if (kd > 0) {
        var ew = kd >= 3 ? 5 : 3.4;                // spessore del bordo in pixel (somma dei due lati)
        if (kd >= 2 && gh === 1 && !fl) fillGeom(geo, 1, ew + (kd >= 3 ? 11 : 7), EDGE[kd], kd >= 3 ? 0.15 : 0.1);   // luce intorno
        if (gh === 1 && !fl) fillGeom(geo, 1, ew + 2, EDGE[kd], kd >= 3 ? 0.35 : 0.3);                                  // sfumatura del neon
        fillGeom(geo, 1, ew, EDGE[kd], gh, fl);                                                          // bordo netto
      }
      fillGeom(geo, 1, 0, colors[kd], gh, fl);
      if (kd >= 3 && gh === 1) {       // linea centrale solo sulle strade a doppio senso (le carreggiate separate non ne hanno una propria)
        var cl2 = seq[qi][0][0].filter(function (r2) { return !r2.ow; });
        if (cl2.length) fillGeom(cl2.length === lst.length ? geo : roadGeom(cl2), 0.12, 0, C.yel, 0.3);
      }
    }
    // frecce dei sensi unici (non su autostrade e strade a scorrimento veloce), nel colore del bordo della strada
    if (wk <= 2.2) {
      ctx.save(); ctx.lineJoin = 'round';
      for (var al = 0; al < 2; al++) for (var ak = 0; ak <= 3; ak++) {
        var arl = (al ? visL : vis)[ak];
        for (var ar = 0; ar < arl.length; ar++) {
          var rd2 = arl[ar];
          if (!rd2.ow || rd2.ring || rd2.ll < 4) continue;
          var step = 55, carry = step * 0.5;
          for (i = 0; i < rd2.xs.length - 1; i++) {
            var ax0 = rd2.xs[i], ay0 = rd2.ys[i], ax1 = rd2.xs[i + 1], ay1 = rd2.ys[i + 1], sl2 = Math.hypot(ax1 - ax0, ay1 - ay0);
            if (sl2 < 0.5) continue;
            var ux = (ax1 - ax0) / sl2 * rd2.ow, uy = (ay1 - ay0) / sl2 * rd2.ow;
            for (; carry <= sl2; carry += step) {
              var px = ax0 + (ax1 - ax0) * carry / sl2, py = ay0 + (ay1 - ay0) * carry / sl2;
              if (Math.abs(px - fc.x) > cm.R || Math.abs(py - fc.y) > cm.R) continue;
              var ca = cam3(px, py, 0), cb = cam3(px + ux * 3, py + uy * 3, 0);
              if (ca.D < NEAR * 3 || cb.D < NEAR * 3) continue;
              var sa = scr(ca), sb = scr(cb), dx2 = sb.x - sa.x, dy2 = sb.y - sa.y, dl = Math.hypot(dx2, dy2);
              if (dl < 0.01 || sa.x < 0 || sa.x > W || sa.y < 60 || sa.y > H) continue;
              dx2 /= dl; dy2 /= dl;
              var sz = Math.max(4.5, Math.min(11, rd2.w * wk * cm.F / ca.D * 0.55)), nx2 = -dy2, ny2 = dx2;
              ctx.beginPath();
              ctx.moveTo(sa.x + dx2 * sz, sa.y + dy2 * sz);
              ctx.lineTo(sa.x - dx2 * sz * 0.8 + nx2 * sz * 0.85, sa.y - dy2 * sz * 0.8 + ny2 * sz * 0.85);
              ctx.lineTo(sa.x - dx2 * sz * 0.25, sa.y - dy2 * sz * 0.25);
              ctx.lineTo(sa.x - dx2 * sz * 0.8 - nx2 * sz * 0.85, sa.y - dy2 * sz * 0.8 - ny2 * sz * 0.85);
              ctx.closePath();
              ctx.globalAlpha = 0.95; ctx.fillStyle = EDGE[ak] || '#8b7bd8'; ctx.shadowColor = EDGE[ak] || '#8b7bd8'; ctx.shadowBlur = 4; ctx.fill();
            }
            carry -= sl2;
          }
        }
      }
      ctx.restore();
    }
    ctx.restore(); ctx.globalAlpha = 1;

    // percorso
    if (route) drawRoute();

    // edifici
    var items = [], bl = [];
    for (c = 0; c < cellList.length; c++) {
      var bs = cellList[c].b;
      for (k = 0; k < bs.length; k++) {
        var b = bs[k], ddx = b.cx - fc.x, ddy = b.cy - fc.y, lim = R + b.r;
        if (ddx * ddx + ddy * ddy > lim * lim) continue;
        if (d2) { bl.push({ D: 0, b: b }); continue; }
        var D = cam3(b.cx, b.cy, 0).D;
        if (D < -b.r - 10) continue;
        bl.push({ D: D, b: b });
      }
    }
    if (d2) {
      // vista dall'alto: impronte piatte, tutte insieme
      if (bl.length > 2500) bl.length = 2500;
      ctx.beginPath();
      for (k = 0; k < bl.length; k++) pathXY(bl[k].b.xs, bl[k].b.ys);
      ctx.globalAlpha = 0.82; ctx.fillStyle = TH.roof; ctx.fill(); ctx.globalAlpha = 1;
      ctx.lineWidth = 1; ctx.strokeStyle = TH.edge; ctx.stroke();
      bl = [];
    } else {
      bl.sort(function (a, b2) { return a.D - b2.D; });
      if (bl.length > maxB) bl.length = maxB;
    }
    // riflesso sull'asfalto sotto le case vicine
    if (prefs.gloss && !d2) {
      ctx.beginPath();
      for (k = 0; k < Math.min(bl.length, 160); k++) {
        var gb = bl[k].b, wp = [];
        for (i = 0; i < gb.n; i++) wp.push([gb.cx + (gb.xs[i] - gb.cx) * 1.45, gb.cy + (gb.ys[i] - gb.cy) * 1.45, 0]);
        addPoly(wp);
      }
      ctx.globalAlpha = 0.14; ctx.fillStyle = TH.glow; ctx.fill(); ctx.globalAlpha = 1;
    }
    for (k = 0; k < bl.length; k++) items.push({ D: bl[k].D, type: 'b', b: bl[k].b, near: k < 160 });
    var ahead = state === 'nav' && route ? camAhead() : null;
    if (prefs.cams) {
      for (k = 0; k < camList.length; k++) {
        var cmr = camList[k];
        if (Math.abs(cmr.x - fc.x) > R || Math.abs(cmr.y - fc.y) > R) continue;
        var onRoute = false;
        if (route) for (i = 0; i < route.cams.length; i++) if (route.cams[i].cam === cmr) { onRoute = true; break; }
        items.push({ D: cam3(cmr.x, cmr.y, 0).D, type: 'c', x: cmr.x, y: cmr.y, limit: cmr.limit, dim: route ? !onRoute : false, hot: !!(ahead && ahead.id === cmr.id) });
      }
    }
    if (route) { var e = route.pts[route.pts.length - 1]; items.push({ D: cam3(e.x, e.y, 0).D, type: 'd', e: e }); }
    items.sort(function (a, b2) { return b2.D - a.D; });
    for (k = 0; k < items.length; k++) {
      var it = items[k];
      if (it.type === 'b') drawBuilding(it.b, it.near);
      else if (it.type === 'c') drawCam3(it, t);
      else drawDest(it.e);
    }
    if (route && !d2 && view.free && view.z3 > 1.6) { ctx.globalAlpha = 0.9; drawRoute(); ctx.globalAlpha = 1; }   // da lontano il percorso resta sopra le case
    drawPois();
    drawRoadNames(); drawRoadRefs();
    drawVehicle();
    if (wb > 0) drawWorldOverlay(t, wb);
    drawPins();
    overlays(side, t);
  }

  /* Nomi delle vie: seguono la direzione della strada, solo dove c'è spazio e senza sovrapporsi */
  function drawRoadNames() {
    if (!prefs.roadNames || cm.Hc > 2200) return;
    var minK = cm.Hc < 450 ? 0 : cm.Hc < 900 ? 1 : 2, cands = [], k, i, c, R2 = cm.R + 40;
    for (c = 0; c < cellList.length; c++) {
      var ls = cellList[c].l;
      if (!ls) continue;
      for (k = 0; k < ls.length; k++) {
        var l = ls[k];
        if (l.k < minK || Math.abs(l.x - fc.x) > R2 || Math.abs(l.y - fc.y) > R2) continue;
        if (prefs.roadRefs && l.ref && l.nm === l.ref) continue;     // il numero si vede già nel cartello
        cands.push(l);
      }
    }
    cands.sort(function (a, b) { return b.k - a.k || b.L - a.L; });
    ctx.save();
    ctx.font = '700 ' + (cm.Hc < 450 ? 12 : 11) + 'px Nunito, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    var placed = [], n = 0;
    for (i = 0; i < cands.length && n < 45; i++) {
      var r = cands[i], ca = cam3(r.ax, r.ay, 0), cb = cam3(r.bx, r.by, 0), cmid = cam3(r.x, r.y, 0);
      if (ca.D < NEAR * 2 || cb.D < NEAR * 2 || cmid.D < NEAR * 2) continue;
      var sa = scr(ca), sb = scr(cb), sm = scr(cmid), L = Math.hypot(sb.x - sa.x, sb.y - sa.y), mw = ctx.measureText(r.nm).width + 6;
      if (L * 1.7 < mw) continue;
      if (sm.x < 20 || sm.x > W - 20 || sm.y < 70 || sm.y > H - 20) continue;
      var hit = false;
      for (var q = 0; q < placed.length; q++) if (Math.abs(placed[q].x - sm.x) < (placed[q].w + mw) / 2 && Math.abs(placed[q].y - sm.y) < 15) { hit = true; break; }
      if (hit) continue;
      placed.push({ x: sm.x, y: sm.y, w: mw }); n++;
      var ang = Math.atan2(sb.y - sa.y, sb.x - sa.x);
      if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI;
      ctx.save(); ctx.translate(sm.x, sm.y); ctx.rotate(ang);
      ctx.lineWidth = 3.4; ctx.strokeStyle = 'rgba(8,4,22,0.92)'; ctx.strokeText(r.nm, 0, 0);
      ctx.fillStyle = r.k >= 5 ? '#ffb3f0' : r.k === 4 ? '#ffd98a' : r.k === 3 ? '#b6f3ff' : '#e4defa'; ctx.fillText(r.nm, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }

  /* Numeri di autostrade e strade principali: cartelli in stile neon (A14, SS16, E45...) */
  var refDbg = null;
  var REF_FILL = ['#2a2050', '#2a2050', '#3a2c6e', '#1c4f9c', '#1c4f9c', '#0c6b3d'];
  function drawRoadRefs() {
    if (!prefs.roadRefs || cm.Hc > 3200) return;
    var minK = cm.Hc < 700 ? 2 : 3, cands = [], k, i, c, R2 = cm.R + 40;
    for (c = 0; c < cellList.length; c++) {
      var ls = cellList[c].l; if (!ls) continue;
      for (k = 0; k < ls.length; k++) {
        var l = ls[k]; if (!l.ref || l.k < minK || !l.rps) continue;
        for (var rj = 0; rj < l.rps.length; rj++) { var rp = l.rps[rj]; if (Math.abs(rp.x - fc.x) > R2 || Math.abs(rp.y - fc.y) > R2) continue; cands.push({ ref: l.ref, k: l.k, L: l.L, rx: rp.x, ry: rp.y }); }
      }
    }
    refDbg = { c: cands.length, Hc: cm.Hc, minK: minK, s: [] };
    cands.sort(function (a, b) { return b.k - a.k || b.L - a.L; });
    ctx.save();
    ctx.font = '800 12px Nunito, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    var placed = [], n = 0;
    for (i = 0; i < cands.length && n < 16; i++) {
      var r = cands[i], cc = cam3(r.rx, r.ry, 0);
      if (cc.D < NEAR * 2) continue;
      var sp = scr(cc);
      if (sp.x < 24 || sp.x > W - 24 || sp.y < 70 || sp.y > H - 24) continue;
      var w = Math.max(28, ctx.measureText(r.ref).width + 14), h = 19, hit = false;
      for (var q = 0; q < placed.length; q++) {
        var pq = placed[q];
        if (Math.abs(pq.x - sp.x) < (pq.w + w) / 2 + 4 && Math.abs(pq.y - sp.y) < h + 4) { hit = true; break; }
        if (pq.ref === r.ref && Math.hypot(pq.x - sp.x, pq.y - sp.y) < 170) { hit = true; break; }
      }
      if (hit) continue;
      placed.push({ x: sp.x, y: sp.y, w: w, ref: r.ref }); n++;
      var x0 = sp.x - w / 2, y0 = sp.y - h / 2;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x0, y0, w, h, 6); else ctx.rect(x0, y0, w, h);
      ctx.fillStyle = REF_FILL[r.k] || '#2a2050'; ctx.shadowColor = EDGE[r.k] || '#19e3ff'; ctx.shadowBlur = 8; ctx.fill(); ctx.shadowBlur = 0;
      ctx.lineWidth = 1.8; ctx.strokeStyle = EDGE[r.k] || '#19e3ff'; ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.fillText(r.ref, sp.x, sp.y + 0.5);
    }
    ctx.restore();
  }

  /* Punti di interesse: icone neon semplici disegnate a mano, con il nome quando c'è spazio */
  var POI_COL = { fuel: '#ffb020', parking: '#5aa9ff', food: '#ff2e88', cafe: '#c07bff', shop: '#19e3ff', health: '#3ddc97', hotel: '#9aa4ff', mech: '#ff7a3d', biz: '#b9a8ff', money: '#f7e733', charge: '#3ddc97', sight: '#ff8fe9' };
  function poiIcon(cat, x, y, r) {
    var col = POI_COL[cat] || '#ccc';
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fillStyle = 'rgba(10,6,24,0.88)'; ctx.fill();
    ctx.lineWidth = 1.8; ctx.strokeStyle = col; ctx.stroke();
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = Math.max(1.3, r * 0.17); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var u = r / 10;
    ctx.beginPath();
    if (cat === 'parking') { ctx.font = '800 ' + (r * 1.25) + 'px Nunito, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('P', x, y + u * 0.5); return; }
    if (cat === 'fuel') { ctx.rect(x - 4 * u, y - 5 * u, 5.5 * u, 9 * u); ctx.moveTo(x + 1.5 * u, y - 2 * u); ctx.lineTo(x + 4.5 * u, y - 2 * u); ctx.lineTo(x + 4.5 * u, y + 3 * u); }
    else if (cat === 'food') { ctx.moveTo(x - 3 * u, y - 5 * u); ctx.lineTo(x - 3 * u, y + 5 * u); ctx.moveTo(x - 5 * u, y - 5 * u); ctx.lineTo(x - 5 * u, y - 1 * u); ctx.moveTo(x - 1 * u, y - 5 * u); ctx.lineTo(x - 1 * u, y - 1 * u); ctx.moveTo(x + 3.5 * u, y - 5 * u); ctx.lineTo(x + 3.5 * u, y + 5 * u); ctx.moveTo(x + 3.5 * u, y - 5 * u); ctx.quadraticCurveTo(x + 6 * u, y - 2 * u, x + 3.5 * u, y + 0.5 * u); }
    else if (cat === 'cafe') { ctx.moveTo(x - 4 * u, y - 3 * u); ctx.lineTo(x + 3 * u, y - 3 * u); ctx.lineTo(x + 2 * u, y + 4 * u); ctx.lineTo(x - 3 * u, y + 4 * u); ctx.closePath(); ctx.moveTo(x + 3 * u, y - 1.5 * u); ctx.quadraticCurveTo(x + 6 * u, y - 1 * u, x + 3 * u, y + 2 * u); }
    else if (cat === 'shop') { ctx.rect(x - 4 * u, y - 2 * u, 8 * u, 7 * u); ctx.moveTo(x - 2 * u, y - 2 * u); ctx.quadraticCurveTo(x, y - 7 * u, x + 2 * u, y - 2 * u); }
    else if (cat === 'health') { ctx.moveTo(x, y - 5 * u); ctx.lineTo(x, y + 5 * u); ctx.moveTo(x - 5 * u, y); ctx.lineTo(x + 5 * u, y); }
    else if (cat === 'hotel') { ctx.moveTo(x - 5 * u, y + 4 * u); ctx.lineTo(x - 5 * u, y - 4 * u); ctx.moveTo(x - 5 * u, y + 1 * u); ctx.lineTo(x + 5 * u, y + 1 * u); ctx.lineTo(x + 5 * u, y + 4 * u); ctx.moveTo(x - 3 * u, y - 1 * u); ctx.lineTo(x - 0.5 * u, y - 1 * u); }
    else if (cat === 'mech') { ctx.moveTo(x - 4.5 * u, y + 4.5 * u); ctx.lineTo(x + 1.5 * u, y - 1.5 * u); ctx.moveTo(x + 4 * u, y - 5 * u); ctx.arc(x + 2.6 * u, y - 3.6 * u, 2.6 * u, -0.6, 4.2); }
    else if (cat === 'money') { ctx.font = '800 ' + (r * 1.2) + 'px Nunito, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('€', x, y + u * 0.5); return; }
    else if (cat === 'charge') { ctx.moveTo(x + 1.5 * u, y - 5.5 * u); ctx.lineTo(x - 3 * u, y + 0.5 * u); ctx.lineTo(x, y + 0.5 * u); ctx.lineTo(x - 1.5 * u, y + 5.5 * u); ctx.lineTo(x + 3 * u, y - 0.5 * u); ctx.lineTo(x, y - 0.5 * u); ctx.closePath(); }
    else { ctx.arc(x, y, 2.4 * u, 0, 6.2832); }
    ctx.stroke();
  }
  function drawPois() {
    if (!prefs.pois || cm.Hc > 1300) return;
    var list = [], c, k, R2 = cm.R + 30;
    for (c = 0; c < cellList.length; c++) {
      var ps = cellList[c].p;
      if (!ps) continue;
      for (k = 0; k < ps.length; k++) {
        var q = ps[k];
        if (Math.abs(q.x - fc.x) > R2 || Math.abs(q.y - fc.y) > R2) continue;
        var cc = cam3(q.x, q.y, 0);
        if (cc.D < NEAR * 3) continue;
        var sp = scr(cc);
        if (sp.x < 10 || sp.x > W - 10 || sp.y < 70 || sp.y > H - 30) continue;
        list.push({ q: q, x: sp.x, y: sp.y, D: cc.D });
      }
    }
    list.sort(function (a, b) { return (a.q.nm ? 0 : 1) - (b.q.nm ? 0 : 1) || a.D - b.D; });
    var rects = [], n = 0, i, k, showNames = cm.Hc < 900, r = cm.Hc < 300 ? 11 : 9;
    function free(x0, y0, x1, y1) {
      for (var m = 0; m < rects.length; m++) { var q = rects[m]; if (x0 < q[2] && x1 > q[0] && y0 < q[3] && y1 > q[1]) return false; }
      return true;
    }
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    var pks = [];      // parcheggi vicini: se ne mostra uno solo (quello con il nome, o il primo)
    for (i = 0; i < list.length && n < 160; i++) {
      var it = list[i], rr = Math.max(6, Math.min(r, r * 150 / Math.max(60, it.D * 0.6)));
      if (!free(it.x - rr, it.y - rr, it.x + rr, it.y + rr)) continue;
      if (it.q.c === 'parking') {
        var near = false;
        for (k = 0; k < pks.length; k++) if (Math.abs(pks[k].x - it.q.x) < 110 && Math.abs(pks[k].y - it.q.y) < 110 && Math.hypot(pks[k].x - it.q.x, pks[k].y - it.q.y) < 110) { near = true; break; }
        if (near) continue;
        pks.push(it.q);
      }
      var nm = it.q.nm ? (it.q.nm.length > 24 ? it.q.nm.slice(0, 23) + '…' : it.q.nm) : '', lab = null;
      if (showNames && nm) {
        ctx.font = '700 10.5px Nunito, sans-serif';
        var tw = ctx.measureText(nm).width + 4;
        if (free(it.x - tw / 2, it.y + rr + 1, it.x + tw / 2, it.y + rr + 14)) lab = [it.x - tw / 2, it.y + rr + 1, it.x + tw / 2, it.y + rr + 14];
      }
      if (!lab && it.q.c === 'biz') continue;     // le attività generiche senza spazio per il nome non servono
      rects.push([it.x - rr, it.y - rr, it.x + rr, it.y + rr]); n++;
      poiIcon(it.q.c, it.x, it.y, rr);
      if (lab) {
        rects.push(lab);
        ctx.font = '700 10.5px Nunito, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8,4,22,0.92)'; ctx.strokeText(nm, it.x, it.y + rr + 2);
        ctx.fillStyle = '#efeaff'; ctx.fillText(nm, it.x, it.y + rr + 2);
      }
    }
    ctx.restore();
  }
  function drawPinMark(sx, sy, label, col) {
    ctx.save();
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - 8, sy - 15); ctx.arc(sx, sy - 22, 11, Math.PI * 0.8, Math.PI * 0.2, false); ctx.closePath();
    ctx.fillStyle = C.bg; ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 8; ctx.stroke(); ctx.shadowBlur = 0;
    if (label) { ctx.fillStyle = col; ctx.font = '800 12px Nunito, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, sx, sy - 22); }
    ctx.restore();
  }
  function drawPins() {
    if (typeof drawCat === 'function') { drawCat(); drawReports(); drawInc(); }
    var list = stops.map(function (q, i) { return { lat: q.lat, lon: q.lon, l: String(i + 1), c: C.yel }; });
    if (pin) list.push({ lat: pin.lat, lon: pin.lon, l: '', c: C.cyan });
    for (var i = 0; i < list.length; i++) {
      var q = list[i], sp;
      if (world.on || worldBlend() >= 1) sp = wScr(q.lat, q.lon);
      else { var p = toXY(q.lat, q.lon), c = cam3(p.x, p.y, 0); if (c.D < NEAR * 2) continue; sp = scr(c); sp.vis = true; }
      if (sp.vis) drawPinMark(sp.x, sp.y, q.l, q.c);
    }
  }
  /* Percorso e terreno */
  function pathXY(xs, ys) {
    var n = xs.length, i, dx, dy, Yd, D, U, X;
    if (n < 3) return false;
    for (i = 0; i < n; i++) {
      dx = xs[i] - fc.x; dy = ys[i] - fc.y;
      if ((dx * cm.fx + dy * cm.fy + cm.Bk) * cm.cosT + cm.Hc * cm.sinT < NEAR) {
        var wp = []; for (i = 0; i < n; i++) wp.push([xs[i], ys[i], 0]);
        return addPoly(wp);
      }
    }
    for (i = 0; i < n; i++) {
      dx = xs[i] - fc.x; dy = ys[i] - fc.y;
      Yd = dx * cm.fx + dy * cm.fy + cm.Bk; X = dx * cm.rx + dy * cm.ry;
      D = Yd * cm.cosT + cm.Hc * cm.sinT; U = Yd * cm.sinT - cm.Hc * cm.cosT;
      if (i) ctx.lineTo(cm.cx + cm.F * X / D, cm.cy - cm.F * U / D); else ctx.moveTo(cm.cx + cm.F * X / D, cm.cy - cm.F * U / D);
    }
    ctx.closePath();
    return true;
  }
  function drawGround(R) {
    var by = {}, c, k, g, q, R2 = R + 120;
    for (c = 0; c < cellList.length; c++) {
      g = cellList[c].g;
      if (!g) continue;
      for (k = 0; k < g.length; k++) {
        q = g[k];
        if (q.maxx < fc.x - R2 || q.minx > fc.x + R2 || q.maxy < fc.y - R2 || q.miny > fc.y + R2) continue;
        (by[q.k] || (by[q.k] = [])).push(q);
      }
    }
    for (k = 0; k < GROUND_ORDER.length; k++) {
      var key = GROUND_ORDER[k], arr = by[key];
      if (!arr) continue;
      ctx.beginPath();
      for (c = 0; c < arr.length; c++) pathXY(arr[c].xs, arr[c].ys);
      ctx.fillStyle = GROUND_COL[key]; ctx.fill();
      if (key === 'water') { ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(25,227,255,0.32)'; ctx.stroke(); }
    }
  }
  function drawAlts() {
    if (state !== 'preview' || alts.list.length < 2) return;
    var R2 = cm.R + 60, wk = Math.max(1, cm.Hc / 420);
    alts.list.forEach(function (a, k) {
      if (k === alts.sel) return;
      var pts = a.rt.pts, n = pts.length - 1, i, ax = pts[0].x, ay = pts[0].y;
      ctx.beginPath();
      for (i = 1; i <= n; i++) {
        var bx = pts[i].x, by = pts[i].y;
        if (!((ax < fc.x - R2 && bx < fc.x - R2) || (ax > fc.x + R2 && bx > fc.x + R2) || (ay < fc.y - R2 && by < fc.y - R2) || (ay > fc.y + R2 && by > fc.y + R2))) addPoly(seg(ax, ay, bx, by, 4.5 * wk, 0));
        ax = bx; ay = by;
      }
      ctx.save(); ctx.globalAlpha = alts.sel < 0 ? 0.95 : 0.65; ctx.fillStyle = a.color; ctx.shadowColor = a.color; ctx.shadowBlur = 8; ctx.fill(); ctx.restore();
    });
  }
  function drawRoute() {
    drawAlts();
    if (state === 'preview' && alts.sel < 0 && alts.list.length > 1) return;
    var pts = route.pts, n = pts.length - 1, i, R2 = cm.R + 60, wk = Math.max(1, cm.Hc / 420);
    var i0 = 0, sx = pts[0].x, sy = pts[0].y;
    if (state === 'nav' || state === 'arrived') {
      // il tratto già percorso non si disegna: la scia parte esattamente sotto il veicolo
      var pr = projectOnRoute(route, car.x, car.y, prog.idx, false), sp = pointAt(route, pr.d);
      i0 = Math.min(n, pr.idx + 1); sx = sp.x; sy = sp.y;
    }
    function batch(w) {
      ctx.beginPath();
      var ax = sx, ay = sy;
      for (i = i0; i <= n; i++) {
        var bx = pts[i].x, by = pts[i].y;
        if (!((ax < fc.x - R2 && bx < fc.x - R2) || (ax > fc.x + R2 && bx > fc.x + R2) || (ay < fc.y - R2 && by < fc.y - R2) || (ay > fc.y + R2 && by > fc.y + R2))) addPoly(seg(ax, ay, bx, by, w * wk, 0));
        ax = bx; ay = by;
      }
    }
    batch(9.5); ctx.fillStyle = bgA(0.9); ctx.fill();
    batch(5.5);
    ctx.save(); ctx.shadowColor = C.cyan; ctx.shadowBlur = 16; ctx.fillStyle = C.cyan; ctx.fill(); ctx.restore();
  }
  function overlays(side, now) {
    var d2o = cm.s, gf = ctx.createLinearGradient(0, 0, 0, H * 0.5);
    gf.addColorStop(0, bgA(0.92 - 0.22 * d2o)); gf.addColorStop(0.3, bgA(0.62 - 0.32 * d2o));
    gf.addColorStop(0.62, d2o > 0.5 ? bgA(0.05) : 'rgba(62,8,74,' + (0.22 * (1 - d2o * 2)) + ')'); gf.addColorStop(1, bgA(0));
    ctx.fillStyle = gf; ctx.fillRect(0, 0, W, H * 0.5);
    var gb = ctx.createLinearGradient(0, H - 220, 0, H);
    gb.addColorStop(0, bgA(0)); gb.addColorStop(1, bgA(0.9));
    ctx.fillStyle = gb; ctx.fillRect(0, H - 220, W, 220);
    if (side) {
      var gl = ctx.createLinearGradient(0, 0, side + 50, 0);
      gl.addColorStop(0, bgA(0.92)); gl.addColorStop(0.8, bgA(0.6)); gl.addColorStop(1, bgA(0));
      ctx.fillStyle = gl; ctx.fillRect(0, 0, side + 50, H);
    }
    var gv = ctx.createRadialGradient(cm.cx, H * 0.6, Math.min(W, H) * 0.3, cm.cx, H * 0.6, Math.hypot(W, H) * 0.62);
    gv.addColorStop(0, bgA(0)); gv.addColorStop(1, bgA(0.6));
    ctx.fillStyle = gv; ctx.fillRect(0, 0, W, H);
    if (!ORG || !car.has || !cellList.length) {
      ctx.fillStyle = 'rgba(169,159,208,0.9)'; ctx.font = '700 15px Nunito, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(!ORG || !car.has ? t('searchPos') : t('loadMap'), cm.cx, H * 0.62);
    }
  }


  /* ---------- Mondo: mappa Mercator a tile (fino a z14+) e globo quando si esce dal pianeta ---------- */
  var world = { on: false, mx: 0.5, my: 0.5, z: 12, zin: 14, ang0: 0, rot: 0, off0: 0, panned: false, wasFree: false };
  var WX = { mx: 0.5, my: 0.5, z: 12, sx: 0, sy: 0, ang: 0 };
  var WK = 1e6, WZMIN = 1.8, WZ_GLOBE = 3.3, WZMAX = 17.5, WS = 384;
  var W_LAND = '#150f2e', W_WATER = '#071433', W_SEA = '#050a1c';
  var W_LC = { wood: '#10253d', grass: '#122a44', farmland: '#191a3f', sand: '#2b2350', ice: '#2c3560', wetland: '#112f4a', rock: '#1f1a3c' };
  var W_LU = { residential: '#231a4a', industrial: '#2b1c40', commercial: '#2d1a49', cemetery: '#122a44', park: '#122a44' };
  var W_ROAD = { motorway: ['#473582', 1.9, 4], trunk: ['#473582', 1.6, 4], primary: ['#3a2c6e', 1.4, 6], secondary: ['#3a2c6e', 1.15, 8], tertiary: ['#3a2c6e', 1.0, 10], minor: ['#2a2050', 0.8, 12], service: ['#2a2050', 0.55, 14] };
  var W_EDGE = { motorway: '#ff2bd6', trunk: '#ffb020', primary: '#19e3ff', secondary: '#12a0b8', tertiary: '#5a4aa8' };
  var wTiles = {}, wCount = 0, wInfl = 0, wWant = [], wFrame = 0;
  var wTex = null, wTexCtx = null, wTexData = null, wTexDirty = false, wTexT = 0, wTexVer = 0;
  function mxOf(lon) { return (lon + 180) / 360; }
  function myOf(lat) { var r = Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2; }
  function lonOfMx(mx) { return mx * 360 - 180; }
  function latOfMy(my) { return Math.atan(Math.sinh(Math.PI * (1 - 2 * my))) * 180 / Math.PI; }
  function wzOfLocal(lat, z2) { return Math.log(156543.03 * ORG.c0 / (HC * 6 * z2 / cm.F)) / Math.LN2; }
  function wrapAng(a) { return ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; }
  function wK() { var k = Math.max(0, Math.min(1, (world.z - (exitZnow() - 2.5)) / 2.5)); return k * k * (3 - 2 * k); }
  function wXfWorld() {
    var k = wK();
    WX.mx = world.mx; WX.my = world.my; WX.z = world.z; WX.sx = cm.cx; WX.sy = cm.cy + world.off0 * k; WX.ang = world.ang0 * k + world.rot;
  }
  /* trasformazione che coincide con la vista locale dall'alto: serve alla dissolvenza tra mappa locale e mappa del mondo */
  function wXfLocal() {
    var ll = toLL(fc.x, fc.y);
    WX.mx = mxOf(ll.lon); WX.my = myOf(ll.lat); WX.z = wzOfLocal(ll.lat, cm.Hc / (HC * 6));
    WX.sx = cm.cx; WX.sy = H * 0.68; WX.ang = -(Math.atan2(cm.fy, cm.fx) + Math.PI / 2);
  }
  function exitZnow() { return wzOfLocal(latOfMy(world.my), ZMAX2 * 0.8); }
  function enterWorld() {
    wXfLocal();
    world.mx = WX.mx; world.my = WX.my; world.z = WX.z; world.zin = WX.z; world.ang0 = 0; world.rot = wrapAng(WX.ang); world.off0 = H * 0.68 - cm.cy;
    world.panned = false; world.wasFree = view.free; world.on = true; rcBtn.hidden = false;
  }
  /* mostra un'area (per esempio un percorso lungo) direttamente sulla mappa del mondo */
  function enterWorldFit(lat1, lon1, lat2, lon2, side) {
    var sx = Math.max(1e-6, Math.abs(mxOf(lon2) - mxOf(lon1))), sy = Math.max(1e-6, Math.abs(myOf(lat2) - myOf(lat1)));
    var z = Math.log(Math.min((W - side) * 0.78 / (256 * sx), H * 0.5 / (256 * sy))) / Math.LN2;
    world.mx = (mxOf(lon1) + mxOf(lon2)) / 2; world.my = (myOf(lat1) + myOf(lat2)) / 2;
    world.z = Math.max(WZMIN, Math.min(WZMAX, z)); world.zin = world.z; world.ang0 = 0; world.rot = 0; world.off0 = H * 0.68 - cm.cy;
    world.panned = true; world.wasFree = true; world.on = true; rcBtn.hidden = false;
  }
  function wAng() { return world.ang0 * wK() + world.rot; }
  /* il punto della mappa del mondo che si trova sotto un punto dello schermo (null sul globo fuori dal disco) */
  function worldUnder(sx, sy) {
    if (world.z < WZ_GLOBE) {
      var R = 256 * Math.pow(2, world.z) / (2 * Math.PI), a = -wAng(), c = Math.cos(a), sn = Math.sin(a), ex0 = sx - cm.cx, ey0 = sy - H * 0.5;
      var x = (ex0 * c - ey0 * sn) / R, y = -(ex0 * sn + ey0 * c) / R, rho = Math.sqrt(x * x + y * y);
      if (rho >= 1) return null;
      var p0 = latOfMy(world.my) * Math.PI / 180, l0 = lonOfMx(world.mx) * Math.PI / 180, cc = Math.asin(rho), lat, lon;
      if (rho < 1e-9) { lat = p0; lon = l0; }
      else { lat = Math.asin(Math.cos(cc) * Math.sin(p0) + y * Math.sin(cc) * Math.cos(p0) / rho); lon = l0 + Math.atan2(x * Math.sin(cc), rho * Math.cos(p0) * Math.cos(cc) - y * Math.sin(p0) * Math.sin(cc)); }
      return { mx: mxOf(lon * 180 / Math.PI), my: myOf(lat * 180 / Math.PI), globe: true };
    }
    wXfWorld();
    var wp = 256 * Math.pow(2, WX.z), ex = sx - WX.sx, ey = sy - WX.sy, ca = Math.cos(WX.ang), sa = Math.sin(WX.ang);
    return { mx: WX.mx + (ex * ca + ey * sa) / wp, my: WX.my + (-ex * sa + ey * ca) / wp };
  }
  /* zoom sulla mappa del mondo che resta ancorato al punto toccato (ax, ay) */
  function worldZoomTo(nz, ax, ay) {
    var oz = world.z, pre = ax == null ? null : worldUnder(ax, ay);
    nz = Math.min(WZMAX, Math.max(WZMIN, nz));
    world.z = nz;
    if (!pre) return;
    world.panned = true;
    if (oz >= WZ_GLOBE && nz >= WZ_GLOBE) {
      var cur = worldUnder(ax, ay);
      world.mx = ((world.mx + pre.mx - cur.mx) % 1 + 1) % 1;
      world.my = Math.max(0.01, Math.min(0.99, world.my + pre.my - cur.my));
    } else if (nz > oz) {
      var f = 1 - Math.pow(2, -(nz - oz)), dmx = pre.mx - world.mx;
      dmx -= Math.round(dmx);
      world.mx = ((world.mx + dmx * f) % 1 + 1) % 1;
      world.my = Math.max(0.01, Math.min(0.99, world.my + (pre.my - world.my) * f));
    }
  }
  function exitWorld(follow) {
    var k = wK(), wasPanned = world.panned || world.wasFree;
    wXfWorld();
    var wp = 256 * Math.pow(2, WX.z), ex = cm.cx - WX.sx, ey = H * 0.68 - WX.sy, ca = Math.cos(WX.ang), sa = Math.sin(WX.ang);
    var fm = WX.mx + (ex * ca + ey * sa) / wp, fy2 = Math.max(0.001, Math.min(0.999, WX.my + (-ex * sa + ey * ca) / wp));
    var lat = latOfMy(fy2), lon = lonOfMx(fm);
    world.on = false;
    var hc = cm.F * 156543.03 * ORG.c0 / Math.pow(2, world.z), th = -(world.ang0 * k + world.rot) - Math.PI / 2;
    if (follow || !wasPanned) { view.free = false; rcBtn.hidden = true; }
    else {
      var p = toXY(lat, lon);
      view.free = true; view.fx = p.x; view.fy = p.y; view.rot = th; rcBtn.hidden = false;
    }
    world.rot = 0;
    if (is2D()) view.z2 = Math.min(ZMAX2, Math.max(ZMIN2, hc / (HC * 6)));
    else view.z3 = Math.min(ZMAX3, Math.max(ZMIN3, hc / HC));
    if (follow) { if (is2D()) view.z2 = ZMAX2 * 0.8; else view.z3 = ZMAX3 * 0.8; }
    ensureData();
  }
  function worldPan(dx, dy) {
    var s = 256 * Math.pow(2, world.z), a = wAng(), c = Math.cos(a), sn = Math.sin(a);
    var u = dx * c + dy * sn, v = -dx * sn + dy * c;     // dal movimento sullo schermo al movimento sulla mappa ruotata
    world.mx = ((world.mx - u / s) % 1 + 1) % 1;
    world.my = Math.max(0.01, Math.min(0.99, world.my - v / s));
    world.panned = true;
  }
  function wTile(z, x, y) {
    var n = Math.pow(2, z); x = ((x % n) + n) % n;
    if (y < 0 || y >= n) return null;
    var k = z + '/' + x + '/' + y, e = wTiles[k];
    if (!e) { e = wTiles[k] = { z: z, x: x, y: y, st: 0, cv: null, pl: null, use: 0, t: 0, inTex: false }; wCount++; }
    e.use = wFrame;
    if (e.st === 3 && Date.now() - e.t > 15000) e.st = 0;
    if (e.st === 0 && wWant.indexOf(e) < 0) wWant.push(e);
    return e;
  }
  function wPeek(z, x, y) { var n = Math.pow(2, z), e = wTiles[z + '/' + (((x % n) + n) % n) + '/' + y]; return e && e.st === 2 ? e : null; }
  function wPump() {
    if (!wWant.length) return;
    var cz = Math.round(world.z), n = Math.pow(2, Math.min(14, Math.max(0, cz))), cx = world.mx * n, cy = world.my * n;
    wWant.sort(function (a, b) {
      var sa = Math.pow(2, a.z - cz), sb = Math.pow(2, b.z - cz);
      return Math.hypot(a.x + 0.5 - cx * sa, a.y + 0.5 - cy * sa) / sa - Math.hypot(b.x + 0.5 - cx * sb, b.y + 0.5 - cy * sb) / sb;
    });
    while (wInfl < 6 && wWant.length) wLoad(wWant.shift());
  }
  function wLoad(e) {
    e.st = 1; wInfl++;
    var key = 'w:' + e.z + '/' + e.x + '/' + e.y, t0 = Date.now();
    cacheGet(key).then(function (c) {
      if (c && c.els && c.els.byteLength !== undefined) return c.els;
      return fetchTile(e.x, e.y, 15000, e.z).then(function (b) { if (b.byteLength) cachePut(key, b); logReq(TILE_HOST, 'mondo', Date.now() - t0, 'ok'); return b; });
    }).then(function (buf) {
      try { wRender(e, buf); e.st = 2; if (e.z === 3) { wTexDirty = true; } }
      catch (er) { e.st = 3; e.t = Date.now(); }
    }, function (er) { e.st = 3; e.t = Date.now(); logReq(TILE_HOST, 'mondo', Date.now() - t0, er && er.status ? 'errore ' + er.status : 'errore'); }).then(function () { wInfl--; });
  }
  function wRender(e, buf, size) {
    var S = size || WS, cv2 = document.createElement('canvas'); cv2.width = cv2.height = S;
    var g = cv2.getContext('2d'), z = e.z, places = [];
    g.scale(S / WS, S / WS); e.buf = buf; e.sz = S;
    if (!buf || !buf.byteLength) { g.fillStyle = W_WATER; g.fillRect(0, 0, WS, WS); e.cv = cv2; e.pl = places; return; }
    var T = mvtDecode(buf), i, j, k;
    g.fillStyle = W_LAND; g.fillRect(0, 0, WS, WS);
    function path(L, f, close) {
      var gm = T.geom(f), sc = WS / L.ext;
      for (var a = 0; a < gm.length; a++) {
        var r = gm[a];
        g.moveTo(r[0] * sc, r[1] * sc);
        for (var b = 2; b < r.length; b += 2) g.lineTo(r[b] * sc, r[b + 1] * sc);
        if (close) g.closePath();
      }
    }
    function polys(name, table, prop, minZ) {
      var L = T.layers[name]; if (!L || z < minZ) return;
      var by = {};
      for (var q = 0; q < L.feats.length; q++) {
        var f = L.feats[q]; if (f.type !== 3) continue;
        var key = table ? T.props(L, f)[prop] : 'x';
        if (table && !table[key]) continue;
        (by[key] || (by[key] = [])).push(f);
      }
      for (var kk in by) {
        g.beginPath();
        for (var w = 0; w < by[kk].length; w++) path(L, by[kk][w], true);
        g.fillStyle = table ? table[kk] : W_WATER; g.fill('evenodd');
      }
    }
    polys('landcover', W_LC, 'class', 0);
    polys('landuse', W_LU, 'class', 8);
    var WL = T.layers.water;
    if (WL) {
      g.beginPath();
      for (i = 0; i < WL.feats.length; i++) if (WL.feats[i].type === 3) path(WL, WL.feats[i], true);
      g.fillStyle = W_WATER; g.fill('evenodd');
      g.lineWidth = 0.9; g.strokeStyle = 'rgba(25,227,255,0.38)'; g.stroke();
    }
    var WW = T.layers.waterway;
    if (WW && z >= 9) {
      g.beginPath();
      for (i = 0; i < WW.feats.length; i++) if (WW.feats[i].type === 2) path(WW, WW.feats[i], false);
      g.lineWidth = 0.6; g.strokeStyle = 'rgba(25,227,255,0.3)'; g.stroke();
    }
    var TR = T.layers.transportation;
    if (TR && z >= 4) {
      var byc = {};
      for (i = 0; i < TR.feats.length; i++) {
        var tf = TR.feats[i]; if (tf.type !== 2) continue;
        var cl = T.props(TR, tf).class, rs = W_ROAD[cl];
        if (!rs || z < rs[2]) continue;
        (byc[cl] || (byc[cl] = [])).push(tf);
      }
      var order = ['service', 'minor', 'tertiary', 'secondary', 'primary', 'trunk', 'motorway'], wsc = 0.8 + Math.max(0, z - 6) * 0.12;
      // dalla meno alla più importante: alone, bordo neon e corpo; la strada più importante copre le altre
      g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
      order.forEach(function (cl) {
        if (!byc[cl]) return;
        var bw = W_ROAD[cl][1] * wsc;
        g.beginPath();
        for (var q = 0; q < byc[cl].length; q++) path(TR, byc[cl][q], false);
        var pth = null;
        if (W_EDGE[cl]) {
          g.strokeStyle = W_EDGE[cl];
          g.globalAlpha = 0.14; g.lineWidth = bw + 5; g.stroke();
          g.globalAlpha = 0.35; g.lineWidth = bw + 2.6; g.stroke();
          g.globalAlpha = 1; g.lineWidth = bw + 1.6; g.stroke();
        }
        g.globalAlpha = 1; g.strokeStyle = W_ROAD[cl][0]; g.lineWidth = bw; g.stroke();
      });
      g.restore();
    }
    var BD = T.layers.boundary;
    if (BD) {
      var bl = { 2: [], 4: [] };
      for (i = 0; i < BD.feats.length; i++) {
        var bf = BD.feats[i]; if (bf.type !== 2) continue;
        var bp = T.props(BD, bf); if (bp.maritime === 1 && bp.admin_level > 2) continue;
        if (bp.admin_level <= 2) bl[2].push(bf); else if (bp.admin_level <= 4 && z >= 3) bl[4].push(bf);
      }
      g.beginPath(); for (i = 0; i < bl[4].length; i++) path(BD, bl[4][i], false);
      g.strokeStyle = 'rgba(166,75,255,0.5)'; g.lineWidth = 0.8; g.setLineDash([3, 3]); g.stroke(); g.setLineDash([]);
      g.beginPath(); for (i = 0; i < bl[2].length; i++) path(BD, bl[2][i], false);
      g.strokeStyle = 'rgba(255,43,214,0.85)'; g.lineWidth = 1.3; g.stroke();
    }
    var PL = T.layers.place;
    if (PL) for (i = 0; i < PL.feats.length; i++) {
      var pf = PL.feats[i]; if (pf.type !== 1) continue;
      var pp = T.props(PL, pf), pg = T.geom(pf);
      if (!pg.length || !pp.name) continue;
      places.push({ x: pg[0][0] / PL.ext, y: pg[0][1] / PL.ext, c: pp['class'], r: pp.rank || 99,
        n: { it: pp['name:it'], en: pp['name:en'], es: pp['name:es'], fr: pp['name:fr'], de: pp['name:de'], la: pp['name:latin'], d: pp.name } });
    }
    e.cv = cv2; e.pl = places;
  }
  function wEvict() {
    if (wCount < 110) return;
    var arr = [], k;
    for (k in wTiles) arr.push(wTiles[k]);
    arr.sort(function (a, b) { return a.use - b.use; });
    for (var i = 0; i < arr.length - 80; i++) { if (arr[i].st === 1 || arr[i].use >= wFrame - 2) continue; delete wTiles[arr[i].z + '/' + arr[i].x + '/' + arr[i].y]; wCount--; }
  }
  function wScr(lat, lon) {
    if (world.on && world.z < WZ_GLOBE) {
      var R = 256 * Math.pow(2, world.z) / (2 * Math.PI), p0 = latOfMy(world.my) * Math.PI / 180, l0 = lonOfMx(world.mx) * Math.PI / 180;
      var p = lat * Math.PI / 180, dl = lon * Math.PI / 180 - l0, cc = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(dl);
      var gx = R * Math.cos(p) * Math.sin(dl), gy = -R * (Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(dl)), ga = wAng(), gc = Math.cos(ga), gs = Math.sin(ga);
      return { x: cm.cx + gx * gc - gy * gs, y: H * 0.5 + gx * gs + gy * gc, vis: cc > 0 };
    }
    var wp = 256 * Math.pow(2, WX.z), dx = mxOf(lon) - WX.mx, ca = Math.cos(WX.ang), sa = Math.sin(WX.ang);
    dx -= Math.round(dx);
    var u = dx * wp, v = (myOf(lat) - WX.my) * wp;
    return { x: WX.sx + u * ca - v * sa, y: WX.sy + u * sa + v * ca, vis: true };
  }
  var reUp = 0;
  function drawWorldFlat(alpha) {
    var Zt = Math.max(0, Math.min(14, Math.round(WX.z))), wp = 256 * Math.pow(2, WX.z), sc = wp / Math.pow(2, Zt);
    var cxp = WX.mx * wp, cyp = WX.my * wp, ca = Math.cos(WX.ang), sa = Math.sin(WX.ang), i, k;
    var umin = 1e12, umax = -1e12, vmin = 1e12, vmax = -1e12, cs = [[0, 0], [W, 0], [0, H], [W, H]];
    for (i = 0; i < 4; i++) {
      var ex = cs[i][0] - WX.sx, ey = cs[i][1] - WX.sy, u = ex * ca + ey * sa, v = -ex * sa + ey * ca;
      if (u < umin) umin = u; if (u > umax) umax = u; if (v < vmin) vmin = v; if (v > vmax) vmax = v;
    }
    var tx0 = Math.floor((cxp + umin) / sc), tx1 = Math.floor((cxp + umax) / sc), ty0 = Math.floor((cyp + vmin) / sc), ty1 = Math.floor((cyp + vmax) / sc), tx, ty, labels = [];
    if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) > 90) { alpha = alpha; ty1 = ty0 + Math.floor(90 / (tx1 - tx0 + 1)); }
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.fillStyle = W_SEA; ctx.fillRect(0, 0, W, H);
    ctx.translate(WX.sx, WX.sy); ctx.rotate(WX.ang);
    reUp = 0;
    for (ty = ty0; ty <= ty1; ty++) for (tx = tx0; tx <= tx1; tx++) {
      var e = wTile(Zt, tx, ty); if (!e) continue;
      var sx = tx * sc - cxp, sy = ty * sc - cyp;
      if (e.st === 2) {
        if (sc > e.sz * 1.2 && e.sz < 1024 && reUp < 2 && e.buf) { reUp++; try { wRender(e, e.buf, Math.min(1024, Math.ceil(sc / 128) * 128)); } catch (er) {} }
        ctx.drawImage(e.cv, Math.floor(sx), Math.floor(sy), Math.ceil(sc) + 1, Math.ceil(sc) + 1);
        for (k = 0; k < e.pl.length; k++) labels.push({ p: e.pl[k], u: sx + e.pl[k].x * sc, v: sy + e.pl[k].y * sc });
      } else {
        var n = Math.pow(2, Zt), txw = ((tx % n) + n) % n;
        for (k = 1; k <= Zt; k++) {
          var pe = wPeek(Zt - k, txw >> k, ty >> k);
          if (pe) {
            var sub = Math.pow(2, k), ss = pe.cv.width / sub;
            ctx.drawImage(pe.cv, (txw % sub) * ss, (ty % sub) * ss, ss, ss, Math.floor(sx), Math.floor(sy), Math.ceil(sc) + 1, Math.ceil(sc) + 1);
            break;
          }
        }
      }
    }
    ctx.restore();
    if (alpha > 0.6) {
      for (i = 0; i < labels.length; i++) { var lu = labels[i].u, lv = labels[i].v; labels[i].x = WX.sx + lu * ca - lv * sa; labels[i].y = WX.sy + lu * sa + lv * ca; }
      drawPlaces(labels);
    }
  }
  function drawPlaces(labels) {
    var wz = world.z, lang = prefs.lang, out = [], i;
    for (i = 0; i < labels.length; i++) {
      var p = labels[i].p, c = p.c, ok = false, pr = 0, fs = 12;
      if (c === 'country') { ok = wz <= 7.5 && p.r <= (wz - 0.6) * 2.4 + 1; pr = 100 - p.r; fs = 15; }
      else if (c === 'state' || c === 'province') { ok = wz >= 4 && wz <= 10; pr = 70 - p.r; fs = 12; }
      else if (c === 'city') { ok = wz >= 3.6 && p.r <= (wz - 2) * 2.4; pr = 60 - p.r; fs = 13; }
      else if (c === 'town') { ok = wz >= 8.5; pr = 40 - p.r * 0.2; fs = 12; }
      else if (c === 'village') { ok = wz >= 11; pr = 30; fs = 11; }
      else if (c === 'suburb' || c === 'neighbourhood' || c === 'quarter' || c === 'hamlet') { ok = wz >= 12.5; pr = 20; fs = 11; }
      if (!ok) continue;
      var nm = p.n[lang] || p.n.la || p.n.d;
      if (!nm) continue;
      out.push({ nm: c === 'country' ? nm.toUpperCase() : nm, x: labels[i].x, y: labels[i].y, pr: pr, fs: fs, c: c });
    }
    out.sort(function (a, b) { return b.pr - a.pr; });
    var placed = [], seen = {};
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    for (i = 0; i < out.length && placed.length < 90; i++) {
      var o = out[i];
      if (o.x < -40 || o.x > W + 40 || o.y < -10 || o.y > H + 10 || seen[o.nm]) continue;
      ctx.font = (o.c === 'country' ? '800 ' : '700 ') + o.fs + 'px Nunito, sans-serif';
      var w = ctx.measureText(o.nm).width + 10, h = o.fs + 6, hit = false;
      for (var q = 0; q < placed.length; q++) { var b = placed[q]; if (Math.abs(b.x - o.x) < (b.w + w) / 2 && Math.abs(b.y - o.y) < (b.h + h) / 2) { hit = true; break; } }
      if (hit) continue;
      placed.push({ x: o.x, y: o.y, w: w, h: h }); seen[o.nm] = 1;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(5,6,22,0.85)'; ctx.strokeText(o.nm, o.x, o.y);
      ctx.fillStyle = o.c === 'country' ? '#ff8fe9' : o.c === 'state' ? '#b9a6ff' : '#e9e4ff'; ctx.fillText(o.nm, o.x, o.y);
      if (o.c === 'city' || o.c === 'town') { ctx.beginPath(); ctx.arc(o.x, o.y + o.fs * 0.95, 2, 0, 6.2832); ctx.fillStyle = C.cyan; ctx.fill(); }
    }
  }
  function wTexPrep() {
    if (!wTex) {
      wTex = document.createElement('canvas'); wTex.width = wTex.height = 2048;
      wTexCtx = wTex.getContext('2d'); wTexCtx.fillStyle = W_WATER; wTexCtx.fillRect(0, 0, 2048, 2048);
    }
    var x, y, n = 8;
    for (y = 0; y < n; y++) for (x = 0; x < n; x++) {
      var e = wTile(3, x, y);
      if (e && e.st === 2 && !e.inTex) { wTexCtx.drawImage(e.cv, x * 256, y * 256, 256, 256); e.inTex = true; wTexDirty = true; }
    }
    if (wTexDirty && (!wTexData || Date.now() - wTexT > 400)) {
      try { wTexData = new Uint32Array(wTexCtx.getImageData(0, 0, 2048, 2048).data.buffer); wTexVer++; } catch (er) {}
      wTexDirty = false; wTexT = Date.now();
    }
  }
  var gCv = null, gImg = null, gKey = '', stars = null;
  function drawGlobe(alpha) {
    wTexPrep();
    var R = 256 * Math.pow(2, world.z) / (2 * Math.PI), cx = cm.cx, cy = H * 0.5, i, j;
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.fillStyle = '#04050f'; ctx.fillRect(0, 0, W, H);
    ctx.translate(cx, cy); ctx.rotate(wAng()); ctx.translate(-cx, -cy);
    if (!stars) { stars = []; var s = 7; for (i = 0; i < 140; i++) { s = (s * 16807) % 2147483647; var a = s / 2147483647; s = (s * 16807) % 2147483647; stars.push([a, s / 2147483647, 0.4 + (i % 5) * 0.18]); } }
    for (i = 0; i < stars.length; i++) { ctx.fillStyle = 'rgba(190,200,255,' + (0.25 + stars[i][2] * 0.4) + ')'; ctx.fillRect(stars[i][0] * W, stars[i][1] * H, stars[i][2] * 1.6, stars[i][2] * 1.6); }
    var gl = ctx.createRadialGradient(cx, cy, R * 0.96, cx, cy, R * 1.22);
    gl.addColorStop(0, 'rgba(25,227,255,0.45)'); gl.addColorStop(0.45, 'rgba(255,43,214,0.16)'); gl.addColorStop(1, 'rgba(25,227,255,0)');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(cx, cy, R * 1.22, 0, 6.2832); ctx.fill();
    if (wTexData) {
      var step = R > 380 ? 3 : 2, N = Math.max(8, Math.min(Math.ceil(2 * R / step), 700)), key = [N, world.mx.toFixed(5), world.my.toFixed(5), wTexVer].join();
      if (!gCv || gCv.width !== N) { gCv = document.createElement('canvas'); gCv.width = gCv.height = N; gImg = gCv.getContext('2d').createImageData(N, N); gKey = ''; }
      if (key !== gKey) {
        gKey = key;
        var p0 = latOfMy(world.my) * Math.PI / 180, l0 = lonOfMx(world.mx) * Math.PI / 180, sp = Math.sin(p0), cp = Math.cos(p0);
        var out = new Uint32Array(gImg.data.buffer), tex = wTexData, M = 2047;
        for (j = 0; j < N; j++) {
          var yy = -((j + 0.5) / N * 2 - 1);
          for (i = 0; i < N; i++) {
            var xx = (i + 0.5) / N * 2 - 1, r2 = xx * xx + yy * yy;
            if (r2 >= 1) { out[j * N + i] = 0; continue; }
            var zc = Math.sqrt(1 - r2), rho = Math.sqrt(r2), phi2, lam;
            if (rho < 1e-9) { phi2 = p0; lam = l0; }
            else { phi2 = Math.asin(zc * sp + yy * rho * cp / rho); lam = l0 + Math.atan2(xx * rho, rho * cp * zc - yy * sp * rho); }
            var u = lam / (2 * Math.PI) + 0.5; u -= Math.floor(u);
            var v = (1 - Math.log(Math.tan(Math.PI / 4 + Math.max(-1.4835, Math.min(1.4835, phi2)) / 2)) / Math.PI) / 2;
            var px = tex[Math.max(0, Math.min(M, Math.floor(v * 2048))) * 2048 + Math.min(M, Math.floor(u * 2048))];
            var sh = 0.32 + 0.68 * Math.pow(zc, 0.55), rr = (px & 255) * sh, gg = ((px >> 8) & 255) * sh, bb = ((px >> 16) & 255) * sh;
            out[j * N + i] = (255 << 24) | ((bb > 255 ? 255 : bb) << 16) | ((gg > 255 ? 255 : gg) << 8) | (rr > 255 ? 255 : rr);
          }
        }
        gCv.getContext('2d').putImageData(gImg, 0, 0);
      }
      ctx.imageSmoothingEnabled = true; ctx.drawImage(gCv, cx - R, cy - R, 2 * R, 2 * R);
    } else {
      ctx.fillStyle = W_WATER; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.2832); ctx.fill();
    }
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(25,227,255,0.55)'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.2832); ctx.stroke();
    ctx.restore();
  }
  function worldLine(rt, color, lw, alpha) {
    var i, step = Math.max(1, Math.floor(rt.pts.length / 300)), started = false;
    ctx.beginPath();
    for (i = 0; i < rt.pts.length; i += step) {
      var q = toLL(rt.pts[i].x, rt.pts[i].y), s = wScr(q.lat, q.lon);
      if (!s.vis) { started = false; continue; }
      if (started) ctx.lineTo(s.x, s.y); else { ctx.moveTo(s.x, s.y); started = true; }
    }
    ctx.globalAlpha = alpha; ctx.lineWidth = lw; ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 10; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }
  function drawWorldMarks(t, alpha) {
    var i, ll = toLL(car.x, car.y), me = wScr(ll.lat, ll.lon);
    ctx.save(); ctx.globalAlpha = alpha;
    if (route) {
      if (state === 'preview' && alts.list.length > 1) {
        alts.list.forEach(function (a, k) { if (k !== alts.sel) worldLine(a.rt, a.color, 3, alts.sel < 0 ? 0.9 : 0.5); });
      }
      worldLine(route, C.cyan, 3.5, 1);
      var d = wScr(route.dest.lat, route.dest.lon);
      if (d.vis) { ctx.beginPath(); ctx.moveTo(d.x, d.y - 9); ctx.lineTo(d.x + 7, d.y); ctx.lineTo(d.x, d.y + 9); ctx.lineTo(d.x - 7, d.y); ctx.closePath(); ctx.fillStyle = C.bg; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = C.yel; ctx.stroke(); }
    }
    if (me.vis) {
      var ph = ((t / 1000) % 1.6) / 1.6;
      ctx.beginPath(); ctx.arc(me.x, me.y, 7 + ph * 22, 0, 6.2832); ctx.strokeStyle = 'rgba(255,46,136,' + (0.75 * (1 - ph)) + ')'; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(me.x, me.y, 6, 0, 6.2832); ctx.fillStyle = gpsLost() ? '#8d8aa0' : prefs.carColor || C.mag; ctx.shadowColor = gpsLost() ? '#8d8aa0' : prefs.carColor || C.mag; ctx.shadowBlur = 14; ctx.fill(); ctx.shadowBlur = 0;
      ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
    }
    ctx.restore();
  }
  /* dissolvenza tra la vista locale dall'alto e la mappa del mondo: stessa scala, stessa rotazione, stesso centro */
  function worldBlend() {
    if (cm.s < 0.99) return 0;
    var x = (cm.Hc - HC * 6 * 1.3) / (HC * 6 * (3.8 - 1.3));
    x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x);
  }
  function drawWorldOverlay(t, a) {
    wFrame++; wWant.length = 0;
    wXfLocal(); drawWorldFlat(a);
    drawWorldMarks(t, a);
    wPump();
    if (wFrame % 90 === 0) wEvict();
  }
  function drawWorld(t) {
    wFrame++; wWant.length = 0;
    wXfWorld();
    var gA = world.z < WZ_GLOBE + 0.45 ? Math.min(1, (WZ_GLOBE + 0.45 - world.z) / 0.5) : 0;
    if (gA < 1) drawWorldFlat(1);
    if (gA > 0) drawGlobe(gA);
    drawWorldMarks(t, 1);
    wPump();
    if (wFrame % 90 === 0) wEvict();
  }

  /* ---------- Esplorare la mappa: trascina, pizzica, ruota, 2D/3D ---------- */
  var ptrs = {}, gest = null, rcBtn = $('recenterBtn'), modeBtn = $('modeBtn');
  function pos(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function touch() { view.last = Date.now(); }
  function enterFree() {
    if (view.free) return;
    view.free = true; view.fx = fc.x; view.fy = fc.y; view.rot = Math.atan2(cm.fy, cm.fx);
    rcBtn.hidden = false;
  }
  var ztw = false;      // ritorno morbido alla scala di navigazione
  var wPreT = 0, compassTw = false, cmpBtn = $('compassBtn'), cmpIc = $('compassIc');
  function northAng() { return world.on ? wAng() : -(Math.atan2(cm.fy, cm.fx) + Math.PI / 2); }
  cmpBtn.addEventListener('click', function () {
    if (!world.on && !view.free) enterFree();
    compassTw = true; touch();
  });
  function stepCompass(dt) {
    var kk = 1 - Math.exp(-dt * 7), d;
    if (world.on) {
      var tot = wrapAng(world.ang0 * wK() + world.rot);
      world.rot = wrapAng(world.rot - tot * kk); world.ang0 *= (1 - kk);
      if (Math.abs(wAng()) < 0.004) { world.rot = 0; world.ang0 = 0; compassTw = false; }
    } else {
      d = wrapAng(-Math.PI / 2 - view.rot); view.rot = view.rot + d * kk;
      if (Math.abs(d) < 0.004) { view.rot = -Math.PI / 2; compassTw = false; }
    }
    touch();
  }
  function syncCompass() {
    var show = world.on || view.free;
    if (cmpBtn.hidden === show) cmpBtn.hidden = !show;
    if (show) cmpIc.style.transform = 'rotate(' + northAng() + 'rad)';
  }
  function recenter() {
    if (world.on) { exitWorld(true); ztw = true; touch(); return; }
    var wasFar = worldBlend() > 0.02;
    view.free = false; rcBtn.hidden = true; ensureData();
    if (wasFar) { ztw = true; touch(); }
  }
  function fitRoute() {
    if (!route || !ORG) return;
    var b = route.bbox.slice();
    if (state === 'preview') alts.list.forEach(function (al) { var q = al.rt.bbox; b[0] = Math.min(b[0], q[0]); b[1] = Math.min(b[1], q[1]); b[2] = Math.max(b[2], q[2]); b[3] = Math.max(b[3], q[3]); });
    var a = toXY(b[0], b[1]), c2 = toXY(b[2], b[3]);
    var mx = (a.x + c2.x) / 2, my = (a.y + c2.y) / 2, w = Math.abs(c2.x - a.x), h = Math.abs(c2.y - a.y);
    var need = (Math.max(w * 1.3 / W, h * 1.3 / (H * 0.7)) + 0.0001) * Math.min(W * 1.25, H * 1.05) / (HC * 6);
    if (need > ZMAX2 * 0.9) { world.on = false; enterWorldFit(b[0], b[1], b[2], b[3], (W >= 900 && W / H >= 1.5) ? Math.min(430, W * 0.36) : 0); touch(); return; }
    world.on = false;
    view.free = true; view.fx = mx; view.fy = my; rcBtn.hidden = false;
    if (is2D()) {
      view.rot = -Math.PI / 2;
      var hc = (Math.max(w * 1.3 / W, h * 1.3 / (H * 0.7)) + 0.0001) * (Math.min(W * 1.25, H * 1.05));
      view.z2 = Math.min(ZMAX2, Math.max(ZMIN2, hc / (HC * 6)));
    } else {
      var s0 = route.pts[0], e0 = route.pts[route.pts.length - 1];
      view.rot = Math.atan2(e0.y - s0.y, e0.x - s0.x);
      view.z3 = Math.min(ZMAX3, Math.max(1, Math.hypot(w, h) / 380));
    }
    touch();
  }
  function startGesture() {
    var ids = Object.keys(ptrs);
    if (ids.length === 1) { var p = ptrs[ids[0]]; gest = { t: 'pan', x0: p.x, y0: p.y, on: false, g0: null }; }
    else if (ids.length >= 2) {
      var a = ptrs[ids[0]], b = ptrs[ids[1]];
      gest = { t: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, a0: Math.atan2(b.y - a.y, b.x - a.x), z0: curZoom(), r0: null, moved: false };
    } else gest = null;
  }
  var lpT = 0, lpFired = false;
  cv.addEventListener('pointerdown', function (e) {
    if (!ORG || !car.has) return;
    try { cv.setPointerCapture(e.pointerId); } catch (x) {}
    ptrs[e.pointerId] = pos(e); startGesture(); touch(); ztw = false;
    clearTimeout(lpT);
    if (Object.keys(ptrs).length === 1) {
      var q0 = pos(e);
      lpT = setTimeout(function () {
        if (!gest || gest.t !== 'pan' || gest.on || Object.keys(ptrs).length !== 1) return;
        var ll = screenToLL(q0.x, q0.y);
        if (ll) { lpFired = true; try { navigator.vibrate && navigator.vibrate(30); } catch (x) {} openPin(ll); }
      }, 600);
    }
  });
  cv.addEventListener('pointermove', function (e) {
    if (!ptrs[e.pointerId] || !gest) return;
    ptrs[e.pointerId] = pos(e); touch();
    if (lpT && gest && Math.hypot(ptrs[e.pointerId].x - gest.x0, ptrs[e.pointerId].y - gest.y0) > 9) { clearTimeout(lpT); lpT = 0; }
    var ids = Object.keys(ptrs);
    if (world.on) {
      if (gest.t === 'pan' && ids.length === 1) {
        var pw = ptrs[ids[0]];
        if (!gest.on) { if (Math.hypot(pw.x - gest.x0, pw.y - gest.y0) < 7) return; gest.on = true; gest.px = gest.x0; gest.py = gest.y0; }
        worldPan(pw.x - gest.px, pw.y - gest.py); gest.px = pw.x; gest.py = pw.y;
      } else if (gest.t === 'pinch' && ids.length >= 2) {
        var qa = ptrs[ids[0]], qb = ptrs[ids[1]], qd = Math.hypot(qa.x - qb.x, qa.y - qb.y) || 1, qm = { x: (qa.x + qb.x) / 2, y: (qa.y + qb.y) / 2 };
        var qang = Math.atan2(qb.y - qa.y, qb.x - qa.x);
        if (gest.wr0 == null) gest.wr0 = world.rot;
        compassTw = false;
        if (Math.abs(qang - gest.a0) > 0.05 || gest.rotOn) { gest.rotOn = true; world.rot = wrapAng(gest.wr0 + (qang - gest.a0)); world.panned = true; }
        setZoom(gest.z0 * gest.d0 / qd, qm.x, qm.y);
        if (!world.on) {
          /* appena usciti dalla mappa del mondo: la camera locale va aggiornata subito, altrimenti l'ancora verrebbe presa sulla vecchia posizione (la tua) */
          gest.w = false; gest.z0 = curZoom(); gest.d0 = qd; gest.a0 = qang; gest.r0 = view.rot; setupCamera(); gest.g0 = groundAt(qm.x, qm.y);
        }
        else { gest.z0 = curZoom(); gest.d0 = qd; }
      }
      return;
    }
    if (gest.t === 'pan' && ids.length === 1) {
      var p = ptrs[ids[0]];
      if (!gest.on) {
        if (Math.hypot(p.x - gest.x0, p.y - gest.y0) < 7) return;
        gest.on = true; enterFree(); gest.g0 = groundAt(p.x, p.y);
        return;
      }
      var g1 = groundAt(p.x, p.y);
      if (gest.g0 && g1) { view.fx += gest.g0.x - g1.x; view.fy += gest.g0.y - g1.y; }
    } else if (gest.t === 'pinch' && ids.length >= 2) {
      var a = ptrs[ids[0]], b = ptrs[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (!view.free) { setZoom(gest.z0 * gest.d0 / d); if (world.on) { gest.z0 = curZoom(); gest.d0 = d; } return; }
      if (!gest.g0) { setupCamera(); gest.g0 = groundAt(mid.x, mid.y); }
      if (gest.r0 === null) gest.r0 = view.rot;
      setZoom(gest.z0 * gest.d0 / d);
      if (world.on) { gest.z0 = curZoom(); gest.d0 = d; return; }
      view.rot = gest.r0 - (Math.atan2(b.y - a.y, b.x - a.x) - gest.a0);
      setupCamera();
      var g2 = groundAt(mid.x, mid.y);
      if (gest.g0 && g2) { view.fx += gest.g0.x - g2.x; view.fy += gest.g0.y - g2.y; }
    }
  });
  function endPtr(e) {
    if (!ptrs[e.pointerId]) return;
    if (e.type === 'pointerup' && state === 'preview' && alts.list.length > 1 && gest && gest.t === 'pan' && !gest.on && !lpFired && Object.keys(ptrs).length === 1) {
      var tp = ptrs[e.pointerId], hi = hitAlt(tp.x, tp.y);
      if (hi >= 0) selectAlt(hi);
    }
    if (e.type === 'pointerup' && reports.length && !lpFired && gest && gest.t === 'pan' && !gest.on && Object.keys(ptrs).length === 1) {
      var tp3 = ptrs[e.pointerId], hr = hitRep(tp3.x, tp3.y);
      if (hr) openRepInfo(hr);
    }
    if (e.type === 'pointerup' && inc.list.length && !lpFired && gest && gest.t === 'pan' && !gest.on && Object.keys(ptrs).length === 1) {
      var tp4 = ptrs[e.pointerId], hi = hitInc(tp4.x, tp4.y);
      if (hi) toast(incText(hi), 9000);
    }
    if (e.type === 'pointerup' && catRes && !lpFired && gest && gest.t === 'pan' && !gest.on && Object.keys(ptrs).length === 1) {
      var tp2 = ptrs[e.pointerId], hc2 = hitCat(tp2.x, tp2.y);
      if (hc2) openPin({ lat: hc2.lat, lon: hc2.lon, name: hc2.name || t(CATLBL[catRes.cat]), sub: t(CATLBL[catRes.cat]) });
    }
    lpFired = false;
    clearTimeout(lpT);
    delete ptrs[e.pointerId];
    try { cv.releasePointerCapture(e.pointerId); } catch (x) {}
    startGesture();
  }
  cv.addEventListener('pointerup', endPtr);
  cv.addEventListener('pointercancel', endPtr);
  cv.addEventListener('wheel', function (e) {
    if (!ORG || !car.has) return;
    e.preventDefault(); touch(); ztw = false;
    var f = Math.exp(e.deltaY * 0.0015);
    if (world.on) { var wq = pos(e); setZoom(curZoom() * f, wq.x, wq.y); return; }
    if (view.free) {
      setupCamera();
      var p = pos(e), g0 = groundAt(p.x, p.y);
      setZoom(curZoom() * f); setupCamera();
      var g1 = groundAt(p.x, p.y);
      if (g0 && g1) { view.fx += g0.x - g1.x; view.fy += g0.y - g1.y; }
    } else setZoom(curZoom() * f);
  }, { passive: false });
  $('zoomIn').addEventListener('click', function () { ztw = false; setZoom(curZoom() / 1.4); touch(); });
  $('zoomOut').addEventListener('click', function () { ztw = false; setZoom(curZoom() * 1.4); touch(); });
  rcBtn.addEventListener('click', recenter);
  modeBtn.addEventListener('click', function () { prefs.view2d = !prefs.view2d; savePrefs(); applyPrefs(); touch(); });
  function syncMode() { modeBtn.textContent = prefs.view2d ? '2D' : '3D'; modeBtn.setAttribute('aria-label', prefs.view2d ? t('to3d') : t('to2d')); }

  /* ---------- Ciclo principale ---------- */
  var last = performance.now(), hudT = 0, dataT = 0, limT = 0;
  function frame(now) {
    var dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (compassTw) stepCompass(dt);
    if (world.on && now - wPreT > 350 && world.z > exitZnow() - 1.8 && world.z >= WZ_GLOBE) {
      /* in background: prepara i dati della mappa locale nel punto dove si sta ingrandendo */
      wPreT = now;
      var pu = worldUnder(cm.cx, H * 0.68);
      if (pu) { var pla = latOfMy(pu.my), plo = lonOfMx(pu.mx); if (Math.abs(pla - ORG.lat) < 1.2 && Math.abs(plo - ORG.lon) < 1.8) { var pq = toXY(pla, plo); wantAround(pq.x, pq.y, 900); pump(); } }
    }
    if (now - incT > 120000 && car.has && !document.hidden) { incT = now; fetchIncidents(); }
    syncCompass();
    if (ztw && !world.on) {
      var cz = is2D() ? view.z2 : view.z3, nz = cz * Math.pow(1 / cz, 1 - Math.exp(-dt * 2.4));
      if (Math.abs(Math.log(nz)) < 0.03) { nz = 1; ztw = false; }
      if (is2D()) view.z2 = nz; else view.z3 = nz;
      touch();
    }
    if (car.has) {
      // previsione: tra un fix GPS e l'altro il bersaglio avanza alla velocità attuale, così la mappa scorre senza scatti
      var el = Math.min(1.5, Math.max(0, (now - fixT) / 1000)), px = tgt.x, py = tgt.y;
      var vNow = speedMs * (sim.active ? prefs.simMult : 1);
      if (vNow > 0.6) {
        if (tgtSnap && route && state === 'nav') { var pq = pointAt(route, Math.min(route.total, tgtD + vNow * el)); px = pq.x; py = pq.y; }
        else { px += Math.cos(phiT) * vNow * el; py += Math.sin(phiT) * vNow * el; }
      }
      var dx = px - car.x, dy = py - car.y;
      if (dx * dx + dy * dy > 80 * 80) { car.x = px; car.y = py; }
      else { var kk = 1 - Math.exp(-dt * 9); car.x += dx * kk; car.y += dy * kk; }
      var diff = ((phiT - phi + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      phi += diff * Math.min(1, dt * 4);
    }
    if (view.free && !world.on && state === 'nav' && speedMs > 2 && !Object.keys(ptrs).length && Date.now() - view.last > 20000) recenter();   // il ritorno automatico vale solo in marcia e mai dalla mappa del mondo
    var t0 = performance.now();
    draw(now);
    var cost = (performance.now() - t0) / 1000;
    frameAvg = frameAvg * 0.92 + Math.max(cost, dt * 0.5) * 0.08;
    if (frameAvg > 0.04) maxB = Math.max(150, Math.floor(maxB * 0.93));
    else if (frameAvg < 0.02) maxB = Math.min(900, Math.ceil(maxB * 1.03));
    hudT += dt; dataT += dt; limT += dt;
    if (hudT > 0.2) { hudT = 0; updateHUD(); }
    if (dataT > 1) { dataT = 0; ensureData(); }
    if (limT > 0.8) { limT = 0; updateLimit(); }
    requestAnimationFrame(frame);
  }

  /* ---------- Avvio ---------- */
  applyPrefs();
  applyLang();
  fillPersonas();
  fillVoices();
  setState('idle');
  updatePlayBtn();
  try {
    var lastPos = JSON.parse(localStorage.getItem(LAST_KEY) || 'null');
    if (lastPos && typeof lastPos.lat === 'number' && typeof lastPos.lon === 'number') {
      feed({ lat: lastPos.lat, lon: lastPos.lon, speed: 0, t: Date.now(), sim: true });
      here = null;
    }
  } catch (e) {}
  startGPS();
  requestAnimationFrame(frame);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
  window.__nightrider = {
    llScr: function (a, b) { return llScr(a, b); },
    gnd: function (x, y) { var g = groundAt(x, y); return g && toLL(g.x, g.y); },
    vf: function () { return { free: view.free, world: world.on, fx: view.fx, fy: view.fy, ll: view.free ? toLL(view.fx, view.fy) : null }; },
    org: function () { return ORG && { lat: ORG.lat, lon: ORG.lon }; },
    wrot: function (v) { if (v !== undefined) world.rot = v; return { rot: world.rot, ang0: world.ang0, ang: world.on ? wAng() : null, free: view.free }; },
    under: function (x, y) { var u = world.on ? worldUnder(x, y) : null; return u && { lat: latOfMy(u.my), lon: lonOfMx(u.mx) }; },
    quick: function () { return prefs.quick.slice(); },
    valid: function (rs) { return validAlts(distinctRoutes(rs)).map(function (r) { return r.duration; }); },
    wb: function () { return { on: world.on, z: world.z, blend: worldBlend(), z2: view.z2, z3: view.z3, free: view.free, ex: world.on ? exitZnow() : null }; },
    refDbg: function () { return refDbg; },
    refs: function () { var a = []; cellList.forEach(function (c) { (c.l || []).forEach(function (l) { if (l.ref) a.push(l.ref + ':' + l.k + ':' + (l.rps || []).length); }); }); return a.slice(0, 12); },
    rings: function () { var n = 0, tot = 0, ks = []; cellList.forEach(function (c) { c.r.forEach(function (r) { tot++; if (r.ring) { n++; ks.push(r.k + '/' + r.w.toFixed(1)); } }); }); return { rings: n, roads: tot, ks: ks }; },
    look: function (lat, lon, z) { var p = toXY(lat, lon); view.free = true; view.fx = p.x; view.fy = p.y; setZoom(z); touch(); },
    cat: function () { return catRes && { cat: catRes.cat, n: catRes.items.length, loading: !!catRes.loading, z2: view.z2, free: view.free, fx: view.fx, fy: view.fy, sp: catRes.items[0] && llScr(catRes.items[0].lat, catRes.items[0].lon) }; },
    info: function () { return { state: state, gps: gps, here: here, route: route && { total: route.total, man: route.man.length, cams: route.cams.length }, prog: prog, cells: cellList.length, cams: camList.length, speed: speedMs, limit: limitNow, maxB: maxB, free: view.free, world: { on: world.on, z: world.z, mx: world.mx, my: world.my }, z3: view.z3, z2: view.z2, d2: is2D(), car: { x: car.x, y: car.y }, trail: route ? (function () { var pr = projectOnRoute(route, car.x, car.y, prog.idx, false); return { d: pr.d, dist: pr.dist }; })() : null }; },
    xcheck: function (lat, lon) {
      var p = toXY(lat, lon), c = cam3(p.x, p.y, 0), l = scr(c), sv = { x: WX.sx, y: WX.sy, ang: WX.ang, mx: WX.mx, my: WX.my, z: WX.z };
      wXfLocal(); var w2 = wScr(lat, lon); WX.sx = sv.x; WX.sy = sv.y; WX.ang = sv.ang; WX.mx = sv.mx; WX.my = sv.my; WX.z = sv.z;
      return { local: l, world: { x: w2.x, y: w2.y }, s: cm.s, hc: cm.Hc };
    },
    setZ: function (z) { if (is2D()) view.z2 = z; else view.z3 = z; },
    pick: function (rs, type) { var o = prefs.routeType; prefs.routeType = type; var x = pickRoute(rs); prefs.routeType = o; return x; }
  };
})();
