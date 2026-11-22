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
  var OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  var OSRM = ['https://router.project-osrm.org', 'https://routing.openstreetmap.de/routed-car'];
  var PHOTON = 'https://photon.komoot.io/api/';
  var NOMINATIM = 'https://nominatim.openstreetmap.org/search';
  var DEMO = { lat: 45.4642, lon: 9.19 };      // Milano, Duomo
  var STORE_KEY = 'nightrider.app.prefs';
  var LAST_KEY = 'nightrider.app.last';
  var HW = {
    motorway: [2, 14], trunk: [2, 13], primary: [1, 12], secondary: [1, 11], tertiary: [1, 10],
    unclassified: [0, 8], residential: [0, 8], living_street: [0, 6], service: [0, 5],
    motorway_link: [2, 8], trunk_link: [1, 8], primary_link: [1, 8], secondary_link: [1, 8], tertiary_link: [0, 8]
  };
  var HW_RE = '^(' + Object.keys(HW).join('|') + ')$';

  var css = getComputedStyle(document.documentElement);
  function tok(n, d) { var v = css.getPropertyValue(n).trim(); return v || d; }
  var C = {
    bg: tok('--bg', '#07060d'), cyan: tok('--cyan', '#19e3ff'), mag: tok('--magenta', '#ff2e88'),
    yel: tok('--yellow', '#f7e733'), ok: tok('--ok', '#3ddc97'), panel: tok('--panel', '#110c20')
  };
  var ROAD_MINOR = '#2a2050', ROAD_MAJOR = '#3a2c6e', ROAD_MOTORWAY = '#473582';
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
  var DEFAULTS = {
    routeType: 'fast', avoidHighway: false, avoidToll: false,
    carIcon: 'arrow', carColor: '#f7e733',
    voice: true, voiceTurn: true, voiceCam: true, voiceName: '', voiceStyle: 'natural', volume: 0.9,
    cams: true, gloss: true, theme: 'fuchsia', tilt: 0.6,
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
      if (mi >= 0.2) return mi.toFixed(1).replace('.', ',') + ' mi';
      var ft = m * 3.28084;
      return ft < 25 ? '0 ft' : Math.max(50, Math.round(ft / 50) * 50) + ' ft';
    }
    if (m >= 995) return (m / 1000).toFixed(1).replace('.', ',') + ' km';
    return m < 5 ? '0 m' : Math.max(10, Math.round(m / 10) * 10) + ' m';
  }
  function spokenDist(m) {
    if (prefs.units === 'mi') {
      var mi = m / 1609.34;
      if (mi >= 0.2) return mi.toFixed(1).replace('.', ',') + ' miglia';
      return Math.max(50, Math.round(m * 3.28084 / 50) * 50) + ' piedi';
    }
    if (m >= 975) { var kmTxt = (m / 1000).toFixed(1); return kmTxt === '1.0' ? 'un chilometro' : kmTxt.replace('.', ',') + ' chilometri'; }
    return Math.max(50, Math.round(m / 50) * 50) + ' metri';
  }
  function fmtDur(s) {
    var m = Math.max(1, Math.round(s / 60));
    if (m < 60) return m + ' min';
    var h = Math.floor(m / 60);
    return h + ' h ' + (m % 60 < 10 ? '0' : '') + (m % 60) + ' min';
  }
  function clockAfter(s) { return new Date(Date.now() + s * 1000).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }); }

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
    var v = voices.filter(function (x) { return x.name === prefs.voiceName; })[0] || bestVoice();
    info.textContent = v ? 'Voce in uso: ' + v.name + (isNatural(v) ? ' (naturale).' : '.') : 'Nessuna voce italiana trovata: uso quella predefinita del dispositivo.';
  }
  function fillVoices() {
    if (!synth) return;
    try {
      var all = synth.getVoices() || [];
      voices = all.filter(function (v) { return /^it/i.test(v.lang); });
      voices.sort(function (a, b) { return voiceScore(b) - voiceScore(a); });
    } catch (e) { voices = []; }
    voiceSel.innerHTML = '';
    var o = document.createElement('option'); o.value = ''; o.textContent = 'Automatica (la migliore disponibile)'; voiceSel.appendChild(o);
    voices.forEach(function (v) {
      var op = document.createElement('option'); op.value = v.name; op.textContent = v.name + (isNatural(v) ? ' · naturale' : ''); voiceSel.appendChild(op);
    });
    voiceSel.value = prefs.voiceName;
    if (voiceSel.value !== prefs.voiceName) voiceSel.value = '';
    updateVoiceInfo();
  }
  if (synth) {
    fillVoices();
    if (synth.addEventListener) synth.addEventListener('voiceschanged', fillVoices);
  } else {
    $('voiceNote').hidden = false; voiceSel.disabled = true; $('vol').disabled = true; $('testVoice').disabled = true;
  }
  function speak(text, force) {
    if (!synth || (!prefs.voice && !force)) return;
    try {
      synth.cancel();
      var u = new SpeechSynthesisUtterance(text);
      var st = VSTYLES[prefs.voiceStyle] || VSTYLES.natural;
      u.lang = 'it-IT'; u.volume = prefs.volume; u.rate = st.rate; u.pitch = st.pitch;
      var v = voices.filter(function (x) { return x.name === prefs.voiceName; })[0] || bestVoice();
      if (v) u.voice = v;
      synth.speak(u);
    } catch (e) {}
  }
  function unlockSpeech() {
    if (!synth) return;
    try { var u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u); } catch (e) {}
  }
  function testSpeak() { speak('Ciao, sono la tua voce di bordo. Tra trecento metri, svolta a destra.', true); }

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
  var DATA_R = 430, CACHE_TTL = 14 * 24 * 3600 * 1000, CACHE_V = 1;
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

  /* Richieste a Overpass: due in parallelo, su server diversi. Se uno è lento o fallisce si passa all'altro. */
  function hostOf(u) { return u.replace(/^https?:\/\//, '').split('/')[0]; }
  function logReq(si, kind, ms, res) {
    diag.unshift({ host: hostOf(OVERPASS[si]), kind: kind, ms: ms, res: res });
    if (diag.length > 14) diag.length = 14;
  }
  function overpass(q, kind) {
    var order = [reqN % OVERPASS.length, (reqN + 1) % OVERPASS.length];
    reqN++;
    if (srvBad[order[0]] > Date.now() && srvBad[order[1]] <= Date.now()) order.reverse();
    function attempt(k, lastErr) {
      if (k >= order.length) return Promise.reject(lastErr || new Error('overpass'));
      var si = order[k], t0 = Date.now();
      return fetchJson(OVERPASS[si], { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) }, k === 0 ? 16000 : 26000).then(function (j) {
        logReq(si, kind, Date.now() - t0, 'ok');
        return j;
      }, function (e) {
        srvBad[si] = Date.now() + 45000;
        logReq(si, kind, Date.now() - t0, e && e.status ? 'errore ' + e.status : (e && e.message) || 'errore');
        return attempt(k + 1, e);
      });
    }
    return attempt(0);
  }
  function bboxStr(S, W, N, E) { return S.toFixed(6) + ',' + W.toFixed(6) + ',' + N.toFixed(6) + ',' + E.toFixed(6); }
  function cellQuery(c, kind) {
    var S = c.j * CELL_DLAT, W = c.i * CELL_DLON, bb = bboxStr(S, W, S + CELL_DLAT, W + CELL_DLON);
    if (kind === 'b') return '[out:json][timeout:20];way["building"](' + bb + ');out geom qt;';
    return '[out:json][timeout:20];(way["highway"~"' + HW_RE + '"](' + bb + ');node["highway"="speed_camera"](' + bb + '););out geom qt;';
  }
  function refreshCellList() {
    cellList = [];
    for (var kk in cells) { var c = cells[kk]; if (c.sr === 'ok' || c.sb === 'ok') cellList.push(c); }
  }
  function applyEls(cell, kind, els) {
    var parsed = parseOsm({ elements: els });
    if (kind === 'b') { cell.b = parsed.b; cell.sb = 'ok'; } else { cell.r = parsed.r; cell.sr = 'ok'; }
    refreshCellList();
  }
  function startFetch(cell, c) {
    var key = c.kind + ':' + cellKey(c.i, c.j), st = c.kind === 'b' ? 'sb' : 'sr', g = gen;
    inflight++; cell[st] = 'loading';
    overpass(cellQuery(c, c.kind), c.kind === 'b' ? 'edifici' : 'strade').then(function (json) {
      if (g !== gen) return;
      var els = json.elements || [];
      applyEls(cell, c.kind, els);
      netErr = 0;
      cachePut(key, compactEls(els));
    }, function () {
      if (g !== gen) return;
      cell[st] = 'err'; cell.t[c.kind] = Date.now(); netErr++;
    }).then(function () { inflight--; pump(); });
  }
  function pump() {
    if (!ORG) return;
    while (inflight < 2 && queue.length) {
      var ll = toLL(car.x, car.y), cc = cellOf(ll.lat, ll.lon), bi = -1, bs = 1e9, k;
      for (k = 0; k < queue.length; k++) {
        var q = queue[k], ring = Math.max(Math.abs(q.i - cc.i), Math.abs(q.j - cc.j)), sc = ring * 10 + (q.kind === 'b' ? 5 : 0);
        if (sc < bs) { bs = sc; bi = k; }
      }
      var c = queue.splice(bi, 1)[0], cell = cells[cellKey(c.i, c.j)];
      if (!cell || c.gen !== gen) continue;
      startFetch(cell, c);
    }
  }
  function wantKind(cell, kind) {
    var st = kind === 'b' ? 'sb' : 'sr';
    if (cell[st] === 'ok' || cell[st] === 'queued' || cell[st] === 'loading') return;
    if (cell[st] === 'err' && Date.now() - cell.t[kind] < 20000) return;
    cell[st] = 'loading';
    var g = gen, key = kind + ':' + cellKey(cell.i, cell.j);
    cacheGet(key).then(function (hit) {
      if (g !== gen) return;
      if (hit) { applyEls(cell, kind, expandEls(hit.els)); return; }
      cell[st] = 'queued';
      queue.push({ i: cell.i, j: cell.j, kind: kind, gen: g });
      pump();
    });
  }
  function wantCell(i, j) {
    var key = cellKey(i, j), cell = cells[key];
    if (!cell) cell = cells[key] = { i: i, j: j, b: [], r: [], sr: 'none', sb: 'none', t: { r: 0, b: 0 } };
    wantKind(cell, 'r'); wantKind(cell, 'b');
  }
  function wantAround(x, y, r) {
    var ll = toLL(x, y), c = cellOf(ll.lat, ll.lon);
    for (var di = -1; di <= 1; di++) for (var dj = -1; dj <= 1; dj++) {
      var i = c.i + di, j = c.j + dj, w = i * CELL_DLON, s = j * CELL_DLAT;
      var dx = Math.max(w - ll.lon, 0, ll.lon - (w + CELL_DLON)) * ORG.kx, dy = Math.max(s - ll.lat, 0, ll.lat - (s + CELL_DLAT)) * ORG.ky;
      if (Math.hypot(dx, dy) <= r) wantCell(i, j);
    }
  }
  function ensureData() {
    if (!ORG) return;
    wantAround(car.x, car.y, DATA_R);
    wantAround(car.x + Math.cos(phi) * 380, car.y + Math.sin(phi) * 380, 200);
    if (route && (state === 'nav' || state === 'preview')) {
      for (var d = prog.d; d < Math.min(route.total, prog.d + 1200); d += 250) { var p = pointAt(route, d); wantAround(p.x, p.y, 150); }
    }
    pump();
  }
  function dataStatus() {
    var done = 0, total = 0, k, bad = 0;
    for (k in cells) {
      var c = cells[k], sts = [c.sr, c.sb];
      for (var s = 0; s < 2; s++) { if (sts[s] === 'none') continue; total++; if (sts[s] === 'ok') done++; else if (sts[s] === 'err') bad++; }
    }
    if (done < total - bad) return 'carico ' + done + '/' + (total - bad);
    if (bad && !done) return 'rete assente';
    return cellList.length ? 'ok' : '--';
  }
  function diagText() {
    if (!diag.length) return 'Nessuna richiesta di rete ancora (mappa dalla cache o in attesa).';
    return diag.map(function (d) { return d.host + ' · ' + d.kind + ' · ' + (d.ms / 1000).toFixed(1).replace('.', ',') + ' s · ' + d.res; }).join('\n');
  }

  /* ---------- Limite di velocità sotto l'auto ---------- */
  var limitNow = 0;
  function updateLimit() {
    var best = 0, bd = 20 * 20, x = car.x, y = car.y;
    for (var c = 0; c < cellList.length; c++) {
      var rs = cellList[c].r;
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
    var url = NOMINATIM + '?format=jsonv2&limit=6&accept-language=it&q=' + encodeURIComponent(q);
    return fetchJson(url, null, 10000).then(function (j) {
      return (j || []).map(function (r) {
        var parts = String(r.display_name || '').split(',');
        return { name: parts[0] || 'Luogo', sub: parts.slice(1, 3).join(',').trim(), lat: parseFloat(r.lat), lon: parseFloat(r.lon) };
      });
    });
  }
  function doSearch(q) {
    var seq = ++searchSeq;
    showResMsg('Cerco…');
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
    if (!list.length) { showResMsg('Nessun risultato. Prova con indirizzo e città.'); return; }
    list.forEach(function (r) {
      var li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button'; b.className = 'res';
      var t = document.createElement('b'); t.textContent = r.name;
      var s = document.createElement('span'); s.textContent = r.sub || '';
      b.appendChild(t); if (r.sub) b.appendChild(s);
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
  var ORD = ['prima', 'seconda', 'terza', 'quarta', 'quinta', 'sesta', 'settima', 'ottava', 'nona', 'decima'];
  function ordinal(n) { return ORD[n - 1] || 'numero ' + n; }
  function keepMan(type, mod) {
    if (type === 'depart' || type === 'new name' || type === 'notification' || type === 'exit roundabout' || type === 'exit rotary' || type === 'arrive') return false;
    if ((type === 'continue' || type === 'turn') && (!mod || mod === 'straight')) return false;
    return true;
  }
  function describe(m) {
    var mod = m.mod || '';
    var side = /left/.test(mod) ? 'sinistra' : /right/.test(mod) ? 'destra' : '';
    var strength = /^slight/.test(mod) ? 'leggermente ' : /^sharp/.test(mod) ? 'decisamente ' : '';
    var icon = side === 'destra' ? 'right' : side === 'sinistra' ? 'left' : 'straight';
    switch (m.type) {
      case 'arrive': return { icon: 'arrive', text: side ? 'la destinazione è sulla ' + side : 'arrivo a destinazione' };
      case 'roundabout': case 'rotary': case 'roundabout turn':
        return { icon: 'round', text: 'alla rotonda, ' + (m.exit ? 'prendi la ' + ordinal(m.exit) + ' uscita' : 'segui le indicazioni') };
      case 'fork': return { icon: icon, text: side ? 'al bivio, tieni la ' + side : 'al bivio, prosegui dritto' };
      case 'merge': return { icon: icon, text: side ? 'immettiti a ' + side : 'immettiti' };
      case 'on ramp': return { icon: icon, text: side ? 'prendi la rampa a ' + side : 'prendi la rampa' };
      case 'off ramp': return { icon: icon, text: side ? "prendi l'uscita a " + side : "prendi l'uscita" };
      case 'end of road': return { icon: icon, text: side ? 'alla fine della strada, svolta a ' + side : 'alla fine della strada, svolta' };
      default:
        if (mod === 'uturn') return { icon: 'uturn', text: 'fai inversione a U' };
        if (side) return { icon: icon, text: 'svolta ' + strength + 'a ' + side };
        return { icon: 'straight', text: 'prosegui dritto' };
    }
  }
  function maneuverPhrase(man, m) {
    var d = describe(man);
    if (man.type === 'arrive') return m < 40 ? 'Sei arrivato a destinazione.' : 'Tra ' + spokenDist(m) + ', ' + d.text + '.';
    var nm = man.name ? ' su ' + man.name : '';
    return m < 35 ? 'Ora ' + d.text + nm + '.' : 'Tra ' + spokenDist(m) + ', ' + d.text + nm + '.';
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
    if (prefs.routeType !== 'simple' || routes.length < 2) return routes[0];
    var fastest = routes[0].duration, best = routes[0], bestN = 1e9;
    routes.forEach(function (r) {
      var n = 0; (r.legs || []).forEach(function (l) { n += (l.steps || []).length; });
      if (r.duration <= fastest * 1.35 && n < bestN) { bestN = n; best = r; }
    });
    return best;
  }
  function getRoute(from, to) {
    var coords = from.lon.toFixed(6) + ',' + from.lat.toFixed(6) + ';' + to.lon.toFixed(6) + ',' + to.lat.toFixed(6);
    var base = '/route/v1/driving/' + coords + '?overview=full&geometries=geojson&steps=true&alternatives=3';
    var ex = []; if (prefs.avoidHighway) ex.push('motorway'); if (prefs.avoidToll) ex.push('toll');
    function tryServers(extra) {
      var i = 0;
      function next(lastErr) {
        if (i >= OSRM.length) return Promise.reject(lastErr || new Error('route'));
        return fetchJson(OSRM[i++] + base + extra, null, 20000).then(function (j) {
          if (!j || j.code !== 'Ok' || !j.routes || !j.routes.length) { var e = new Error('noroute'); e.code = j && j.code; e.fatal = !!(j && j.code === 'NoRoute'); throw e; }
          return j;
        }).catch(function (e) { if (e && e.fatal) throw e; return next(e); });
      }
      return next();
    }
    var p = tryServers(ex.length ? '&exclude=' + ex.join(',') : '');
    return p.then(function (j) { return { data: j, dropped: false }; }, function (e) {
      if (ex.length) return tryServers('').then(function (j) { return { data: j, dropped: true }; });
      throw e;
    });
  }
  function routeCams(rt) {
    var b = rt.bbox, pad = 0.002;
    if (b[2] - b[0] > 4 || b[3] - b[1] > 6) return Promise.resolve();
    var bb = bboxStr(b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad);
    var q = '[out:json][timeout:25];(node["highway"="speed_camera"](' + bb + ');node["enforcement"~"^(maxspeed|average_speed)$"](' + bb + '););out body;';
    return overpass(q, 'autovelox').then(function (j) { parseOsm(j); attachCams(rt); }, function () {});
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
    if (err && err.code === 1) gpsErr = 'posizione negata';
    else if (err && err.code === 2) gpsErr = 'GPS non disponibile';
    else gpsErr = 'in attesa';
    if (err && err.code === 1) $('demoBtn').hidden = false;
  }
  function startGPS() {
    if (!navigator.geolocation) { gpsErr = 'non supportato'; $('demoBtn').hidden = false; return; }
    navigator.geolocation.watchPosition(onFix, onGeoErr, { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
  }
  function resetData() { gen++; cells = {}; cellList = []; queue = []; SEEN = {}; CAMS = {}; camList = []; }

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
  function chooseDest(r) {
    if (!here) { toast('Serve la posizione. Attiva il GPS oppure usa la posizione di esempio.'); $('demoBtn').hidden = false; return; }
    var dest = { name: r.name, sub: r.sub, lat: r.lat, lon: r.lon };
    results.innerHTML = ''; $('q').value = r.name;
    showResMsg('Calcolo il percorso…');
    getRoute(here, dest).then(function (res) {
      var rt = buildRoute(pickRoute(res.data.routes), dest);
      setRoute(rt);
      $('pvNote').textContent = (res.dropped ? 'Il server non supporta le esclusioni scelte: percorso calcolato senza. ' : '') + 'Durata stimata senza traffico.';
      showPreview();
      routeCams(rt);
    }, function (e) {
      showResMsg(e && e.fatal ? 'Nessun percorso trovato verso questa destinazione.' : 'Server dei percorsi non raggiungibile. Riprova tra poco.');
    });
  }
  function setRoute(rt) {
    route = rt; prog = { d: 0, idx: 0, dist: 0 }; spoken = {}; offSince = 0;
    attachCams(rt);
  }
  function showPreview() {
    $('pvTitle').textContent = route.dest.name;
    $('pvMeta').textContent = fmtDur(route.dur) + ' · ' + fmtDist(route.dist) + ' · arrivo ' + clockAfter(route.dur);
    setState('preview');
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
    setState('nav');
    updatePlayBtn();
    requestWake(true);
    if (prefs.voice && prefs.voiceTurn) {
      spoken.m0a = 1;
      if (route.man[0].d <= 150) spoken.m0b = 1;
      speak('Si parte. ' + maneuverPhrase(route.man[0], Math.max(0, route.man[0].d)));
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
    if (prefs.voice) speak('Sei arrivato a destinazione.');
    requestWake(false);
    clearInterval(sim.timer);
  }
  function reroute() {
    if (rerouting || !route || !here) return;
    rerouting = true; lastReroute = Date.now();
    toast('Ricalcolo del percorso…'); speak('Ricalcolo del percorso.');
    var dest = route.dest;
    getRoute(here, dest).then(function (res) {
      setRoute(buildRoute(pickRoute(res.data.routes), dest));
      routeCams(route);
      rerouting = false;
    }, function () { rerouting = false; toast('Non riesco a ricalcolare: server non raggiungibile.'); });
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
      speak('Attenzione, autovelox fisso tra ' + spokenDist(cam.dist) + '.' + (cam.limit ? ' Limite ' + limitDisp(cam.limit) + '.' : ''));
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
    var label = sim.running ? 'Pausa simulazione' : 'Riprendi simulazione';
    els.playBtn.innerHTML = sim.running ? PLAY_ICONS.pause : PLAY_ICONS.play;
    els.playBtn.setAttribute('aria-label', label); els.playBtn.title = label;
  }
  function updateHUD() {
    var kmh = speedMs * 3.6, cam = null, nm = null;
    els.speed.textContent = String(Math.round(spd(kmh)));
    els.unit.textContent = prefs.units === 'mi' ? 'mph' : 'km/h';
    els.limit.style.visibility = limitNow > 0 ? 'visible' : 'hidden';
    els.limit.textContent = limitNow > 0 ? String(limitDisp(limitNow)) : '';
    els.limit.setAttribute('aria-label', limitNow > 0 ? 'Limite di velocità ' + limitDisp(limitNow) : 'Limite non noto');
    els.speedBox.classList.toggle('over', limitNow > 0 && kmh > limitNow + 2);
    var gpsText = sim.active ? 'simulato' : gps ? '±' + Math.round(gps.acc) + ' m' : (demoPos ? 'di esempio' : (gpsErr || 'in attesa'));

    if (state === 'nav' || state === 'arrived') {
      nm = nextMan();
      var man = nm.m, ds = describe(man), m = Math.max(0, man.d - prog.d);
      if (state === 'arrived') {
        if (lastIcon !== 'arrive') { els.ticon.innerHTML = ICONS.arrive; lastIcon = 'arrive'; }
        els.tstreet.textContent = 'Sei arrivato'; els.voice.textContent = 'Hai raggiunto ' + route.dest.name + '.'; els.tdist.textContent = fmtDist(0);
      } else {
        if (lastIcon !== ds.icon) { els.ticon.innerHTML = ICONS[ds.icon]; lastIcon = ds.icon; }
        els.tstreet.textContent = man.type === 'arrive' ? route.dest.name : (man.name ? 'Su ' + man.name : ds.text.charAt(0).toUpperCase() + ds.text.slice(1));
        els.voice.textContent = m < 35 ? 'Ora ' + ds.text + '.' : 'Tra ' + fmtDist(m) + ', ' + ds.text + '.';
        els.tdist.textContent = fmtDist(m);
      }
      var rem = Math.max(0, route.total - prog.d), sec = route.dur * (rem / Math.max(1, route.total));
      setRow(1, 'Arrivo', state === 'arrived' ? '--:--' : clockAfter(sec), 'arr');
      setRow(2, 'Resta', state === 'arrived' ? '0 min' : fmtDur(sec));
      setRow(3, 'Distanza', fmtDist(rem));
      cam = state === 'nav' ? camAhead() : null;
    } else {
      setRow(1, 'GPS', gpsText);
      setRow(2, 'Mappa', dataStatus());
      setRow(3, '', '');
      els.gpsLine.textContent = gps || sim.active ? 'Posizione trovata (' + gpsText + '). Scrivi dove vuoi andare.' : demoPos ? 'Sto usando una posizione di esempio a Milano.' : gpsErr === 'posizione negata' ? 'Posizione negata. Abilitala nelle impostazioni del browser per questo sito.' : gpsErr === 'non supportato' ? 'Questo browser non fornisce la posizione.' : 'In attesa del GPS…';
      $('demoBtn').hidden = !!(gps || demoPos) || !(gpsErr === 'posizione negata' || gpsErr === 'non supportato' || gpsErr === 'GPS non disponibile' || performance.now() > 8000);
      cam = camAhead();
    }
    if (state === 'preview') { setRow(1, 'GPS', gpsText); setRow(2, 'Mappa', dataStatus()); setRow(3, '', ''); }
    if (menuOpen) { var dg = $('diag'); if (dg) dg.textContent = diagText(); }
    els.alert.hidden = !cam;
    if (cam) els.alertText.innerHTML = 'Autovelox fisso tra <span class="big">' + fmtDist(cam.dist) + '</span>' + (cam.limit ? ' · limite <span class="big">' + limitDisp(cam.limit) + '</span> ' + (prefs.units === 'mi' ? 'mph' : 'km/h') : '');
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
    if (prefs.routeType !== 'fast' && prefs.routeType !== 'simple') prefs.routeType = 'fast';
    if (!THEMES[prefs.theme]) prefs.theme = 'fuchsia';
    if (!SHAPES[prefs.carIcon]) prefs.carIcon = 'arrow';
    if (!VSTYLES[prefs.voiceStyle]) prefs.voiceStyle = 'natural';
    if ([1, 3, 6].indexOf(prefs.simMult) < 0) prefs.simMult = 3;
    prefs.tilt = Math.min(1.25, Math.max(0.35, Number(prefs.tilt) || 0.6));
    prefs.volume = Math.min(1, Math.max(0, Number(prefs.volume)));
    if (prefs.units !== 'km' && prefs.units !== 'mi') prefs.units = 'km';
  }
  function applyPrefs() {
    sanitize();
    TH = THEMES[prefs.theme] || THEMES.fuchsia; buildWalls();
    PITCH = prefs.tilt;
    syncUI();
  }
  function onPref(key) {
    savePrefs(); applyPrefs();
    if (key === 'voiceStyle') testSpeak();
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
  $('resetBtn').addEventListener('click', function () { resetPrefs(); savePrefs(); applyPrefs(); fillVoices(); });
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
  $('cancelBtn').addEventListener('click', function () { route = null; setState('idle'); });
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
  var cm = { Bk: 60, F: 500, cx: 0, cy: 0, cosT: 1, sinT: 0, fx: 1, fy: 0, rx: 0, ry: 1 };

  function resize() {
    var b = app.getBoundingClientRect();
    W = b.width; H = b.height; dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(app);
  window.addEventListener('resize', resize);
  resize();

  function cam3(x, y, z) {
    var dx = x - car.x, dy = y - car.y;
    var X = dx * cm.rx + dy * cm.ry, Yd = dx * cm.fx + dy * cm.fy + cm.Bk, Z = z - HC;
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
      return [car.x + (p[0] * cm.rx + p[1] * cm.fx) * CAR_SC, car.y + (p[0] * cm.ry + p[1] * cm.fy) * CAR_SC, z * CAR_SC];
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
    var camx = car.x - cm.fx * cm.Bk, camy = car.y - cm.fy * cm.Bk;
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

    cm.F = Math.min(W * 1.25, H * 1.05);
    cm.cosT = Math.cos(PITCH); cm.sinT = Math.sin(PITCH);
    cm.fx = Math.cos(phi); cm.fy = Math.sin(phi); cm.rx = -cm.fy; cm.ry = cm.fx;
    cm.Bk = HC / Math.tan(PITCH + Math.atan((H * 0.68 - cm.cy) / cm.F));

    var i, j, k, c, x, y;
    // griglia del terreno
    var gs = 60, gx0 = Math.floor((car.x - VIEW) / gs) * gs, gy0 = Math.floor((car.y - VIEW) / gs) * gs;
    ctx.beginPath();
    for (x = gx0; x <= car.x + VIEW; x += gs) addPoly(seg(x, car.y - VIEW, x, car.y + VIEW, 0.7, 0));
    for (y = gy0; y <= car.y + VIEW; y += gs) addPoly(seg(car.x - VIEW, y, car.x + VIEW, y, 0.7, 0));
    ctx.globalAlpha = 0.09; ctx.fillStyle = TH.glow; ctx.fill(); ctx.globalAlpha = 1;

    // strade per classe
    var vis = [[], [], []], V2 = VIEW + 80;
    for (c = 0; c < cellList.length; c++) {
      var rs = cellList[c].r;
      for (k = 0; k < rs.length; k++) {
        var rd = rs[k];
        if (rd.maxx < car.x - V2 || rd.minx > car.x + V2 || rd.maxy < car.y - V2 || rd.miny > car.y + V2) continue;
        vis[rd.cls].push(rd);
      }
    }
    var colors = [ROAD_MINOR, ROAD_MAJOR, ROAD_MOTORWAY];
    for (var cl = 0; cl < 3; cl++) {
      ctx.beginPath();
      for (k = 0; k < vis[cl].length; k++) {
        var r = vis[cl][k];
        for (i = 0; i < r.xs.length - 1; i++) {
          if (Math.abs(r.xs[i] - car.x) > V2 && Math.abs(r.ys[i] - car.y) > V2) continue;
          addPoly(seg(r.xs[i], r.ys[i], r.xs[i + 1], r.ys[i + 1], r.w, 0));
        }
      }
      ctx.fillStyle = colors[cl]; ctx.fill();
    }
    ctx.beginPath();
    for (cl = 1; cl < 3; cl++) for (k = 0; k < vis[cl].length; k++) {
      var r2 = vis[cl][k];
      for (i = 0; i < r2.xs.length - 1; i++) {
        if (Math.abs(r2.xs[i] - car.x) > VIEW && Math.abs(r2.ys[i] - car.y) > VIEW) continue;
        addPoly(seg(r2.xs[i], r2.ys[i], r2.xs[i + 1], r2.ys[i + 1], 0.9, 0));
      }
    }
    ctx.globalAlpha = 0.3; ctx.fillStyle = C.yel; ctx.fill(); ctx.globalAlpha = 1;

    // percorso
    if (route) drawRoute();

    // oggetti in piedi, dal più lontano
    var items = [], bl = [];
    for (c = 0; c < cellList.length; c++) {
      var bs = cellList[c].b;
      for (k = 0; k < bs.length; k++) {
        var b = bs[k], ddx = b.cx - car.x, ddy = b.cy - car.y, lim = VIEW + b.r;
        if (ddx * ddx + ddy * ddy > lim * lim) continue;
        var D = cam3(b.cx, b.cy, 0).D;
        if (D < -b.r - 10) continue;
        bl.push({ D: D, b: b });
      }
    }
    bl.sort(function (a, b2) { return a.D - b2.D; });
    if (bl.length > maxB) bl.length = maxB;
    // riflesso sull'asfalto sotto le case vicine
    if (prefs.gloss) {
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
        if (Math.abs(cmr.x - car.x) > VIEW || Math.abs(cmr.y - car.y) > VIEW) continue;
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
    drawVehicle();
    overlays(side, t);
  }
  function drawRoute() {
    var pts = route.pts, n = pts.length - 1, i, R2 = (VIEW + 60);
    function batch(w, from, to) {
      ctx.beginPath();
      for (i = from; i < to; i++) {
        if (Math.abs(pts[i].x - car.x) > R2 && Math.abs(pts[i].y - car.y) > R2) continue;
        addPoly(seg(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, w, 0));
      }
    }
    batch(9.5, 0, n); ctx.fillStyle = bgA(0.9); ctx.fill();
    batch(5.5, 0, n);
    ctx.save(); ctx.shadowColor = C.cyan; ctx.shadowBlur = 16; ctx.fillStyle = C.cyan; ctx.fill(); ctx.restore();
    if (prog.idx > 0 && state !== 'preview') { batch(5.5, 0, Math.min(n, prog.idx)); ctx.fillStyle = '#3a2f66'; ctx.fill(); }
  }
  function overlays(side, t) {
    var gf = ctx.createLinearGradient(0, 0, 0, H * 0.5);
    gf.addColorStop(0, bgA(0.92)); gf.addColorStop(0.3, bgA(0.62));
    gf.addColorStop(0.62, 'rgba(62,8,74,0.22)'); gf.addColorStop(1, bgA(0));
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
      ctx.fillText(!ORG || !car.has ? 'Cerco la tua posizione…' : 'Carico la mappa…', cm.cx, H * 0.62);
    }
  }

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
    info: function () { return { state: state, gps: gps, here: here, route: route && { total: route.total, man: route.man.length, cams: route.cams.length }, prog: prog, cells: cellList.length, cams: camList.length, speed: speedMs, limit: limitNow, maxB: maxB }; }
  };
})();
