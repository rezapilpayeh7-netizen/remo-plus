// ============================================
// REMO+ - player.js (نسخه نهایی با CORS اصلاح شده)
// ============================================

import supabase from "./supabase-config.js";

// --- DOM Elements ---
const videoElement = document.getElementById("video-player");
const subtitleTrack = document.getElementById("subtitleTrack");
const playerTitle = document.getElementById("movie-title");
const playerMeta = document.getElementById("movie-description");
const downloadButton = document.getElementById("download-btn");

// --- Constants ---
const CONTINUE_KEY = "remo_continue";
const PROGRESS_SAVE_INTERVAL = 5;

// --- State ---
let currentContent = null;
let currentSeasonNumber = null;
let currentEpisodeNumber = null;
let subtitleBlobUrl = null; // برای cleanup

// --- Helpers ---

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function getContentParams() {
  const id = getParam("id");
  const s = getParam("s");
  const e = getParam("e");
  return {
    id,
    season: s ? parseInt(s, 10) : null,
    episode: e ? parseInt(e, 10) : null
  };
}

function getContinueList() {
  try {
    return JSON.parse(localStorage.getItem(CONTINUE_KEY)) || [];
  } catch {
    return [];
  }
}

function setContinueList(list) {
  localStorage.setItem(CONTINUE_KEY, JSON.stringify(list));
}

function saveContinueState({ id, type, season, episode, position, duration }) {
  const list = getContinueList();
  const idx = list.findIndex(item => 
    String(item.id) === String(id) &&
    (type === "movie" || (type === "series" && item.season === season && item.episode === episode))
  );

  const payload = {
    id, type, season, episode, position, duration,
    progress: duration > 0 ? Math.round((position / duration) * 100) : 0,
    updatedAt: Date.now()
  };

  if (idx >= 0) list[idx] = payload;
  else list.push(payload);
  
  setContinueList(list);
}

