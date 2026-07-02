// =============================
// import Supabase
// =============================
import supabase from "./supabase-config.js";

// =============================
// المان‌های DOM
// =============================
const form = document.getElementById("movie-form");
const adminList = document.getElementById("movie-list-container");
const submitBtn = document.getElementById("submit-btn");
const formTitle = document.getElementById("form-title");

const typeSelect = document.getElementById("type");
const streamInput = document.getElementById("stream");

const seriesSection = document.getElementById("series-section");
const seasonsContainer = document.getElementById("seasons-container");
const addSeasonBtn = document.getElementById("add-season-btn");

// فیلد فایل زیرنویس (اگر در DOM وجود داشته باشد)
const subtitleFileInput = document.getElementById("sub-file");

let editMode = null;

// =============================
// مدیریت زیرنویس آپلودی
// =============================
let uploadedSubtitleContent = null;

// گوش دادن به تغییرات فیلد آپلود فایل زیرنویس
if (subtitleFileInput) {
  subtitleFileInput.addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (evt) {
      uploadedSubtitleContent = {
        name: file.name,
        content: evt.target.result,
        type: file.name.toLowerCase().endsWith(".srt") ? "srt" : "vtt",
        file: file // اصل فایل را هم نگه می‌داریم برای آپلود به Supabase
      };
      alert("زیرنویس با موفقیت لود شد.");
    };
    reader.readAsText(file);
  });
}

// =============================
// UID – در Supabase می‌تونی بی‌نیاز باشی، ولی برای سازگاری نگه می‌داریم
// =============================
function uid() {
  return Date.now().toString() + Math.floor(Math.random() * 1000).toString();
}

