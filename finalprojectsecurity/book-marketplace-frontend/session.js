/* Shared server-session guard for all Librowse pages. */
(function () {
    function librowseApiBase() {
        if (window.LIBROWSE_API_BASE) return String(window.LIBROWSE_API_BASE).replace(/\/$/, "");
        const host = window.location.hostname || "127.0.0.1";
        const protocol = window.location.protocol === "https:" ? "https:" : "http:";
        if (host.includes("vercel.app") || window.location.port === "" || window.location.port === "80" || window.location.port === "443") {
            return `${window.location.origin}/api`;
        }
        return `${protocol}//${host}:8000/api`;
    }

    const API_BASE = librowseApiBase();
    const TOKEN_KEY = "librowseSessionToken";
    const USER_KEY = "librowseCurrentUser";

    const path = window.location.pathname.toLowerCase();
    const isPublicPage = path.endsWith("index.html") ||
                         path.endsWith("browse.html") ||
                         path.endsWith("login.html") ||
                         path.endsWith("register.html") ||
                         path === "" ||
                         path === "/" ||
                         path.endsWith("/");

    if (!isPublicPage) {
        document.documentElement.classList.add("librowse-auth-pending");
        const style = document.createElement("style");
        style.textContent = "html.librowse-auth-pending body{visibility:hidden!important}html.librowse-auth-ready body{visibility:visible!important}";
        document.head.appendChild(style);
    } else {
        document.documentElement.classList.add("librowse-auth-ready");
    }

    function getToken() { return sessionStorage.getItem(TOKEN_KEY); }
    function getUser() {
        try { return JSON.parse(sessionStorage.getItem(USER_KEY) || "null"); }
        catch (_) { return null; }
    }
    function saveSession(token, user) {
        sessionStorage.setItem(TOKEN_KEY, token);
        sessionStorage.setItem(USER_KEY, JSON.stringify(user));
        localStorage.removeItem(USER_KEY);
    }
    function clearSession() {
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(USER_KEY);
        localStorage.removeItem(USER_KEY);
    }

    async function validateSession(redirect = false) {
        const token = getToken();
        if (!token) {
            clearSession();
            if (redirect && !isPublicPage) window.location.replace("login.html");
            document.documentElement.classList.remove("librowse-auth-pending");
            document.documentElement.classList.add("librowse-auth-ready");
            return null;
        }
        try {
            const response = await fetch(`${API_BASE}/auth.php?action=validate`, {
                method: "GET",
                headers: { "Authorization": `Bearer ${token}`, "Cache-Control": "no-store" },
                cache: "no-store"
            });
            if (!response.ok) throw new Error("Invalid session");
            const data = await response.json();
            if (!data.authenticated || !data.user) throw new Error("Invalid session");
            sessionStorage.setItem(USER_KEY, JSON.stringify(data.user));
            document.documentElement.classList.remove("librowse-auth-pending");
            document.documentElement.classList.add("librowse-auth-ready");
            return data.user;
        } catch (_) {
            clearSession();
            if (redirect && !isPublicPage) window.location.replace("login.html");
            document.documentElement.classList.remove("librowse-auth-pending");
            document.documentElement.classList.add("librowse-auth-ready");
            return null;
        }
    }

    async function requireRole(expected) {
        const allowed = Array.isArray(expected) ? expected : [expected];
        const user = await validateSession(true);
        if (!user) return null;
        const role = String(user.role || "").toLowerCase();
        if (!allowed.map(r => String(r).toLowerCase()).includes(role)) {
            window.location.replace(role === "admin" ? "admin.html" : role === "staff" ? "staff.html" : "index.html");
            return null;
        }
        return user;
    }

    async function logout() {
        const token = getToken();
        try {
            if (token) {
                await fetch(`${API_BASE}/auth.php?action=logout`, {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${token}`, "Cache-Control": "no-store" },
                    cache: "no-store"
                });
            }
        } catch (_) { }
        finally { clearSession(); }
    }

    window.librowseAuth = { API_BASE, getToken, getUser, saveSession, clearSession, validateSession, requireRole, logout };
    window.librowseAuthReady = validateSession(!isPublicPage);

    window.addEventListener("pageshow", function () {
        // Handles bfcache/back-button restores after logout
        window.librowseAuthReady = validateSession(!isPublicPage);
    });
})();
