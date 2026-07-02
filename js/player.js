// عناصر DOM
const video = document.getElementById("video-player");
const title = document.getElementById("movie-title");
const description = document.getElementById("movie-description");
const downloadBtn = document.getElementById("download-btn");

const playPauseBtn = document.getElementById("play-pause");
const timeDisplay = document.getElementById("time-display");
const fsBtn = document.getElementById("fs-btn");
const subBtn = document.getElementById("sub-btn");
const progressBar = document.getElementById("progress-bar");
const progressFilled = document.getElementById("progress-filled");

// برای fullscreen سفارشی روی کل پلیر
const playerWrapper = document.querySelector(".player-wrapper");

// پارامترهای URL
const params = new URLSearchParams(window.location.search);
const movieId = params.get("id");
const seasonNumber = params.get("s");
const episodeNumber = params.get("e");

// متغیرهای سراسری
let currentMovie = null;
let currentEpisode = null;
let continueKeyId = null; // کلیدی که برای remo_continue استفاده می‌شود
let lastSaveTime = 0;

// ============================
// لود اولیه پلیر
// ============================
async function loadPlayer() {
    console.log("ID:", movieId, "Season:", seasonNumber, "Episode:", episodeNumber);

    if (!movieId) {
        alert("شناسه محتوا نامعتبر است");
        window.location.href = "index.html";
        return;
    }

    try {
        // دریافت لیست فیلم‌ها
        let movies = [];
        const localData = localStorage.getItem("remo_movies");

        if (localData) {
            movies = JSON.parse(localData);
        } else {
            const response = await fetch("data/playlist.json");
            movies = await response.json();
            localStorage.setItem("remo_movies", JSON.stringify(movies));
        }

        const movie = movies.find(m => String(m.id) === String(movieId));

        if (!movie) {
            alert("محتوا پیدا نشد");
            window.location.href = "index.html";
            return;
        }

        currentMovie = movie;

        // اگر سریال نیست → فیلم سینمایی
        if (movie.type !== "series") {
            continueKeyId = `movie_${movie.id}`;
            setupMovieInfo(movie);
            await initPlayerForSource(movie.stream);
            await setupSubtitle(movie);      // ست کردن زیرنویس بر اساس movie.subtitle
            restoreContinuePosition();
            return;
        }

        // سریال است → باید فصل و قسمت وجود داشته باشد
        if (!seasonNumber || !episodeNumber) {
            alert("قسمت انتخاب نشده است.");
            window.location.href = `details.html?id=${movie.id}`;
            return;
        }

        const seasonIndex = Number(seasonNumber) - 1;
        const episodeIndex = Number(episodeNumber) - 1;

        const season = movie.seasons?.[seasonIndex];
        if (!season) {
            alert("فصل پیدا نشد.");
            window.location.href = `details.html?id=${movie.id}`;
            return;
        }

        const episode = season.episodes?.[episodeIndex];
        if (!episode) {
            alert("قسمت پیدا نشد.");
            window.location.href = `details.html?id=${movie.id}`;
            return;
        }

        currentEpisode = episode;
        continueKeyId = `series_${movie.id}_s${seasonNumber}_e${episodeNumber}`;

        setupEpisodeInfo(movie, seasonNumber, episodeNumber, episode);
        await initPlayerForSource(episode.stream);
        await setupSubtitle(episode);       // ست کردن زیرنویس بر اساس episode.subtitle
        restoreContinuePosition();

    } catch (error) {
        console.error("PLAYER ERROR =", error);
        alert("خطا در بارگذاری پلیر");
    }
}

// تنظیم اطلاعات برای فیلم سینمایی
function setupMovieInfo(movie) {
    title.textContent = movie.title || "";
    description.textContent = movie.description || "";

    if (movie.download) {
        downloadBtn.href = movie.download;
        downloadBtn.style.display = "inline-block";
    } else {
        downloadBtn.style.display = "none";
    }
}

// تنظیم اطلاعات برای اپیزود
function setupEpisodeInfo(movie, seasonNumber, episodeNumber, episode) {
    title.textContent = `${movie.title} - فصل ${seasonNumber} قسمت ${episodeNumber}`;
    description.textContent = episode.title || movie.description || "";

    if (episode.download) {
        downloadBtn.href = episode.download;
        downloadBtn.style.display = "inline-block";
    } else {
        downloadBtn.style.display = "none";
    }
}

