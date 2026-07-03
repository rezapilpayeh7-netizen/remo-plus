// --- Import Supabase ---
import supabase from "./supabase-config.js";
// --- DOM Elements ---
const videoElement     = document.getElementById("videoPlayer");
const subtitleTrack    = document.getElementById("subtitleTrack");

const playerTitle      = document.getElementById("playerTitle");
const playerMeta       = document.getElementById("playerMeta");
const playerDescription= document.getElementById("playerDescription");

const episodeList      = document.getElementById("episodeList");
const seasonSelector   = document.getElementById("seasonSelector");

const backButton       = document.getElementById("backButton");
const downloadButton   = document.getElementById("playerDownloadBtn");

// --- Helpers ---

// گرفتن پارامتر از URL
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
    episodeNumber: e ? parseInt(e, 10) : null
  };
}

// continue-watching (همان ساختار پیشنهادی)
function getContinueList() {
  const raw = localStorage.getItem("remo_continue");
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
  localStorage.setItem("remo_continue", JSON.stringify(list));
}

// ذخیره وضعیت پخش
function saveContinueState({ id, type, season, episode, position, duration }) {
  const list = getContinueList();
  const idx = list.findIndex(
    item =>
      String(item.id) === String(id) &&
      ((type === "movie") ||
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
    duration
  };

  if (idx >= 0) {
    list[idx] = payload;
  } else {
    list.push(payload);
  }

  setContinueList(list);
}

// --- Main initialize ---
async function initializePlayer() {
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
  } catch (err) {
    console.error("خطا در ارتباط با Supabase در player.js:", err);
    return;
  }

  if (!content) {
    console.error("محتوا یافت نشد");
    return;
  }

  // دکمه برگشت
  if (backButton) {
    backButton.addEventListener("click", () => {
      const ref = document.referrer || "";
      if (ref.includes("details.html")) {
        window.history.back();
      } else {
        window.location.href = `details.html?id=${content.id}`;
      }
    });
  }

  // رندر UI عمومی
  setupPlayerHeader(content);

  if (content.type === "movie") {
    setupMoviePlayer(content);
  } else if (content.type === "series") {
    setupSeriesPlayer(content, seasonNumber, episodeNumber);
  }
}

// --- Header / Info ---

function setupPlayerHeader(content) {
  if (playerTitle) {
    playerTitle.textContent = content.title || "بدون عنوان";
  }

  if (playerDescription) {
    playerDescription.textContent =
      content.description || "توضیحات در دسترس نیست.";
  }

  if (playerMeta) {
    const parts = [];
    if (content.year)                parts.push(content.year);
    if (content.category)            parts.push(content.category);
    if (content.type === "series")   parts.push("سریال");
    if (content.type === "movie")    parts.push("فیلم");
    playerMeta.textContent = parts.join(" • ");
  }
}

// --- Movie Player ---

function setupMoviePlayer(content) {
  if (!videoElement) return;

  // لینک پخش
  if (content.stream) {
    videoElement.src = content.stream;
  } else {
    console.warn("لینک پخش برای فیلم موجود نیست.");
  }

  // لینک دانلود
  if (downloadButton) {
    if (content.download) {
      downloadButton.href = content.download;
      downloadButton.style.display = "inline-flex";
    } else {
      downloadButton.style.display = "none";
    }
  }

  // زیرنویس
  setupSubtitleTrack(content.subtitle);

  // بارگذاری continue-watching برای فیلم
  const cwList = getContinueList();
  const cw = cwList.find(
    (item) => String(item.id) === String(content.id) && item.type === "movie"
  );

  if (cw && typeof cw.position === "number" && cw.position > 0) {
    videoElement.currentTime = cw.position;
  }

  bindTimeUpdate(content, "movie");
}

// --- Series Player ---

function setupSeriesPlayer(content, requestedSeason, requestedEpisode) {
  if (!Array.isArray(content.seasons) || content.seasons.length === 0) {
    console.warn("هیچ فصلی برای این سریال ثبت نشده است.");
    return;
  }

  // فصل و قسمت هدف: یا از URL، یا از continue-watching، یا ۱/۱
  let seasonNumber     = requestedSeason || 1;
  let episodeNumber    = requestedEpisode || 1;

  const cwList  = getContinueList();
  const cwState = cwList.find(
    (item) => String(item.id) === String(content.id) && item.type === "series"
  );
  if (!requestedSeason && !requestedEpisode && cwState) {
    if (cwState.season)  seasonNumber  = cwState.season;
    if (cwState.episode) episodeNumber = cwState.episode;
  }

  // رندر سیزن سلکتور و لیست اپیزودها
  renderSeasonSelector(content, seasonNumber);
  renderEpisodesList(content, seasonNumber, episodeNumber);

  // انتخاب اپیزود اولیه
  const { episode, season } = findEpisode(content, seasonNumber, episodeNumber);
  if (episode && season) {
    loadEpisode(content, season, episode);
    // اگر continue-watching برای این اپیزود داریم، زمان را ست کنیم
    if (cwState &&
        cwState.season === season.seasonNumber &&
        cwState.episode === episode.episodeNumber &&
        typeof cwState.position === "number" &&
        cwState.position > 0 &&
        videoElement) {
      videoElement.currentTime = cwState.position;
    }
  }
}

