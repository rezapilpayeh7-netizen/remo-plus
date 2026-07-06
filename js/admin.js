// ============================================
// REMO+ - admin.js (اصلاح شده)
// داشبورد مدیریت - افزودن/ویرایش محتوا با اسکیمای استاندارد
// ============================================

import supabase from "./supabase-config.js";

// --- DOM Elements ---
const form = document.getElementById("movie-form");
const adminList = document.getElementById("movie-list-container");
const submitBtn = document.getElementById("submit-btn");
const formTitle = document.getElementById("form-title");

const typeSelect = document.getElementById("type");
const streamInput = document.getElementById("stream");

const seriesSection = document.getElementById("series-section");
const seasonsContainer = document.getElementById("seasons-container");
const addSeasonBtn = document.getElementById("add-season-btn");

const subtitleFileInput = document.getElementById("sub-file");

let editMode = null;

// --- Schema Standard ---
// استاندارد فیلدهای رکورد content:
// id, title, type, year, category, description,
// cover_url, stream_url, download_url, subtitle_url,
// seasons (JSON برای سریال)
//
// ساختار فصل:
// { season_number: number, title: string, episodes: [...] }
//
// ساختار قسمت:
// { episode_number: number, title: string, duration: string, 
//   thumbnail_url: string, stream_url: string, subtitle_url: string }

// --- Helpers ---

function uid() {
  return Date.now().toString() + Math.floor(Math.random() * 1000).toString();
}

async function getContents() {
  try {
    const { data, error } = await supabase
      .from("contents")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error("Error loading contents:", err);
    return [];
  }
}

// --- Subtitle Upload (VTT only) ---

async function uploadSubtitle(fileInput) {
  if (!fileInput?.files?.[0]) return null;

  const file = fileInput.files[0];
  const fileNameLower = file.name.toLowerCase();

  if (!fileNameLower.endsWith(".vtt")) {
    alert("فقط فایل .vtt مجاز است");
    return null;
  }

  const fileName = `subtitles/${uid()}_${file.name}`;

  const { error } = await supabase.storage
    .from("remo-assets")
    .upload(fileName, file, {
      cacheControl: "3600",
      contentType: "text/vtt"
    });

  if (error) {
    console.error("Upload error:", error);
    alert("خطا در آپلود زیرنویس");
    return null;
  }

  const { data } = supabase.storage.from("remo-assets").getPublicUrl(fileName);
  return data.publicUrl;
}

async function getMovieSubtitleUrl() {
  const manualUrl = document.getElementById("subtitle")?.value.trim() || "";
  const uploadedUrl = await uploadSubtitle(subtitleFileInput);
  return uploadedUrl || manualUrl;
}

// --- Series Mode Toggle ---

function setSeriesMode(isSeries) {
  if (!streamInput) return;

  if (isSeries) {
    streamInput.removeAttribute("required");
    streamInput.disabled = true;
    streamInput.value = "";
    streamInput.closest(".form-group")?.classList.add("hidden");
    seriesSection?.classList.remove("hidden");
  } else {
    streamInput.disabled = false;
    streamInput.setAttribute("required", "true");
    streamInput.closest(".form-group")?.classList.remove("hidden");
    seriesSection?.classList.add("hidden");
  }
}

// --- Season/Episode Builders ---

function createEpisodeItem(data = {}) {
  const wrap = document.createElement("div");
  wrap.className = "episode-item";

  wrap.innerHTML = `
    <div class="episode-box">
      <input type="number" class="ep-number" placeholder="شماره" 
        value="${data.episode_number || ""}" min="1">
      <input type="text" class="ep-title" placeholder="عنوان قسمت" 
        value="${data.title || ""}">
      <input type="text" class="ep-stream" placeholder="لینک استریم" 
        value="${data.stream_url || ""}">
      <input type="text" class="ep-download" placeholder="لینک دانلود" 
        value="${data.download_url || ""}">
      <input type="text" class="ep-subtitle" placeholder="لینک زیرنویس" 
        value="${data.subtitle_url || ""}">
      <input type="text" class="ep-duration" placeholder="مدت (دقیقه)" 
        value="${data.duration || ""}">
      <input type="text" class="ep-thumbnail" placeholder="لینک تصویر" 
        value="${data.thumbnail_url || ""}">
      
      <div class="form-group file-upload">
        <label>آپلود زیرنویس:</label>
        <input type="file" class="ep-subfile" accept=".vtt">
      </div>

      <button type="button" class="remove-episode-btn remove-btn">حذف قسمت</button>
    </div>
  `;

  wrap.querySelector(".remove-episode-btn").addEventListener("click", () => wrap.remove());
  return wrap;
}

