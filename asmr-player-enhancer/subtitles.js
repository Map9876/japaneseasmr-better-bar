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
  const LIB_KEY = 'asmrSubLibrary';   // localStorage：我历史上传的所有字幕（刷新/重开仍在）

  // ─── State ────────────────────────────────────────────────
  let audioEl = null;
  let tracks = [];
  let trackSubtitles = {};     // trackIndex -> { name, cues:[{start,end,text}] }  (track-relative)
  let workRelative = [];       // [{ name, cues }]  (整作绝对时间)
  let activeCues = [];
  let activeBaseTime = 0;
  let currentTrackIndex = -2;
  let lyricsLineEls = [];        // 与 activeCues 平行的歌词行 DOM
  let lastActiveIdx = -1;        // 上一次高亮行，避免反复滚动
  let renderedKey = null;        // 当前渲染的字幕集标识，变化时才重建 DOM
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

  // 仅在字幕集变化时构建一次歌词行 DOM（避免每帧重建导致闪烁）
  function buildLyricsSkeleton() {
    if (!lyricsContent) return;
    lyricsContent.innerHTML = '';
    lyricsLineEls = [];
    activeCues.forEach((cue) => {
      const line = document.createElement('div');
      line.className = 'asmr-lyric-line';
      line.textContent = cue.text;
      line.style.cssText = 'padding:2px 0;cursor:pointer;color:rgba(255,255,255,0.3);font-weight:normal;font-size:13px;';
      line.onclick = (() => { const t = activeBaseTime + cue.start; return () => seekTo(t); })();
      lyricsContent.appendChild(line);
      lyricsLineEls.push(line);
    });
  }

  // 每帧只更新样式 + 当前行变化时才滚动一次（容器内滚动，不带动整页）
  function updateLyricsDisplay(localTime) {
    if (!lyricsContent || activeCues.length === 0) return;
    let activeIdx = -1;
    for (let i = 0; i < activeCues.length; i++) {
      if (localTime >= activeCues[i].start && localTime < activeCues[i].end) { activeIdx = i; break; }
    }
    for (let i = 0; i < lyricsLineEls.length; i++) {
      const cue = activeCues[i];
      const isActive = i === activeIdx;
      const isPast = !isActive && localTime >= cue.end;
      const color = isActive ? '#4fc3f7' : (isPast ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.3)');
      const el = lyricsLineEls[i];
      el.style.color = color;
      el.style.fontWeight = isActive ? 'bold' : 'normal';
      el.style.fontSize = isActive ? '15px' : '13px';
    }
    if (activeIdx !== -1 && activeIdx !== lastActiveIdx) {
      const el = lyricsLineEls[activeIdx];
      const target = el.offsetTop - lyricsContent.clientHeight / 2 + el.clientHeight / 2;
      lyricsContent.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
      lastActiveIdx = activeIdx;
    }
  }

  function refreshLyricsForTime(currentTime, force) {
    let idx = -1;
    if (tracks.length > 0) {
      for (let i = tracks.length - 1; i >= 0; i--) if (currentTime >= tracks[i].startTime) { idx = i; break; }
    }
    const tr = tracks[idx];
    let key = null;
    if (tr && trackSubtitles[tr.index]) {
      activeCues = trackSubtitles[tr.index].cues;
      activeBaseTime = tr.startTime;
      key = 't' + tr.index;
    } else if (workRelative.length) {
      activeCues = workRelative.flatMap((x) => x.cues);
      activeBaseTime = 0;
      key = 'w' + workRelative.length + ':' + (activeCues[0] ? activeCues[0].start : 0);
    } else { activeCues = []; activeBaseTime = 0; key = null; }

    // 字幕集未变且轨道未变：仅更新样式，不重建 DOM
    if (currentTrackIndex === idx && !force && key === renderedKey) {
      if (activeCues.length) updateLyricsDisplay((currentTime || 0) - activeBaseTime);
      return;
    }
    currentTrackIndex = idx;
    if (key !== renderedKey) {
      renderedKey = key;
      lastActiveIdx = -1;
      if (activeCues.length) buildLyricsSkeleton();
    }
    if (activeCues.length) {
      createLyricsOverlay();
      lyricsOverlay.style.display = 'block';
      updateLyricsDisplay((currentTime || 0) - activeBaseTime);
    } else if (lyricsOverlay) {
      lyricsOverlay.style.display = 'none';
    }
  }

  function watchPlayback() {
    setInterval(() => {
      if (!audioEl) return;
      const t = audioEl.currentTime || 0;
      refreshLyricsForTime(t, false);
    }, 250);
  }

  // ─── 当前页面 RJ 识别 ──────────────────────────────────────
  function getCurrentPageRJ() {
    if (!document.body) return '';
    const m = (document.body.innerText || '').match(/RJ\d{6,10}/i);
    return m ? m[0].toUpperCase() : '';
  }

  // ─── 字幕库（localStorage：我历史上传的所有，刷新/重开仍在）──
  // 存储结构: [{ rj, title, files:[{name, cues:[{start,end,text}]}], savedAt }]
  function loadLibraryStore() {
    try { return JSON.parse(localStorage.getItem(LIB_KEY) || '[]') || []; }
    catch (e) { return []; }
  }
  function saveLibraryStore(arr) {
    try { localStorage.setItem(LIB_KEY, JSON.stringify(arr)); } catch (e) {}
  }

  function fetchLibrary() {
    // 新 → 旧（按保存时间倒序）；同步返回数组（renderLibrary 同步消费）
    return loadLibraryStore().slice().sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  }

  function coverUrl(rj) { return COVER_BASE + rj + '_img_main.jpg'; }

  function buildLibraryItem(item, isCurrent) {
    const rj = item.rj;
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
    meta.style.cssText = 'font-size:11px;color:#888;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    const fileCount = (item.files || []).length;
    const cueCount = (item.files || []).reduce((s, f) => s + (f.cues ? f.cues.length : 0), 0);
    meta.textContent = (item.title ? item.title + '  ·  ' : '') + fileCount + ' 文件 / ' + cueCount + ' 行';
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
    libraryItems = fetchLibrary();
    if (!libraryItems.length) {
      box.innerHTML = '<div style="font-size:12px;color:#999;padding:6px 0;">字幕库为空（拖入字幕后会出现在这里）</div>';
      return;
    }
    libraryItems.forEach((it) => box.appendChild(buildLibraryItem(it, it.rj === currentRJ)));
  }

  function highlightLibraryItem(rj) {
    document.querySelectorAll('.asmr-lib-item').forEach((el) => {
      const cur = el.dataset.rj === rj;
      el.style.background = cur ? '#e3f2fd' : '';
      const btn = el.querySelector('button');
      if (btn) { btn.textContent = cur ? '✓ 已载' : '载入'; btn.style.background = cur ? '#90caf9' : '#1976d2'; }
    });
  }

  // 从 localStorage 载入某个 RJ 的全部字幕并匹配当前页面（无需联网）
  async function loadLibraryRJ(rj) {
    const entry = loadLibraryStore().find((x) => x.rj === rj);
    if (!entry || !entry.files || !entry.files.length) {
      setStatus('字幕库无 ' + rj + ' 的字幕', '#c62828');
      return;
    }
    setStatus('载入 ' + rj + ' …', '#1976d2');
    loadedFiles = entry.files.map((f) => ({ name: f.name, cues: f.cues }));
    if (!tracks.length) parseTracks();
    if (!audioEl) findAudio();
    buildTrackMap();
    setStatus('已载入 ' + rj + '：' + loadedFiles.length + ' 个字幕（本地）', '#2e7d32');
    highlightLibraryItem(rj);
  }

  // 打开面板时自动匹配当前页面 RJ 并刷新字幕库
  async function refreshLibraryAndMatch() {
    currentRJ = getCurrentPageRJ();
    renderLibrary(currentRJ);
    const rjHint = document.getElementById('asmr-sub-currrj');
    if (rjHint) rjHint.textContent = currentRJ ? ('当前页面 RJ：' + currentRJ) : '当前页面未识别到 RJ';
    if (currentRJ && Array.isArray(libraryItems) && libraryItems.some((it) => it.rj === currentRJ)) {
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
    const extVer = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) ? chrome.runtime.getManifest().version : '';
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
        <b>字幕 / 歌词</b>
        <span id="asmr-sub-close" style="cursor:pointer;font-size:16px;">✕</span>
      </div>
      <div style="font-size:10px;color:#aaa;margin-bottom:8px;">ASMR Player Enhancer v${extVer}</div>
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
        <label style="font-size:12px;color:#555;">上传到云端字幕库（可选，仅用于同步分享）:</label>
        <input id="asmr-sub-server" type="text" placeholder="https://your-server" value="${serverUrl}"
          style="width:100%;box-sizing:border-box;padding:5px;margin-top:4px;border:1px solid #ccc;border-radius:4px;font-size:12px;" />
        <button id="asmr-sub-upload" style="margin-top:6px;width:100%;padding:7px;background:#00897b;color:#fff;border:none;border-radius:5px;cursor:pointer;">⬆ 上传到云端字幕库</button>
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

    // 持久化到本地字幕库（localStorage）：以当前页面 RJ 为键，刷新/重开仍在
    const rj = getCurrentPageRJ();
    if (rj) {
      persistLoaded(rj);
      refreshLibraryAndMatch();
    } else {
      setStatus('已读取字幕，但未识别到当前页面 RJ（不会存入字幕库）', '#f57c00');
    }
  }

  // 将当前 loadedFiles 写入 localStorage 字幕库（同名 RJ 覆盖更新）
  function persistLoaded(rj) {
    if (!rj || !loadedFiles.length) return;
    const store = loadLibraryStore();
    const entry = {
      rj,
      title: (loadedFiles[0] && loadedFiles[0].name) || rj,
      files: loadedFiles.map((f) => ({ name: f.name, cues: f.cues })),
      savedAt: Date.now()
    };
    const idx = store.findIndex((x) => x.rj === rj);
    if (idx >= 0) store[idx] = entry; else store.push(entry);
    saveLibraryStore(store);
  }

  // ─── 上传按钮：先存入本地字幕库（必做），再可选同步到云端 ─────
  async function uploadToServer() {
    const files = Array.from(document.getElementById('asmr-sub-file').files || []);
    if (!files.length) { setStatus('请先选择包含字幕的 .zip / .lrc 再上传', '#c62828'); return; }

    // 1) 当作本地字幕加载并写入本地字幕库（这一步一定执行，确保「我的字幕库」里能看到）
    await handleFiles(files);

    // 2) 可选：同步到云端字幕库（仅当填写了服务器地址）
    if (!serverUrl) {
      setStatus('已保存到本地字幕库（未配置云端地址，仅存本地）', '#2e7d32');
      return;
    }
    setStatus('同步到云端中...', '#1976d2');
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append('file', f));
      const r = await fetch(serverUrl.replace(/\/$/, '') + '/api/upload-subtitles', { method: 'POST', body: fd });
      const data = await r.json().catch(() => ({}));
      if (data.error) setStatus('✅ 本地已存；云端：' + data.error, '#f57c00');
      else setStatus('✅ 本地已存 + 云端：' + (data.message || '成功') + (data.saved_rjs ? ' (' + data.saved_rjs.join(',') + ')' : ''), '#2e7d32');
    } catch (e) {
      setStatus('✅ 本地已存；云端同步失败：' + e.message, '#f57c00');
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

    // 刷新后自动匹配当前页面 RJ 并载入字幕（localStorage 字幕库）
    setTimeout(autoLoadCurrentRJ, 2500);
  }

  async function autoLoadCurrentRJ() {
    const rj = getCurrentPageRJ();
    if (!rj) return;
    const store = loadLibraryStore();
    if (store.some((it) => it.rj === rj)) await loadLibraryRJ(rj);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 800));
  else setTimeout(init, 800);
})();
