// --- Import Supabase ---
import supabase from "./js/supabase-config.js";

// --- انتخاب عناصر DOM ---
const detailsCover       = document.getElementById("detailsCover");
const detailsTitle       = document.getElementById("detailsTitle");
const detailsMeta        = document.getElementById("detailsMeta");
const detailsDescription = document.getElementById("detailsDescription");
const detailsLong        = document.getElementById("detailsLong");
const detailsInfo        = document.getElementById("detailsInfo");

const watchBtn           = document.getElementById("watchBtn");
const downloadBtn        = document.getElementById("downloadBtn");
const favoriteBtn        = document.getElementById("favoriteBtn");

const seasonsWrapper     = document.getElementById("seasonsWrapper");
const seasonTabs         = document.getElementById("seasonTabs");
const episodesList       = document.getElementById("episodesList");

// --- توابع کمکی ---

// گرفتن id از URL
function getContentId() {
  return new URLSearchParams(window.location.search).get("id");
}

// خواندن continue-watching برای این محتوا (بر اساس id)
function getContinueState(contentId) {
  const cwRaw = localStorage.getItem("remo_continue");
  if (!cwRaw) return null;

  try {
    const cwList = JSON.parse(cwRaw); // آرایه‌ای از آبجکت‌ها
    // ساخت پیشنهادی: { id, type, season, episode, position }
    return cwList.find(item => String(item.id) === String(contentId)) || null;
  } catch (err) {
    console.error("خطا در parse remo_continue:", err);
    return null;
  }
}

// خواندن لیست علاقه‌مندی‌ها
function getFavorites() {
  const favRaw = localStorage.getItem("remo_favorites");
  if (!favRaw) return [];
  try {
    return JSON.parse(favRaw);
  } catch (err) {
    console.error("خطا در parse remo_favorites:", err);
    return [];
  }
}

// ذخیره علاقه‌مندی‌ها
function setFavorites(list) {
  localStorage.setItem("remo_favorites", JSON.stringify(list));
}

// به‌روزرسانی ظاهر دکمه‌ی favorite
function updateFavoriteButton(isFavorite) {
  if (!favoriteBtn) return;
  favoriteBtn.textContent = isFavorite ? "★ در علاقه‌مندی‌ها" : "★ افزودن به علاقه‌مندی";
  favoriteBtn.classList.toggle("btn-secondary-active", isFavorite);
}

// --- تابع اصلی راه‌اندازی صفحه جزئیات ---

async function initializeDetailsPage() {
  const contentId = getContentId();

  if (!contentId) {
    console.error("شناسه محتوا در URL یافت نشد");
    return;
  }

  // --- دریافت داده از Supabase ---
  let content = null;
  try {
    const { data, error } = await supabase
      .from("contents")
      .select("*")
      .eq("id", contentId)
      .single();

    if (error) {
      console.error("خطا در دریافت محتوا از Supabase:", error);
      return;
    }

    content = data;
  } catch (err) {
    console.error("خطا در ارتباط با Supabase در details.js:", err);
    return;
  }

  if (!content) {
    console.error("محتوای مورد نظر در داده‌ها یافت نشد");
    return;
  }

  // --- پرکردن اطلاعات اصلی ---
  if (detailsTitle) {
    detailsTitle.textContent = content.title || "بدون عنوان";
  }

  if (detailsDescription) {
    detailsDescription.textContent = content.description || "توضیحی ثبت نشده است.";
  }

  if (detailsLong) {
    detailsLong.textContent = content.longDescription || content.description || "";
  }

  if (detailsCover) {
    if (content.cover) {
      detailsCover.src = content.cover;
      detailsCover.alt = content.title || "کاور";
    } else {
      detailsCover.src = "assets/covers/default-cover.jpg"; // اگر داری
      detailsCover.alt = "کاور پیش‌فرض";
    }
  }

  // --- متا دیتا ---
  if (detailsMeta) {
    const metaParts = [];

    if (content.year) {
      metaParts.push(`<span>${content.year}</span>`);
    }

    const typeLabel = content.type === "series" ? "سریال" : "فیلم";
    metaParts.push(`<span>${typeLabel}</span>`);

    if (content.type === "series" && Array.isArray(content.seasons)) {
      metaParts.push(`<span>${content.seasons.length} فصل</span>`);
    }

    if (content.duration && content.type === "movie") {
      metaParts.push(`<span>${content.duration}</span>`);
    }

    detailsMeta.innerHTML = metaParts.join('<span class="meta-separator">•</span>');
  }

  // --- اطلاعات جانبی در ستون راست ---
  if (detailsInfo) {
    detailsInfo.innerHTML = "";

    if (content.category) {
      const div = document.createElement("div");
      div.innerHTML = `
        <h4 class="h4" style="margin-bottom:5px;">ژانر</h4>
        <p class="text-soft">${content.category}</p>
      `;
      detailsInfo.appendChild(div);
    }

    if (content.director) {
      const div = document.createElement("div");
      div.innerHTML = `
        <h4 class="h4" style="margin-bottom:5px;">کارگردان</h4>
        <p class="text-soft">${content.director}</p>
      `;
      detailsInfo.appendChild(div);
    }

    if (content.cast) {
      const div = document.createElement("div");
      div.innerHTML = `
        <h4 class="h4" style="margin-bottom:5px;">بازیگران</h4>
        <p class="text-soft">${Array.isArray(content.cast) ? content.cast.join("، ") : content.cast}</p>
      `;
      detailsInfo.appendChild(div);
    }
  }

  // --- دکمه دانلود ---
  if (downloadBtn) {
    if (content.download) {
      downloadBtn.href          = content.download;
      downloadBtn.style.display = "inline-flex";
    } else {
      downloadBtn.style.display = "none";
    }
  }

  // --- دکمه پخش با درنظر گرفتن continue-watching ---
  const cwState = getContinueState(content.id);

  if (watchBtn) {
    if (content.type === "movie") {
      // فیلم: فقط روی id
      watchBtn.href = `player.html?id=${content.id}`;
      if (cwState && typeof cwState.position === "number") {
        watchBtn.textContent = "▶ ادامه تماشا";
      } else {
        watchBtn.textContent = "▶ پخش فیلم";
      }
    } else if (content.type === "series") {
      // سریال: سعی کن بر اساس continue-watching برود به فصل/قسمت جاری
      let seasonNumber = 1;
      let episodeNumber = 1;

      if (cwState && cwState.season && cwState.episode) {
        seasonNumber  = cwState.season;
        episodeNumber = cwState.episode;
        watchBtn.textContent = `▶ ادامه فصل ${seasonNumber} قسمت ${episodeNumber}`;
      } else {
        watchBtn.textContent = "▶ پخش از قسمت اول";
      }

      watchBtn.href = `player.html?id=${content.id}&s=${seasonNumber}&e=${episodeNumber}`;
    }
  }

  // --- علاقه‌مندی‌ها ---
  let favorites   = getFavorites();
  let isFavorite  = favorites.some(fav => String(fav.id) === String(content.id));
  updateFavoriteButton(isFavorite);

  if (favoriteBtn) {
    favoriteBtn.addEventListener("click", () => {
      favorites = getFavorites(); // ری‌فرش برای اطمینان
      const exists = favorites.some(fav => String(fav.id) === String(content.id));

      let updated;
      if (exists) {
        // حذف از علاقه‌مندی‌ها
        updated = favorites.filter(fav => String(fav.id) !== String(content.id));
        isFavorite = false;
      } else {
        // افزودن؛ فقط اطلاعات ضروری را ذخیره کن تا سایز کوچک بماند
        const minimalContent = {
          id: content.id,
          title: content.title,
          cover: content.cover,
          type: content.type,
          year: content.year,
          category: content.category
        };
        updated = [...favorites, minimalContent];
        isFavorite = true;
      }

      setFavorites(updated);
      updateFavoriteButton(isFavorite);
    });
  }

  // --- اگر سریال است، فصل‌ها و قسمت‌ها را رندر کن ---
  if (content.type === "series" && Array.isArray(content.seasons) && content.seasons.length > 0) {
    if (seasonsWrapper) {
      seasonsWrapper.style.display = "block";
    }
    renderSeriesDetails(content, cwState);
  } else {
    if (seasonsWrapper) {
      seasonsWrapper.style.display = "none";
    }
  }
}