function formatTime(sec) {
  if (!sec || isNaN(sec)) return "00:00";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0 
    ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
    : `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

// --- Main Initialization ---

async function initializePlayer() {
  if (!videoElement) {
    console.error("❌ video-player element not found");
    return;
  }

  const { id, season, episode } = getContentParams();
  if (!id) {
    console.error("❌ Content ID not found in URL");
    return;
  }

  console.log("🎬 Loading content:", id);

  try {
    const { data, error } = await supabase
      .from("contents")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;
    if (!data) throw new Error("Content not found");

    currentContent = data;
    console.log("✅ Content loaded:", data.title);
    console.log("📝 Subtitle URL:", data.subtitle_url);

    setupHeader(data);

    if (data.type === "movie") {
      await setupMovie(data);
    } else if (data.type === "series") {
      await setupSeries(data, season, episode);
    }

    setupControls();

  } catch (err) {
    console.error("❌ Failed to load content:", err);
  }
}

// --- Header Setup ---

function setupHeader(content) {
  if (playerTitle) playerTitle.textContent = content.title || "بدون عنوان";
  
  if (playerMeta) {
    const parts = [];
    if (content.year) parts.push(content.year);
    if (content.category) parts.push(content.category);
    parts.push(content.type === "series" ? "سریال" : "فیلم");
    playerMeta.textContent = parts.join(" • ");
  }

  if (downloadButton) {
    const dlUrl = content.download_url || content.download;
    downloadButton.href = dlUrl || "#";
    downloadButton.style.display = dlUrl ? "inline-flex" : "none";
  }
}

// --- Movie Player ---

async function setupMovie(content) {
  const cw = getContinueList().find(item => 
    String(item.id) === String(content.id) && item.type === "movie"
  );

  const streamUrl = content.stream_url || content.stream;
  const subtitleUrl = content.subtitle_url || content.subtitle;

  console.log("🎥 Stream URL:", streamUrl);
  console.log("📝 Subtitle URL:", subtitleUrl);

  if (!streamUrl) {
    console.warn("⚠️ No stream URL for movie");
    return;
  }

  await setupSubtitle(subtitleUrl);
  playStream(streamUrl);

  if (cw?.position > 0) {
    videoElement.addEventListener("loadedmetadata", () => {
      if (cw.position < videoElement.duration - 10) {
        videoElement.currentTime = cw.position;
      }
    }, { once: true });
  }

  bindTimeUpdate(content, "movie");
}

// --- Series Player ---

async function setupSeries(content, requestedSeason, requestedEpisode) {
  if (!Array.isArray(content.seasons) || content.seasons.length === 0) {
    console.warn("⚠️ No seasons available");
    return;
  }

  const cw = getContinueList().find(item => 
    String(item.id) === String(content.id) && item.type === "series"
  );

  let seasonNum = requestedSeason || 1;
  let episodeNum = requestedEpisode || 1;

  if (!requestedSeason && !requestedEpisode && cw?.season && cw?.episode) {
    seasonNum = cw.season;
    episodeNum = cw.episode;
  }

  const result = findEpisode(content, seasonNum, episodeNum);
  if (!result.season || !result.episode) {
    console.warn("⚠️ Episode not found");
    return;
  }

  await loadEpisode(content, result.season, result.episode, cw);
}

function findEpisode(content, seasonNum, episodeNum) {
  const season = content.seasons.find(s => s.season_number === seasonNum);
  if (!season?.episodes) return { season: null, episode: null };
  
  const episode = season.episodes.find(ep => ep.episode_number === episodeNum);
  return { season, episode };
}

async function loadEpisode(content, season, episode, cwState) {
  const streamUrl = episode.stream_url;
  const subtitleUrl = episode.subtitle_url || content.subtitle_url || content.subtitle;

  if (!streamUrl) {
    console.warn("⚠️ No stream URL for episode");
    return;
  }

  currentSeasonNumber = season.season_number;
  currentEpisodeNumber = episode.episode_number;

  if (playerTitle) {
    playerTitle.textContent = `${content.title} - فصل ${season.season_number} قسمت ${episode.episode_number}`;
  }

  if (downloadButton) {
    const epDl = episode.download_url || episode.download;
    downloadButton.href = epDl || "#";
    downloadButton.style.display = epDl ? "inline-flex" : "none";
  }

  await setupSubtitle(subtitleUrl);
  playStream(streamUrl);

  const isSameEpisode = cwState?.season === season.season_number && 
                        cwState?.episode === episode.episode_number;
  
  if (isSameEpisode && cwState?.position > 0) {
    videoElement.addEventListener("loadedmetadata", () => {
      if (cwState.position < videoElement.duration - 10) {
        videoElement.currentTime = cwState.position;
      }
    }, { once: true });
  }

  bindTimeUpdate(content, "series", {
    season: season.season_number,
    episode: episode.episode_number
  });

  // Update URL
  const url = new URL(window.location.href);
  url.searchParams.set("s", season.season_number);
  url.searchParams.set("e", episode.episode_number);
  window.history.replaceState({}, "", url);
}

// --- Subtitle Setup (اصلاح شده برای CORS) ---

async function setupSubtitle(url) {
  console.log("🎯 setupSubtitle called with:", url);

  if (!subtitleTrack) {
    console.error("❌ subtitleTrack element not found");
    return;
  }

  // Cleanup قبلی
  if (subtitleBlobUrl) {
    URL.revokeObjectURL(subtitleBlobUrl);
    subtitleBlobUrl = null;
  }

  if (!url) {
    console.log("ℹ️ No subtitle URL provided");
    subtitleTrack.src = "";
    subtitleTrack.mode = "disabled";
    return;
  }

  try {
    // تست CORS با fetch
    console.log("🧪 Testing CORS...");
    const response = await fetch(url, { 
      method: 'GET',
      mode: 'cors',
      headers: {
        'Accept': 'text/vtt,text/plain,*/*'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const vttText = await response.text();
    console.log("✅ CORS OK, VTT loaded, size:", vttText.length);

    // تبدیل به Blob و Object URL
    const blob = new Blob([vttText], { type: 'text/vtt' });
    subtitleBlobUrl = URL.createObjectURL(blob);

    // تنظیم track
    subtitleTrack.src = subtitleBlobUrl;
    subtitleTrack.label = "فارسی";
    subtitleTrack.kind = "subtitles";
    subtitleTrack.srclang = "fa";
    subtitleTrack.default = true;
    
    // فعال کردن با تاخیر کوتاه
    setTimeout(() => {
      subtitleTrack.mode = "showing";
      console.log("✅ Subtitle enabled, mode:", subtitleTrack.mode);
    }, 100);

    // Event listeners
    subtitleTrack.onerror = (e) => console.error("❌ Track error:", e);
    subtitleTrack.onload = () => console.log("✅ Track loaded");

  } catch (err) {
    console.error("❌ CORS/Load error:", err.message);
    
    // Fallback: تلاش مستقیم (اگه CORS تنظیم شده باشه کار می‌کنه)
    console.log("🔄 Trying direct load...");
    subtitleTrack.src = url;
    subtitleTrack.label = "فارسی";
    subtitleTrack.kind = "subtitles";
    subtitleTrack.srclang = "fa";
    subtitleTrack.default = true;
    subtitleTrack.mode = "showing";
  }
}

// --- Stream Playback ---

function playStream(url) {
  if (!url) return;

  console.log("▶️ Playing stream:", url);

  // Cleanup HLS قبلی
  if (window.hlsPlayer) {
    window.hlsPlayer.destroy();
    window.hlsPlayer = null;
  }

  const video = videoElement;

  if (url.includes(".m3u8")) {
    if (window.Hls?.isSupported()) {
      const hls = new window.Hls({
        enableWorker: true,
        lowLatencyMode: true,
        debug: false
      });
      window.hlsPlayer = hls;

      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(err => console.warn("Autoplay blocked:", err));
      });

      hls.on(window.Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          console.error("HLS fatal error:", data);
          hls.destroy();
        }
      });

    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.play().catch(err => console.warn("Autoplay blocked:", err));
    } else {
      console.error("HLS not supported");
      video.src = url;
    }
  } else {
    video.src = url;
    video.play().catch(err => console.warn("Autoplay blocked:", err));
  }
}

// --- Time Update & Progress Save ---

function bindTimeUpdate(content, type, extra = {}) {
  if (!videoElement) return;

  let lastSave = 0;

  const save = () => {
    if (!videoElement.duration) return;
    
    const position = videoElement.currentTime;
    const duration = videoElement.duration;

    if (position < 5 || position > duration - 5) return;

    saveContinueState({
      id: content.id,
      type,
      season: extra.season || currentSeasonNumber,
      episode: extra.episode || currentEpisodeNumber,
      position,
      duration
    });
  };

  videoElement.ontimeupdate = () => {
    const currentSec = Math.floor(videoElement.currentTime);
    if (currentSec % PROGRESS_SAVE_INTERVAL === 0 && currentSec !== lastSave) {
      lastSave = currentSec;
      save();
    }
  };

  videoElement.onpause = save;
  videoElement.onended = save;
}

// --- Custom Controls ---

function setupControls() {
  const playPauseBtn = document.getElementById("play-pause");
  const timeDisplay = document.getElementById("time-display");
  const progressBar = document.getElementById("progress-bar");
  const progressFilled = document.getElementById("progress-filled");
  const subBtn = document.getElementById("sub-btn");
  const fsBtn = document.getElementById("fs-btn");
  const playerWrapper = document.getElementById("player-wrapper");

  if (!videoElement) return;

  // Play/Pause
  if (playPauseBtn) {
    playPauseBtn.addEventListener("click", () => {
      videoElement.paused ? videoElement.play() : videoElement.pause();
    });

    videoElement.addEventListener("play", () => playPauseBtn.textContent = "⏸");
    videoElement.addEventListener("pause", () => playPauseBtn.textContent = "▶");
  }

  // Time & Progress
  if (timeDisplay || progressFilled) {
    videoElement.addEventListener("timeupdate", () => {
      const current = formatTime(videoElement.currentTime);
      const total = formatTime(videoElement.duration || 0);

      if (timeDisplay) timeDisplay.textContent = `${current} / ${total}`;
      
      if (progressFilled && videoElement.duration) {
        const pct = (videoElement.currentTime / videoElement.duration) * 100;
        progressFilled.style.width = `${pct}%`;
      }
    });
  }

  // Seek
  if (progressBar) {
    progressBar.addEventListener("click", (e) => {
      const rect = progressBar.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      if (videoElement.duration) {
        videoElement.currentTime = ratio * videoElement.duration;
      }
    });
  }

  // Subtitle Toggle
  if (subBtn && subtitleTrack) {
    subBtn.addEventListener("click", () => {
      const isShowing = subtitleTrack.mode === "showing";
      subtitleTrack.mode = isShowing ? "disabled" : "showing";
      subBtn.classList.toggle("active", !isShowing);
      console.log("Subtitle mode:", subtitleTrack.mode);
    });
  }

  // Fullscreen
  if (fsBtn && playerWrapper) {
    fsBtn.addEventListener("click", () => {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        playerWrapper.requestFullscreen();
      }
    });
  }
}

// --- Cleanup on page unload ---
window.addEventListener("beforeunload", () => {
  if (subtitleBlobUrl) {
    URL.revokeObjectURL(subtitleBlobUrl);
  }
  if (window.hlsPlayer) {
    window.hlsPlayer.destroy();
  }
});

// --- Init ---
document.addEventListener("DOMContentLoaded", initializePlayer);
