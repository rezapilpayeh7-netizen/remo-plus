// ============================================
// REMO+ - details.js (اصلاح شده)
// صفحه جزئیات محتوا - نمایش اطلاعات، مدیریت علاقه‌مندی و ادامه تماشا
// ============================================

import supabase from "./supabase-config.js";

// --- DOM Elements ---
const detailsCover = document.getElementById("detailsCover");
const detailsTitle = document.getElementById("detailsTitle");
const detailsMeta = document.getElementById("detailsMeta");
const detailsDescription = document.getElementById("detailsDescription");
const detailsLong = document.getElementById("detailsLong");
const detailsInfo = document.getElementById("detailsInfo");

const watchBtn = document.getElementById("watchBtn");
const downloadBtn = document.getElementById("downloadBtn");
const favoriteBtn = document.getElementById("favoriteBtn");

const seasonsWrapper = document.getElementById("seasonsWrapper");
const seasonTabs = document.getElementById("seasonTabs");
const episodesList = document.getElementById("episodesList");

// --- Schema Standard ---
// استاندارد فیلدهای رکورد content:
// id, title, type, year, category, description,
// cover_url, stream_url, download_url, subtitle_url,
// seasons (JSON برای سریال)
// 
// ساختار فصل:
// { season_number: number, episodes: [...] }
//
// ساختار قسمت:
// { episode_number: number, title: string, duration: string, thumbnail_url: string, stream_url: string, subtitle_url: string }

// --- Helper Functions ---

function getContentId() {
  return new URLSearchParams(window.location.search).get("id");
}

function getContinueState(contentId) {
  const raw = localStorage.getItem("remo_continue");
  if (!raw) return null;
  
  try {
    const list = JSON.parse(raw);
    return list.find(item => String(item.id) === String(contentId)) || null;
  } catch {
    return null;
  }
}

