/* ============================================================
   ASMR Player Enhancer - Content Script
   Target: japaneseasmr.com (Plyr-based player)
   ============================================================ */

(function () {
  'use strict';

  // ─── Constants ─────────────────────────────────────────────
  const TIME_DISPLAY_DURATION = 1500;
  const TRACK_DRAG_DELAY = 300; // 长按激活延迟(ms)，防止滑动误触
  const TRACK_DRAG_THRESHOLD = 10; // 触摸移动超过此像素视为滑动，取消拖拽
  const MAX_RETRIES = 15;
  const RETRY_INTERVAL = 1500;
  const INJECTED_FLAG = 'asmrEnhancerInjected';

  // ─── State ────────────────────────────────────────────────
  let audioEl = null;
  let tracks = [];
  let isDraggingProgress = false;
  let isDraggingTrackProgress = false;
  let dragStartX = 0;
  let currentTrackIndex = -1;
  let activeTrackDragIndex = -1;
  let retryCount = 0;
  let uiInjected = false;
  let trackDragTimer = null;
  let trackDragStartX = 0;
  let trackDragStartY = 0;
  let trackDragPending = false;

  // ─── Utility ──────────────────────────────────────────────
  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) seconds = 0;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  function formatTimeShort(seconds) {
    if (!isFinite(seconds) || seconds < 0) seconds = 0;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  // ─── Parse Track List from DOM ────────────────────────────
  function parseTrackList() {
    tracks = [];

    const table = document.querySelector('#plyr-chapter-playlist');
    if (!table) {
      console.log('[ASMR Enhancer] No #plyr-chapter-playlist found');
      return tracks;
    }

    const rows = table.querySelectorAll('tr');
    rows.forEach((row) => {
      const titleLink = row.querySelector('td.chapter_list.chapter_title a[data-value]');
      if (!titleLink) return;

      const startTime = parseFloat(titleLink.getAttribute('data-value')) || 0;
      const title = titleLink.getAttribute('data-track-title') || titleLink.textContent.trim();
      const index = parseInt(titleLink.getAttribute('data-index')) || 0;

      if (title && title !== 'トラックリスト') {
        tracks.push({
          index: index,
          title: title,
          startTime: startTime,
          endTime: null,
        });
      }
    });

    for (let i = 0; i < tracks.length; i++) {
      if (i < tracks.length - 1) {
        tracks[i].endTime = tracks[i + 1].startTime;
      }
    }

    console.log('[ASMR Enhancer] Parsed', tracks.length, 'tracks from DOM');
    return tracks;
  }

  // ─── Find Audio/Video Element ─────────────────────────────
  function findAudioElement() {
    const selectors = [
      '#cleanp_audio video',
      '#cleanp_audio audio',
      '#audioplayer audio',
      '#audio',
      'video',
      'audio',
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        audioEl = el;
        console.log('[ASMR Enhancer] Found media element:', sel);
        return audioEl;
      }
    }
    return null;
  }

  // ─── Create Floating Progress Bar ─────────────────────────
  function createFloatingProgressBar() {
    const container = document.createElement('div');
    container.id = 'asmr-enhancer-progress-container';
    container.innerHTML = `
      <div class="asmr-progress-bar" id="asmr-main-progress">
        <div class="asmr-progress-buffered"></div>
        <div class="asmr-progress-played"></div>
        <div class="asmr-progress-handle"></div>
      </div>
      <div class="asmr-time-display">
        <span class="asmr-time-elapsed">00:00:00</span>
        <span class="asmr-time-separator">/</span>
        <span class="asmr-time-total">00:00:00</span>
      </div>
    `;
    return container;
  }

  // ─── Enhance Existing Track List with Progress Bars ───────
  function enhanceTrackList() {
    const table = document.querySelector('#plyr-chapter-playlist');
    if (!table || tracks.length === 0) return;

    const rows = table.querySelectorAll('tr');
    rows.forEach((row) => {
      const titleLink = row.querySelector('td.chapter_list.chapter_title a[data-value]');
      if (!titleLink) return;

      const trackIndex = parseInt(titleLink.getAttribute('data-index'));
      if (isNaN(trackIndex)) return;

      if (row.querySelector('.asmr-track-progress-bar')) return;

      const progressTd = document.createElement('td');
      progressTd.className = 'asmr-track-progress-td';
      progressTd.colSpan = 2;
      progressTd.innerHTML = `
        <div class="asmr-track-progress-wrapper">
          <span class="asmr-track-time-display" data-track-index="${trackIndex}">0:00/--:--</span>
          <div class="asmr-track-progress-bar" data-track-index="${trackIndex}">
            <div class="asmr-track-progress-played"></div>
            <div class="asmr-track-progress-handle"></div>
          </div>
        </div>
      `;

      const progressRow = document.createElement('tr');
      progressRow.className = 'asmr-track-progress-row';
      progressRow.appendChild(progressTd);

      row.after(progressRow);

      row.classList.add('asmr-track-item');
      row.dataset.trackIndex = trackIndex;
    });
  }

  // ─── Inject UI ────────────────────────────────────────────
  function injectUI() {
    if (uiInjected) return;
    if (!audioEl) {
      console.warn('[ASMR Enhancer] No audio element, cannot inject UI');
      return;
    }

    uiInjected = true;
    document.documentElement.dataset[INJECTED_FLAG] = 'true';

    // 1. Add floating progress bar (fixed position at bottom 30%)
    const progressBar = createFloatingProgressBar();
    document.body.appendChild(progressBar);

    // 2. Enhance existing track list with progress bars
    enhanceTrackList();

    // 3. Setup all event listeners
    setupProgressBarEvents();
    setupTrackListEvents();
    setupAudioEvents();

    // 4. Start update loop
    requestAnimationFrame(updateLoop);

    console.log('[ASMR Enhancer] UI injected successfully');
  }

  // ─── Audio Events ─────────────────────────────────────────
  function setupAudioEvents() {
    if (!audioEl) return;

    audioEl.addEventListener('loadedmetadata', () => {
      console.log('[ASMR Enhancer] Media metadata loaded, duration:', audioEl.duration);
      if (tracks.length > 0 && tracks[tracks.length - 1].endTime === null) {
        tracks[tracks.length - 1].endTime = audioEl.duration;
      }
    });

    audioEl.addEventListener('durationchange', () => {
      if (tracks.length > 0 && tracks[tracks.length - 1].endTime === null) {
        tracks[tracks.length - 1].endTime = audioEl.duration;
      }
    });
  }

  // ─── Progress Bar Events ──────────────────────────────────
  function setupProgressBarEvents() {
    const progressContainer = document.getElementById('asmr-main-progress');
    if (!progressContainer) return;

    const handleInteraction = (clientX) => {
      if (!audioEl || !isFinite(audioEl.duration)) return;
      const rect = progressContainer.getBoundingClientRect();
      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
      audioEl.currentTime = ratio * audioEl.duration;
      updateProgressUI();
      updateTrackProgressUI();
    };

    progressContainer.addEventListener('mousedown', (e) => {
      isDraggingProgress = true;
      handleInteraction(e.clientX);
      e.preventDefault();
      e.stopPropagation();
    });

    progressContainer.addEventListener('touchstart', (e) => {
      isDraggingProgress = true;
      handleInteraction(e.touches[0].clientX);
      e.stopPropagation();
    }, { passive: true });

    document.addEventListener('mousemove', (e) => {
      if (isDraggingProgress) handleInteraction(e.clientX);
    });

    document.addEventListener('touchmove', (e) => {
      if (isDraggingProgress) handleInteraction(e.touches[0].clientX);
    }, { passive: true });

    document.addEventListener('mouseup', () => { isDraggingProgress = false; });
    document.addEventListener('touchend', () => { isDraggingProgress = false; });
  }

  // ─── Track List Events (长按激活拖拽，防止滑动误触) ────────
  function setupTrackListEvents() {
    const table = document.querySelector('#plyr-chapter-playlist');
    if (!table) return;

    function cancelTrackDrag() {
      if (trackDragTimer) { clearTimeout(trackDragTimer); trackDragTimer = null; }
      trackDragPending = false;
      isDraggingTrackProgress = false;
      activeTrackDragIndex = -1;
    }

    // 鼠标：直接激活（桌面端无需防误触）
    table.addEventListener('mousedown', (e) => {
      const trackBar = e.target.closest('.asmr-track-progress-bar');
      if (trackBar && audioEl) {
        isDraggingTrackProgress = true;
        activeTrackDragIndex = parseInt(trackBar.dataset.trackIndex);
        handleTrackProgressSeek(trackBar, e.clientX);
        e.preventDefault();
        e.stopPropagation();
      }
    });

    // 触摸：长按延迟激活，快速滑动则取消
    table.addEventListener('touchstart', (e) => {
      const trackBar = e.target.closest('.asmr-track-progress-bar');
      if (!trackBar || !audioEl) return;

      const touch = e.touches[0];
      trackDragStartX = touch.clientX;
      trackDragStartY = touch.clientY;
      activeTrackDragIndex = parseInt(trackBar.dataset.trackIndex);
      trackDragPending = true;
      isDraggingTrackProgress = false;

      trackDragTimer = setTimeout(() => {
        trackDragPending = false;
        isDraggingTrackProgress = true;
        handleTrackProgressSeek(trackBar, trackDragStartX);
      }, TRACK_DRAG_DELAY);
    }, { passive: true });

    table.addEventListener('click', (e) => {
      const trackBar = e.target.closest('.asmr-track-progress-bar');
      if (trackBar) {
        handleTrackProgressSeek(trackBar, e.clientX);
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (isDraggingTrackProgress && activeTrackDragIndex >= 0) {
        const bar = document.querySelector(`.asmr-track-progress-bar[data-track-index="${activeTrackDragIndex}"]`);
        if (bar) handleTrackProgressSeek(bar, e.clientX);
      }
    });

    document.addEventListener('touchmove', (e) => {
      // 拖拽激活前：检测是否为滑动操作
      if (trackDragPending) {
        const touch = e.touches[0];
        const dx = Math.abs(touch.clientX - trackDragStartX);
        const dy = Math.abs(touch.clientY - trackDragStartY);
        if (dx > TRACK_DRAG_THRESHOLD || dy > TRACK_DRAG_THRESHOLD) {
          cancelTrackDrag();
          return;
        }
      }
      // 拖拽已激活：跟随手指
      if (isDraggingTrackProgress && activeTrackDragIndex >= 0) {
        const bar = document.querySelector(`.asmr-track-progress-bar[data-track-index="${activeTrackDragIndex}"]`);
        if (bar) handleTrackProgressSeek(bar, e.touches[0].clientX);
      }
    }, { passive: true });

    document.addEventListener('mouseup', () => {
      isDraggingTrackProgress = false;
      activeTrackDragIndex = -1;
    });

    document.addEventListener('touchend', () => {
      cancelTrackDrag();
    });
  }

  function handleTrackProgressSeek(bar, clientX) {
    if (!audioEl) return;
    const trackIndex = parseInt(bar.dataset.trackIndex);
    const track = tracks.find(t => t.index === trackIndex);
    if (!track) return;

    const rect = bar.getBoundingClientRect();
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    const trackEndTime = track.endTime || audioEl.duration || 0;
    const trackDuration = trackEndTime - track.startTime;
    const newTime = track.startTime + ratio * trackDuration;

    audioEl.currentTime = clamp(newTime, 0, audioEl.duration || 0);
    updateProgressUI();
    updateTrackProgressUI();
  }

  // ─── UI Update ────────────────────────────────────────────
  function updateProgressUI() {
    if (!audioEl) return;
    const currentTime = audioEl.currentTime || 0;
    updateProgressUIForTime(currentTime);
  }

  function updateProgressUIForTime(currentTime) {
    if (!audioEl) return;

    const duration = audioEl.duration || 0;
    const ratio = duration > 0 ? currentTime / duration : 0;

    const playedEl = document.querySelector('#asmr-main-progress .asmr-progress-played');
    const handleEl = document.querySelector('#asmr-main-progress .asmr-progress-handle');
    const elapsedEl = document.querySelector('.asmr-time-elapsed');
    const totalEl = document.querySelector('.asmr-time-total');

    if (playedEl) playedEl.style.width = `${ratio * 100}%`;
    if (handleEl) handleEl.style.left = `${ratio * 100}%`;
    if (elapsedEl) elapsedEl.textContent = formatTime(currentTime);
    if (totalEl) totalEl.textContent = formatTime(duration);

    const bufferedEl = document.querySelector('#asmr-main-progress .asmr-progress-buffered');
    if (bufferedEl && audioEl.buffered.length > 0) {
      const bufferedEnd = audioEl.buffered.end(audioEl.buffered.length - 1);
      const bufferedRatio = duration > 0 ? bufferedEnd / duration : 0;
      bufferedEl.style.width = `${bufferedRatio * 100}%`;
    }
  }

  function updateTrackProgressUI() {
    if (!audioEl || tracks.length === 0) return;
    const currentTime = audioEl.currentTime || 0;
    updateTrackProgressUIForTime(currentTime);
  }

  function updateTrackProgressUIForTime(currentTime) {
    if (!audioEl || tracks.length === 0) return;

    const duration = audioEl.duration || 0;

    // Determine current track
    let newTrackIndex = -1;
    for (let i = tracks.length - 1; i >= 0; i--) {
      if (currentTime >= tracks[i].startTime) {
        newTrackIndex = i;
        break;
      }
    }

    // Update active track styling
    const table = document.querySelector('#plyr-chapter-playlist');
    if (table) {
      table.querySelectorAll('tr.asm-track-item').forEach((row) => {
        const idx = parseInt(row.dataset.trackIndex);
        row.classList.toggle('asmr-track-active', idx === newTrackIndex);
        const progressRow = row.nextElementSibling;
        if (progressRow && progressRow.classList.contains('asmr-track-progress-row')) {
          progressRow.classList.toggle('asmr-track-active', idx === newTrackIndex);
        }
      });
    }

    // Update each track progress bar + time display
    tracks.forEach((track) => {
      const trackEndTime = track.endTime || duration;
      const trackDuration = trackEndTime - track.startTime;
      let trackProgress = 0;
      let trackElapsed = 0;

      if (currentTime >= track.startTime && currentTime < trackEndTime) {
        trackProgress = trackDuration > 0 ? (currentTime - track.startTime) / trackDuration : 0;
        trackElapsed = currentTime - track.startTime;
      } else if (currentTime >= trackEndTime) {
        trackProgress = 1;
        trackElapsed = trackDuration;
      }

      const playedEl = document.querySelector(`.asmr-track-progress-bar[data-track-index="${track.index}"] .asmr-track-progress-played`);
      const handleEl = document.querySelector(`.asmr-track-progress-bar[data-track-index="${track.index}"] .asmr-track-progress-handle`);
      const timeDisplay = document.querySelector(`.asmr-track-time-display[data-track-index="${track.index}"]`);

      if (playedEl) playedEl.style.width = `${trackProgress * 100}%`;
      if (handleEl) handleEl.style.left = `${trackProgress * 100}%`;
      if (timeDisplay) {
        timeDisplay.textContent = `${formatTimeShort(trackElapsed)}/${formatTimeShort(trackDuration)}`;
      }
    });

    currentTrackIndex = newTrackIndex;
  }

  function updateLoop() {
    if (!isDraggingProgress && !isDraggingTrackProgress) {
      updateProgressUI();
      updateTrackProgressUI();
    }

    if (audioEl && audioEl.duration && tracks.length > 0) {
      if (tracks[tracks.length - 1].endTime === null) {
        tracks[tracks.length - 1].endTime = audioEl.duration;
      }
    }

    requestAnimationFrame(updateLoop);
  }

  // ─── MutationObserver for dynamic content ─────────────────
  function observePage() {
    const observer = new MutationObserver((mutations) => {
      if (uiInjected) {
        observer.disconnect();
        return;
      }

      if (!audioEl && findAudioElement()) {
        console.log('[ASMR Enhancer] Audio element detected via MutationObserver');
        parseTrackList();
        injectUI();
        observer.disconnect();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => observer.disconnect(), 60000);
  }

  // ─── Retry Logic ──────────────────────────────────────────
  function tryInit() {
    parseTrackList();

    if (findAudioElement()) {
      injectUI();
      return;
    }

    if (retryCount < MAX_RETRIES) {
      retryCount++;
      console.log(`[ASMR Enhancer] Retry ${retryCount}/${MAX_RETRIES} in ${RETRY_INTERVAL}ms...`);
      setTimeout(tryInit, RETRY_INTERVAL);
    } else {
      console.warn('[ASMR Enhancer] Max retries reached.');
    }
  }

  // ─── Initialize ───────────────────────────────────────────
  function init() {
    if (document.documentElement.dataset[INJECTED_FLAG]) {
      console.log('[ASMR Enhancer] Already injected, skipping');
      return;
    }

    console.log('[ASMR Enhancer] Initializing...');
    tryInit();
    observePage();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 500));
  } else {
    setTimeout(init, 1000);
  }
})();
