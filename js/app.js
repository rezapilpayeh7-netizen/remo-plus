// --- Import Supabase ---
import supabase from "./supabase-config.js";

// --- Global State ---
let favorites = JSON.parse(localStorage.getItem("remo_favorites")) || [];
let allMovies = [];
let activeCategory = "all";
let searchQuery = "";

// DOM Elements
const movieGrid = document.getElementById("movie-grid");
const searchInput = document.getElementById("search-input");
const categoryFilters = document.getElementById("category-filters");
const continueSection = document.getElementById("continue-watching-section");
const continueGrid = document.getElementById("continue-grid");

// --- Load Movies from Supabase ---
async function loadMovies() {
  try {
    const { data: contents, error } = await supabase
      .from("contents")
      .select("*")
      .order("id", { ascending: true });

    if (error) {
      console.error("Error fetching data from Supabase:", error);
      if (movieGrid) {
        movieGrid.innerHTML = "<p>خطا در بارگذاری محتوا</p>";
      }
      return;
    }

    // جدول contents باید ستون‌هایی مثل:
    // id, title, year, category, cover, type, stream, seasons, ...
    allMovies = contents || [];

    buildCategoryFilters();
    filterAndRender();
    renderContinueWatching(allMovies);
  } catch (err) {
    console.error("خطا در لود داده‌ها", err);
    if (movieGrid) {
      movieGrid.innerHTML = "<p>خطا در بارگذاری محتوا</p>";
    }
  }
}

// --- Build Category Filters Dynamically ---
function buildCategoryFilters() {
  if (!categoryFilters) return;

  const categories = new Set();

  allMovies.forEach((movie) => {
    if (movie.category) {
      movie.category.split(",").forEach((cat) => {
        categories.add(cat.trim());
      });
    }
  });

  // دکمه "همه"
  categoryFilters.innerHTML = `
    <button class="category-btn active" data-cat="all">همه</button>
  `;

  // سایر دسته‌ها
  categories.forEach((cat) => {
    if (!cat) return;
    const btn = document.createElement("button");
    btn.classList.add("category-btn");
    btn.setAttribute("data-cat", cat);
    btn.innerText = cat;
    categoryFilters.appendChild(btn);
  });

  // هندل کلیک روی دسته‌ها (یک بار bind می‌کنیم)
  categoryFilters.addEventListener("click", (event) => {
    if (event.target.classList.contains("category-btn")) {
      document
        .querySelectorAll(".category-btn")
        .forEach((btn) => btn.classList.remove("active"));

      event.target.classList.add("active");
      activeCategory = event.target.getAttribute("data-cat");
      filterAndRender();
    }
  });
}

// --- Filter Movies by category + search ---
function filterAndRender() {
  let filteredMovies = allMovies;

  if (activeCategory !== "all") {
    filteredMovies = filteredMovies.filter((movie) =>
      movie.category
        ?.split(",")
        .map((cat) => cat.trim())
        .includes(activeCategory)
    );
  }

  if (searchQuery.trim() !== "") {
    const q = searchQuery.toLowerCase();
    filteredMovies = filteredMovies.filter((movie) =>
      (movie.title || "").toLowerCase().includes(q)
    );
  }

  renderMovies(filteredMovies);
}

// --- Render Movie Grid ---
function renderMovies(movies) {
  if (!movieGrid) return;

  movieGrid.innerHTML = "";

  if (!movies || movies.length === 0) {
    movieGrid.innerHTML =
      '<p class="no-results">هیچ محتوایی یافت نشد.</p>';
    return;
  }

  movies.forEach((movie) => {
    const card = createMovieCard(movie);
    movieGrid.appendChild(card);
  });
}

// --- Create Single Movie Card ---
function createMovieCard(movie) {
  const isFavorite = favorites.includes(movie.id);

  const coverSrc =
    movie.cover ||
    movie.cover_url || // اگر در Supabase نام ستون cover_url باشد
    "assets/default-cover.jpg";

  const card = document.createElement("div");
  card.classList.add("movie-card");

  card.innerHTML = `
    <img src="${coverSrc}" alt="${movie.title}" class="movie-cover" loading="lazy">

    <div class="card-info">
      <h3>${movie.title}</h3>

      <div class="movie-meta">
        ${movie.year ? `<span>${movie.year}</span>` : ""}
        ${movie.category ? `<span>${movie.category}</span>` : ""}
      </div>

      <div class="card-buttons">
        <a href="details.html?id=${movie.id}" class="play-btn">▶</a>
        <button class="fav-btn ${isFavorite ? "active" : ""}" data-id="${movie.id}">❤</button>
      </div>
    </div>
  `;

  const favBtn = card.querySelector(".fav-btn");
  favBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleFavorite(movie.id);
    favBtn.classList.toggle("active");
  });

  card.addEventListener("click", () => {
    window.location.href = `details.html?id=${movie.id}`;
  });

  return card;
}

// --- Toggle Favorites ---
function toggleFavorite(id) {
  if (favorites.includes(id)) {
    favorites = favorites.filter((fav) => fav !== id);
  } else {
    favorites.push(id);
  }
  localStorage.setItem("remo_favorites", JSON.stringify(favorites));
}

// --- Render Continue Watching Section ---
function renderContinueWatching(movies) {
  if (!continueSection || !continueGrid) return;

  const continueRaw = localStorage.getItem("continueWatching");
  const continueList = continueRaw ? JSON.parse(continueRaw) : [];

  continueGrid.innerHTML = "";

  if (!Array.isArray(continueList) || continueList.length === 0) {
    continueSection.classList.add("hidden");
    continueSection.style.display = "none";
    return;
  }

  const continueMap = new Map();
  continueList.forEach((item) => {
    if (item && item.id != null) {
      continueMap.set(item.id, item);
    }
  });

  let hasContinueItems = false;

  movies.forEach((movie) => {
    const state = continueMap.get(movie.id);
    if (!state) return;

    hasContinueItems = true;

    const label = movie.type === "series" ? "ادامه سریال" : "ادامه فیلم";

    const coverSrc =
      movie.cover ||
      movie.cover_url ||
      "assets/default-cover.jpg";

    const card = document.createElement("div");
    card.classList.add("continue-card");

    card.innerHTML = `
      <img src="${coverSrc}" alt="${movie.title}" class="continue-thumb" loading="lazy">

      <div class="continue-info">
        <div>
          <div class="continue-info-title">${movie.title}</div>
          <div class="continue-info-meta">
            ${movie.year ? movie.year + " • " : ""}${movie.category || ""}
          </div>
        </div>
        <a href="details.html?id=${movie.id}" class="play-btn">
          ${label}
        </a>
      </div>
    `;

    card.addEventListener("click", () => {
      window.location.href = `details.html?id=${movie.id}`;
    });

    continueGrid.appendChild(card);
  });

  if (hasContinueItems) {
    continueSection.classList.remove("hidden");
    continueSection.style.display = "block";
  } else {
    continueSection.classList.add("hidden");
    continueSection.style.display = "none";
  }
}

// --- Search Input Listener ---
if (searchInput) {
  searchInput.addEventListener("input", (event) => {
    searchQuery = event.target.value;
    filterAndRender();
  });
}

// --- Initial Load ---
document.addEventListener("DOMContentLoaded", () => {
  loadMovies();
});
