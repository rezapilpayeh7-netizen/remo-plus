// ============================================
// REMO+ - app.js (اصلاح شده)
// صفحه اصلی - نمایش لیست محتوا، جستجو، فیلتر و ادامه تماشا
// ============================================

import supabase from "./supabase-config.js";

// --- State ---
let favorites = JSON.parse(localStorage.getItem("remo_favorites")) || [];
let allContents = [];
let activeCategory = "all";
let searchQuery = "";

// --- DOM Elements ---
const movieGrid = document.getElementById("movie-grid");
const searchInput = document.getElementById("search-input");
const categoryFilters = document.getElementById("category-filters");
const continueSection = document.getElementById("continue-watching-section");
const continueGrid = document.getElementById("continue-grid");

// --- Schema Standard ---
// استاندارد فیلدهای رکورد content:
// id, title, type, year, category, description,
// cover_url, stream_url, download_url, subtitle_url,
// seasons (JSON برای سریال)

// --- Load Contents from Supabase ---
async function loadContents() {
  try {
    const { data: contents, error } = await supabase
      .from("contents")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase error:", error);
      renderError("خطا در بارگذاری محتوا از سرور");
      return;
    }

    allContents = contents || [];
    
    buildCategoryFilters();
    filterAndRender();
    renderContinueWatching();

  } catch (err) {
    console.error("Load error:", err);
    renderError("خطا در بارگذاری محتوا");
  }
}

function renderError(message) {
  if (movieGrid) {
    movieGrid.innerHTML = `<p class="error-message">${message}</p>`;
  }
}

// --- Build Category Filters ---
function buildCategoryFilters() {
  if (!categoryFilters) return;

  const categories = new Set();
  
  allContents.forEach((item) => {
    if (item.category) {
      item.category.split(",").forEach((cat) => {
        const trimmed = cat.trim();
        if (trimmed) categories.add(trimmed);
      });
    }
  });

  const sortedCategories = Array.from(categories).sort();

  categoryFilters.innerHTML = `
    <button class="category-btn active" data-cat="all">همه</button>
  `;

  sortedCategories.forEach((cat) => {
    const btn = document.createElement("button");
    btn.className = "category-btn";
    btn.dataset.cat = cat;
    btn.textContent = cat;
    categoryFilters.appendChild(btn);
  });

  // Event delegation
  categoryFilters.addEventListener("click", handleCategoryClick);
}

function handleCategoryClick(e) {
  if (!e.target.classList.contains("category-btn")) return;

  document.querySelectorAll(".category-btn").forEach((btn) => {
    btn.classList.remove("active");
  });

  e.target.classList.add("active");
  activeCategory = e.target.dataset.cat;
  filterAndRender();
}

// --- Filter and Render ---
function filterAndRender() {
  let filtered = allContents;

  // Filter by category
  if (activeCategory !== "all") {
    filtered = filtered.filter((item) => {
      const cats = item.category?.split(",").map((c) => c.trim()) || [];
      return cats.includes(activeCategory);
    });
  }

  // Filter by search
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter((item) => 
      (item.title || "").toLowerCase().includes(q)
    );
  }

  renderGrid(filtered);
}

// --- Render Content Grid ---
function renderGrid(contents) {
  if (!movieGrid) return;

  movieGrid.innerHTML = "";

  if (!contents || contents.length === 0) {
    movieGrid.innerHTML = '<p class="no-results">هیچ محتوایی یافت نشد</p>';
    return;
  }

  contents.forEach((item) => {
    const card = createContentCard(item);
    movieGrid.appendChild(card);
  });
}

