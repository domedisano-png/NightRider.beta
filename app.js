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
    motorway: [2, 17], trunk: [2, 15], primary: [1, 14], secondary: [1, 12], tertiary: [1, 10],
    unclassified: [0, 7], residential: [0, 6], living_street: [0, 5], service: [0, 3.5],
    motorway_link: [2, 9], trunk_link: [1, 9], primary_link: [1, 9], secondary_link: [1, 8], tertiary_link: [0, 7]
  };
  var HW_RE = '^(' + Object.keys(HW).join('|') + ')$';

  var css = getComputedStyle(document.documentElement);
  function tok(n, d) { var v = css.getPropertyValue(n).trim(); return v || d; }
  var C = {
    bg: tok('--bg', '#07060d'), cyan: tok('--cyan', '#19e3ff'), mag: tok('--magenta', '#ff2e88'),
    yel: tok('--yellow', '#f7e733'), ok: tok('--ok', '#3ddc97'), panel: tok('--panel', '#110c20')
  };
  var ROAD_MINOR = '#271d4d', ROAD_MAJOR = '#4b3a94', ROAD_MOTORWAY = '#6d3fb8';
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
    routeType: 'fast', avoidHighway: false, avoidToll: false,
    carIcon: 'arrow', carColor: '#f7e733',
    voice: true, voiceTurn: true, voiceCam: true, voiceName: '', voiceStyle: 'natural', volume: 0.9,
    cams: true, gloss: true, theme: 'fuchsia', tilt: 0.6, view2d: false,
    lang: detectLang(), persona: 'cyber', voiceAll: false, ttKey: '',
    units: 'km', wake: true, simMult: 3
  };
  var prefs = {};
  function resetPrefs() { for (var k in DEFAULTS) prefs[k] = DEFAULTS[k]; }
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
  }

  /* ---------- Proiezione locale ---------- */
  var ORG = null;
  function setOrigin(lat, lon) { ORG = { lat: lat, lon: lon, kx: 111320 * Math.cos(lat * Math.PI / 180), ky: 110540 }; }
  function toXY(lat, lon) { return { x: (lon - ORG.lon) * ORG.kx, y: -(lat - ORG.lat) * ORG.ky }; }
  function toLL(x, y) { return { lat: ORG.lat - y / ORG.ky, lon: ORG.lon + x / ORG.kx }; }
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
    return { xs: xs, ys: ys, cls: def[0], w: def[1] * 1.25, ms: parseMax(t.maxspeed), minx: minx, maxx: maxx, miny: miny, maxy: maxy };
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
      if (e.type === 'node') { if (t.highway === 'speed_camera' || t.enforcement === 'maxspeed' || t.enforcement === 'average_speed') addCam(e); continue; }
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
    return out;
  }
  var gen = 0, inflight = 0, diag = [], reqN = 0, srvBad = [0, 0];
  var DATA_R = 430, CACHE_TTL = 14 * 24 * 3600 * 1000, CACHE_V = 2;
  var KEEP = ['building', 'height', 'building:levels', 'highway', 'maxspeed', 'area', 'enforcement'];

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
        els.push({ type: 'way', id: synthId++, tags: { highway: hw }, geometry: g2 });
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
    return { els: els, ground: ground };
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
    cell.b = parsed.b; cell.r = parsed.r; cell.g = tl.ground; cell.sr = cell.sb = 'ok';
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
    return '[out:json][timeout:25];(node["highway"="speed_camera"](' + bb + ');node["enforcement"~"^(maxspeed|average_speed)$"](' + bb + ');way["highway"~"' + HW_RE + '"]["maxspeed"](' + bb + '););out geom qt;';
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
    var ll = toLL(x, y), dLat = r / ORG.ky, dLon = r / ORG.kx, tx, ty, i, j;
    var a = tileOf(ll.lat + dLat, ll.lon - dLon), b = tileOf(ll.lat - dLat, ll.lon + dLon);
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
      if (m.type === 'arrive') { man.push({ d: total, type: 'arrive', mod: m.modifier || '', name: dest.name }); continue; }
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
      else if (prefs.routeType === 'simple') { if (r.duration > fastest * 1.35) return; var n = 0; (r.legs || []).forEach(function (l) { n += (l.steps || []).length; }); v = n * 1e6 + r.duration; }
      else v = r.duration;
      if (v < bv) { bv = v; best = r; }
    });
    return best;
  }
  /* Percorsi: si interrogano tutti i server insieme e si sceglie il migliore tra tutte le alternative */
  function getRoute(from, to, headingDeg) {
    var coords = from.lon.toFixed(6) + ',' + from.lat.toFixed(6) + ';' + to.lon.toFixed(6) + ',' + to.lat.toFixed(6);
    var base = '/route/v1/driving/' + coords + '?overview=full&geometries=geojson&steps=true&alternatives=3';
    var ex = []; if (prefs.avoidHighway) ex.push('motorway'); if (prefs.avoidToll) ex.push('toll');
    function one(srv, extra) {
      return fetchJson(srv + base + extra, null, 14000).then(function (j) {
        if (!j || j.code !== 'Ok' || !j.routes || !j.routes.length) { var e = new Error('noroute'); e.fatal = !!(j && j.code === 'NoRoute'); throw e; }
        return j.routes;
      });
    }
    function all(extra) {
      return new Promise(function (resolve, reject) {
        var pending = OSRM.length, routes = [], fatal = 0, firstOk = 0, timer = null, finished = false, lastErr = null;
        function finish() {
          if (finished) return; finished = true; clearTimeout(timer);
          if (routes.length) resolve({ routes: routes }); else { var e = lastErr || new Error('route'); e.fatal = fatal === OSRM.length; reject(e); }
        }
        OSRM.forEach(function (srv) {
          one(srv, extra).then(function (rs) {
            routes = routes.concat(rs);
            if (!firstOk) { firstOk = Date.now(); timer = setTimeout(finish, 1200); }
          }, function (e) { lastErr = e; if (e && e.fatal) fatal++; }).then(function () { if (--pending === 0) finish(); });
        });
      });
    }
    var bear = headingDeg != null ? '&bearings=' + Math.round(headingDeg) + ',60;' : '';
    function attempt(extra) {
      return bear ? all(extra + bear).then(null, function (e) { return all(extra); }) : all(extra);
    }
    var mainP = attempt(ex.length ? '&exclude=' + ex.join(',') : '').then(function (j) { return { data: j, dropped: false }; }, function (e) {
      if (ex.length && !e.fatal) return attempt('').then(function (j) { return { data: j, dropped: true }; });
      throw e;
    });
    var nohwP = ex.indexOf('motorway') >= 0 ? Promise.resolve(null) : attempt('&exclude=motorway').then(function (j) {
      j.routes.forEach(function (r) { r._nohw = true; }); return j.routes;
    }, function () { return null; });
    var ttP = prefs.ttKey ? tomtomRoutes(from, to).catch(function () { return null; }) : Promise.resolve(null);
    return Promise.all([mainP.then(function (r) { return r; }, function (e) { return { err: e }; }), nohwP, ttP]).then(function (a) {
      var res = a[0];
      if (a[2] && a[2].length) return { data: { routes: a[2] }, dropped: false, traffic: true };
      if (res.err) throw res.err;
      if (a[1]) res.data.routes = res.data.routes.concat(a[1]);
      return res;
    });
  }
  /* TomTom (opzionale, con la chiave gratuita dell'utente): percorsi con traffico, convertiti nel formato OSRM */
  var TT_MAN = { DEPART: ['depart', ''], ARRIVE: ['arrive', ''], ARRIVE_LEFT: ['arrive', 'left'], ARRIVE_RIGHT: ['arrive', 'right'], TURN_LEFT: ['turn', 'left'], TURN_RIGHT: ['turn', 'right'], SHARP_LEFT: ['turn', 'sharp left'], SHARP_RIGHT: ['turn', 'sharp right'], BEAR_LEFT: ['turn', 'slight left'], BEAR_RIGHT: ['turn', 'slight right'], KEEP_LEFT: ['fork', 'left'], KEEP_RIGHT: ['fork', 'right'], MAKE_UTURN: ['turn', 'uturn'], ENTER_MOTORWAY: ['on ramp', ''], ENTER_FREEWAY: ['on ramp', ''], TAKE_EXIT: ['off ramp', ''], ROUNDABOUT_CROSS: ['roundabout', 'straight'], ROUNDABOUT_RIGHT: ['roundabout', 'right'], ROUNDABOUT_LEFT: ['roundabout', 'left'], ROUNDABOUT_BACK: ['roundabout', 'uturn'] };
  function tomtomRoutes(from, to) {
    var url = 'https://api.tomtom.com/routing/1/calculateRoute/' + from.lat.toFixed(6) + ',' + from.lon.toFixed(6) + ':' + to.lat.toFixed(6) + ',' + to.lon.toFixed(6) +
      '/json?key=' + encodeURIComponent(prefs.ttKey) + '&traffic=true&maxAlternatives=2&instructionsType=coded&travelMode=car&routeType=fastest&computeTravelTimeFor=all';
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
  function sameGeom(a, b) {
    if (Math.abs(a.distance - b.distance) / Math.max(a.distance, 1) > 0.05) return false;
    var A = a.geometry.coordinates, B = b.geometry.coordinates, k = 24, hit = 0, i, j;
    for (i = 0; i < k; i++) {
      var p = A[Math.floor(i * (A.length - 1) / (k - 1))], best = 1e9, c = Math.cos(p[1] * Math.PI / 180);
      for (j = 0; j < B.length; j++) {
        var dx = (B[j][0] - p[0]) * c * 111320, dy = (B[j][1] - p[1]) * 111320, d = dx * dx + dy * dy;
        if (d < best) best = d;
      }
      if (best < 3600) hit++;
    }
    return hit / k >= 0.88;
  }
  function makeAlts(routes, dest) {
    var sorted = routes.slice().sort(function (a, b) { return a.duration - b.duration; }), uniq = [];
    sorted.forEach(function (r) {
      for (var i = 0; i < uniq.length; i++) if (sameGeom(r, uniq[i])) { return; }
      uniq.push(r);
    });
    var fastest = uniq[0], shortest = uniq[0], simple = uniq[0], nohw = null;
    uniq.forEach(function (r) {
      if (r.distance < shortest.distance) shortest = r;
      if (r.duration <= fastest.duration * 1.6 && (nSteps(r) < nSteps(simple) || (nSteps(r) === nSteps(simple) && r.duration < simple.duration))) simple = r;
      if (r._nohw && !nohw) nohw = r;
    });
    var order = prefs.routeType === 'short' ? [shortest, fastest, simple, nohw] : prefs.routeType === 'simple' ? [simple, fastest, shortest, nohw] : [fastest, shortest, simple, nohw];
    var pick = [];
    order.concat(uniq).forEach(function (r) {
      if (!r || pick.length >= 3 || pick.indexOf(r) >= 0) return;
      if (r !== fastest && r.duration > fastest.duration * 2) return;
      pick.push(r);
    });
    var lead = prefs.routeType === 'short' ? shortest : prefs.routeType === 'simple' ? simple : fastest;
    var colors = ['#19e3ff', '#ff2bd6', '#ffd23f'], used = {};
    return pick.map(function (r, i) {
      var key = 'altOther';
      if (r === lead) key = prefs.routeType === 'short' ? 'altShort' : prefs.routeType === 'simple' ? 'altSimple' : 'altFast';
      else if (r === fastest) key = 'altFast';
      else if (r === shortest) key = 'altShort';
      else if (r === simple) key = 'altSimple';
      else if (r._nohw) key = 'altNoHw';
      if (used[key]) key = r._nohw ? 'altNoHw' : 'altOther';
      used[key] = 1;
      var rt = buildRoute(r, dest);
      rt.turns = nSteps(r); rt.delay = r._delay || 0;
      return { rt: rt, key: key, color: colors[i % 3], fastDur: fastest.duration };
    });
  }
  var alts = { list: [], sel: 0 };
  function renderAlts() {
    var box = $('alts'); if (!box) return;
    box.innerHTML = '';
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
    alts.sel = i; setRoute(alts.list[i].rt); showMeta(); routeCams(route); renderAlts();
  }
  function showMeta() {
    $('pvTitle').textContent = route.dest.name;
    $('pvMeta').textContent = fmtDur(route.dur) + ' · ' + fmtDist(route.dist) + ' · ' + t('lArr') + ' ' + clockAfter(route.dur);
  }
  function routeCams(rt) {
    if (rt._camsReq) return Promise.resolve();
    rt._camsReq = true;
    var DL = 0.3, DN = 0.4, cellsSet = {}, list = [], step = Math.max(1, Math.floor(rt.pts.length / 400)), i;
    for (i = 0; i < rt.pts.length; i += step) {
      var ll = toLL(rt.pts[i].x, rt.pts[i].y), ci = Math.floor(ll.lon / DN), cj = Math.floor(ll.lat / DL), key = ci + ',' + cj;
      if (!cellsSet[key]) { cellsSet[key] = 1; list.push([ci, cj]); }
    }
    list = list.slice(0, 10);
    var pad = 0.002, idx = 0;
    function worker() {
      if (idx >= list.length) return Promise.resolve();
      var c = list[idx++], bb = bboxStr(c[1] * DL - pad, c[0] * DN - pad, (c[1] + 1) * DL + pad, (c[0] + 1) * DN + pad);
      var q = '[out:json][timeout:25];(node["highway"="speed_camera"](' + bb + ');node["enforcement"~"^(maxspeed|average_speed)$"](' + bb + '););out body;';
      return overpass(q, 'autovelox').then(function (j) { parseOsm(j); attachCams(rt); }, function () {}).then(worker);
    }
    return Promise.all([worker(), worker()]).then(function () { attachCams(rt); renderAlts(); });
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
  var gps = null, gpsErr = '', here = null, demoPos = false;
  var car = { x: 0, y: 0, has: false }, tgt = { x: 0, y: 0 }, phi = -Math.PI / 2, phiT = -Math.PI / 2;
  var speedMs = 0, lastFix = null, lastSave = 0;
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
        if (pr.dist < 30) { tgt.x = pa.x; tgt.y = pa.y; snapped = true; }
        phiT = Math.atan2(pa.hy, pa.hx);
      } else if (!sim.active) {
        if (!offSince) offSince = now;
        if (now - offSince > 4000 && now - lastReroute > 12000) reroute();
      }
      if (route.total - prog.d < 25) arrive();
    }
    if (!snapped) { tgt.x = p.x; tgt.y = p.y; }
    if (hd != null && (speedMs > 1.2 || f.sim) && !(snapped && route)) phiT = bearingToPhi(hd);
    if (!car.has) { car.x = tgt.x; car.y = tgt.y; car.has = true; phi = phiT; }
    if (!f.sim && now - lastSave > 10000) { lastSave = now; try { localStorage.setItem(LAST_KEY, JSON.stringify({ lat: f.lat, lon: f.lon })); } catch (e) {} }
  }

  /* ---------- GPS ---------- */
  function onFix(p) {
    var c = p.coords;
    gps = { lat: c.latitude, lon: c.longitude, acc: c.accuracy, t: p.timestamp };
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
  function resetData() { gen++; cells = {}; cellList = []; queue = []; SEEN = {}; CAMS = {}; camList = []; limWays = []; xcells = {}; xqueue = []; myAdded = false; }

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
  }
  function movingHeading() {
    if (speedMs < 2.5 || sim.active) return null;
    return ((Math.atan2(Math.cos(phiT), -Math.sin(phiT)) * 180 / Math.PI) % 360 + 360) % 360;
  }
  function chooseDest(r) {
    if (!here) { toast(t('needPos')); $('demoBtn').hidden = false; return; }
    var dest = { name: r.name, sub: r.sub, lat: r.lat, lon: r.lon };
    results.innerHTML = ''; $('q').value = r.name;
    showResMsg(t('calcRoute'));
    getRoute(here, dest, movingHeading()).then(function (res) {
      alts = { list: makeAlts(res.data.routes, dest), sel: 0 };
      setRoute(alts.list[0].rt);
      $('pvNote').textContent = (res.dropped ? t('dropped') : '') + (res.traffic ? t('withTraffic') : t('noTraffic'));
      showPreview();
      routeCams(route);
    }, function (e) {
      showResMsg(e && e.fatal ? t('noRoute') : t('srvDown'));
    });
  }
  function setRoute(rt) {
    route = rt; prog = { d: 0, idx: 0, dist: 0 }; spoken = {}; offSince = 0;
    attachCams(rt);
  }
  function showPreview() {
    showMeta();
    setState('preview');
    renderAlts();
    fitRoute();
    ensureData();
  }
  function startNav(simMode) {
    if (!route) return;
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
    route = null; prog = { d: 0, idx: 0, dist: 0 };
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
        els.tstreet.textContent = man.type === 'arrive' ? route.dest.name : (man.name ? t('onSt', man.name) : ds.text.charAt(0).toUpperCase() + ds.text.slice(1));
        els.voice.textContent = leadText(man, m, false) + ds.text + '.';
        els.tdist.textContent = fmtDist(m);
      }
      var rem = Math.max(0, route.total - prog.d), sec = route.dur * (rem / Math.max(1, route.total));
      setRow(1, t('lArr'), state === 'arrived' ? '--:--' : clockAfter(sec), 'arr');
      setRow(2, t('lLeft'), state === 'arrived' ? '0 ' + t('min') : fmtDur(sec));
      setRow(3, t('lDist'), fmtDist(rem));
      cam = state === 'nav' ? camAhead() : null;
    } else {
      setRow(1, t('lGps'), gpsText);
      setRow(2, t('lMap'), dataStatus());
      setRow(3, '', '');
      els.gpsLine.textContent = gps || sim.active ? t('gpsFound', gpsText) : demoPos ? t('gpsUsingExample') : gpsErr === 'denied' ? t('gpsDenied') : gpsErr === 'nosupport' ? t('gpsNoSupport') : t('gpsWaitLine');
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
    if (['fast', 'short', 'simple'].indexOf(prefs.routeType) < 0) prefs.routeType = 'fast';
    if (!THEMES[prefs.theme]) prefs.theme = 'fuchsia';
    if (!SHAPES[prefs.carIcon]) prefs.carIcon = 'arrow';
    if (!VSTYLES[prefs.voiceStyle]) prefs.voiceStyle = 'natural';
    if ([1, 3, 6].indexOf(prefs.simMult) < 0) prefs.simMult = 3;
    prefs.tilt = Math.min(1.25, Math.max(0.35, Number(prefs.tilt) || 0.6));
    prefs.volume = Math.min(1, Math.max(0, Number(prefs.volume)));
    if (prefs.units !== 'km' && prefs.units !== 'mi') prefs.units = 'km';
    if (['it', 'en', 'es', 'fr', 'de'].indexOf(prefs.lang) < 0) prefs.lang = 'en';
    if (NRL.personas.indexOf(prefs.persona) < 0) prefs.persona = 'cyber';
    prefs.ttKey = String(prefs.ttKey || '').replace(/[^A-Za-z0-9_\-]/g, '').slice(0, 80);
  }
  function applyPrefs() {
    sanitize();
    TH = THEMES[prefs.theme] || THEMES.fuchsia; buildWalls();
    PITCH = prefs.tilt;
    syncUI(); if (typeof syncMode === 'function') syncMode();
    $('ttKey').value = prefs.ttKey; langSel.value = prefs.lang; personaSel.value = prefs.persona;
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
  $('ttKey').addEventListener('change', function () { prefs.ttKey = $('ttKey').value.trim(); sanitize(); savePrefs(); $('ttKey').value = prefs.ttKey; });

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
  $('cancelBtn').addEventListener('click', function () { route = null; alts = { list: [], sel: 0 }; setState('idle'); renderAlts(); });
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
  var cm = { Bk: 60, F: 500, cx: 0, cy: 0, cosT: 1, sinT: 0, fx: 1, fy: 0, rx: 0, ry: 1, Hc: HC, T: 0.6, R: VIEW };
  var fc = { x: 0, y: 0 };                                   // punto guardato dalla camera
  var view = { free: false, fx: 0, fy: 0, rot: 0, z3: 1, z2: 1, last: 0 };   // esplorazione con le dita
  var ZMIN3 = 0.4, ZMAX3 = 7, ZMIN2 = 0.12, ZMAX2 = 14;
  function is2D() { return !!prefs.view2d; }
  function setZoom(z) {
    if (world.on) {
      world.z = Math.min(WZMAX, Math.max(WZMIN, Math.log(WK / z) / Math.LN2));
      if (world.z > world.exitZ) { if (nearOrg()) exitWorld(false); else world.z = Math.min(world.z, WZMAX); }
      return;
    }
    if (is2D()) { if (z > ZMAX2 && ORG && car.has) { enterWorld(); return; } view.z2 = Math.min(ZMAX2, Math.max(ZMIN2, z)); }
    else { if (z > ZMAX3 && ORG && car.has) { enterWorld(); return; } view.z3 = Math.min(ZMAX3, Math.max(ZMIN3, z)); }
  }
  function curZoom() { return world.on ? WK / Math.pow(2, world.z) : is2D() ? view.z2 : view.z3; }
  function setupCamera() {
    var d2 = is2D();
    cm.Hc = d2 ? HC * 6 * view.z2 : HC * view.z3;
    cm.T = d2 ? Math.PI / 2 : PITCH;
    cm.cosT = Math.cos(cm.T); cm.sinT = Math.sin(cm.T);
    var cp = view.free ? view.rot : phi;
    cm.fx = Math.cos(cp); cm.fy = Math.sin(cp); cm.rx = -cm.fy; cm.ry = cm.fx;
    fc.x = view.free ? view.fx : car.x; fc.y = view.free ? view.fy : car.y;
    cm.F = Math.min(W * 1.25, H * 1.05);
    var off = (H * 0.68 - cm.cy) / cm.F;
    cm.Bk = d2 ? -off * cm.Hc : cm.Hc / Math.tan(cm.T + Math.atan(off));
    cm.R = d2 ? Math.hypot(W, H) / cm.F * cm.Hc * 0.7 : VIEW * view.z3;
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

  var SHAPES = {
    arrow: [{ p: [[0, 26], [14, -14], [0, -6], [-14, -14]], z: 8, c: 'car' }],
    car: [
      { p: [[-8, 26], [8, 26], [11, 20], [11, -18], [8, -24], [-8, -24], [-11, -18], [-11, 20]], z: 7, c: 'car' },
      { p: [[-7, 9], [7, 9], [7, -12], [-7, -12]], z: 10, c: 'rgba(7,6,13,0.6)' },
      { p: [[-9, 25], [-4, 25], [-4, 22], [-9, 22]], z: 8, c: '#ffffff' },
      { p: [[4, 25], [9, 25], [9, 22], [4, 22]], z: 8, c: '#ffffff' }
    ],
    moto: [
      { p: [[-4, 28], [4, 28], [4, -24], [-4, -24]], z: 7, c: 'car' },
      { p: [[-12, 15], [12, 15], [12, 11], [-12, 11]], z: 9, c: 'car' },
      { p: [[-3, 4], [3, 4], [3, -8], [-3, -8]], z: 10, c: 'rgba(7,6,13,0.6)' }
    ]
  };
  function shapePts(pts, z) {
    return pts.map(function (p) {
      var vs = CAR_SC * Math.max(1, cm.Hc / (is2D() ? 520 : HC * 1.5)), vx = Math.cos(phi), vy = Math.sin(phi);
      return [car.x + (p[0] * -vy + p[1] * vx) * vs, car.y + (p[0] * vx + p[1] * vy) * vs, z * vs];
    });
  }
  function drawVehicle() {
    var layers = SHAPES[prefs.carIcon] || SHAPES.arrow, k;
    fillPoly(shapePts(layers[0].p, 0), 'rgba(0,0,0,0.55)');
    ctx.save(); ctx.shadowColor = prefs.carColor; ctx.shadowBlur = 22;
    ctx.beginPath();
    if (addPoly(shapePts(layers[0].p, layers[0].z))) { ctx.fillStyle = prefs.carColor; ctx.fill(); }
    ctx.restore();
    for (k = 1; k < layers.length; k++) fillPoly(shapePts(layers[k].p, layers[k].z), layers[k].c === 'car' ? prefs.carColor : layers[k].c);
    ctx.beginPath();
    if (addPoly(shapePts(layers[0].p, layers[0].z))) { ctx.lineWidth = 1.5; ctx.strokeStyle = C.bg; ctx.stroke(); }
  }

  function drawBuilding(b, near) {
    var n = b.n, h = b.h, k, i;
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
    if (world.on) { drawWorld(t); overlays(side, t); return; }
    var d2 = is2D(), zf = d2 ? 1 : view.z3, R = cm.R, i, j, k, c, x, y;

    // terreno: colore di base e zone (parchi, campagna, industria, acqua)
    ctx.beginPath(); pathXY([fc.x - R * 1.7, fc.x + R * 1.7, fc.x + R * 1.7, fc.x - R * 1.7], [fc.y - R * 1.7, fc.y - R * 1.7, fc.y + R * 1.7, fc.y + R * 1.7]);
    ctx.fillStyle = GROUND_BASE; ctx.fill();
    drawGround(R);

    // strade per classe
    var vis = [[], [], []], V2 = R + 80 * Math.max(1, zf), wk = Math.max(1, cm.Hc / (d2 ? 650 : 420));
    for (c = 0; c < cellList.length; c++) {
      var rs = cellList[c].r;
      for (k = 0; k < rs.length; k++) {
        var rd = rs[k];
        if (rd.maxx < fc.x - V2 || rd.minx > fc.x + V2 || rd.maxy < fc.y - V2 || rd.miny > fc.y + V2) continue;
        vis[rd.cls].push(rd);
      }
    }
    var colors = [ROAD_MINOR, ROAD_MAJOR, ROAD_MOTORWAY];
    for (var cl = 0; cl < 3; cl++) {
      if (cl === 0 && wk > 6) continue;           // da molto lontano le stradine sono solo rumore
      if (cl > 0) {                               // contorno scuro: stacca le vie principali dallo sfondo
        ctx.beginPath();
        for (k = 0; k < vis[cl].length; k++) {
          var rc = vis[cl][k];
          for (i = 0; i < rc.xs.length - 1; i++) {
            if (Math.abs(rc.xs[i] - fc.x) > V2 && Math.abs(rc.ys[i] - fc.y) > V2) continue;
            addPoly(seg(rc.xs[i], rc.ys[i], rc.xs[i + 1], rc.ys[i + 1], rc.w * wk * 1.4, 0));
          }
        }
        ctx.fillStyle = 'rgba(8,4,22,0.85)'; ctx.fill();
      }
      ctx.beginPath();
      for (k = 0; k < vis[cl].length; k++) {
        var r = vis[cl][k];
        for (i = 0; i < r.xs.length - 1; i++) {
          if (Math.abs(r.xs[i] - fc.x) > V2 && Math.abs(r.ys[i] - fc.y) > V2) continue;
          addPoly(seg(r.xs[i], r.ys[i], r.xs[i + 1], r.ys[i + 1], r.w * wk, 0));
        }
      }
      ctx.fillStyle = colors[cl];
      if (cl === 2) { ctx.save(); ctx.shadowColor = '#b04bff'; ctx.shadowBlur = 10; ctx.fill(); ctx.restore(); } else ctx.fill();
    }
    ctx.beginPath();
    for (cl = 1; cl < 3; cl++) for (k = 0; k < vis[cl].length; k++) {
      var r2 = vis[cl][k];
      for (i = 0; i < r2.xs.length - 1; i++) {
        if (Math.abs(r2.xs[i] - fc.x) > R && Math.abs(r2.ys[i] - fc.y) > R) continue;
        addPoly(seg(r2.xs[i], r2.ys[i], r2.xs[i + 1], r2.ys[i + 1], 0.9 * wk, 0));
      }
    }
    ctx.globalAlpha = 0.38; ctx.fillStyle = C.yel; ctx.fill(); ctx.globalAlpha = 1;

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
    drawVehicle();
    overlays(side, t);
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
      ctx.save(); ctx.globalAlpha = 0.65; ctx.fillStyle = a.color; ctx.shadowColor = a.color; ctx.shadowBlur = 8; ctx.fill(); ctx.restore();
    });
  }
  function drawRoute() {
    drawAlts();
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
    var d2o = is2D(), gf = ctx.createLinearGradient(0, 0, 0, H * 0.5);
    gf.addColorStop(0, bgA(d2o ? 0.7 : 0.92)); gf.addColorStop(0.3, bgA(d2o ? 0.3 : 0.62));
    gf.addColorStop(0.62, d2o ? bgA(0.05) : 'rgba(62,8,74,0.22)'); gf.addColorStop(1, bgA(0));
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
  var world = { on: false, mx: 0.5, my: 0.5, z: 12, exitZ: 14, rot: 0 };
  var WK = 1e6, WZMIN = 1.8, WZ_GLOBE = 3.3, WZMAX = 17.5, WS = 384;
  var W_LAND = '#150f2e', W_WATER = '#071433', W_SEA = '#050a1c';
  var W_LC = { wood: '#10253d', grass: '#122a44', farmland: '#191a3f', sand: '#2b2350', ice: '#2c3560', wetland: '#112f4a', rock: '#1f1a3c' };
  var W_LU = { residential: '#231a4a', industrial: '#2b1c40', commercial: '#2d1a49', cemetery: '#122a44', park: '#122a44' };
  var W_ROAD = { motorway: ['#b04bff', 1.7, 4], trunk: ['#8d49e0', 1.4, 4], primary: ['#6d3fb8', 1.2, 6], secondary: ['#4f3a99', 1.0, 8], tertiary: ['#3b2e78', 0.9, 10], minor: ['#2d2360', 0.7, 12], service: ['#251c52', 0.5, 14] };
  var wTiles = {}, wCount = 0, wInfl = 0, wWant = [], wFrame = 0;
  var wTex = null, wTexCtx = null, wTexData = null, wTexDirty = false, wTexT = 0, wTexVer = 0;
  function mxOf(lon) { return (lon + 180) / 360; }
  function myOf(lat) { var r = Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2; }
  function lonOfMx(mx) { return mx * 360 - 180; }
  function latOfMy(my) { return Math.atan(Math.sinh(Math.PI * (1 - 2 * my))) * 180 / Math.PI; }
  function wzOfLocal(lat, z2) { return Math.log(156543.03 * Math.cos(lat * Math.PI / 180) / (HC * 6 * z2 / cm.F)) / Math.LN2; }
  function nearOrg() { var ll = { lat: latOfMy(world.my), lon: lonOfMx(world.mx) }; return Math.abs(ll.lat - ORG.lat) < 0.9 && Math.abs(ll.lon - ORG.lon) < 1.3; }
  function enterWorld() {
    var ll = toLL(fc.x, fc.y);
    world.mx = mxOf(ll.lon); world.my = myOf(ll.lat);
    world.z = wzOfLocal(ll.lat, ZMAX2) - 0.01; world.exitZ = wzOfLocal(ll.lat, ZMAX2 * 0.8);
    world.rot = Math.atan2(cm.fy, cm.fx); world.on = true; rcBtn.hidden = false;
  }
  function exitWorld(follow) {
    world.on = false;
    if (follow) { view.free = false; rcBtn.hidden = true; }
    else {
      var p = toXY(latOfMy(world.my), lonOfMx(world.mx));
      view.free = true; view.fx = p.x; view.fy = p.y; view.rot = world.rot; rcBtn.hidden = false;
    }
    if (is2D()) view.z2 = ZMAX2 * 0.8; else view.z3 = ZMAX3 * 0.8;
    ensureData();
  }
  function worldPan(dx, dy) {
    var s = 256 * Math.pow(2, world.z);
    world.mx = ((world.mx - dx / s) % 1 + 1) % 1;
    world.my = Math.max(0.01, Math.min(0.99, world.my - dy / s));
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
  function wRender(e, buf) {
    var cv2 = document.createElement('canvas'); cv2.width = cv2.height = WS;
    var g = cv2.getContext('2d'), z = e.z, places = [];
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
      ['service', 'minor', 'tertiary', 'secondary', 'primary', 'trunk', 'motorway'].forEach(function (cl) {
        if (!byc[cl]) return;
        g.beginPath();
        for (var q = 0; q < byc[cl].length; q++) path(TR, byc[cl][q], false);
        g.strokeStyle = W_ROAD[cl][0]; g.lineWidth = W_ROAD[cl][1] * (0.8 + Math.max(0, z - 6) * 0.12); g.lineJoin = 'round'; g.stroke();
      });
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
    if (world.z < WZ_GLOBE) {
      var R = 256 * Math.pow(2, world.z) / (2 * Math.PI), p0 = latOfMy(world.my) * Math.PI / 180, l0 = lonOfMx(world.mx) * Math.PI / 180;
      var p = lat * Math.PI / 180, dl = lon * Math.PI / 180 - l0, cc = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(dl);
      return { x: cm.cx + R * Math.cos(p) * Math.sin(dl), y: H * 0.5 - R * (Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(dl)), vis: cc > 0 };
    }
    var wp = 256 * Math.pow(2, world.z), dx = mxOf(lon) - world.mx;
    dx -= Math.round(dx);
    return { x: cm.cx + dx * wp, y: H * 0.5 + (myOf(lat) - world.my) * wp, vis: true };
  }
  function drawWorldFlat(alpha) {
    var Zt = Math.max(0, Math.min(14, Math.round(world.z))), wp = 256 * Math.pow(2, world.z), sc = wp / Math.pow(2, Zt);
    var cxp = world.mx * wp, cyp = world.my * wp, cx = cm.cx, cy = H * 0.5;
    var tx0 = Math.floor((cxp - cx) / sc), tx1 = Math.floor((cxp + (W - cx)) / sc), ty0 = Math.floor((cyp - cy) / sc), ty1 = Math.floor((cyp + (H - cy)) / sc);
    var tx, ty, k, labels = [];
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.fillStyle = W_SEA; ctx.fillRect(0, 0, W, H);
    for (ty = ty0; ty <= ty1; ty++) for (tx = tx0; tx <= tx1; tx++) {
      var e = wTile(Zt, tx, ty); if (!e) continue;
      var sx = cx + tx * sc - cxp, sy = cy + ty * sc - cyp;
      if (e.st === 2) {
        ctx.drawImage(e.cv, Math.floor(sx), Math.floor(sy), Math.ceil(sc) + 1, Math.ceil(sc) + 1);
        for (k = 0; k < e.pl.length; k++) labels.push({ p: e.pl[k], x: sx + e.pl[k].x * sc, y: sy + e.pl[k].y * sc });
      } else {
        var n = Math.pow(2, Zt), txw = ((tx % n) + n) % n;
        for (k = 1; k <= Zt; k++) {
          var pe = wPeek(Zt - k, txw >> k, ty >> k);
          if (pe) {
            var ss = WS / Math.pow(2, k), sub = Math.pow(2, k);
            ctx.drawImage(pe.cv, (txw % sub) * ss, (ty % sub) * ss, ss, ss, Math.floor(sx), Math.floor(sy), Math.ceil(sc) + 1, Math.ceil(sc) + 1);
            break;
          }
        }
      }
    }
    ctx.restore();
    if (alpha > 0.6) drawPlaces(labels);
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
  function drawWorldMarks(t) {
    var i, ll = toLL(car.x, car.y), me = wScr(ll.lat, ll.lon);
    if (route) {
      ctx.beginPath();
      var step = Math.max(1, Math.floor(route.pts.length / 300)), started = false;
      for (i = 0; i < route.pts.length; i += step) {
        var q = toLL(route.pts[i].x, route.pts[i].y), s = wScr(q.lat, q.lon);
        if (!s.vis) { started = false; continue; }
        if (started) ctx.lineTo(s.x, s.y); else { ctx.moveTo(s.x, s.y); started = true; }
      }
      ctx.lineWidth = 3; ctx.strokeStyle = C.cyan; ctx.shadowColor = C.cyan; ctx.shadowBlur = 10; ctx.lineCap = 'round'; ctx.stroke(); ctx.shadowBlur = 0;
      var d = wScr(route.dest.lat, route.dest.lon);
      if (d.vis) { ctx.beginPath(); ctx.moveTo(d.x, d.y - 9); ctx.lineTo(d.x + 7, d.y); ctx.lineTo(d.x, d.y + 9); ctx.lineTo(d.x - 7, d.y); ctx.closePath(); ctx.fillStyle = C.bg; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = C.yel; ctx.stroke(); }
    }
    if (me.vis) {
      var ph = ((t / 1000) % 1.6) / 1.6;
      ctx.beginPath(); ctx.arc(me.x, me.y, 7 + ph * 22, 0, 6.2832); ctx.strokeStyle = 'rgba(255,46,136,' + (0.75 * (1 - ph)) + ')'; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(me.x, me.y, 6, 0, 6.2832); ctx.fillStyle = prefs.carColor || C.mag; ctx.shadowColor = prefs.carColor || C.mag; ctx.shadowBlur = 14; ctx.fill(); ctx.shadowBlur = 0;
      ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
    }
  }
  function drawWorld(t) {
    wFrame++; wWant.length = 0;
    var gA = world.z < WZ_GLOBE + 0.45 ? Math.min(1, (WZ_GLOBE + 0.45 - world.z) / 0.5) : 0;
    if (gA < 1) drawWorldFlat(1);
    if (gA > 0) drawGlobe(gA);
    drawWorldMarks(t);
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
  function recenter() {
    if (world.on) { exitWorld(true); return; }
    view.free = false; rcBtn.hidden = true; ensureData();
  }
  function fitRoute() {
    if (!route || !ORG) return;
    var b = route.bbox, a = toXY(b[0], b[1]), c2 = toXY(b[2], b[3]);
    var mx = (a.x + c2.x) / 2, my = (a.y + c2.y) / 2, w = Math.abs(c2.x - a.x), h = Math.abs(c2.y - a.y);
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
  cv.addEventListener('pointerdown', function (e) {
    if (!ORG || !car.has) return;
    try { cv.setPointerCapture(e.pointerId); } catch (x) {}
    ptrs[e.pointerId] = pos(e); startGesture(); touch();
  });
  cv.addEventListener('pointermove', function (e) {
    if (!ptrs[e.pointerId] || !gest) return;
    ptrs[e.pointerId] = pos(e); touch();
    var ids = Object.keys(ptrs);
    if (world.on) {
      if (gest.t === 'pan' && ids.length === 1) {
        var pw = ptrs[ids[0]];
        if (!gest.on) { if (Math.hypot(pw.x - gest.x0, pw.y - gest.y0) < 7) return; gest.on = true; gest.px = gest.x0; gest.py = gest.y0; }
        worldPan(pw.x - gest.px, pw.y - gest.py); gest.px = pw.x; gest.py = pw.y;
      } else if (gest.t === 'pinch' && ids.length >= 2) {
        var qa = ptrs[ids[0]], qb = ptrs[ids[1]], qd = Math.hypot(qa.x - qb.x, qa.y - qb.y) || 1;
        setZoom(gest.z0 * gest.d0 / qd);
        if (!world.on) { gest.w = false; gest.z0 = curZoom(); gest.d0 = qd; }
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
      if (!gest.g0) gest.g0 = groundAt(mid.x, mid.y);
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
    delete ptrs[e.pointerId];
    try { cv.releasePointerCapture(e.pointerId); } catch (x) {}
    startGesture();
  }
  cv.addEventListener('pointerup', endPtr);
  cv.addEventListener('pointercancel', endPtr);
  cv.addEventListener('wheel', function (e) {
    if (!ORG || !car.has) return;
    e.preventDefault(); touch();
    var f = Math.exp(e.deltaY * 0.0015);
    if (world.on) { setZoom(curZoom() * f); return; }
    if (view.free) {
      var p = pos(e), g0 = groundAt(p.x, p.y);
      setZoom(curZoom() * f); setupCamera();
      var g1 = groundAt(p.x, p.y);
      if (g0 && g1) { view.fx += g0.x - g1.x; view.fy += g0.y - g1.y; }
    } else setZoom(curZoom() * f);
  }, { passive: false });
  $('zoomIn').addEventListener('click', function () { setZoom(curZoom() / 1.4); touch(); });
  $('zoomOut').addEventListener('click', function () { setZoom(curZoom() * 1.4); touch(); });
  rcBtn.addEventListener('click', recenter);
  modeBtn.addEventListener('click', function () { prefs.view2d = !prefs.view2d; savePrefs(); applyPrefs(); touch(); });
  function syncMode() { modeBtn.textContent = prefs.view2d ? '2D' : '3D'; modeBtn.setAttribute('aria-label', prefs.view2d ? t('to3d') : t('to2d')); }

  /* ---------- Ciclo principale ---------- */
  var last = performance.now(), hudT = 0, dataT = 0, limT = 0;
  function frame(now) {
    var dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (car.has) {
      var dx = tgt.x - car.x, dy = tgt.y - car.y;
      if (dx * dx + dy * dy > 80 * 80) { car.x = tgt.x; car.y = tgt.y; }
      else { var kk = Math.min(1, dt * 6); car.x += dx * kk; car.y += dy * kk; }
      var diff = ((phiT - phi + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      phi += diff * Math.min(1, dt * 4);
    }
    if ((view.free || world.on) && state === 'nav' && !Object.keys(ptrs).length && Date.now() - view.last > 15000) recenter();
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
    info: function () { return { state: state, gps: gps, here: here, route: route && { total: route.total, man: route.man.length, cams: route.cams.length }, prog: prog, cells: cellList.length, cams: camList.length, speed: speedMs, limit: limitNow, maxB: maxB, free: view.free, world: { on: world.on, z: world.z, mx: world.mx, my: world.my }, z3: view.z3, z2: view.z2, d2: is2D(), car: { x: car.x, y: car.y }, trail: route ? (function () { var pr = projectOnRoute(route, car.x, car.y, prog.idx, false); return { d: pr.d, dist: pr.dist }; })() : null }; },
    pick: function (rs, type) { var o = prefs.routeType; prefs.routeType = type; var x = pickRoute(rs); prefs.routeType = o; return x; }
  };
})();
