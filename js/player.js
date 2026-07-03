// --- Import Supabase ---
import supabase from "./supabase-config.js";

// --- DOM Elements ---
// توجه: این‌ها بر اساس player.html فعلی تو هستند
const videoElement      = document.getElementById("video-player");
const subtitleTrack     = document.getElementById("subtitleTrack"); // اگر بعداً اضافه کردی

const playerTitle       = document.getElementById("movie-title");
const playerMeta        = document.getElementById("movie-description");
const downloadButton    = document.getElementById("download-btn");

// اگر بعداً سریال UI اضافه کنی:
const episodeList    = document.getElementById("episodeList");
const seasonSelector = document.getElementById("seasonSelector");

// --- localStorage keys ---
const CONTINUE_KEY = "remo_continue";

// --- Helpers ---

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

// id محتوا و پارامتر فصل/قسمت
function getContentParams() {
  const id = getParam("id");
  const s  = getParam("s");
  const e  = getParam("e");

  return {
    id,
    seasonNumber: s ? parseInt(s, 10) : null,
    episodeNumber: e ? parseInt(e, 10) : null,
  };
}

// continue-watching
function getContinueList() {
  const raw = localStorage.getItem(CONTINUE_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (err) {
    console.error("خطا در parse remo_continue:", err);
    return [];
  }
}

function setContinueList(list) {
  localStorage.setItem(CONTINUE_KEY, JSON.stringify(list));
}

// ذخیره وضعیت پخش
function saveContinueState({ id, type, season, episode, position, duration }) {
  const list = getContinueList();
  const idx = list.findIndex(
    (item) =>
      String(item.id) === String(id) &&
      (type === "movie" ||
        (type === "series" &&
          item.season === season &&
          item.episode === episode))
  );

  const payload = {
    id,
    type,
    season: type === "series" ? season : null,
    episode: type === "series" ? episode : null,
    position,
    duration,
    updatedAt: Date.now()
  };

  if (idx >= 0) {
    list[idx] = payload;
  } else {
    list.push(payload);
  }

  setContinueList(list);
}

// --- Main initialize ---
let currentContent = null;
let currentSeasonNumber = null;
let currentEpisodeNumber = null;

async function initializePlayer() {
  if (!videoElement) {
    console.error("videoElement پیدا نشد؛ id باید 'video-player' باشد.");
    return;
  }

  const { id, seasonNumber, episodeNumber } = getContentParams();

  if (!id) {
    console.error("شناسه محتوا در URL یافت نشد.");
    return;
  }

  // دریافت محتوا از Supabase
  let content;
  try {
    const { data, error } = await supabase
      .from("contents")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error("خطا در دریافت محتوا از Supabase:", error);
      return;
    }

    content = data;

    // دیباگ دیتای اصلی محتوا
    window.debugData = content;
    console.log("دیتا لود شد:", content);
  } catch (err) {
    console.error("خطا در ارتباط با Supabase در player.js:", err);
    return;
  }

  if (!content) {
    console.error("محتوا یافت نشد");
    return;
  }

  currentContent = content;

  // رندر UI عمومی
  setupPlayerHeader(content);

  if (content.type === "movie") {
    setupMoviePlayer(content);
  } else if (content.type === "series") {
    setupSeriesPlayer(content, seasonNumber, episodeNumber);
  } else {
    console.warn("نوع محتوا نامعتبر است:", content.type);
  }

  // کنترل‌های سفارشی (play/pause، progress bar، subtitle toggle، fullscreen)
  setupCustomControls();
}

// --- Header / Info ---

function setupPlayerHeader(content) {
  if (playerTitle) {
    playerTitle.textContent = content.title || "بدون عنوان";
  }

  if (playerMeta) {
    const parts = [];
    if (content.year) parts.push(content.year);
    if (content.category) parts.push(content.category);
    if (content.type === "series") parts.push("سریال");
    if (content.type === "movie") parts.push("فیلم");
    playerMeta.textContent = parts.join(" • ");
  }

  // دکمه دانلود عمومی (برای فیلم؛ برای سریال در loadEpisode override می‌شود)
  if (downloadButton) {
    if (content.download) {
      downloadButton.href = content.download;
      downloadButton.style.display = "inline-flex";
    } else {
      downloadButton.style.display = "none";
    }
  }
}

// --- Movie Player ---

function setupMoviePlayer(content) {
  const cwList = getContinueList();
  const cw = cwList.find(
    (item) => String(item.id) === String(content.id) && item.type === "movie"
  );

  const streamUrl    = content.stream;
  const subtitleUrl  = content.subtitle;

  if (!streamUrl) {
    console.warn("لینک پخش برای فیلم موجود نیست.");
    return;
  }

  // زیرنویس
  setupSubtitleTrack(subtitleUrl);

  // پخش استریم با HLS/mp4
  playStream(streamUrl);

  // ادامه تماشا
  if (
    cw &&
    typeof cw.position === "number" &&
    cw.position > 0 &&
    videoElement
  ) {
    // صبر کن تا متادیتا لود شود
    videoElement.addEventListener(
      "loadedmetadata",
      () => {
        if (cw.position < videoElement.duration) {
          videoElement.currentTime = cw.position;
        }
      },
      { once: true }
    );
  }

  bindTimeUpdate(content, "movie");
}