// --- Create Content Card ---
function createContentCard(item) {
  const isFav = favorites.includes(item.id);
  
  // استفاده از cover_url استاندارد
  const coverUrl = item.cover_url || "assets/default-cover.jpg";
  
  // برچسب نوع محتوا
  const typeLabel = item.type === "series" ? "سریال" : "فیلم";
  
  const card = document.createElement("div");
  card.className = "movie-card";
  card.dataset.id = item.id;

  card.innerHTML = `
    <div class="card-cover-wrapper">
      <img src="${coverUrl}" alt="${item.title}" class="movie-cover" loading="lazy">
      <div class="card-overlay">
        <a href="details.html?id=${item.id}" class="play-icon">▶</a>
      </div>
      ${item.type === "series" ? '<span class="type-badge">سریال</span>' : ""}
    </div>
    
    <div class="card-info">
      <h3 class="card-title">${item.title}</h3>
      <div class="card-meta">
        ${item.year ? `<span>${item.year}</span>` : ""}
        ${item.category ? `<span>${item.category.split(",")[0]}</span>` : ""}
      </div>
    </div>
    
    <button class="fav-btn ${isFav ? "active" : ""}" data-id="${item.id}" title="علاقه‌مندی">
      ❤
    </button>
  `;

  // Favorite toggle
  const favBtn = card.querySelector(".fav-btn");
  favBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFavorite(item.id);
    favBtn.classList.toggle("active");
  });

  // Click on card goes to details
  card.addEventListener("click", (e) => {
    if (!e.target.closest(".fav-btn")) {
      window.location.href = `details.html?id=${item.id}`;
    }
  });

  return card;
}

// --- Toggle Favorite ---
function toggleFavorite(id) {
  const index = favorites.indexOf(id);
  
  if (index > -1) {
    favorites.splice(index, 1);
  } else {
    favorites.push(id);
  }
  
  localStorage.setItem("remo_favorites", JSON.stringify(favorites));
}

// --- Render Continue Watching ---
function renderContinueWatching() {
  if (!continueSection || !continueGrid) return;

  const continueRaw = localStorage.getItem("remo_continue");
  const continueList = continueRaw ? JSON.parse(continueRaw) : [];

  continueGrid.innerHTML = "";

  if (!Array.isArray(continueList) || continueList.length === 0) {
    continueSection.classList.add("hidden");
    continueSection.style.display = "none";
    return;
  }

  // Map for quick lookup
  const continueMap = new Map();
  continueList.forEach((item) => {
    if (item?.id) continueMap.set(item.id, item);
  });

  const continueItems = [];

  allContents.forEach((item) => {
    const state = continueMap.get(item.id);
    if (!state) return;

    continueItems.push({ item, state });
  });

  if (continueItems.length === 0) {
    continueSection.classList.add("hidden");
    continueSection.style.display = "none";
    return;
  }

  continueSection.classList.remove("hidden");
  continueSection.style.display = "block";

  continueItems.forEach(({ item, state }) => {
    const card = createContinueCard(item, state);
    continueGrid.appendChild(card);
  });
}

// --- Create Continue Watching Card ---
function createContinueCard(item, state) {
  const coverUrl = item.cover_url || "assets/default-cover.jpg";
  
  // Progress bar
  const progress = state.progress || 0;
  
  // Label based on content type
  let label = "ادامه تماشا";
  if (item.type === "series" && state.season && state.episode) {
    label = `فصل ${state.season} قسمت ${state.episode}`;
  }

  const card = document.createElement("div");
  card.className = "continue-card";

  card.innerHTML = `
    <div class="continue-thumb-wrapper">
      <img src="${coverUrl}" alt="${item.title}" class="continue-thumb" loading="lazy">
      <div class="continue-overlay">
        <span class="continue-play">▶</span>
      </div>
      <div class="continue-progress">
        <div class="progress-bar" style="width: ${progress}%"></div>
      </div>
    </div>
    
    <div class="continue-info">
      <h4 class="continue-title">${item.title}</h4>
      <span class="continue-label">${label}</span>
    </div>
  `;

  // Click goes to player directly
  card.addEventListener("click", () => {
    const params = new URLSearchParams();
    params.set("id", item.id);
    
    if (item.type === "series" && state.season && state.episode) {
      params.set("s", state.season);
      params.set("e", state.episode);
    }
    
    window.location.href = `player.html?${params.toString()}`;
  });

  return card;
}

// --- Search Handler ---
if (searchInput) {
  searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    filterAndRender();
  });
}

// --- Init ---
document.addEventListener("DOMContentLoaded", loadContents);
