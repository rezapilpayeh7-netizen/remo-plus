// رمز عبور و نام کاربری دلخواه خودت را اینجا بنویس
const AUTH_USER = "admin";
const AUTH_PASS = "123456"; // رمز عبور شخصی خودت

function checkAuth() {
    // اگر در صفحه لاگین نیستیم و کاربر لاگین نکرده، بفرستش به صفحه ورود
    const isLoggedIn = localStorage.getItem("remo_logged_in") === "true";
    const currentPage = window.location.pathname.split("/").pop();

    if (!isLoggedIn && currentPage !== "login.html" && currentPage !== "") {
        window.location.href = "login.html";
    }
}

function login(username, password) {
    if (username === AUTH_USER && password === AUTH_PASS) {
        localStorage.setItem("remo_logged_in", "true");
        window.location.href = "index.html";
        return true;
    }
    alert("نام کاربری یا رمز عبور اشتباه است!");
    return false;
}

function logout() {
    localStorage.removeItem("remo_logged_in");
    window.location.href = "login.html";
}

// اجرای خودکار بررسی هویت در صفحات
if (typeof window !== "undefined") {
    const currentPage = window.location.pathname.split("/").pop();
    if (currentPage !== "login.html") {
        checkAuth();
    }
}