function createSeasonItem(data = {}) {
  const wrap = document.createElement("div");
  wrap.className = "season-item";

  wrap.innerHTML = `
    <div class="season-box">
      <div class="season-header">
        <input type="number" class="season-number" placeholder="شماره فصل" 
          value="${data.season_number || ""}" min="1">
        <input type="text" class="season-title" placeholder="عنوان فصل" 
          value="${data.title || ""}">
        <button type="button" class="remove-season-btn remove-btn">حذف فصل</button>
      </div>
      <div class="episodes-container"></div>
      <button type="button" class="add-episode-btn">+ افزودن قسمت</button>
    </div>
  `;

  const episodesContainer = wrap.querySelector(".episodes-container");
  const addEpisodeBtn = wrap.querySelector(".add-episode-btn");

  (data.episodes || []).forEach(ep => {
    episodesContainer.appendChild(createEpisodeItem(ep));
  });

  addEpisodeBtn.addEventListener("click", () => {
    episodesContainer.appendChild(createEpisodeItem());
  });

  wrap.querySelector(".remove-season-btn").addEventListener("click", () => wrap.remove());

  return wrap;
}

// --- Data Collection ---

async function collectSeasonsData() {
  const seasons = [];

  const seasonEls = document.querySelectorAll(".season-item");

  for (const seasonEl of seasonEls) {
    const seasonNumber = parseInt(seasonEl.querySelector(".season-number")?.value) || 1;
    const seasonTitle = seasonEl.querySelector(".season-title")?.value.trim() || "";
    
    const episodes = [];
    const episodeEls = seasonEl.querySelectorAll(".episode-item");

    for (const epEl of episodeEls) {
      const fileInput = epEl.querySelector(".ep-subfile");
      const uploadedSubtitle = await uploadSubtitle(fileInput);

      episodes.push({
        episode_number: parseInt(epEl.querySelector(".ep-number")?.value) || episodes.length + 1,
        title: epEl.querySelector(".ep-title")?.value.trim() || "",
        stream_url: epEl.querySelector(".ep-stream")?.value.trim() || "",
        download_url: epEl.querySelector(".ep-download")?.value.trim() || "",
        subtitle_url: uploadedSubtitle || epEl.querySelector(".ep-subtitle")?.value.trim() || "",
        duration: epEl.querySelector(".ep-duration")?.value.trim() || "",
        thumbnail_url: epEl.querySelector(".ep-thumbnail")?.value.trim() || ""
      });
    }

    seasons.push({
      season_number: seasonNumber,
      title: seasonTitle,
      episodes: episodes.sort((a, b) => a.episode_number - b.episode_number)
    });
  }

  return seasons.sort((a, b) => a.season_number - b.season_number);
}

function collectFormData(subtitleUrl = "") {
  const type = typeSelect?.value || "movie";
  const isSeries = type === "series";

  const data = {
    title: document.getElementById("title")?.value.trim() || "",
    year: document.getElementById("year")?.value.trim() || "",
    type,
    category: document.getElementById("category")?.value.trim() || "",
    cover_url: document.getElementById("cover")?.value.trim() || "",
    description: document.getElementById("description")?.value.trim() || "",
    download_url: document.getElementById("download")?.value.trim() || "",
    subtitle_url: subtitleUrl
  };

  if (!isSeries) {
    data.stream_url = document.getElementById("stream")?.value.trim() || "";
    data.seasons = [];
  }

  if (editMode) {
    data.id = editMode;
  }

  return data;
}

// --- Save to Supabase ---

async function saveContent(data) {
  const payload = {
    title: data.title,
    year: data.year,
    type: data.type,
    category: data.category,
    cover_url: data.cover_url,
    description: data.description,
    download_url: data.download_url,
    subtitle_url: data.subtitle_url,
    stream_url: data.stream_url,
    seasons: data.seasons || []
  };

  if (editMode) {
    const { error } = await supabase
      .from("contents")
      .update(payload)
      .eq("id", editMode);

    if (error) {
      alert("خطا در ویرایش: " + error.message);
      return false;
    }
  } else {
    const { error } = await supabase.from("contents").insert([payload]);

    if (error) {
      alert("خطا در افزودن: " + error.message);
      return false;
    }
  }

  return true;
}

// --- Render List ---