// --- رندر فصل‌ها و اپیزودها ---

function renderSeriesDetails(seriesData, cwState) {
  if (!seasonTabs || !episodesList) return;

  seasonTabs.innerHTML   = "";
  episodesList.innerHTML = "";

  seriesData.seasons.forEach((season, index) => {
    const tab = document.createElement("button");
    tab.className = "season-tab";
    tab.textContent = `فصل ${season.seasonNumber}`;
    tab.dataset.seasonIndex = index;

    // فصل فعال اولیه: یا فصل continue-watching، یا فصل اول
    const shouldActive =
      (cwState && cwState.season === season.seasonNumber) ||
      (!cwState && index === 0);

    if (shouldActive) {
      tab.classList.add("active");
    }

    tab.addEventListener("click", () => {
      document.querySelectorAll(".season-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      renderEpisodes(seriesData.id, season);
    });

    seasonTabs.appendChild(tab);
  });

  // رندر فصل اولیه
  let initialSeason = seriesData.seasons[0];

  if (cwState && cwState.season) {
    const foundSeason = seriesData.seasons.find(s => s.seasonNumber === cwState.season);
    if (foundSeason) {
      initialSeason = foundSeason;
    }
  }

  renderEpisodes(seriesData.id, initialSeason);
}

// رندر اپیزودهای یک فصل
function renderEpisodes(seriesId, season) {
  if (!episodesList) return;

  episodesList.innerHTML = "";

  if (!season.episodes || !Array.isArray(season.episodes)) return;

  season.episodes.forEach(episode => {
    const card = document.createElement("div");
    card.className = "episode-card";

    const thumb = episode.thumbnail || "assets/icons/default-episode-thumb.png";
    const epTitle = episode.title || `قسمت ${episode.episodeNumber}`;
    const epDuration = episode.duration || "";

    card.innerHTML = `
      <img src="${thumb}" alt="قسمت ${episode.episodeNumber}" class="episode-thumb">
      <div class="episode-info">
        <h4 class="episode-info-title">قسمت ${episode.episodeNumber}: ${epTitle}</h4>
        <p class="episode-info-meta">${epDuration}</p>
      </div>
      <a href="player.html?id=${seriesId}&s=${season.seasonNumber}&e=${episode.episodeNumber}"
         class="btn-secondary"
         style="margin-left:auto;">
         ▶ پخش
      </a>
    `;

    episodesList.appendChild(card);
  });
}

// --- شروع کار ---
document.addEventListener("DOMContentLoaded", initializeDetailsPage);