// =============================
// دریافت داده‌ها از Supabase (به‌جای localStorage)
// =============================
async function getMovies() {
  try {
    const { data, error } = await supabase
      .from("contents")
      .select("*")
      .order("id", { ascending: true });

    if (error) {
      console.error("خطا در خواندن از Supabase:", error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error("خطای غیرمنتظره در getMovies:", err);
    return [];
  }
}

// =============================
// آپلود زیرنویس به Supabase Storage (در صورت وجود فایل)
// =============================
async function uploadSubtitleIfNeeded() {
  // اگر هیچ فایلی در uploadedSubtitleContent نیست، null برمی‌گردانیم
  if (!uploadedSubtitleContent || !uploadedSubtitleContent.file) {
    return null;
  }

  const file = uploadedSubtitleContent.file;
  const fileName = `${Date.now()}_${file.name}`;

  // ۱. آپلود به bucket subtitles
  const { data, error } = await supabase.storage
    .from("subtitles")
    .upload(fileName, file);

  if (error) {
    console.error("Upload Error:", error);
    alert("خطا در آپلود زیرنویس");
    return null;
  }

  // ۲. گرفتن لینک عمومی
  const { data: publicUrlData, error: publicUrlError } = supabase.storage
    .from("subtitles")
    .getPublicUrl(fileName);

  if (publicUrlError) {
    console.error("Public URL Error:", publicUrlError);
    return null;
  }

  return publicUrlData.publicUrl; // رشته‌ی URL
}

// =============================
// تنظیم حالت سریال / فیلم
// =============================
function setSeriesMode(isSeries) {
  if (!streamInput) return;

  if (isSeries) {
    streamInput.removeAttribute("required");
    streamInput.disabled = true;
    streamInput.value = "";

    if (streamInput.parentElement) {
      streamInput.parentElement.style.display = "none";
    }

    if (seriesSection) {
      seriesSection.style.display = "block";
    }
  } else {
    streamInput.disabled = false;
    streamInput.setAttribute("required", "true");

    if (streamInput.parentElement) {
      streamInput.parentElement.style.display = "block";
    }

    if (seriesSection) {
      seriesSection.style.display = "none";
    }
  }
}

// =============================
// ساخت آیتم قسمت
// =============================
function createEpisodeItem(data = {}) {
  const wrap = document.createElement("div");
  wrap.className = "episode-item";

  wrap.innerHTML = `
    <div class="episode-box">
      <input
        type="text"
        class="episode-title"
        placeholder="عنوان قسمت"
        value="${data.title || ""}"
      >

      <input
        type="text"
        class="episode-stream"
        placeholder="لینک استریم"
        value="${data.stream || ""}"
      >

      <input
        type="text"
        class="episode-download"
        placeholder="لینک دانلود"
        value="${data.download || ""}"
      >

      <input
        type="text"
        class="episode-subtitle"
        placeholder="لینک زیرنویس"
        value="${data.subtitle || ""}"
      >

      <button
        type="button"
        class="remove-episode-btn remove-btn"
      >
        حذف قسمت
      </button>
    </div>
  `;

  const removeBtn = wrap.querySelector(".remove-episode-btn");
  removeBtn.addEventListener("click", () => {
    wrap.remove();
  });

  return wrap;
}

// =============================
// ساخت فصل
// =============================
function createSeasonItem(data = {}) {
  const wrap = document.createElement("div");
  wrap.className = "season-item";

  wrap.innerHTML = `
    <div class="season-box">
      <div class="season-header">
        <input
          type="text"
          class="season-title"
          placeholder="عنوان فصل"
          value="${data.title || ""}"
        >

        <button
          type="button"
          class="remove-season-btn remove-btn"
        >
          حذف فصل
        </button>
      </div>

      <div class="episodes-container"></div>

      <button
        type="button"
        class="add-episode-btn"
      >
        + افزودن قسمت
      </button>
    </div>
  `;

  const episodesContainer = wrap.querySelector(".episodes-container");
  const addEpisodeBtn = wrap.querySelector(".add-episode-btn");
  const removeSeasonBtn = wrap.querySelector(".remove-season-btn");

  (data.episodes || []).forEach((ep) => {
    episodesContainer.appendChild(createEpisodeItem(ep));
  });

  addEpisodeBtn.addEventListener("click", () => {
    episodesContainer.appendChild(createEpisodeItem());
  });

  removeSeasonBtn.addEventListener("click", () => {
    wrap.remove();
  });

  return wrap;
}

// =============================
// جمع‌آوری فصل‌ها از DOM
// =============================
function collectSeasonsData() {
  const seasons = [];

  document.querySelectorAll(".season-item").forEach((seasonEl, sIndex) => {
    const episodes = [];

    seasonEl.querySelectorAll(".episode-item").forEach((epEl, eIndex) => {
      episodes.push({
        episodeNumber: eIndex + 1,
        title: epEl.querySelector(".episode-title")?.value.trim() || "",
        stream: epEl.querySelector(".episode-stream")?.value.trim() || "",
        download: epEl.querySelector(".episode-download")?.value.trim() || "",
        subtitle: epEl.querySelector(".episode-subtitle")?.value.trim() || "",
      });
    });

    seasons.push({
      seasonNumber: sIndex + 1,
      title: seasonEl.querySelector(".season-title")?.value.trim() || "",
      episodes,
    });
  });

  return seasons;
}

// =============================
// جمع‌آوری داده‌های فرم
// =============================
function collectFormData(subtitleUrlFromSupabase = null) {
  const type = typeSelect ? typeSelect.value : "movie";
  const isSeries = type === "series";

  const subtitleField =
    document.getElementById("subtitle")?.value.trim() || "";

  // اگر Supabase URL برگردانده، از آن استفاده می‌کنیم
  // در غیر این صورت اگر فایلی آپلود شده ولی URL نداریم، از object استفاده می‌کنیم
  // در غیر این صورت هم از فیلد متنی
  let subtitleValue;
  if (subtitleUrlFromSupabase) {
    subtitleValue = subtitleUrlFromSupabase;
  } else if (uploadedSubtitleContent) {
    subtitleValue = {
      name: uploadedSubtitleContent.name,
      type: uploadedSubtitleContent.type,
    };
  } else {
    subtitleValue = subtitleField;
  }

  const data = {
    // اگر در Supabase ستون id auto-increment داری، می‌تونی این را حذف کنی
    id: editMode ? editMode : Number(uid()),

    title: document.getElementById("title")?.value.trim() || "",
    year: document.getElementById("year")?.value.trim() || "",
    type,
    category: document.getElementById("category")?.value.trim() || "",
    cover: document.getElementById("cover")?.value.trim() || "",
    description: document.getElementById("description")?.value.trim() || "",
    download: document.getElementById("download")?.value.trim() || "",
    subtitle: subtitleValue,
  };

  if (isSeries) {
    data.stream = "";
    data.seasons = collectSeasonsData();
  } else {
    data.stream = document.getElementById("stream")?.value.trim() || "";
    data.seasons = [];
  }

  return data;
}

// =============================
// ذخیره در Supabase (insert / update)
// =============================
async function saveMovieToSupabase(data) {
  // اگر در جدول contents ستونی به نام id داری و می‌خواهی update کنی:
  if (editMode) {
    const { error } = await supabase
      .from("contents")
      .update({
        title: data.title,
        year: data.year,
        type: data.type,
        category: data.category,
        cover: data.cover,
        description: data.description,
        download: data.download,
        subtitle: data.subtitle,
        stream: data.stream,
        seasons: data.seasons,
      })
      .eq("id", editMode);

    if (error) {
      console.error("خطا در آپدیت محتوا:", error);
      alert("خطا در ذخیره تغییرات: " + error.message);
      return false;
    }
    return true;
  } else {
    const { error } = await supabase.from("contents").insert([
      {
        title: data.title,
        year: data.year,
        type: data.type,
        category: data.category,
        cover: data.cover,
        description: data.description,
        download: data.download,
        subtitle: data.subtitle,
        stream: data.stream,
        seasons: data.seasons,
      },
    ]);

    if (error) {
      console.error("خطا در افزودن محتوا:", error);
      alert("خطا در افزودن محتوا: " + error.message);
      return false;
    }
    return true;
  }
}

// =============================
// رندر لیست ادمین
// =============================
async function renderAdminList() {
  const movies = await getMovies();

  if (!adminList) return;

  if (!movies.length) {
    adminList.innerHTML = "<p class='no-results'>هیچ محتوایی یافت نشد.</p>";
    return;
  }

  adminList.innerHTML = movies
    .map((movie) => {
      return `
        <div class="admin-card">
          <img
            src="${movie.cover || ""}"
            alt="${movie.title || ""}"
          >

          <div class="admin-card-info">
            <h3>${movie.title || "-"}</h3>

            <span class="admin-meta">
              ${movie.category || "-"} | ${movie.year || "-"}
            </span>

            <div class="admin-type">
              ${movie.type === "series" ? "سریال" : "فیلم"}
            </div>
          </div>

          <div class="admin-card-actions">
            <button
              class="admin-btn edit-btn"
              onclick="editMovie('${movie.id}')"
            >
              ویرایش
            </button>

            <button
              class="admin-btn delete-btn"
              onclick="deleteMovie('${movie.id}')"
            >
              حذف
            </button>
          </div>
        </div>
      `;
    })
    .join("");
}

// =============================
// ویرایش
// =============================
window.editMovie = async function (id) {
  const movies = await getMovies();
  const movie = movies.find((m) => String(m.id) === String(id));

  if (!movie) return;

  editMode = movie.id;

  document.getElementById("title").value = movie.title || "";
  document.getElementById("year").value = movie.year || "";
  document.getElementById("type").value = movie.type || "movie";
  document.getElementById("category").value = movie.category || "";
  document.getElementById("cover").value = movie.cover || "";
  document.getElementById("download").value = movie.download || "";
  document.getElementById("description").value = movie.description || "";

  const subtitleInput = document.getElementById("subtitle");
  if (subtitleInput) {
    if (movie.subtitle && typeof movie.subtitle === "object") {
      subtitleInput.value = movie.subtitle.name || "";
    } else {
      subtitleInput.value = movie.subtitle || "";
    }
  }

  uploadedSubtitleContent = null;
  if (subtitleFileInput) {
    subtitleFileInput.value = "";
  }

  setSeriesMode(movie.type === "series");

  seasonsContainer.innerHTML = "";

  if (movie.type === "series") {
    (movie.seasons || []).forEach((season) => {
      seasonsContainer.appendChild(createSeasonItem(season));
    });
  } else {
    document.getElementById("stream").value = movie.stream || "";
  }

  submitBtn.textContent = "ذخیره تغییرات";
  formTitle.textContent = "ویرایش محتوا";

  form.scrollIntoView({
    behavior: "smooth",
  });
};

// =============================
// حذف
// =============================
window.deleteMovie = async function (id) {
  const confirmDelete = confirm("آیا از حذف این محتوا مطمئن هستید؟");
  if (!confirmDelete) return;

  const { error } = await supabase.from("contents").delete().eq("id", id);

  if (error) {
    console.error("خطا در حذف محتوا:", error);
    alert("خطا در حذف محتوا: " + error.message);
    return;
  }

  renderAdminList();
};

// =============================
// ریست فرم
// =============================
function resetFormState() {
  form.reset();
  editMode = null;

  submitBtn.textContent = "ثبت و افزودن";
  formTitle.textContent = "افزودن محتوای جدید";

  seasonsContainer.innerHTML = "";
  setSeriesMode(false);

  uploadedSubtitleContent = null;
  if (subtitleFileInput) {
    subtitleFileInput.value = "";
  }
}

// =============================
// تغییر نوع
// =============================
if (typeSelect) {
  typeSelect.addEventListener("change", () => {
    const isSeries = typeSelect.value === "series";
    setSeriesMode(isSeries);

    if (isSeries && seasonsContainer.children.length === 0) {
      seasonsContainer.appendChild(createSeasonItem());
    }
  });
}

// =============================
// افزودن فصل
// =============================
if (addSeasonBtn) {
  addSeasonBtn.addEventListener("click", () => {
    seasonsContainer.appendChild(createSeasonItem());
  });
}

// =============================
// ثبت فرم (با Supabase)
// =============================
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // ۱. اعتبارسنجی اولیه
    const type = typeSelect ? typeSelect.value : "movie";

    const titleVal = document.getElementById("title")?.value.trim();
    if (!titleVal) {
      alert("عنوان را وارد کنید.");
      return;
    }

    if (type === "movie") {
      const streamVal = document.getElementById("stream")?.value.trim();
      if (!streamVal) {
        alert("لینک استریم فیلم را وارد کنید.");
        return;
      }
    }

    if (
      type === "series" &&
      (!collectSeasonsData() || collectSeasonsData().length === 0)
    ) {
      alert("حداقل یک فصل اضافه کنید.");
      return;
    }

    // ۲. اگر زیرنویس فایل داشتیم، اول به Supabase Storage آپلود می‌کنیم
    const subtitleUrl = await uploadSubtitleIfNeeded();

    // ۳. جمع‌آوری داده‌ها با در نظر گرفتن subtitleUrl
    const data = collectFormData(subtitleUrl);

    // ۴. ذخیره در Supabase
    const ok = await saveMovieToSupabase(data);
    if (!ok) return;

    resetFormState();
    renderAdminList();
  });
}

// =============================
// اجرای اولیه
// =============================
if (typeSelect) {
  setSeriesMode(typeSelect.value === "series");
}

renderAdminList();