// ============================
// هسته پلیر: پخش استریم
// ============================
async function initPlayerForSource(streamUrl) {
    if (!streamUrl) {
        alert("لینک پخش موجود نیست.");
        return;
    }

    // پاکسازی قبلی
    video.pause();
    video.removeAttribute("src");
    video.load();

    // حذف ترک‌های زیرنویس قبلی (اگر وجود دارد)
    const oldTracks = video.querySelectorAll("track");
    oldTracks.forEach(t => t.remove());

    // پخش HLS یا MP4
    if (streamUrl.includes(".m3u8")) {
        if (Hls.isSupported()) {
            const hls = new Hls();
            hls.loadSource(streamUrl);
            hls.attachMedia(video);

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                console.log("HLS Ready");
            });

            hls.on(Hls.Events.ERROR, (event, data) => {
                console.error("HLS ERROR:", data);
            });
        } else {
            video.src = streamUrl;
        }
    } else {
        video.src = streamUrl;
    }

    // بعد از آماده شدن متادیتا، زمان را نمایش بده
    video.addEventListener("loadedmetadata", () => {
        updateTimeDisplay();
    }, { once: true });
}

// ============================
// زیرنویس: SRT/VTT (آپلودی یا لینک)
// ============================

async function setupSubtitle(movieOrEpisode) {
    if (!movieOrEpisode || !movieOrEpisode.subtitle) return;

    // پاک کردن ترک‌های قدیمی
    const oldTracks = video.querySelectorAll("track");
    oldTracks.forEach(t => t.remove());

    const subtitleData = movieOrEpisode.subtitle;

    // حالت اول: زیرنویس به صورت آبجکت آپلود شده در localStorage
    // { name, content, type: "srt" | "vtt" }
    if (typeof subtitleData === "object" && subtitleData.content) {
        let vttText = "";

        if (subtitleData.type === "srt") {
            vttText = "WEBVTT\n\n" + convertSrtToVtt(subtitleData.content);
        } else {
            vttText = subtitleData.content.startsWith("WEBVTT")
                ? subtitleData.content
                : "WEBVTT\n\n" + subtitleData.content;
        }

        const blob = new Blob([vttText], { type: "text/vtt" });
        const blobUrl = URL.createObjectURL(blob);
        createTrackElement(blobUrl);
        console.log("زیرنویس آپلود شده از دیتابیس داخلی لود شد.");
    }
    // حالت دوم: زیرنویس به صورت لینک متنی است
    else if (typeof subtitleData === "string") {
        const subtitleUrl = subtitleData;

        if (subtitleUrl.toLowerCase().endsWith(".srt")) {
            await attachSrtAsVtt(video, subtitleUrl);
        } else {
            // VTT مستقیم با فالبک
            try {
                const res = await fetch(subtitleUrl, { cache: "no-store" });
                if (!res.ok) throw new Error("Network error");
                const vttText = await res.text();
                const blob = new Blob([vttText], { type: "text/vtt" });
                const blobUrl = URL.createObjectURL(blob);
                createTrackElement(blobUrl);
                console.log("زیرنویس VTT از URL با Blob لود شد.");
            } catch (err) {
                console.warn("خطا در fetch زیرنویس، تلاش با لینک مستقیم...", err);
                createTrackElement(subtitleUrl);
            }
        }
    }
}

// دانلود و تبدیل SRT به VTT در لحظه از URL
async function attachSrtAsVtt(videoElement, srtUrl) {
    try {
        const res = await fetch(srtUrl, { cache: "no-store" });
        const srtText = await res.text();
        const vttText = "WEBVTT\n\n" + convertSrtToVtt(srtText);

        const blob = new Blob([vttText], { type: "text/vtt" });
        const vttUrl = URL.createObjectURL(blob);

        const track = document.createElement("track");
        track.kind = "subtitles";
        track.label = "فارسی";
        track.srclang = "fa";
        track.src = vttUrl;
        track.default = true;

        videoElement.appendChild(track);

        track.addEventListener("load", () => {
            const tt = videoElement.textTracks[0];
            if (tt) {
                tt.mode = "showing";
                subBtn?.classList.add("active");
            }
        });

        // fallback کوچک اگر رویداد load نیامد
        setTimeout(() => {
            const tt = videoElement.textTracks[0];
            if (tt) {
                tt.mode = "showing";
                subBtn?.classList.add("active");
            }
        }, 800);
    } catch (err) {
        console.error("خطا در بارگذاری زیرنویس SRT:", err);
    }
}

// تابع کمکی برای ساخت و فعال‌سازی Track (برای VTT)
function createTrackElement(url) {
    const track = document.createElement("track");
    track.kind = "subtitles";
    track.label = "فارسی";
    track.srclang = "fa";
    track.src = url;
    track.default = true;
    video.appendChild(track);

    track.addEventListener("load", () => {
        const tt = video.textTracks[0];
        if (tt) {
            tt.mode = "showing";
            subBtn?.classList.add("active");
        }
    });

    // fallback کوچک اگر رویداد load نیامد
    setTimeout(() => {
        const tt = video.textTracks[0];
        if (tt) {
            tt.mode = "showing";
            subBtn?.classList.add("active");
        }
    }, 800);
}