// --- Series Player ---

function setupSeriesPlayer(content, requestedSeason, requestedEpisode) {
  if (!Array.isArray(content.seasons) || content.seasons.length === 0) {
    console.warn("هیچ فصلی برای این سریال ثبت نشده است.");
    return;
  }

  // فصل/قسمت هدف
  let seasonNumber = requestedSeason || 1;
  let episodeNumber = requestedEpisode || 1;

  const cwList = getContinueList();
  const cwState = cwList.find(
    (item) => String(item.id) === String(content.id) && item.type === "series"
  );

  // اگر URL چیزی نگفته و continue داریم، از آن استفاده کن
  if (!requestedSeason && !requestedEpisode && cwState) {
    if (cwState.season) seasonNumber = cwState.season;
    if (cwState.episode) episodeNumber = cwState.episode;
  }

  currentSeasonNumber  = seasonNumber;
  currentEpisodeNumber = episodeNumber;

  // انتخاب اپیزود
  const { season, episode } = findEpisode(content, seasonNumber, episodeNumber);
  if (!season || !episode) {
    console.warn("اپیزود مورد نظر یافت نشد.");
    return;
  }

  // اگر UI سیزن/اپیزود داری، بعداً این‌ها را اینجا رندر کن
  // renderSeasonSelector(content, seasonNumber);
  // renderEpisodesList(content, seasonNumber, episodeNumber);

  loadEpisode(content, season, episode, cwState);
}

// پیدا کردن فصل/قسمت بر اساس schema استاندارد seasons
function findEpisode(content, seasonNumber, episodeNumber) {
  const season = content.seasons.find(
    (s) => s.season_number === seasonNumber
  );
  if (!season || !Array.isArray(season.episodes)) {
    return { season: null, episode: null };
  }

  const episode = season.episodes.find(
    (ep) => ep.episode_number === episodeNumber
  );

  return { season, episode };
}

// بارگذاری اپیزود در پلیر
function loadEpisode(content, season, episode, cwState) {
  if (!videoElement) return;

  const streamUrl   = episode.stream;
  const subtitleUrl = episode.subtitle || content.subtitle;

  if (!streamUrl) {
    console.warn("لینک stream برای این اپیزود تعریف نشده.");
    return;
  }

  currentSeasonNumber  = season.season_number;
  currentEpisodeNumber = episode.episode_number;

  // زیرنویس
  setupSubtitleTrack(subtitleUrl);

  // پخش استریم
  playStream(streamUrl);

  // آپدیت عنوان
  if (playerTitle) {
    playerTitle.textContent = `${content.title} - فصل ${season.season_number} قسمت ${episode.episode_number}`;
  }

  // دانلود
  if (downloadButton) {
    if (episode.download) {
      downloadButton.href = episode.download;
      downloadButton.style.display = "inline-flex";
    } else {
      downloadButton.style.display = "none";
    }
  }

  // continue position
  if (
    cwState &&
    cwState.season === season.season_number &&
    cwState.episode === episode.episode_number &&
    typeof cwState.position === "number" &&
    cwState.position > 0
  ) {
    videoElement.addEventListener(
      "loadedmetadata",
      () => {
        if (cwState.position < videoElement.duration) {
          videoElement.currentTime = cwState.position;
        }
      },
      { once: true }
    );
  }

  bindTimeUpdate(content, "series", {
    seasonNumber: season.season_number,
    episodeNumber: episode.episode_number,
  });

  // URL را آپدیت کن (برای share لینک اپیزود)
  const url = new URL(window.location.href);
  url.searchParams.set("s", season.season_number);
  url.searchParams.set("e", episode.episode_number);
  window.history.replaceState({}, "", url.toString());
}

// --- Subtitle ---

function setupSubtitleTrack(subtitleUrl) {
  // الان در HTML track نداریم؛ اگر بعداً اضافه کردی، این بخش فعال می‌شود.
  if (!subtitleTrack) return;

  if (subtitleUrl) {
    subtitleTrack.src = subtitleUrl;
    subtitleTrack.label = "فارسی";
    subtitleTrack.kind = "subtitles";
    subtitleTrack.default = true;
    subtitleTrack.mode = "showing";
  } else {
    subtitleTrack.src = "";
    subtitleTrack.mode = "disabled";
  }
}

// --- HLS/mp4 playback ---