function getFavorites() {
  const raw = localStorage.getItem("remo_favorites");
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function setFavorites(list) {
  localStorage.setItem("remo_favorites", JSON.stringify(list));
}

function updateFavoriteButton(isFav) {
  if (!favoriteBtn) return;
  favoriteBtn.textContent = isFav ? "★ در علاقه‌مندی‌ها" : "★ افزودن به علاقه‌مندی";
  favoriteBtn.classList.toggle("btn-secondary-active", isFav);
}

// --- Main Initialization ---

async function initializeDetailsPage() {
  const contentId = getContentId();
  
  if (!contentId) {
    console.error("شناسه محتوا یافت نشد");
    return;
  }

  // Fetch from Supabase
  let content = null;
  try {
    const { data, error } = await supabase
      .from("contents")
      .select("*")
      .eq("id", contentId)
      .single();

    if (error) {
      console.error("Supabase error:", error);
      return;
    }
    content = data;
  } catch (err) {
    console.error("Connection error:", err);
    return;
  }

  if (!content) {
    console.error("محتوا یافت نشد");
    return;
  }

  // Render content info
  renderContentInfo(content);
  
  // Render metadata
  renderMetadata(content);
  
  // Render side info
  renderSideInfo(content);
  
  // Setup action buttons
  setupWatchButton(content);
  setupDownloadButton(content);
  setupFavoriteButton(content);
  
  // Render seasons if series
  if (content.type === "series") {
    renderSeriesSection(content);
  }
}

// --- Render Functions ---

function renderContentInfo(content) {
  if (detailsTitle) {
    detailsTitle.textContent = content.title || "بدون عنوان";
  }

  if (detailsDescription) {
    detailsDescription.textContent = content.description || "توضیحی ثبت نشده";
  }

  if (detailsLong) {
    detailsLong.textContent = content.description || "";
  }

  if (detailsCover) {
    detailsCover.src = content.cover_url || "assets/default-cover.jpg";
    detailsCover.alt = content.title || "کاور";
  }
}

function renderMetadata(content) {
  if (!detailsMeta) return;

  const parts = [];
  
  if (content.year) {
    parts.push(`<span>${content.year}</span>`);
  }

  const typeLabel = content.type === "series" ? "سریال" : "فیلم";
  parts.push(`<span>${typeLabel}</span>`);

  if (content.type === "series" && Array.isArray(content.seasons)) {
    parts.push(`<span>${content.seasons.length} فصل</span>`);
  }

  detailsMeta.innerHTML = parts.join('<span class="meta-separator">•</span>');
}

function renderSideInfo(content) {
  if (!detailsInfo) return;

  detailsInfo.innerHTML = "";

  const fields = [
    { key: "category", label: "ژانر" },
    { key: "director", label: "کارگردان" },
    { key: "cast", label: "بازیگران", isArray: true }
  ];

  fields.forEach(field => {
    const value = content[field.key];
    if (!value) return;

    const div = document.createElement("div");
    div.innerHTML = `
      <h4 class="h4" style="margin-bottom:5px;">${field.label}</h4>
      <p class="text-soft">
        ${field.isArray && Array.isArray(value) ? value.join("، ") : value}
      </p>
    `;
    detailsInfo.appendChild(div);
  });
}

// --- Action Buttons ---

function setupDownloadButton(content) {
  if (!downloadBtn) return;
  
  if (content.download_url) {
    downloadBtn.href = content.download_url;
    downloadBtn.style.display = "inline-flex";
  } else {
    downloadBtn.style.display = "none";
  }
}

function setupWatchButton(content) {
  if (!watchBtn) return;

  const cwState = getContinueState(content.id);

  if (content.type === "movie") {
    watchBtn.href = `player.html?id=${content.id}`;
    const hasProgress = cwState && typeof cwState.progress === "number" && cwState.progress > 0;
    watchBtn.textContent = hasProgress ? "▶ ادامه تماشا" : "▶ پخش فیلم";
    
  } else if (content.type === "series") {
    let s = 1, e = 1;
    
    if (cwState?.season && cwState?.episode) {
      s = cwState.season;
      e = cwState.episode;
      watchBtn.textContent = `▶ ادامه فصل ${s} قسمت ${e}`;
    } else {
      watchBtn.textContent = "▶ پخش از قسمت اول";
    }
    
    watchBtn.href = `player.html?id=${content.id}&s=${s}&e=${e}`;
  }
}

function setupFavoriteButton(content) {
  if (!favoriteBtn) return;

  let favorites = getFavorites();
  let isFav = favorites.some(fav => String(fav.id) === String(content.id));
  updateFavoriteButton(isFav);

  favoriteBtn.addEventListener("click", () => {
    favorites = getFavorites();
    const exists = favorites.some(fav => String(fav.id) === String(content.id));

    let updated;
    if (exists) {
      updated = favorites.filter(fav => String(fav.id) !== String(content.id));
      isFav = false;
    } else {
      const minimal = {
        id: content.id,
        title: content.title,
        cover_url: content.cover_url,
        type: content.type,
        year: content.year,
        category: content.category
      };
      updated = [...favorites, minimal];
      isFav = true;
    }

    setFavorites(updated);
    updateFavoriteButton(isFav);
  });
}

// --- Series Section ---

function renderSeriesSection(content) {
  if (!seasonsWrapper || !seasonTabs || !episodesList) return;
  
  if (!Array.isArray(content.seasons) || content.seasons.length === 0) {
    seasonsWrapper.style.display = "none";
    return;
  }

  seasonsWrapper.style.display = "block";
  
  const cwState = getContinueState(content.id);
  
  // Clear previous
  seasonTabs.innerHTML = "";
  episodesList.innerHTML = "";

  // Create tabs
  content.seasons.forEach((season, index) => {
    const seasonNum = season.season_number || (index + 1);
    
    const tab = document.createElement("button");
    tab.className = "season-tab";
    tab.textContent = `فصل ${seasonNum}`;
    tab.dataset.seasonIndex = index;
    tab.dataset.seasonNumber = seasonNum;

    const isActive = (cwState?.season === seasonNum) || (!cwState && index === 0);
    if (isActive) {
      tab.classList.add("active");
    }

    tab.addEventListener("click", () => {
      document.querySelectorAll(".season-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      renderEpisodes(content.id, season);
    });

    seasonTabs.appendChild(tab);
  });

  // Render initial season
  let initialSeason = content.seasons[0];
  if (cwState?.season) {
    const found = content.seasons.find(s => s.season_number === cwState.season);
    if (found) initialSeason = found;
  }
  
  renderEpisodes(content.id, initialSeason);
}

function renderEpisodes(seriesId, season) {
  if (!episodesList) return;
  
  episodesList.innerHTML = "";

  if (!season?.episodes || !Array.isArray(season.episodes)) return;

  season.episodes.forEach(ep => {
    const epNum = ep.episode_number;
    const title = ep.title || `قسمت ${epNum}`;
    const duration = ep.duration || "";
    const thumb = ep.thumbnail_url || "assets/default-episode.jpg";

    const card = document.createElement("div");
    card.className = "episode-card";

    card.innerHTML = `
      <img src="${thumb}" alt="${title}" class="episode-thumb" loading="lazy">
      <div class="episode-info">
        <h4 class="episode-info-title">قسمت ${epNum}: ${title}</h4>
        ${duration ? `<p class="episode-info-meta">${duration}</p>` : ""}
      </div>
      <a href="player.html?id=${seriesId}&s=${season.season_number}&e=${epNum}"
         class="btn-secondary play-ep-btn">
         ▶ پخش
      </a>
    `;

    episodesList.appendChild(card);
  });
}

// --- Init ---
document.addEventListener("DOMContentLoaded", initializeDetailsPage);