// تبدیل ساده SRT به VTT (حذف شماره‌ها، حفظ زمان‌ها)
function convertSrtToVtt(srt) {
    return srt
        .replace(/\r/g, "")
        .split(/\n\n+/)
        .map(block => {
            const lines = block.split("\n").filter(Boolean);
            if (lines.length === 0) return "";

            // اگر خط اول شماره است، حذفش
            if (/^\d+$/.test(lines[0].trim())) {
                lines.shift();
            }

            // تبدیل کاما به نقطه در تایم‌کد
            if (lines[0] && lines[0].includes("-->")) {
                lines[0] = lines[0].replace(/,/g, ".");
            }

            return lines.join("\n");
        })
        .filter(Boolean)
        .join("\n\n");
}

// ============================
// سیستم Continue Watching
// ============================
function saveProgress(force = false) {
    if (!continueKeyId) return;
    if (!video.duration || isNaN(video.duration)) return;

    const now = Date.now();

    // ذخیره هر ~۵ ثانیه، مگر اینکه force=true باشد
    if (!force && now - lastSaveTime < 5000) return;
    lastSaveTime = now;

    const position = video.currentTime;
    const duration = video.duration;

    const continueData = JSON.parse(localStorage.getItem("remo_continue")) || [];

    const index = continueData.findIndex(item => item.key === continueKeyId);

    const baseMeta = {
        id: movieId,
        key: continueKeyId,
        title: currentEpisode
            ? title.textContent
            : (currentMovie?.title || ""),
        cover: currentMovie?.cover || "",
        position,
        duration,
        lastUpdate: now,
        type: currentMovie?.type || "movie",
        season: seasonNumber || null,
        episode: episodeNumber || null
    };

    if (index > -1) {
        continueData[index] = baseMeta;
    } else {
        continueData.unshift(baseMeta);
    }

    // محدودیت ۱۰ آیتم
    if (continueData.length > 10) {
        continueData.length = 10;
    }

    localStorage.setItem("remo_continue", JSON.stringify(continueData));
}

function restoreContinuePosition() {
    if (!continueKeyId) return;

    const continueData = JSON.parse(localStorage.getItem("remo_continue")) || [];
    const session = continueData.find(item => item.key === continueKeyId);

    if (session && session.position && session.position < session.duration - 5) {
        video.currentTime = session.position;
    }
}

// ============================
// کنترل‌های سفارشی پلیر
// ============================
function togglePlay() {
    if (video.paused) {
        video.play();
    } else {
        video.pause();
    }
}

function updatePlayButton() {
    if (!playPauseBtn) return;
    playPauseBtn.textContent = video.paused ? "▶" : "⏸";
}

function updateTimeDisplay() {
    if (!timeDisplay) return;

    const current = formatTime(video.currentTime || 0);
    const total = formatTime(video.duration || 0);
    timeDisplay.textContent = `${current} / ${total}`;
}

function formatTime(sec) {
    const s = Math.floor(sec % 60).toString().padStart(2, "0");
    const m = Math.floor(sec / 60).toString().padStart(2, "0");
    const h = Math.floor(sec / 3600);
    if (h > 0) {
        return `${h}:${m}:${s}`;
    }
    return `${m}:${s}`;
}

function updateProgressBar() {
    if (!progressFilled || !video.duration) return;
    const percent = (video.currentTime / video.duration) * 100;
    progressFilled.style.width = `${percent}%`;
}

function seekByClick(e) {
    if (!progressBar || !video.duration) return;
    const rect = progressBar.getBoundingClientRect();
    // فاصله از چپ نوار
    const ratio = (e.clientX - rect.left) / rect.width;
    const clamped = Math.min(Math.max(ratio, 0), 1);
    video.currentTime = clamped * video.duration;
}

// ============================
// fullscreen سفارشی (بدون Fullscreen API)
// ============================
function toggleFullScreen() {
    if (!playerWrapper) return;
    playerWrapper.classList.toggle("player-fullscreen");
}

// ============================
// toggle دکمه زیرنویس
// ============================
function handleSubtitleToggle() {
    const tracks = video.textTracks;
    if (!tracks || tracks.length === 0) return;

    const track = tracks[0]; // اولین ترک زیرنویس

    if (track.mode === "showing") {
        track.mode = "hidden";
        subBtn.classList.remove("active");
    } else {
        track.mode = "showing";
        subBtn.classList.add("active");
    }
}

// ============================
// رویدادها
// ============================

// کنترل‌ها
if (playPauseBtn) playPauseBtn.addEventListener("click", togglePlay);

if (fsBtn) fsBtn.addEventListener("click", toggleFullScreen);

if (subBtn) {
    subBtn.addEventListener("click", handleSubtitleToggle);
}

if (progressBar) {
    progressBar.addEventListener("click", seekByClick);
}

// رویدادهای ویدیو
video.addEventListener("play", updatePlayButton);
video.addEventListener("pause", updatePlayButton);
video.addEventListener("timeupdate", () => {
    updateTimeDisplay();
    updateProgressBar();
    saveProgress(false);
});

// هنگام بسته شدن/رفتن از صفحه، حتماً ذخیره کن
window.addEventListener("beforeunload", () => {
    saveProgress(true);
});

// شروع
loadPlayer();
