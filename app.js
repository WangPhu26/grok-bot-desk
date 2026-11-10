/* app.js — Grok Bot iPhone app (Plan B, GitHub Pages).
   Reads ONLY the JSON the writer publishes under d/{DATA_PATH}/.
   Never builds a FOMO URL: every FOMO link comes from a `link` / `profileUrl` /
   `signupUrl` field in that JSON. No external requests of any kind. */
(function () {
  'use strict';

  // VAPID public key (public by design) as base64url of the raw 65-byte EC point.
  var VAPID_PUBLIC_KEY_B64URL = 'BBvklmVrmzegaS4xpq6OjoxmIWfINlmtwI0kP9lLOyCAsbJ4bwEgVuSMbtNv5iMFDcqI4UToXyOhFosBtLXwQ6A';
  var LS_PATH = 'grokbot_data_path';
  var LS_PUSH = 'grokbot_push_sub';
  var REFRESH_MS = 15000;

  var screen = document.getElementById('screen');
  var badge = document.getElementById('modeBadge');
  var cache = { state: null, chart: null, activity: null, account: null };
  var loadError = null;
  var firstLoad = true;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(v) {
    if (v == null || !isFinite(v)) return '—';
    var a = Math.abs(v);
    if (a >= 1000) return '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (a >= 1) return '$' + Number(v).toFixed(2);
    return '$' + Number(v).toFixed(6);
  }
  function pct(v) { return (v == null ? '—' : (v > 0 ? '+' : '') + Number(v).toFixed(1) + '%'); }
  function ago(ts) {
    if (!ts) return '—';
    var s = Math.max(0, Math.floor((Date.now() - Date.parse(ts)) / 1000));
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  }
  function shortMint(m) { return m ? m.slice(0, 4) + '…' + m.slice(-4) : '—'; }

  // ---- data path -----------------------------------------------------------
  function dataPath() {
    if (location.hash.indexOf('#d=') === 0) {
      var d = location.hash.slice(3).split('/')[0].split('?')[0];
      if (d) { try { localStorage.setItem(LS_PATH, d); } catch (e) {} location.hash = '#/'; return d; }
    }
    try { return localStorage.getItem(LS_PATH) || ''; } catch (e) { return ''; }
  }
  var DATA = dataPath();

  function dataUrl(rel) { return 'd/' + DATA + '/' + rel; }

  function fetchJSON(rel) {
    return fetch(dataUrl(rel), { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + rel);
      return r.json();
    });
  }

  function refreshAll() {
    if (!DATA) return Promise.resolve(false);
    return Promise.all([
      fetchJSON('state.json').then(function (j) { cache.state = j; }),
      fetchJSON('chart.json').then(function (j) { cache.chart = j; }),
      fetchJSON('activity.json').then(function (j) { cache.activity = j; }),
      fetchJSON('account.json').then(function (j) { cache.account = j; })
    ]).then(function () { loadError = null; return true; })
    .catch(function (e) { loadError = e; return false; });
  }

  function setBadge(mode) {
    if (!mode) { badge.textContent = '…'; badge.className = 'badge grey'; return; }
    badge.textContent = mode;
    badge.className = 'badge ' + (mode === 'PAPER' ? 'paper' : mode === 'LIVE' ? 'live' : 'grey');
  }

  // ---- shared states -------------------------------------------------------
  function setupState() {
    return '<div class="empty"><div class="big-ic">🔗</div><h2>No data link yet</h2>' +
      '<p style="margin-top:8px;line-height:1.5">Open this app once from the link with <span class="mono">#d=…</span> at the end ' +
      'of the URL. The app saves that link on this phone and loads your desk data from it.</p>' +
      '<p style="margin-top:8px;line-height:1.5">Nothing is guessed and nothing is fetched from a bare <span class="mono">/d/</span> path.</p></div>';
  }
  function skeleton() {
    return '<div class="card"><div class="skel skel-big"></div><div class="skel skel-line"></div><div class="skel skel-line"></div></div>' +
      '<div class="card"><div class="skel skel-line"></div><div class="skel skel-line"></div><div class="skel skel-line"></div></div>';
  }
  function errorBox(msg) {
    return '<div class="errorbox"><div class="big-ic">⚠️</div><p>Couldn\'t load desk data.</p>' +
      '<p style="margin-top:6px;font-size:13px">' + esc(msg || '') + '</p>' +
      '<button class="btn ghost" style="margin-top:14px" onclick="location.reload()">Retry</button></div>';
  }
  function emptyBox(icon, title, sub) {
    return '<div class="empty"><div class="big-ic">' + icon + '</div><h2>' + esc(title) + '</h2>' +
      '<p style="margin-top:8px;line-height:1.5">' + esc(sub || '') + '</p></div>';
  }

  // ---- screens -------------------------------------------------------------
  function openMintsFromActivity() {
    var rows = (cache.activity && cache.activity.rows) || [];
    var open = {};
    rows.slice().reverse().forEach(function (r) {
      if (!r.mint) return;
      if (r.kind === 'bought') open[r.mint] = true;
      if (r.kind === 'sold' || r.kind === 'stopped') delete open[r.mint];
    });
    return Object.keys(open);
  }

  function renderHome() {
    if (!DATA) return setupState();
    if (firstLoad && !cache.state) return skeleton();
    if (loadError && !cache.state) return errorBox(String(loadError.message || loadError));
    var s = cache.state || {};
    var bal = s.balance, tp = s.todayPct, mult = s.multiplier;
    setBadge(s.mode);
    var html = '<div class="card"><h2>Balance</h2><div class="big">' + money(bal) + '</div>' +
      '<div class="sub"><span class="' + (tp >= 0 ? 'green' : 'red') + '">' + pct(tp) + ' today</span>' +
      ' · ×' + (mult == null ? '—' : Number(mult).toFixed(2)) + ' · ' + (s.openPositions || 0) + ' open</div></div>';
    html += '<div class="card"><h2>Balance chart</h2><canvas id="homeChart" class="chart"></canvas></div>';
    var mints = openMintsFromActivity();
    html += '<div class="card"><h2>Open positions</h2><div id="posList">';
    if (!mints.length) {
      html += emptyBox('📭', 'No open positions', 'Nothing is open right now. When Executor fills a buy, it shows up here with its entry, stop and trail lines.');
    } else {
      mints.forEach(function (m) { html += '<div class="row" data-pos="' + esc(m) + '"><span class="mono">' + esc(shortMint(m)) + '</span><span class="muted">loading…</span></div>'; });
    }
    html += '</div></div>';
    var rows = ((cache.activity && cache.activity.rows) || []).slice(0, 3);
    html += '<div class="card"><h2>Latest activity</h2>';
    if (!rows.length) html += emptyBox('🕐', 'No activity tonight', 'Scanner, Auditor and Analyst decisions will appear here as the night runs.');
    else rows.forEach(function (r) { html += activityRow(r); });
    html += '<a class="btn ghost block" href="#/activity">All activity →</a></div>';
    screen.innerHTML = html;
    var cv = document.getElementById('homeChart');
    if (cv && cache.chart) window.GrokCharts.drawLine(cv, cache.chart.points, cache.chart.marks);
    mints.forEach(function (m) {
      fetchJSON('coin/' + m + '.json').then(function (c) {
        var el = screen.querySelector('[data-pos="' + m + '"]');
        if (!el || !c.position) return;
        var p = c.position;
        el.innerHTML = '<span><b>' + esc(c.name || shortMint(m)) + '</b> <span class="muted">' + esc(c.symbol || '') + '</span></span>' +
          '<span class="kv">entry ' + money(p.entryPrice) + ' · stop ' + money(p.stopPrice) + (p.trailActive ? ' · trail on' : '') + '</span>';
        el.style.cursor = 'pointer';
        el.onclick = function () { location.hash = '#/coin/' + m; };
      }).catch(function () {});
    });
    return null;
  }

  var AGENT_NAMES = ['scanner', 'auditor', 'analyst', 'executor', 'risk'];
  function renderAgents() {
    if (!DATA) return setupState();
    if (firstLoad && !cache.state) return skeleton();
    if (loadError && !cache.state) return errorBox(String(loadError.message || loadError));
    setBadge(cache.state.mode);
    var rows = ((cache.activity && cache.activity.rows) || []);
    var html = '';
    AGENT_NAMES.forEach(function (name) {
      var a = (cache.state.agents || []).filter(function (x) { return x.name === name; })[0] || {};
      var dec = rows.filter(function (r) { return (r.agent || '').toLowerCase() === name; }).slice(0, 3);
      html += '<div class="card agentcard"><div class="row"><h3><span class="dot ' + (a.alive ? 'on' : 'off') + '"></span>' +
        esc(name.charAt(0).toUpperCase() + name.slice(1)) + '</h3><span class="muted">' + (a.alive ? 'alive' : 'offline') + '</span></div>' +
        '<div class="meta">Last heartbeat: ' + (a.lastHeartbeat ? ago(a.lastHeartbeat) : 'never') + '</div>';
      if (!dec.length) html += '<div class="meta" style="margin-top:8px">No decisions tonight yet.</div>';
      dec.forEach(function (r) { html += activityRow(r); });
      html += '</div>';
    });
    screen.innerHTML = html;
    return null;
  }

  var KIND_ICON = { bought: '🟢', sold: '🔴', stopped: '🛑', rejected: '⛔', sent: '📤' };
  function activityRow(r) {
    var icon = KIND_ICON[r.kind] || '•';
    var click = r.mint ? ' data-mint="' + esc(r.mint) + '"' : '';
    var linkBtn = (r.mint && r.link) ? '<a class="fomolink" href="' + esc(r.link) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">Open on FOMO ↗</a>' : '';
    return '<div class="actrow"' + click + '><div class="acticon">' + icon + '</div>' +
      '<div class="actbody"><div class="t">' + esc(r.title || r.kind || '') + '</div>' +
      '<div class="s">' + esc(r.subtitle || '') + ' · ' + esc(ago(r.ts)) + '</div>' + linkBtn + '</div>' +
      (r.value != null ? '<div class="actval">' + esc(String(r.value)) + '</div>' : '') + '</div>';
  }

  function renderActivity() {
    if (!DATA) return setupState();
    if (firstLoad && !cache.activity) return skeleton();
    if (loadError && !cache.activity) return errorBox(String(loadError.message || loadError));
    setBadge(cache.state && cache.state.mode);
    var rows = ((cache.activity && cache.activity.rows) || []).slice(0, 30);
    var html = '<div class="card"><h2>Activity — tonight</h2>';
    if (!rows.length) html += emptyBox('🕐', 'No activity tonight', 'Decisions from Scanner, Auditor, Analyst, Executor and Risk will appear here.');
    else rows.forEach(function (r) { html += activityRow(r); });
    html += '</div>';
    screen.innerHTML = html;
    screen.querySelectorAll('[data-mint]').forEach(function (el) {
      el.addEventListener('click', function () { location.hash = '#/coin/' + el.getAttribute('data-mint'); });
    });
    return null;
  }

  function renderAccount() {
    if (!DATA) return setupState();
    if (firstLoad && !cache.account) return skeleton();
    if (loadError && !cache.account) return errorBox(String(loadError.message || loadError));
    var a = cache.account || {};
    setBadge(a.mode);
    var pushStatus = 'Not enabled on this phone.';
    try { if (localStorage.getItem(LS_PUSH)) pushStatus = 'Saved on this phone — no live backend yet, pushes still come via chat.'; } catch (e) {}
    var html = '<div class="card"><h2>Account</h2>' +
      '<div class="row kv"><span class="muted">Mode</span><b>' + esc(a.mode || '—') + '</b></div>' +
      '<div class="row kv"><span class="muted">Stack</span><b>' + money(a.stack) + '</b></div>' +
      '<div class="row kv"><span class="muted">FOMO handle</span><b>@' + esc(a.fomoHandle || '—') + '</b></div>' +
      '<div class="row kv"><span class="muted">Analyst</span><b>' + esc(a.analystMode || '—') + '</b></div>' +
      '<div class="row kv"><span class="muted">Notifier</span><b>' + esc(a.notifier || '—') + '</b></div>' +
      '<div class="btnrow"><a class="btn" href="' + esc(a.profileUrl || '#') + '" target="_blank" rel="noopener">My FOMO profile ↗</a>' +
      '<a class="btn ghost" href="' + esc(a.signupUrl || '#') + '" target="_blank" rel="noopener">Invite ↗</a></div></div>';
    html += '<div class="card settings-list"><h2>Settings — read-only</h2>';
    html += '<div class="note">Plan B is read-only — change settings by messaging Cooper in chat.</div>';
    var settings = a.settings || {};
    var keys = Object.keys(settings).sort();
    if (!keys.length) html += '<p class="muted">No settings published yet.</p>';
    keys.forEach(function (k) {
      html += '<div class="row"><span class="k">' + esc(k) + '</span><b>' + esc(String(settings[k])) + '</b></div>';
    });
    html += '</div>';
    html += '<div class="card"><h2>Notifications</h2><p class="muted" style="font-size:13px;line-height:1.5">' + esc(pushStatus) + '</p>' +
      '<button class="btn block" id="enablePush">Enable notifications</button>' +
      '<p class="muted" style="font-size:12px;margin-top:8px;line-height:1.5">Push needs a live backend to deliver. Enabling here saves the subscription on this phone so it is ready when one exists.</p></div>';
    screen.innerHTML = html;
    var btn = document.getElementById('enablePush');
    if (btn) btn.addEventListener('click', enablePush);
    return null;
  }

  function renderCoin(mint) {
    if (!DATA) return setupState();
    screen.innerHTML = '<a class="backlink" href="#/activity">← Back</a>' + skeleton();
    Promise.all([fetchJSON('coin/' + mint + '.json'), fetchJSON('audit/' + mint + '.json').catch(function () { return { layers: [], passed: null }; })])
      .then(function (res) {
        var c = res[0], au = res[1];
        setBadge(cache.state && cache.state.mode);
        var html = '<a class="backlink" href="#/activity">← Back</a>' +
          '<div class="card"><h2>Coin</h2><div class="big" style="font-size:28px">' + esc(c.name || shortMint(mint)) + ' <span class="muted">' + esc(c.symbol || '') + '</span></div>' +
          '<div class="sub">Price: <b style="color:#fff">' + money(c.price) + '</b></div>' +
          '<canvas id="coinChart" class="chart"></canvas></div>';
        html += '<div class="card"><h2>Stats</h2>' +
          '<div class="row kv"><span class="muted">Pool</span><span class="mono">' + esc(shortMint(c.pool)) + '</span></div>' +
          '<div class="row kv"><span class="muted">Creator</span><span class="mono">' + esc(shortMint(c.creator)) + '</span></div>' +
          '<div class="row kv"><span class="muted">Holders</span><b>' + esc(c.holders == null ? '—' : c.holders) + '</b></div>' +
          '<div class="row kv"><span class="muted">Migrated</span><b>' + esc(c.migratedAt ? ago(c.migratedAt) : '—') + '</b></div></div>';
        if (c.position) {
          var p = c.position;
          html += '<div class="card"><h2>Position</h2>' +
            '<div class="row kv"><span class="muted">Entry</span><b>' + money(p.entryPrice) + '</b></div>' +
            '<div class="row kv"><span class="muted">Size</span><b>' + money(p.sizeUsd) + '</b></div>' +
            '<div class="row kv"><span class="muted">Peak</span><b>' + money(p.peakPrice) + '</b></div>' +
            '<div class="row kv"><span class="muted">Stop</span><b>' + money(p.stopPrice) + '</b></div>' +
            '<div class="row kv"><span class="muted">Trail</span><b>' + (p.trailActive ? 'active' : 'off') + '</b></div>' +
            (p.closedAt ? '<div class="row kv"><span class="muted">Exit</span><b>' + money(p.exitPrice) + ' · ' + esc(p.exitReason || '') + '</b></div>' : '') +
            '</div>';
        } else {
          html += '<div class="card"><h2>Position</h2>' + emptyBox('📭', 'No position', 'No open or closed position for this coin tonight.') + '</div>';
        }
        html += '<div class="card"><h2>Auditor beam</h2><div class="beam">';
        var layers = au.layers || [];
        if (!layers.length) {
          html += emptyBox('🔍', 'No audit yet', 'The Auditor has not checked this coin tonight.');
        } else {
          layers.forEach(function (l) {
            var cls = l.pass === true ? 'pass' : l.pass === false ? 'fail' : 'na';
            var st = l.pass === true ? '✓ pass' : l.pass === false ? '✗ fail' : '– not checked';
            html += '<div class="layer ' + cls + '"><span class="n">' + esc(l.n) + '</span><span class="nm">' + esc(l.name) + '</span><span class="v">' + esc(l.value || '') + '</span><span class="st">' + st + '</span></div>';
          });
          html += '<div class="row" style="margin-top:8px"><span class="muted">Verdict</span><b class="' + (au.passed ? 'green' : 'red') + '">' + (au.passed ? 'PASSED 8/8' : 'REJECTED') + '</b></div>';
        }
        html += '</div></div>';
        html += '<div class="btnrow"><a class="btn" href="' + esc(c.link) + '" target="_blank" rel="noopener">Buy on FOMO ↗</a>' +
          '<a class="btn sell" href="' + esc(c.link) + '" target="_blank" rel="noopener">Sell on FOMO ↗</a></div>' +
          '<p class="muted" style="font-size:12px;margin-top:10px;line-height:1.5">Trading happens on FOMO — you tap the button and confirm there. This app never places an order.</p>';
        screen.innerHTML = html;
        var cv = document.getElementById('coinChart');
        if (cv) window.GrokCharts.drawCandles(cv, c.candles || []);
      })
      .catch(function (e) {
        screen.innerHTML = '<a class="backlink" href="#/activity">← Back</a>' + errorBox('Could not load this coin: ' + String(e.message || e));
      });
    return null;
  }

  // ---- push ---------------------------------------------------------------
  function urlB64ToUint8(b64) {
    var raw = b64.replace(/-/g, '+').replace(/_/g, '/');
    while (raw.length % 4) raw += '=';
    var bin = atob(raw), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function enablePush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('Push is not supported in this browser.');
      return;
    }
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(VAPID_PUBLIC_KEY_B64URL) });
    }).then(function (sub) {
      try { localStorage.setItem(LS_PUSH, JSON.stringify(sub.toJSON())); } catch (e) {}
      alert('Notifications enabled on this phone. No live backend yet, so pushes still come via chat — the subscription is saved and ready.');
      renderAccount();
    }).catch(function (e) { alert('Could not enable notifications: ' + (e.message || e)); });
  }

  // ---- router --------------------------------------------------------------
  function route() {
    var h = location.hash || '#/';
    document.querySelectorAll('#tabs a').forEach(function (a) {
      var tab = a.getAttribute('data-tab');
      a.classList.toggle('active',
        (tab === 'home' && (h === '#/' || h === '')) ||
        (tab !== 'home' && h.indexOf('#/' + tab) === 0));
    });
    if (h.indexOf('#/coin/') === 0) { renderCoin(decodeURIComponent(h.slice(7).split('?')[0])); return; }
    if (h.indexOf('#/agents') === 0) { renderAgents(); return; }
    if (h.indexOf('#/activity') === 0) { renderActivity(); return; }
    if (h.indexOf('#/account') === 0) { renderAccount(); return; }
    renderHome();
  }

  function tick() {
    refreshAll().then(function () {
      firstLoad = false;
      route();
    });
  }

  window.addEventListener('hashchange', route);
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
  route();
  tick();
  setInterval(tick, REFRESH_MS);
})();