async function renderList() {
  const contents = await getContents();

  if (!adminList) return;

  if (!contents.length) {
    adminList.innerHTML = "<p class='no-results'>هیچ محتوایی یافت نشد.</p>";
    return;
  }

  adminList.innerHTML = contents.map(item => `
    <div class="admin-card">
      <img src="${item.cover_url || 'assets/default-cover.jpg'}" alt="${item.title}">
      <div class="admin-card-info">
        <h3>${item.title}</h3>
        <span class="admin-meta">${item.category || '-'} | ${item.year || '-'}</span>
        <div class="admin-type">${item.type === 'series' ? 'سریال' : 'فیلم'}</div>
      </div>
      <div class="admin-card-actions">
        <button class="admin-btn edit-btn" data-id="${item.id}">ویرایش</button>
        <button class="admin-btn delete-btn" data-id="${item.id}">حذف</button>
      </div>
    </div>
  `).join("");

  // Event delegation for buttons
  adminList.addEventListener("click", handleListActions);
}

function handleListActions(e) {
  const btn = e.target.closest(".admin-btn");
  if (!btn) return;

  const id = btn.dataset.id;
  if (btn.classList.contains("edit-btn")) {
    editContent(id);
  } else if (btn.classList.contains("delete-btn")) {
    deleteContent(id);
  }
}

// --- Edit ---

async function editContent(id) {
  const contents = await getContents();
  const item = contents.find(c => String(c.id) === String(id));
  if (!item) return;

  editMode = item.id;

  document.getElementById("title").value = item.title || "";
  document.getElementById("year").value = item.year || "";
  document.getElementById("type").value = item.type || "movie";
  document.getElementById("category").value = item.category || "";
  document.getElementById("cover").value = item.cover_url || "";
  document.getElementById("download").value = item.download_url || "";
  document.getElementById("description").value = item.description || "";
  document.getElementById("subtitle").value = item.subtitle_url || "";

  if (subtitleFileInput) subtitleFileInput.value = "";

  setSeriesMode(item.type === "series");
  seasonsContainer.innerHTML = "";

  if (item.type === "series" && Array.isArray(item.seasons)) {
    item.seasons.forEach(s => seasonsContainer.appendChild(createSeasonItem(s)));
  } else {
    document.getElementById("stream").value = item.stream_url || "";
  }

  submitBtn.textContent = "ذخیره تغییرات";
  formTitle.textContent = "ویرایش محتوا";
  form.scrollIntoView({ behavior: "smooth" });
}

// --- Delete ---

async function deleteContent(id) {
  if (!confirm("آیا از حذف مطمئن هستید؟")) return;

  const { error } = await supabase.from("contents").delete().eq("id", id);
  if (error) {
    alert("خطا در حذف: " + error.message);
    return;
  }

  renderList();
}

// --- Reset ---

function resetForm() {
  form?.reset();
  editMode = null;
  submitBtn.textContent = "ثبت و افزودن";
  formTitle.textContent = "افزودن محتوای جدید";
  seasonsContainer.innerHTML = "";
  setSeriesMode(false);
  if (subtitleFileInput) subtitleFileInput.value = "";
}

// --- Event Listeners ---

if (typeSelect) {
  typeSelect.addEventListener("change", () => {
    const isSeries = typeSelect.value === "series";
    setSeriesMode(isSeries);
    if (isSeries && !seasonsContainer.children.length) {
      seasonsContainer.appendChild(createSeasonItem());
    }
  });
}

if (addSeasonBtn) {
  addSeasonBtn.addEventListener("click", () => {
    seasonsContainer.appendChild(createSeasonItem());
  });
}

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const type = typeSelect?.value || "movie";

    if (!document.getElementById("title")?.value.trim()) {
      alert("عنوان را وارد کنید");
      return;
    }

    if (type === "movie" && !document.getElementById("stream")?.value.trim()) {
      alert("لینک استریم را وارد کنید");
      return;
    }

    let seasonsData = [];
    if (type === "series") {
      seasonsData = await collectSeasonsData();
      if (!seasonsData.length) {
        alert("حداقل یک فصل اضافه کنید");
        return;
      }
    }

    const subtitleUrl = await getMovieSubtitleUrl();
    const data = collectFormData(subtitleUrl);

    if (type === "series") {
      data.seasons = seasonsData;
      data.stream_url = "";
    }

    const ok = await saveContent(data);
    if (!ok) return;

    resetForm();
    renderList();
  });
}

// --- Init ---
if (typeSelect) setSeriesMode(typeSelect.value === "series");
renderList();
