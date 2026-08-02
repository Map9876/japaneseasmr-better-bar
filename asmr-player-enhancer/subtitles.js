/* ============================================================
   ASMR Player Enhancer - Subtitle Module (Content Script)
   Target: japaneseasmr.com
   功能:
     - 加载字幕压缩包(.zip) / 单个 .lrc/.vtt/.srt/.ass
     - 按 Track 标题自动匹配字幕
     - 浮动同步歌词框（点击歌词行可跳转播放位置，对齐 kiko 歌词 web）
     - 字幕库：列出服务端「我历史上传的所有」字幕，新→旧、可收起
       · 每条带封面图(pic.weeabo0.xyz，尝试绕过 CF)
       · RJ 号蓝色可点 → japaneseasmr.com 搜索
     - 自动匹配当前页面 RJ 号并载入对应字幕（刷新后仍在）
     - 可选「上传到字幕库」(POST 到可配置的 kikoeru 服务端)
   ============================================================ */

(function () {
  'use strict';

  const INJECTED_FLAG = 'asmrSubInjected';
  const COVER_BASE = 'https://pic.weeabo0.xyz/';
  const SEARCH_BASE = 'https://japaneseasmr.com/?s=';

  // ─── State ────────────────────────────────────────────────
  let audioEl = null;
  let tracks = [];
  let trackSubtitles = {};     // trackIndex -> { name, cues:[{start,end,text}] }  (track-relative)
  let workRelative = [];       // [{ name, cues }]  (整作绝对时间)
  let activeCues = [];
  let activeBaseTime = 0;
  let currentTrackIndex = -2;
  let lyricsOverlay = null;
  let lyricsContent = null;
  let serverUrl = '';
  let loadedFiles = [];
  let libraryItems = [];        // 服务端字幕库列表
  let currentRJ = '';           // 当前页面识别到的 RJ

  // ─── Utility ──────────────────────────────────────────────
  function pad(n) { return n.toString().padStart(2, '0'); }
  function fmt(t) {
    if (!isFinite(t) || t < 0) t = 0;
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60);
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  function normalize(s) {
    return (s || '')
      .toLowerCase()
      .replace(/\.[^.]+$/, '')
      .replace(/^(track|torakk|トラック|trk|chapter|ch|第)\s*_?\s*(\d+[\.\-_]?)?/i, ' ')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function leadingIndex(s) {
    const m = (s || '').match(/^\s*(?:track|torakk|トラック|trk|chapter|ch)?\s*_?0*(\d{1,3})/i);
    return m ? parseInt(m[1], 10) : -1;
  }

  // ─── Parse Track List (与 content.js 同源) ────────────────
  function parseTracks() {
    tracks = [];
    const table = document.querySelector('#plyr-chapter-playlist');
    if (!table) return tracks;
    const rows = table.querySelectorAll('tr');
    rows.forEach((row) => {
      const link = row.querySelector('td.chapter_list.chapter_title a[data-value]');
      if (!link) return;
      const startTime = parseFloat(link.getAttribute('data-value')) || 0;
      const title = link.getAttribute('data-track-title') || link.textContent.trim();
      const index = parseInt(link.getAttribute('data-index')) || 0;
      if (title && title !== 'トラックリスト') {
        tracks.push({ index, title, startTime, endTime: null });
      }
    });
    for (let i = 0; i < tracks.length - 1; i++) tracks[i].endTime = tracks[i + 1].startTime;
    return tracks;
  }

  function findAudio() {
    const sels = ['#cleanp_audio video', '#cleanp_audio audio', '#audioplayer audio', '#audio', 'video', 'audio'];
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (el) { audioEl = el; return el; }
    }
    return null;
  }

  // ─── Subtitle parsers ─────────────────────────────────────
  function parseVtt(text) {
    const cues = [];
    const lines = text.split('\n');
    let i = 0;
    while (i < lines.length && !/^\d+$/.test(lines[i].trim())) i++;
    while (i < lines.length) {
      while (i < lines.length && lines[i].trim() === '') i++;
      if (i >= lines.length) break;
      if (/^\d+$/.test(lines[i].trim())) i++;
      if (i >= lines.length) break;
      const m = lines[i].match(/(\d{1,2}):(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[.,](\d{3})/);
      if (m) {
        const start = +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000;
        const end = +m[5] * 3600 + +m[6] * 60 + +m[7] + +m[8] / 1000;
        i++;
        const tl = [];
        while (i < lines.length && lines[i].trim() !== '' && !/^\d+$/.test(lines[i].trim()) && !lines[i].includes('-->')) {
          tl.push(lines[i].trim()); i++;
        }
        if (tl.length) cues.push({ start, end, text: tl.join('\n') });
      } else i++;
    }
    return cues;
  }

  function parseLrc(text) {
    const cues = [];
    const re = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
    text.split('\n').forEach((line) => {
      const tm = line.match(re);
      if (!tm) return;
      const txt = line.replace(re, '').trim();
      if (!txt) return;
      tm.forEach((tag) => {
        const m = tag.match(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/);
        if (!m) return;
        let ms = m[3] ? +m[3] : 0;
        if (m[3] && m[3].length === 2) ms *= 10;
        const start = +m[1] * 60 + +m[2] + ms / 1000;
        cues.push({ start, end: start, text: txt });
      });
    });
    cues.sort((a, b) => a.start - b.start);
    for (let i = 0; i < cues.length; i++) cues[i].end = i + 1 < cues.length ? cues[i + 1].start : cues[i].start + 5;
    return cues;
  }

  function parseSrt(text) {
    const cues = [];
    const blocks = text.replace(/\r/g, '').split(/\n\s*\n/);
    blocks.forEach((b) => {
      const lines = b.split('\n').filter((x) => x.trim() !== '');
      if (lines.length < 2) return;
      const m = lines[0].match(/(\d{1,2}):(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[.,](\d{3})/);
      if (!m) return;
      const start = +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000;
      const end = +m[5] * 3600 + +m[6] * 60 + +m[7] + +m[8] / 1000;
      cues.push({ start, end, text: lines.slice(1).join('\n') });
    });
    return cues;
  }

  function parseAss(text) {
    const cues = [];
    const re = /Dialogue:\s*[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,(\d+:\d{2}:\d{2}[.,]\d{2}),(\d+:\d{2}:\d{2}[.,]\d{2}),(.*)/;
    text.split('\n').forEach((line) => {
      const m = line.match(re);
      if (!m) return;
      const toSec = (t) => { const p = t.replace(',', '.').split(':'); return +p[0] * 3600 + +p[1] * 60 + +p[2]; };
      let txt = m[3].replace(/\{[^}]*\}/g, '').replace(/\\N/g, '\n').trim();
      if (!txt) return;
      cues.push({ start: toSec(m[1]), end: toSec(m[2]), text: txt });
    });
    return cues;
  }

  function parseSubtitle(name, text) {
    const ext = name.toLowerCase().split('.').pop();
    let cues = [];
    if (ext === 'vtt') cues = parseVtt(text);
    else if (ext === 'lrc') cues = parseLrc(text);
    else if (ext === 'srt') cues = parseSrt(text);
    else if (ext === 'ass' || ext === 'ssa') cues = parseAss(text);
    return cues;
  }

  // ─── Match subtitles to tracks ────────────────────────────
  function scoreMatch(subName, track) {
    const subNorm = normalize(subName);
    const trNorm = normalize(track.title);
    if (!subNorm) return 0;
    let score = 0;
    if (subNorm === trNorm) score = 100;
    else if (trNorm && subNorm.includes(trNorm)) score = 80;
    else if (subNorm && trNorm.includes(subNorm)) score = 70;
    else {
      const sa = subNorm.split(' ').filter((x) => x.length > 1);
      const ta = trNorm.split(' ').filter((x) => x.length > 1);
      let hit = 0;
      ta.forEach((t) => { if (sa.some((s) => s === t || (s.length > 2 && t.includes(s)))) hit++; });
      if (ta.length) score = Math.max(score, Math.round((hit / ta.length) * 60));
    }
    const si = leadingIndex(subName);
    if (si >= 0 && (si === track.index + 1 || si === track.index)) score += 15;
    return score;
  }

  function buildTrackMap() {
    trackSubtitles = {};
    workRelative = [];
    tracks.forEach((t) => {
      let best = null, bestScore = 0;
      loadedFiles.forEach((f) => {
        const s = scoreMatch(f.name, t);
        if (s > bestScore) { bestScore = s; best = f; }
      });
      if (best && bestScore >= 40) {
        trackSubtitles[t.index] = { name: best.name, cues: best.cues };
      }
    });
    const used = new Set(Object.values(trackSubtitles).map((x) => x.name));
    loadedFiles.forEach((f) => { if (!used.has(f.name) && f.cues.length) workRelative.push({ name: f.name, cues: f.cues }); });
    refreshLyricsForTime(audioEl ? audioEl.currentTime : 0, true);
  }

  // ─── Lyrics overlay (对齐 kiko 歌词 web) ───────────────────
  function createLyricsOverlay() {
    if (lyricsOverlay) return;
    lyricsOverlay = document.createElement('div');
    lyricsOverlay.id = '__asmrLyricsOverlay';
    lyricsOverlay.style.cssText = 'position:fixed;top:60px;right:10px;width:min(340px, calc(100vw - 20px));max-width:calc(100vw - 20px);box-sizing:border-box;max-height:60vh;background:rgba(0,0,0,0.85);color:#fff;border-radius:8px;z-index:99998;display:none;overflow:hidden;font-family:sans-serif;box-shadow:0 4px 20px rgba(0,0,0,0.5);';
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:rgba(255,255,255,0.1);cursor:move;user-select:none;';
    const title = document.createElement('span');
    title.textContent = '歌词';
    title.style.cssText = 'font-size:13px;font-weight:500;';
    const closeBtn = document.createElement('span');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'cursor:pointer;font-size:16px;padding:0 4px;';
    closeBtn.onclick = () => { lyricsOverlay.style.display = 'none'; };
    header.appendChild(title); header.appendChild(closeBtn);
    lyricsOverlay.appendChild(header);
    lyricsContent = document.createElement('div');
    lyricsContent.style.cssText = 'padding:12px;max-height:calc(60vh - 40px);overflow-y:auto;font-size:14px;line-height:1.8;';
    lyricsOverlay.appendChild(lyricsContent);
    document.body.appendChild(lyricsOverlay);

    let drag = false, sx, sy, sl, st;
    header.onmousedown = (e) => { drag = true; sx = e.clientX; sy = e.clientY; const r = lyricsOverlay.getBoundingClientRect(); sl = r.left; st = r.top; e.preventDefault(); };
    document.addEventListener('mousemove', (e) => { if (!drag) return; lyricsOverlay.style.left = (sl + e.clientX - sx) + 'px'; lyricsOverlay.style.top = (st + e.clientY - sy) + 'px'; lyricsOverlay.style.right = 'auto'; });
    document.addEventListener('mouseup', () => { drag = false; });
  }

  // 点击歌词行 → 跳转到对应播放位置（对齐 kiko 歌词 web）
  function seekTo(absStart) {
    if (!audioEl) return;
    try { audioEl.currentTime = absStart; if (audioEl.paused) audioEl.play().catch(() => {}); } catch (e) {}
  }

  function updateLyricsDisplay(localTime) {
    if (!lyricsContent) return;
    lyricsContent.innerHTML = '';
    if (activeCues.length === 0) return;
    let pastActive = false;
    for (const cue of activeCues) {
      const isActive = localTime >= cue.start && localTime < cue.end;
      let color;
      if (isActive) color = '#4fc3f7';
      else if (pastActive) color = 'rgba(255,255,255,0.5)';
      else color = 'rgba(255,255,255,0.3)';
      const line = document.createElement('div');
      line.className = 'asmr-lyric-line';
      line.textContent = cue.text;
      line.style.cssText = 'padding:2px 0;cursor:pointer;color:' + color + ';font-weight:' + (isActive ? 'bold' : 'normal') + ';font-size:' + (isActive ? '15px' : '13px') + ';';
      line.onclick = (() => { const t = activeBaseTime + cue.start; return () => seekTo(t); })();
      lyricsContent.appendChild(line);
      if (isActive) { line.scrollIntoView({ behavior: 'smooth', block: 'center' }); pastActive = true; }
    }
  }

  function refreshLyricsForTime(currentTime, force) {
    if (tracks.length === 0) return;
    let idx = -1;
    for (let i = tracks.length - 1; i >= 0; i--) if (currentTime >= tracks[i].startTime) { idx = i; break; }
    if (idx === currentTrackIndex && !force) return;
    currentTrackIndex = idx;
    const tr = tracks[idx];
    if (tr && trackSubtitles[tr.index]) {
      activeCues = trackSubtitles[tr.index].cues;
      activeBaseTime = tr.startTime;
    } else if (workRelative.length) {
      activeCues = workRelative.flatMap((x) => x.cues);
      activeBaseTime = 0;
    } else { activeCues = []; activeBaseTime = 0; }
    if (activeCues.length) { createLyricsOverlay(); lyricsOverlay.style.display = 'block'; updateLyricsDisplay((currentTime || 0) - activeBaseTime); }
    else if (lyricsOverlay) lyricsOverlay.style.display = 'none';
  }

  function watchPlayback() {
    setInterval(() => {
      if (!audioEl) return;
      const t = audioEl.currentTime || 0;
      refreshLyricsForTime(t, false);
      if (!audioEl.paused && activeCues.length) updateLyricsDisplay(t - activeBaseTime);
    }, 250);
  }

  // ─── 当前页面 RJ 识别 ──────────────────────────────────────
  function getCurrentPageRJ() {
    if (!document.body) return '';
    const m = (document.body.innerText || '').match(/RJ\d{6,10}/i);
    return m ? m[0].toUpperCase() : '';
  }

  // ─── 字幕库（服务端「我历史上传的所有」）─────────────────────
  async function fetchLibrary() {
    if (!serverUrl) return [];
    try {
      const r = await fetch(serverUrl.replace(/\/$/, '') + '/api/subtitles-list');
      if (!r.ok) return [];
      const d = await r.json();
      const items = (d.items || []).slice();
      // 新 → 旧：RJ 号越大越新（零填充可字典序排序），作为近似
      items.sort((a, b) => String(b.rj_number).localeCompare(String(a.rj_number)));
      return items;
    } catch (e) { return []; }
  }

  function coverUrl(rj) { return COVER_BASE + rj + '_img_main.jpg'; }

  function buildLibraryItem(item, isCurrent) {
    const rj = item.rj_number;
    const wrap = document.createElement('div');
    wrap.className = 'asmr-lib-item';
    wrap.dataset.rj = rj;
    wrap.style.cssText = 'display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid #f0f0f0;cursor:pointer;' + (isCurrent ? 'background:#e3f2fd;' : '');

    // 封面（尝试绕过 CF：no-referrer；失败则隐藏）
    const img = document.createElement('img');
    img.className = 'asmr-lib-cover';
    img.src = coverUrl(rj);
    img.referrerPolicy = 'no-referrer';
    img.loading = 'lazy';
    img.style.cssText = 'width:40px;height:40px;object-fit:cover;border-radius:4px;flex:none;background:#eee;';
    img.onerror = () => { img.style.display = 'none'; };
    wrap.appendChild(img);

    const info = document.createElement('div');
    info.style.cssText = 'flex:1;min-width:0;';
    const rjLink = document.createElement('a');
    rjLink.textContent = rj;
    rjLink.href = SEARCH_BASE + rj;
    rjLink.target = '_blank';
    rjLink.rel = 'noopener';
    rjLink.style.cssText = 'color:#1565c0;font-weight:500;text-decoration:none;font-size:13px;';
    rjLink.onclick = (e) => e.stopPropagation();
    info.appendChild(rjLink);
    const meta = document.createElement('div');
    meta.style.cssText = 'font-size:11px;color:#888;';
    meta.textContent = 'lrc:' + (item.lrc_count || 0) + '  vtt:' + (item.vtt_count || 0);
    info.appendChild(meta);
    wrap.appendChild(info);

    const loadBtn = document.createElement('button');
    loadBtn.textContent = isCurrent ? '✓ 已载' : '载入';
    loadBtn.style.cssText = 'flex:none;padding:4px 10px;border:none;border-radius:4px;background:' + (isCurrent ? '#90caf9' : '#1976d2') + ';color:#fff;cursor:pointer;font-size:12px;';
    loadBtn.onclick = (e) => { e.stopPropagation(); loadLibraryRJ(rj); };
    wrap.appendChild(loadBtn);

    wrap.onclick = () => loadLibraryRJ(rj);
    return wrap;
  }

  function renderLibrary(currentRJ) {
    const box = document.getElementById('asmr-sub-liblist');
    if (!box) return;
    box.innerHTML = '';
    if (!serverUrl) {
      box.innerHTML = '<div style="font-size:12px;color:#999;padding:6px 0;">未配置字幕库服务器（下方填写后刷新）</div>';
      return;
    }
    if (!libraryItems.length) {
      box.innerHTML = '<div style="font-size:12px;color:#999;padding:6px 0;">字幕库为空</div>';
      return;
    }
    libraryItems.forEach((it) => box.appendChild(buildLibraryItem(it, it.rj_number === currentRJ)));
  }

  function highlightLibraryItem(rj) {
    document.querySelectorAll('.asmr-lib-item').forEach((el) => {
      const cur = el.dataset.rj === rj;
      el.style.background = cur ? '#e3f2fd' : '';
      const btn = el.querySelector('button');
      if (btn) { btn.textContent = cur ? '✓ 已载' : '载入'; btn.style.background = cur ? '#90caf9' : '#1976d2'; }
    });
  }

  // 从服务端载入某个 RJ 的全部字幕并匹配当前页面
  async function loadLibraryRJ(rj) {
    if (!serverUrl) { setStatus('未配置字幕库服务器', '#c62828'); return; }
    setStatus('载入 ' + rj + ' …', '#1976d2');
    try {
      const base = serverUrl.replace(/\/$/, '');
      const r = await fetch(base + '/api/subtitles-for-kikoeru/' + rj);
      const data = await r.json().catch(() => ({}));
      const files = (data.lrc_files || []).concat(data.vtt_files || []);
      if (!files.length) { setStatus(rj + ' 无字幕文件', '#c62828'); return; }
      loadedFiles = [];
      for (const f of files) {
        const fr = await fetch(base + '/api/download-lrc/' + rj + '/' + encodeURIComponent(f));
        const text = await fr.text();
        const cues = parseSubtitle(f, text);
        if (cues.length) loadedFiles.push({ name: f, cues });
      }
      if (!loadedFiles.length) { setStatus('解析失败：' + rj, '#c62828'); return; }
      if (!tracks.length) parseTracks();
      if (!audioEl) findAudio();
      buildTrackMap();
      setStatus('已载入 ' + rj + '：' + loadedFiles.length + ' 个字幕', '#2e7d32');
      highlightLibraryItem(rj);
    } catch (e) {
      setStatus('载入失败：' + e.message, '#c62828');
    }
  }

  // 打开面板时自动匹配当前页面 RJ 并刷新字幕库
  async function refreshLibraryAndMatch() {
    currentRJ = getCurrentPageRJ();
    libraryItems = await fetchLibrary();
    renderLibrary(currentRJ);
    const rjHint = document.getElementById('asmr-sub-currrj');
    if (rjHint) rjHint.textContent = currentRJ ? ('当前页面 RJ：' + currentRJ) : '当前页面未识别到 RJ';
    if (currentRJ && libraryItems.some((it) => it.rj_number === currentRJ)) {
      loadLibraryRJ(currentRJ);
    }
  }

  // ─── UI: FAB + Panel ──────────────────────────────────────
  function buildUI() {
    if (document.getElementById('asmr-sub-fab')) return;
    const fab = document.createElement('div');
    fab.id = 'asmr-sub-fab';
    fab.textContent = '字幕';
    fab.style.cssText = 'position:fixed;left:10px;bottom:12px;z-index:99997;background:#1976d2;color:#fff;padding:8px 14px;border-radius:20px;font-size:13px;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,0.4);font-family:sans-serif;';
    fab.onclick = togglePanel;
    document.body.appendChild(fab);
  }

  function togglePanel() {
    let panel = document.getElementById('asmr-sub-panel');
    if (panel) { panel.style.display = panel.style.display === 'none' ? 'block' : 'none'; return; }
    panel = document.createElement('div');
    panel.id = 'asmr-sub-panel';
    panel.style.cssText = 'position:fixed;left:10px;bottom:54px;z-index:99997;width:min(340px, calc(100vw - 20px));max-width:calc(100vw - 20px);box-sizing:border-box;max-height:80vh;overflow:auto;background:#fff;color:#222;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,0.4);font-family:sans-serif;font-size:13px;padding:14px;overflow-wrap:anywhere;';
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <b>字幕 / 歌词</b>
        <span id="asmr-sub-close" style="cursor:pointer;font-size:16px;">✕</span>
      </div>
      <div id="asmr-sub-drop" style="border:2px dashed #bbb;border-radius:8px;padding:14px;text-align:center;color:#666;cursor:pointer;">
        点击选择 或 拖拽 .zip / .lrc / .vtt / .srt / .ass
      </div>
      <input id="asmr-sub-file" type="file" multiple accept=".zip,.lrc,.vtt,.srt,.ass" style="display:none" />
      <div id="asmr-sub-status" style="margin-top:8px;font-size:12px;color:#444;"></div>

      <div style="margin-top:10px;border-top:1px solid #eee;padding-top:8px;">
        <div id="asmr-sub-currrj" style="font-size:12px;color:#1565c0;margin-bottom:4px;"></div>
        <div id="asmr-sub-libtoggle" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;font-size:13px;font-weight:500;color:#222;">
          <span>📚 我的字幕库</span><span id="asmr-sub-libarrow">▼</span>
        </div>
        <div id="asmr-sub-liblist" style="margin-top:4px;max-height:40vh;overflow:auto;"></div>
      </div>

      <div style="margin-top:10px;border-top:1px solid #eee;padding-top:8px;">
        <label style="font-size:12px;color:#555;">字幕库服务器(可选):</label>
        <input id="asmr-sub-server" type="text" placeholder="https://your-server" value="${serverUrl}"
          style="width:100%;box-sizing:border-box;padding:5px;margin-top:4px;border:1px solid #ccc;border-radius:4px;font-size:12px;" />
        <button id="asmr-sub-upload" style="margin-top:6px;width:100%;padding:7px;background:#00897b;color:#fff;border:none;border-radius:5px;cursor:pointer;">⬆ 上传到字幕库</button>
      </div>
    `;
    document.body.appendChild(panel);

    document.getElementById('asmr-sub-close').onclick = () => { panel.style.display = 'none'; };
    const drop = document.getElementById('asmr-sub-drop');
    const fileInput = document.getElementById('asmr-sub-file');
    drop.onclick = () => fileInput.click();
    fileInput.onchange = (e) => handleFiles(e.target.files);
    drop.ondragover = (e) => { e.preventDefault(); drop.style.borderColor = '#1976d2'; };
    drop.ondragleave = () => { drop.style.borderColor = '#bbb'; };
    drop.ondrop = (e) => { e.preventDefault(); drop.style.borderColor = '#bbb'; if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); };
    const serverInput = document.getElementById('asmr-sub-server');
    serverInput.onchange = () => {
      serverUrl = serverInput.value.trim();
      try { localStorage.setItem('asmrSubServer', serverUrl); } catch (e) {}
      refreshLibraryAndMatch();
    };
    document.getElementById('asmr-sub-upload').onclick = uploadToServer;

    // 字幕库可收起
    const toggle = document.getElementById('asmr-sub-libtoggle');
    const list = document.getElementById('asmr-sub-liblist');
    const arrow = document.getElementById('asmr-sub-libarrow');
    toggle.onclick = () => {
      const hidden = list.style.display === 'none';
      list.style.display = hidden ? 'block' : 'none';
      arrow.textContent = hidden ? '▼' : '▶';
    };

    refreshLibraryAndMatch();
  }

  function setStatus(msg, color) {
    const el = document.getElementById('asmr-sub-status');
    if (el) { el.textContent = msg; el.style.color = color || '#444'; }
  }

  // ─── Load subtitles (本地拖拽/选择) ─────────────────────────
  async function handleFiles(fileList) {
    if (!fileList || !fileList.length) return;
    loadedFiles = [];
    setStatus('解析中...', '#1976d2');

    const files = Array.from(fileList);
    const zipFile = files.find((f) => f.name.toLowerCase().endsWith('.zip'));

    if (zipFile) {
      try {
        const zip = await JSZip.loadAsync(await zipFile.arrayBuffer());
        const entries = Object.keys(zip.files).filter((n) => !zip.files[n].dir &&
          /\.(lrc|vtt|srt|ass|ssa)$/i.test(n));
        for (const name of entries) {
          const text = await zip.files[name].async('string');
          const cues = parseSubtitle(name, text);
          if (cues.length) loadedFiles.push({ name: name.split('/').pop(), cues });
        }
        setStatus('压缩包解析完成：' + loadedFiles.length + ' 个字幕文件', '#2e7d32');
      } catch (e) {
        setStatus('ZIP 解析失败：' + e.message, '#c62828');
        return;
      }
    } else {
      for (const f of files) {
        const text = await f.text();
        const cues = parseSubtitle(f.name, text);
        if (cues.length) loadedFiles.push({ name: f.name, cues });
      }
      setStatus('已读取 ' + loadedFiles.length + ' 个字幕文件', loadedFiles.length ? '#2e7d32' : '#c62828');
    }

    if (!loadedFiles.length) { setStatus('未找到有效字幕文件', '#c62828'); return; }
    if (!tracks.length) parseTracks();
    if (!audioEl) findAudio();
    buildTrackMap();
  }

  // ─── Upload to kikoeru server (七步上传压缩包集成) ─────────
  async function uploadToServer() {
    const zipFile = Array.from(document.getElementById('asmr-sub-file').files || []).find((f) => f.name.toLowerCase().endsWith('.zip'));
    if (!zipFile) { setStatus('请先选择包含字幕的 .zip 再上传', '#c62828'); return; }
    if (!serverUrl) { setStatus('请先在上方填写字幕库服务器地址', '#c62828'); return; }
    setStatus('上传中...', '#1976d2');
    try {
      const fd = new FormData();
      fd.append('file', zipFile);
      const r = await fetch(serverUrl.replace(/\/$/, '') + '/api/upload-subtitles', { method: 'POST', body: fd });
      const data = await r.json().catch(() => ({}));
      if (data.error) setStatus('❌ ' + data.error, '#c62828');
      else setStatus('✅ ' + (data.message || '上传成功') + (data.saved_rjs ? ' (' + data.saved_rjs.join(',') + ')' : ''), '#2e7d32');
      // 上传后刷新字幕库
      refreshLibraryAndMatch();
    } catch (e) {
      setStatus('上传失败：' + e.message, '#c62828');
    }
  }

  // ─── Init ─────────────────────────────────────────────────
  function init() {
    if (document.documentElement.dataset[INJECTED_FLAG]) return;
    document.documentElement.dataset[INJECTED_FLAG] = 'true';
    try { serverUrl = localStorage.getItem('asmrSubServer') || ''; } catch (e) {}
    buildUI();
    parseTracks();
    findAudio();
    watchPlayback();

    const obs = new MutationObserver(() => {
      if (!tracks.length) parseTracks();
      if (!audioEl) findAudio();
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => obs.disconnect(), 60000);

    // 刷新后自动匹配当前页面 RJ 并载入字幕（若已在字幕库）
    if (serverUrl) setTimeout(autoLoadCurrentRJ, 2500);
  }

  async function autoLoadCurrentRJ() {
    const rj = getCurrentPageRJ();
    if (!rj) return;
    const items = await fetchLibrary();
    if (items.some((it) => it.rj_number === rj)) await loadLibraryRJ(rj);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 800));
  else setTimeout(init, 800);
})();