function playStream(url) {
  if (!url) {
    console.error("No stream URL provided!");
    return;
  }

  const video = videoElement;

  // اگر HLS (m3u8)
  if (url.includes(".m3u8")) {
    if (window.Hls && window.Hls.isSupported()) {
      const hls = new Hls();
      window.hlsPlayer = hls; // برای دیباگ

      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(err => {
          console.warn("Autoplay blocked:", err);
        });
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        console.error("HLS error:", data);
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.play().catch(err => console.warn("Autoplay blocked:", err));
    } else {
      console.error("HLS not supported in this browser.");
      // fallback: شاید backend لینک دیگری بده
      video.src = url;
      video.play().catch(err => console.warn("Autoplay blocked:", err));
    }
  } else {
    // mp4 و سایر فرمت‌ها
    video.src = url;
    video.play().catch(err => console.warn("Autoplay blocked:", err));
  }
}

// --- Timeupdate binding ---

function bindTimeUpdate(content, type, extra = {}) {
  if (!videoElement) return;

  // برای اینکه event listener چندباره اضافه نشود:
  videoElement.onpause      = null;
  videoElement.ontimeupdate = null;
  videoElement.onended      = null;

  const save = () => {
    if (!videoElement || !videoElement.duration) return;
    const position = videoElement.currentTime;
    const duration = videoElement.duration;

    // اگر خیلی کم پخش شده، ذخیره نکن
    if (position < 5) return;

    saveContinueState({
      id: content.id,
      type,
      season: extra.seasonNumber || currentSeasonNumber || null,
      episode: extra.episodeNumber || currentEpisodeNumber || null,
      position,
      duration,
    });
  };

  videoElement.ontimeupdate = () => {
    if (Math.floor(videoElement.currentTime) % 5 === 0) {
      save();
    }
  };

  videoElement.onpause = () => {
    save();
  };

  videoElement.onended = () => {
    save();
  };
}

// --- Custom Controls (play/pause, progress, subtitles toggle, fullscreen) ---

function setupCustomControls() {
  const playPauseBtn  = document.getElementById("play-pause");
  const timeDisplay   = document.getElementById("time-display");
  const progressBar   = document.getElementById("progress-bar");
  const progressFilled= document.getElementById("progress-filled");
  const subBtn        = document.getElementById("sub-btn");
  const fsBtn         = document.getElementById("fs-btn");
  const playerWrapper = document.getElementById("player-wrapper");

  if (!videoElement) return;

  // Play/Pause
  if (playPauseBtn) {
    playPauseBtn.addEventListener("click", () => {
      if (videoElement.paused) {
        videoElement.play().catch(err => console.warn("Autoplay blocked:", err));
        playPauseBtn.textContent = "⏸";
      } else {
        videoElement.pause();
        playPauseBtn.textContent = "▶";
      }
    });

    videoElement.addEventListener("play", () => {
      playPauseBtn.textContent = "⏸";
    });

    videoElement.addEventListener("pause", () => {
      playPauseBtn.textContent = "▶";
    });
  }

  // Time display + progress
  if (timeDisplay || progressFilled) {
    videoElement.addEventListener("timeupdate", () => {
      const current = formatTime(videoElement.currentTime);
      const total   = formatTime(videoElement.duration || 0);
      if (timeDisplay) {
        timeDisplay.textContent = `${current} / ${total}`;
      }

      if (progressFilled && videoElement.duration) {
        const percent = (videoElement.currentTime / videoElement.duration) * 100;
        progressFilled.style.width = `${percent}%`;
      }
    });
  }

  // Seek by clicking progress bar
  if (progressBar) {
    progressBar.addEventListener("click", (e) => {
      const rect = progressBar.getBoundingClientRect();
      const x    = e.clientX - rect.left;
      const ratio= x / rect.width;
      if (videoElement.duration) {
        videoElement.currentTime = ratio * videoElement.duration;
      }
    });
  }

  // Subtitle toggle (اگر track داریم)
  if (subBtn && subtitleTrack) {
    subBtn.addEventListener("click", () => {
      const isOn = subtitleTrack.mode === "showing";
      if (isOn) {
        subtitleTrack.mode = "disabled";
        subBtn.classList.remove("active");
        subBtn.classList.add("off");
      } else {
        subtitleTrack.mode = "showing";
        subBtn.classList.add("active");
        subBtn.classList.remove("off");
      }
    });
  }

  // Fullscreen
  if (fsBtn && playerWrapper) {
    fsBtn.addEventListener("click", () => {
      const isFs = document.fullscreenElement === playerWrapper;
      if (isFs) {
        document.exitFullscreen?.();
        playerWrapper.classList.remove("player-fullscreen");
      } else {
        playerWrapper.requestFullscreen?.();
        playerWrapper.classList.add("player-fullscreen");
      }
    });

    document.addEventListener("fullscreenchange", () => {
      const isFs = document.fullscreenElement === playerWrapper;
      if (!isFs) {
        playerWrapper.classList.remove("player-fullscreen");
      }
    });
  }
}

function formatTime(sec) {
  if (!sec || isNaN(sec)) return "00:00";
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60);
  const mm = m.toString().padStart(2, "0");
  const ss = s.toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

// --- Start ---
document.addEventListener("DOMContentLoaded", initializePlayer);