// پیدا کردن فصل/قسمت
function findEpisode(content, seasonNumber, episodeNumber) {
  const season = content.seasons.find(
    (s) => s.seasonNumber === seasonNumber
  );
  if (!season || !Array.isArray(season.episodes)) {
    return { season: null, episode: null };
  }

  const episode = season.episodes.find(
    (ep) => ep.episodeNumber === episodeNumber
  );

  return { season, episode };
}

// رندر سیزن سلکتور
function renderSeasonSelector(content, activeSeasonNumber) {
  if (!seasonSelector) return;

  seasonSelector.innerHTML = "";

  content.seasons.forEach((season) => {
    const option = document.createElement("option");
    option.value = season.seasonNumber;
    option.textContent = `فصل ${season.seasonNumber}${
      season.title ? " - " + season.title : ""
    }`;
    if (season.seasonNumber === activeSeasonNumber) {
      option.selected = true;
    }
    seasonSelector.appendChild(option);
  });

  seasonSelector.addEventListener("change", () => {
    const newSeasonNumber = parseInt(seasonSelector.value, 10);
    // default episode: 1
    renderEpisodesList(content, newSeasonNumber, 1);

    const { episode, season } = findEpisode(content, newSeasonNumber, 1);
    if (episode && season) {
      loadEpisode(content, season, episode);
    }
  });
}

// رندر لیست اپیزودها
function renderEpisodesList(content, activeSeasonNumber, activeEpisodeNumber) {
  if (!episodeList) return;

  episodeList.innerHTML = "";

  const season = content.seasons.find(
    (s) => s.seasonNumber === activeSeasonNumber
  );
  if (!season || !Array.isArray(season.episodes)) return;

  season.episodes.forEach((episode) => {
    const item = document.createElement("button");
    item.className = "episode-item";

    if (episode.episodeNumber === activeEpisodeNumber) {
      item.classList.add("active");
    }

    item.textContent = `قسمت ${episode.episodeNumber}: ${
      episode.title || ""
    }`;

    item.addEventListener("click", () => {
      // active کلاس‌ها
      document
        .querySelectorAll(".episode-item")
        .forEach((el) => el.classList.remove("active"));
      item.classList.add("active");

      loadEpisode(content, season, episode);
    });

    episodeList.appendChild(item);
  });
}

// بارگذاری اپیزود در پلیر
function loadEpisode(content, season, episode) {
  if (!videoElement) return;

  if (!episode.stream) {
    console.warn("لینک stream برای این اپیزود تعریف نشده.");
  }
  videoElement.src = episode.stream || "";

  // دانلود
  if (downloadButton) {
    if (episode.download) {
      downloadButton.href = episode.download;
      downloadButton.style.display = "inline-flex";
    } else {
      downloadButton.style.display = "none";
    }
  }

  // زیرنویس
  setupSubtitleTrack(episode.subtitle);

  // آپدیت عنوان بالای پلیر (اگر خواستی)
  if (playerTitle) {
    playerTitle.textContent = `${content.title} - فصل ${season.seasonNumber} قسمت ${episode.episodeNumber}`;
  }

  // bind timeupdate برای سریال
  bindTimeUpdate(content, "series", {
    seasonNumber: season.seasonNumber,
    episodeNumber: episode.episodeNumber
  });

  // برای اینکه از ابتدا شروع شود
  videoElement.currentTime = 0;
  videoElement.play().catch(() => {
    // کاربر اجازه autoplay نداده بود؛ اشکالی ندارد
  });

  // آدرس URL را هم آپدیت کنیم (اختیاری، ولی کمک می‌کند به اشتراک‌گذاری لینک اپیزود)
  const url = new URL(window.location.href);
  url.searchParams.set("s", season.seasonNumber);
  url.searchParams.set("e", episode.episodeNumber);
  window.history.replaceState({}, "", url.toString());
}

// --- Subtitle ---

function setupSubtitleTrack(subtitleUrl) {
  if (!subtitleTrack) return;

  if (subtitleUrl) {
    subtitleTrack.src   = subtitleUrl;
    subtitleTrack.label = "فارسی";
    subtitleTrack.kind  = "subtitles";
    subtitleTrack.default = true;
    subtitleTrack.mode  = "showing";
  } else {
    // اگر زیرنویس نداریم، src را خالی کنیم
    subtitleTrack.src   = "";
    subtitleTrack.mode  = "disabled";
  }
}

// --- Timeupdate binding ---

function bindTimeUpdate(content, type, extra = {}) {
  if (!videoElement) return;

  // برای اینکه event listener چندباره اضافه نشود، ابتدا قبلی‌ها را حذف کنیم:
  videoElement.onpause     = null;
  videoElement.ontimeupdate= null;
  videoElement.onended     = null;

  const save = () => {
    if (!videoElement || !videoElement.duration) return;
    const position = videoElement.currentTime;
    const duration = videoElement.duration;

    // اگر کمتر از چند ثانیه پخش شده، نذارش
    if (position < 5) return;

    saveContinueState({
      id: content.id,
      type,
      season: extra.seasonNumber || null,
      episode: extra.episodeNumber || null,
      position,
      duration
    });
  };

  videoElement.ontimeupdate = () => {
    // هر چند ثانیه یک بار ذخیره شود (مثلاً هر ~۵ ثانیه)
    // ساده: مثلا اگر currentTime % 5 < 0.3
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

// --- Start ---
document.addEventListener("DOMContentLoaded", initializePlayer);
