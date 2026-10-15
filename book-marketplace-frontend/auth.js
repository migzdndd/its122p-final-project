/* LIBROWSE BOOK EXCHANGE - Frontend Authentication JavaScript */

function librowseApiBase() {
    if (window.LIBROWSE_API_BASE) return String(window.LIBROWSE_API_BASE).replace(/\/$/, '');
    const host = window.location.hostname || '127.0.0.1';
    const port = window.location.port;
    if (port === '8000') {
        const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
        return `${protocol}//${host}:8000/api`;
    }
    return '/api';
}
const API_BASE = librowseApiBase();
const SESSION_TOKEN_KEY = "librowseSessionToken";
const SESSION_USER_KEY = "librowseCurrentUser";

/**
 * Built-in mock customer accounts for offline/demo resilience
 * matching the SQL seed in book-marketplace-backend/sql/queries.sql
 */

/* ==========================================================================
   API REQUEST HELPER
   ========================================================================== */

/**
 * Sends asynchronous HTTP requests to the PHP REST backend
 * @param {string} endpoint - The relative API path (e.g., 'user.php')
 * @param {object} options - Fetch options (method, headers, body)
 * @returns {Promise<any>}
 */
async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE}/${endpoint}`;

    try {
        const token = sessionStorage.getItem(SESSION_TOKEN_KEY);
        const headers = new Headers(options.headers || {});
        if (token) headers.set("Authorization", `Bearer ${token}`);
        headers.set("Cache-Control", "no-store");
        const response = await fetch(url, { ...options, headers, cache: "no-store" });
        const text = await response.text();

        let data;
        try {
            data = text ? JSON.parse(text) : {};
        } catch {
            throw new Error("The backend server did not return valid JSON.");
        }

        if (response.status === 401) {
            sessionStorage.removeItem(SESSION_TOKEN_KEY);
            sessionStorage.removeItem(SESSION_USER_KEY);
            localStorage.removeItem(SESSION_USER_KEY);
            throw new Error("Your session has expired. Please sign in again.");
        }

        if (!response.ok) {
            throw new Error(data.error || `Server returned error status ${response.status}`);
        }

        return data;
    } catch (err) {
        if (err.name === "TypeError" && err.message.includes("fetch")) {
            const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
            const tip = isLocal
                ? "Please ensure your PHP server is running (e.g., php -S 127.0.0.1:8000 -t book-marketplace-backend)."
                : "Please check your network connection or verify service status.";
            throw new Error(`Cannot connect to the backend at ${API_BASE}. ${tip}`);
        }
        throw err;
    }
}

/**
 * Searches for users by specific column (username or email)
 * @param {string} field - 'username' or 'email'
 * @param {string} value - Search query string
 * @returns {Promise<Array>}
 */
async function findUsersByField(field, value) {
    const encoded = encodeURIComponent(value);
    const users = await apiRequest(`user.php?${field}=${encoded}&limit=50&offset=0`);
    return Array.isArray(users) ? users : [];
}

const EMAIL_FORMAT_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function validateEmailFormat(value) {
    return EMAIL_FORMAT_REGEX.test(String(value || "").trim());
}

function updateFieldValidation(input, errorEl, isValid, message) {
    if (!input) return;
    if (isValid) {
        input.setCustomValidity("");
        input.classList.remove("field-invalid");
        if (errorEl) {
            errorEl.textContent = "";
            errorEl.style.display = "none";
        }
    } else {
        input.setCustomValidity(message);
        input.classList.add("field-invalid");
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.style.display = "block";
        }
    }
}

function initEmailFormatGuards() {
    const regEmail = document.getElementById("register-email");
    const regEmailErr = document.getElementById("register-email-error");
    if (regEmail) {
        const check = () => {
            const val = regEmail.value.trim();
            if (!val) {
                updateFieldValidation(regEmail, regEmailErr, true, "");
                return;
            }
            if (!validateEmailFormat(val)) {
                updateFieldValidation(regEmail, regEmailErr, false, "Please enter the right format (e.g. you@example.com).");
            } else {
                updateFieldValidation(regEmail, regEmailErr, true, "");
            }
        };
        regEmail.addEventListener("input", check);
        regEmail.addEventListener("blur", check);
    }

    const forgotIdent = document.getElementById("forgot-identifier");
    const forgotErr = document.getElementById("forgot-identifier-error");
    if (forgotIdent) {
        const check = () => {
            const val = forgotIdent.value.trim();
            if (!val) {
                updateFieldValidation(forgotIdent, forgotErr, true, "");
                return;
            }
            if (val.includes("@") && !validateEmailFormat(val)) {
                updateFieldValidation(forgotIdent, forgotErr, false, "Please enter the right format (e.g. you@example.com).");
            } else {
                updateFieldValidation(forgotIdent, forgotErr, true, "");
            }
        };
        forgotIdent.addEventListener("input", check);
        forgotIdent.addEventListener("blur", check);
    }

    const resendIdent = document.getElementById("resend-identifier");
    const resendErr = document.getElementById("resend-identifier-error");
    if (resendIdent) {
        const check = () => {
            const val = resendIdent.value.trim();
            if (!val) {
                updateFieldValidation(resendIdent, resendErr, true, "");
                return;
            }
            if (val.includes("@") && !validateEmailFormat(val)) {
                updateFieldValidation(resendIdent, resendErr, false, "Please enter the right format (e.g. you@example.com).");
            } else {
                updateFieldValidation(resendIdent, resendErr, true, "");
            }
        };
        resendIdent.addEventListener("input", check);
        resendIdent.addEventListener("blur", check);
    }
}

/* ==========================================================================
   UI NOTIFICATIONS & FEEDBACK
   ========================================================================== */

/**
 * Displays status, success, or error messages in the auth alert banner
 * @param {string} message - Text to show
 * @param {"error"|"success"|"info"} type - Message severity
 */
function showMessage(message, type = "info") {
    const messageEl = document.getElementById("auth-message");
    if (!messageEl) return;

    if (!message) {
        messageEl.style.display = "none";
        messageEl.textContent = "";
        return;
    }

    messageEl.className = "auth-message";
    if (type === "error") {
        messageEl.classList.add("auth-error");
        messageEl.innerHTML = `
            <svg style="width:16px;height:16px;flex-shrink:0;fill:currentColor;" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
            <span>${escapeHTML(message)}</span>
        `;
    } else if (type === "success") {
        messageEl.classList.add("auth-success");
        messageEl.innerHTML = `
            <svg style="width:16px;height:16px;flex-shrink:0;fill:currentColor;" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            <span>${escapeHTML(message)}</span>
        `;
    } else {
        messageEl.classList.add("auth-info");
        messageEl.innerHTML = `
            <svg style="width:16px;height:16px;flex-shrink:0;fill:currentColor;" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
            </svg>
            <span>${escapeHTML(message)}</span>
        `;
    }

    messageEl.style.display = "flex";
}

/**
 * Escapes HTML characters to prevent XSS in client-rendered messages
 */
function escapeHTML(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/* ==========================================================================
   SESSION STORAGE
   ========================================================================== */

/**
 * Saves current user session details to localStorage
 * Matches the format expected by script.js (currentUser)
 * @param {object} user
 */
function saveCurrentUser(user, token) {
    sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    localStorage.removeItem(SESSION_USER_KEY);
}

function getStoredUser() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_USER_KEY) || 'null'); }
    catch { return null; }
}

async function clearCurrentUser() {
    const token = sessionStorage.getItem(SESSION_TOKEN_KEY);
    try {
        if (token) {
            await fetch(`${API_BASE}/auth.php?action=logout`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}`, "Cache-Control": "no-store" },
                cache: "no-store"
            });
        }
    } catch (_) {}
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    sessionStorage.removeItem(SESSION_USER_KEY);
    localStorage.removeItem(SESSION_USER_KEY);
}

/* ==========================================================================
   LOGIN HANDLER
   ========================================================================== */

/**
 * Processes Customer login form submission
 * @param {Event} event
 */
/* ==========================================================================
   LOGIN RATE LIMITING (display side)
   The server is the source of truth: it counts wrong passwords and locks the
   account in the database on the 4th one. This code only explains what is
   happening and remembers locked accounts so a refresh still shows the lock.
   ========================================================================== */
const LOCKED_ACCOUNTS_KEY = "librowseLockedAccounts";
const LAST_LOCKED_KEY = "librowseLastLockedAccount";

function getLockedAccounts() {
    try { return JSON.parse(localStorage.getItem(LOCKED_ACCOUNTS_KEY) || "[]"); }
    catch (_) { return []; }
}
function isAccountMarkedLocked(identifier) {
    return !!identifier && getLockedAccounts().includes(identifier.toLowerCase().trim());
}
function markAccountLocked(identifier, username) {
    const list = new Set(getLockedAccounts());
    [identifier, username].filter(Boolean).forEach(v => list.add(String(v).toLowerCase().trim()));
    try {
        localStorage.setItem(LOCKED_ACCOUNTS_KEY, JSON.stringify([...list]));
        localStorage.setItem(LAST_LOCKED_KEY, identifier);
    } catch (_) {}
}
function forgetLockedAccount(identifier) {
    const key = String(identifier || "").toLowerCase().trim();
    try {
        localStorage.setItem(LOCKED_ACCOUNTS_KEY, JSON.stringify(getLockedAccounts().filter(v => v !== key)));
        if ((localStorage.getItem(LAST_LOCKED_KEY) || "").toLowerCase() === key) localStorage.removeItem(LAST_LOCKED_KEY);
    } catch (_) {}
}

function attemptDots(used, max) {
    let dots = "";
    for (let i = 1; i <= max; i++) dots += `<span class="attempt-dot${i <= used ? " used" : ""}"></span>`;
    return `<span class="attempt-dots" aria-hidden="true">${dots}</span>`;
}

function showAttemptWarning(used, max, finalWarning) {
    const messageEl = document.getElementById("auth-message");
    if (!messageEl) return;
    const left = Math.max(max - used, 0);
    messageEl.className = finalWarning ? "auth-message auth-warning" : "auth-message auth-error";
    messageEl.style.display = "flex";
    messageEl.innerHTML = finalWarning
        ? `<div><strong>Incorrect password — last chance.</strong>
             You have used all ${max} attempts. <strong>One more incorrect password will lock your account</strong>,
             and only an administrator can unlock it.
             <div class="attempt-row">${attemptDots(used, max)} Attempt ${used} of ${max}</div></div>`
        : `<div><strong>Incorrect password.</strong>
             You have ${left} attempt${left === 1 ? "" : "s"} left before the final warning.
             After ${max} incorrect attempts, the next one locks your account.
             <div class="attempt-row">${attemptDots(used, max)} Attempt ${used} of ${max}</div></div>`;
}

function setLoginLocked(locked, identifier) {
    const submitBtn = document.getElementById("login-submit-btn");
    const messageEl = document.getElementById("auth-message");
    if (!submitBtn) return;
    const label = submitBtn.querySelector("span");

    if (!locked) {
        submitBtn.disabled = false;
        submitBtn.classList.remove("btn-locked");
        if (label) label.textContent = "Sign In";
        return;
    }

    submitBtn.disabled = true;
    submitBtn.classList.add("btn-locked");
    if (label) label.textContent = "Account locked";
    if (messageEl) {
        messageEl.className = "auth-message auth-message-locked";
        messageEl.style.display = "block";
        messageEl.innerHTML = `
            <strong class="lock-title">This account is locked</strong>
            <span>${escapeHTML(identifier || "This account")} was locked after too many incorrect password attempts.
            For your security, signing in is blocked until an <strong>administrator unlocks the account</strong>.</span>
            <div class="lock-actions">
                <button type="button" class="lock-request-btn" id="lock-request-btn">Request an unlock</button>
                <button type="button" class="lock-retry-link" id="lock-retry-link">An admin already unlocked it? Try again</button>
            </div>`;
        document.getElementById("lock-request-btn")?.addEventListener("click", () => openUnlockDialog(identifier));
        document.getElementById("lock-retry-link")?.addEventListener("click", () => {
            forgetLockedAccount(identifier);
            setLoginLocked(false);
            showMessage("Enter your password to try again. If the account is still locked, you will see this notice again.", "info");
            document.getElementById("login-password")?.focus();
        });
    }
}

/* ---------- "Request an unlock" (works without signing in) ---------- */
function openUnlockDialog(identifier) {
    const dlg = document.getElementById("unlock-dialog");
    if (!dlg) return;
    const idEl = document.getElementById("unlock-identifier");
    idEl.value = identifier || document.getElementById("login-identifier")?.value.trim() || "";
    document.getElementById("unlock-message").value = "";
    document.getElementById("unlock-identifier-error").style.display = "none";
    document.getElementById("unlock-done").hidden = true;
    dlg.querySelectorAll(".unlock-hide-when-done").forEach(el => el.hidden = false);
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
    (idEl.value ? document.getElementById("unlock-message") : idEl).focus();
}

function initUnlockRequest() {
    const dlg = document.getElementById("unlock-dialog");
    const form = document.getElementById("unlock-form");
    if (!dlg || !form) return;
    // Everything except the success box is hidden once the request is sent
    ["unlock-intro", "unlock-actions"].forEach(cls => form.querySelector("." + cls)?.classList.add("unlock-hide-when-done"));
    form.querySelectorAll("label, input, textarea, .field-error").forEach(el => el.classList.add("unlock-hide-when-done"));

    const close = () => dlg.close();
    document.getElementById("unlock-link")?.addEventListener("click", () => openUnlockDialog());
    document.getElementById("unlock-close")?.addEventListener("click", close);
    document.getElementById("unlock-cancel")?.addEventListener("click", close);
    document.getElementById("unlock-done-close")?.addEventListener("click", close);
    dlg.addEventListener("click", e => { if (e.target === dlg) close(); });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submit = document.getElementById("unlock-submit");
        if (submit.disabled) return;                          // no double sends
        const identifier = document.getElementById("unlock-identifier").value.trim();
        const message = document.getElementById("unlock-message").value.trim();
        const err = document.getElementById("unlock-identifier-error");
        if (!identifier) {
            err.textContent = "Please enter the username or email of the locked account.";
            err.style.display = "block";
            return;
        }
        if (identifier.includes("@") && !validateEmailFormat(identifier)) {
            err.textContent = "Please enter the right format (e.g. you@example.com).";
            err.style.display = "block";
            return;
        }
        err.style.display = "none";
        submit.disabled = true;
        submit.textContent = "Sending…";
        try {
            const res = await fetch(`${API_BASE}/unlock_request.php`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ identifier, message })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Could not send the request.");
            form.querySelectorAll(".unlock-hide-when-done").forEach(el => el.hidden = true);
            document.getElementById("unlock-done-text").textContent = data.message;
            document.getElementById("unlock-done").hidden = false;
            document.getElementById("unlock-done-close").focus();
        } catch (error) {
            err.textContent = error instanceof TypeError ? "Couldn't reach the server. Check your connection and try again." : error.message;
            err.style.display = "block";
        } finally {
            submit.disabled = false;
            submit.textContent = "Send request";
        }
    });
}

/* Re-show the lock after a refresh, and when a locked username is typed in */
function initLoginLockState() {
    const idEl = document.getElementById("login-identifier");
    if (!idEl) return;
    const last = localStorage.getItem(LAST_LOCKED_KEY);
    if (last && isAccountMarkedLocked(last)) {
        idEl.value = last;
        setLoginLocked(true, last);
    }
    idEl.addEventListener("input", () => {
        const value = idEl.value.trim();
        if (isAccountMarkedLocked(value)) {
            setLoginLocked(true, value);
        } else if (document.getElementById("login-submit-btn")?.classList.contains("btn-locked")) {
            setLoginLocked(false);
            showMessage("", "info");
        }
    });
}

async function handleLogin(event) {
    event.preventDefault();
    const identifier = document.getElementById("login-identifier")?.value.trim() || "";
    const password = document.getElementById("login-password")?.value || "";
    const submitBtn = document.getElementById("login-submit-btn");

    if (isAccountMarkedLocked(identifier)) { setLoginLocked(true, identifier); return; }
    if (!identifier || !password) {
        showMessage("Please enter both your email/username and password.", "error");
        return;
    }
    if (identifier.includes("@") && !validateEmailFormat(identifier)) {
        showMessage("Please enter the right format for your email address (e.g. you@example.com).", "error");
        return;
    }
    if (submitBtn) { submitBtn.disabled = true; submitBtn.querySelector("span").textContent = "Signing in..."; }
    showMessage("Authenticating with Librowse...", "info");

    let lockedNow = false;
    try {
        const response = await fetch(`${API_BASE}/auth.php?action=login`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
            cache: "no-store",
            body: JSON.stringify({ identifier, password })
        });
        const data = await response.json();

        if (data.locked) {
            lockedNow = true;
            markAccountLocked(identifier, data.username);
            setLoginLocked(true, identifier);
            return;
        }
        if (!response.ok) {
            if (data.pending_verification) {
                const messageEl = document.getElementById("auth-message");
                if (messageEl) {
                    messageEl.className = "auth-message auth-warning";
                    messageEl.style.display = "block";
                    messageEl.innerHTML = `
                        <div>
                            <strong>Email verification required</strong>
                            <p style="margin:4px 0 10px;">Please check your inbox at <strong>${escapeHTML(data.email || identifier)}</strong> for the verification link.</p>
                            <button type="button" class="text-link" id="resend-login-link" style="font-weight:700;text-decoration:underline;">
                                Resend verification email
                            </button>
                        </div>
                    `;
                    document.getElementById("resend-login-link")?.addEventListener("click", async () => {
                        try {
                            const res = await fetch(`${API_BASE}/auth.php?action=resend-verification`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ identifier: data.email || identifier })
                            });
                            const rData = await res.json();
                            showMessage(rData.message || "Verification email sent.", "info");
                        } catch (err) {
                            showMessage("Could not resend email: " + err.message, "error");
                        }
                    });
                }
                return;
            }
            if (data.attempts_used) {
                showAttemptWarning(data.attempts_used, data.max_attempts || 3, !!data.final_warning);
                const pw = document.getElementById("login-password");
                if (pw) { pw.value = ""; pw.focus(); }
                return;
            }
            throw new Error(data.error || "Unable to sign in.");
        }

        forgetLockedAccount(identifier);
        saveCurrentUser(data.user, data.token);
        const destination = data.user.role === "Admin" ? "admin.html" : data.user.role === "Staff" ? "staff.html" : "customer-dashboard.html";
        showMessage(`Welcome back, ${data.user.username}! Redirecting...`, "success");
        setTimeout(() => window.location.replace(destination), 250);
    } catch (error) {
        const detail = error instanceof TypeError
            ? `Unable to reach ${API_BASE}. Check your connection and try again.`
            : error.message;
        showMessage(`Unable to sign in: ${detail}`, "error");
    } finally {
        if (submitBtn && !lockedNow && !submitBtn.classList.contains("btn-locked")) {
            submitBtn.disabled = false;
            submitBtn.querySelector("span").textContent = "Sign In";
        }
    }
}

async function handleRegister(event) {
    event.preventDefault();
    const username = document.getElementById("register-username")?.value.trim() || "";
    const regEmailInput = document.getElementById("register-email");
    const regEmailErr = document.getElementById("register-email-error");
    const email = regEmailInput?.value.trim().toLowerCase() || "";
    const password = document.getElementById("register-password")?.value || "";
    const confirmPassword = document.getElementById("register-confirm-password")?.value || "";
    const submitBtn = document.getElementById("register-submit-btn");

    if (!username || !email || !password || !confirmPassword) return showMessage("Please fill in all registration fields.", "error");
    if (!/^[a-zA-Z0-9_]{3,50}$/.test(username)) return showMessage("Username must be 3-50 characters and contain only letters, numbers, and underscores.", "error");
    if (!validateEmailFormat(email)) {
        updateFieldValidation(regEmailInput, regEmailErr, false, "Please enter the right format (e.g. you@example.com).");
        regEmailInput?.focus();
        return showMessage("Please enter the right format for your email address (e.g. you@example.com).", "error");
    }
    if (password.length < 8) return showMessage("Password must be at least 8 characters long.", "error");
    if (password !== confirmPassword) return showMessage("Passwords do not match.", "error");

    if (submitBtn) { submitBtn.disabled = true; submitBtn.querySelector("span").textContent = "Creating Account..."; }
    try {
        const response = await fetch(`${API_BASE}/auth.php?action=register`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
            cache: "no-store",
            body: JSON.stringify({ username, email, password })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Registration failed.");

        if (data.requires_verification) {
            showMessage(data.message, "success");
            const form = document.getElementById("register-form");
            if (form) {
                form.innerHTML = `
                    <div class="session-active-card">
                        <p style="margin:0 0 12px;color:var(--ok);font-size:16px;"><strong>Registration Successful</strong></p>
                        <p style="margin:0 0 16px;color:var(--text);">${escapeHTML(data.message)}</p>
                        ${data.dev_preview_link ? `
                            <div class="dev-preview-box">
                                <strong>Developer Preview (Local Testing)</strong>
                                <p>Click below to verify your account immediately:</p>
                                <a href="${data.dev_preview_link}" class="dev-preview-btn">Verify Account Now</a>
                            </div>
                        ` : ''}
                        <div class="session-actions" style="margin-top:16px;">
                            <a href="login.html" class="btn-continue">Go to Sign In</a>
                        </div>
                    </div>
                `;
            }
            return;
        }

        saveCurrentUser(data.user, data.token);
        showMessage("Account created successfully! Redirecting...", "success");
        setTimeout(() => window.location.replace("customer-dashboard.html"), 250);
    } catch (error) {
        showMessage(`Registration failed: ${error.message}`, "error");
    } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.querySelector("span").textContent = "Create Account"; }
    }
}

/* ==========================================================================
   PAGE INITIALIZATION & EVENT BINDINGS
   ========================================================================== */

document.addEventListener("DOMContentLoaded", async () => {
    localStorage.removeItem(SESSION_USER_KEY);
    const currentUser = getStoredUser();
    const sessionCard = document.getElementById("session-active-card");
    const sessionText = document.getElementById("session-active-text");
    const sessionLogoutBtn = document.getElementById("session-logout-btn");

    if (currentUser && sessionStorage.getItem(SESSION_TOKEN_KEY)) {
        try {
            const token = sessionStorage.getItem(SESSION_TOKEN_KEY);
            const response = await fetch(`${API_BASE}/auth.php?action=validate`, { headers: { "Authorization": `Bearer ${token}` }, cache: "no-store" });
            if (!response.ok) throw new Error("Session invalid");
            const data = await response.json();
            saveCurrentUser(data.user, token);
            if (sessionCard && sessionText) {
                sessionCard.style.display = "block";
                sessionText.innerHTML = `You are currently signed in as <strong>${escapeHTML(data.user.username)}</strong> (Role: ${escapeHTML(data.user.role)}).`;
            }
            const link = document.getElementById("session-continue-link");
            if (link) {
                const role = String(data.user.role || '').toLowerCase();
                link.href = role === 'admin' ? 'admin.html' : role === 'staff' ? 'staff.html' : 'customer-dashboard.html';
                link.textContent = role === 'admin' || role === 'staff' ? 'Open Management Dashboard' : 'Go to Marketplace';
            }
        } catch (_) { await clearCurrentUser(); }
    }

    sessionLogoutBtn?.addEventListener("click", async () => {
        await clearCurrentUser();
        if (sessionCard) sessionCard.style.display = "none";
        showMessage("Signed out. You may now log in with another account.", "info");
    });

    document.getElementById("login-form")?.addEventListener("submit", handleLogin);
    initLoginLockState();
    initUnlockRequest();
    initEmailFormatGuards();
    document.getElementById("register-form")?.addEventListener("submit", handleRegister);

    document.getElementById("forgot-password-form")?.addEventListener("submit", handleForgotPassword);
    initResetPasswordPage();
    initVerifyEmailPage();

    document.querySelectorAll(".toggle-password-btn").forEach(button => button.addEventListener("click", () => {
        const input = document.getElementById(button.dataset.target);
        if (input) input.type = input.type === "password" ? "text" : "password";
    }));

    // Demo convenience buttons still fill the login form, but authentication is now always server-side.
    document.querySelectorAll(".demo-pill").forEach(button => button.addEventListener("click", () => {
        const username = document.getElementById("login-identifier");
        const password = document.getElementById("login-password");
        if (username) username.value = button.dataset.username || "";
        if (password) password.value = button.dataset.pass || "password";
    }));
});

/* ==========================================================================
   FORGOT PASSWORD & RESET PASSWORD HANDLERS
   ========================================================================== */

async function handleForgotPassword(event) {
    event.preventDefault();
    const identInput = document.getElementById("forgot-identifier");
    const identErr = document.getElementById("forgot-identifier-error");
    const identifier = identInput?.value.trim() || "";
    const submitBtn = document.getElementById("forgot-submit-btn");

    if (!identifier) {
        showMessage("Please enter your email address or username.", "error");
        return;
    }
    if (identifier.includes("@") && !validateEmailFormat(identifier)) {
        updateFieldValidation(identInput, identErr, false, "Please enter the right format (e.g. you@example.com).");
        identInput?.focus();
        showMessage("Please enter the right format for your email address (e.g. you@example.com).", "error");
        return;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.querySelector("span").textContent = "Sending Link...";
    }
    showMessage("Processing request...", "info");

    try {
        const response = await fetch(`${API_BASE}/auth.php?action=forgot-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
            cache: "no-store",
            body: JSON.stringify({ identifier })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to send reset link.");

        showMessage(data.message, "success");

        if (data.dev_preview_link) {
            const previewBox = document.getElementById("dev-preview-container");
            const previewLink = document.getElementById("dev-preview-link");
            if (previewBox && previewLink) {
                previewLink.href = data.dev_preview_link;
                previewBox.style.display = "block";
            }
        }
    } catch (err) {
        showMessage(err.message, "error");
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.querySelector("span").textContent = "Send Reset Link";
        }
    }
}

async function initResetPasswordPage() {
    const form = document.getElementById("reset-password-form");
    if (!form) return;

    const checkingCard = document.getElementById("token-checking-card");
    const invalidCard = document.getElementById("token-invalid-card");
    const invalidText = document.getElementById("token-invalid-text");
    const successCard = document.getElementById("reset-success-card");
    const submitBtn = document.getElementById("reset-submit-btn");

    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
        if (checkingCard) checkingCard.style.display = "none";
        if (invalidCard) {
            invalidCard.style.display = "block";
            if (invalidText) invalidText.textContent = "Missing password reset token. Please request a new link.";
        }
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/auth.php?action=verify-reset-token&token=${encodeURIComponent(token)}`, {
            cache: "no-store"
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Invalid or expired reset link.");

        if (checkingCard) checkingCard.style.display = "none";
        form.style.display = "block";
    } catch (err) {
        if (checkingCard) checkingCard.style.display = "none";
        if (invalidCard) {
            invalidCard.style.display = "block";
            if (invalidText) invalidText.textContent = err.message;
        }
        return;
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const password = document.getElementById("reset-password")?.value || "";
        const confirm = document.getElementById("reset-confirm-password")?.value || "";

        if (password.length < 8) {
            showMessage("Password must be at least 8 characters long.", "error");
            return;
        }
        if (password !== confirm) {
            showMessage("Passwords do not match.", "error");
            return;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.querySelector("span").textContent = "Updating...";
        }

        try {
            const response = await fetch(`${API_BASE}/auth.php?action=reset-password`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
                cache: "no-store",
                body: JSON.stringify({ token, password })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Could not reset password.");

            form.style.display = "none";
            showMessage("", "info");
            if (successCard) successCard.style.display = "block";
        } catch (err) {
            showMessage(err.message, "error");
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.querySelector("span").textContent = "Update Password";
            }
        }
    });
}

async function initVerifyEmailPage() {
    const loadingCard = document.getElementById("verify-loading-card");
    if (!loadingCard) return;

    const successCard = document.getElementById("verify-success-card");
    const resendCard = document.getElementById("resend-card");
    const heading = document.getElementById("verify-heading");
    const token = new URLSearchParams(window.location.search).get("token");

    if (token) {
        try {
            const response = await fetch(`${API_BASE}/auth.php?action=verify-email`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
                cache: "no-store",
                body: JSON.stringify({ token })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Verification failed.");

            loadingCard.style.display = "none";
            if (heading) heading.textContent = "Email Verified";
            if (successCard) successCard.style.display = "block";
        } catch (err) {
            loadingCard.style.display = "none";
            showMessage(err.message, "error");
            if (resendCard) resendCard.style.display = "block";
        }
    } else {
        loadingCard.style.display = "none";
        if (resendCard) resendCard.style.display = "block";
    }

    const resendForm = document.getElementById("resend-verification-form");
    resendForm?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const resendInput = document.getElementById("resend-identifier");
        const resendErr = document.getElementById("resend-identifier-error");
        const identifier = resendInput?.value.trim() || "";
        const submitBtn = document.getElementById("resend-submit-btn");
        if (!identifier) return showMessage("Please enter your email or username.", "error");
        if (identifier.includes("@") && !validateEmailFormat(identifier)) {
            updateFieldValidation(resendInput, resendErr, false, "Please enter the right format (e.g. you@example.com).");
            resendInput?.focus();
            return showMessage("Please enter the right format for your email address (e.g. you@example.com).", "error");
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.querySelector("span").textContent = "Sending...";
        }

        try {
            const response = await fetch(`${API_BASE}/auth.php?action=resend-verification`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
                cache: "no-store",
                body: JSON.stringify({ identifier })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Could not send verification email.");

            showMessage(data.message, "success");
            if (data.dev_preview_link) {
                const devBox = document.getElementById("dev-resend-preview");
                const devLink = document.getElementById("dev-resend-link");
                if (devBox && devLink) {
                    devLink.href = data.dev_preview_link;
                    devBox.style.display = "block";
                }
            }
        } catch (err) {
            showMessage(err.message, "error");
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.querySelector("span").textContent = "Send New Verification Link";
            }
        }
    });
}

/* ==========================================================================
   PASSWORD STRENGTH METER (register and reset pages)
   ========================================================================== */
(function () {
    const pw = document.getElementById("register-password") || document.getElementById("reset-password");
    if (!pw) return;

    const fill = document.getElementById("pw-strength-fill");
    const label = document.getElementById("pw-strength-label");
    const reqEls = {
        length: document.getElementById("req-length"),
        upper:  document.getElementById("req-upper"),
        lower:  document.getElementById("req-lower"),
        digit:  document.getElementById("req-digit"),
        symbol: document.getElementById("req-symbol"),
    };

    function score(v) {
        const rules = {
            length: v.length >= 8,
            upper:  /[A-Z]/.test(v),
            lower:  /[a-z]/.test(v),
            digit:  /[0-9]/.test(v),
            symbol: /[^A-Za-z0-9]/.test(v),
        };
        let passed = 0;
        for (const [key, ok] of Object.entries(rules)) {
            const el = reqEls[key];
            if (!el) continue;
            el.classList.toggle("req-met", ok);
            el.textContent = (ok ? "✓ " : "○ ") + el.textContent.replace(/^[✓○] /, "");
            if (ok) passed++;
        }
        return passed;
    }

    const LEVELS = [
        { label: "Very weak", color: "#ef4444", pct: "20%" },
        { label: "Weak",      color: "#f97316", pct: "40%" },
        { label: "Fair",      color: "#eab308", pct: "60%" },
        { label: "Almost there: 1 rule left", color: "#84cc16", pct: "80%" },
        { label: "Strong", color: "#16a34a", pct: "100%" },
    ];

    pw.addEventListener("input", () => {
        const v = pw.value;
        if (!fill) return;
        if (!v) {
            fill.style.width = "0"; fill.style.background = "";
            if (label) { label.textContent = "Password strength: None"; label.style.color = ""; }
            score("");
            checkMatch();
            return;
        }
        const passed = score(v);
        const lvl = LEVELS[Math.max(0, passed - 1)];
        fill.style.width = lvl.pct;
        fill.style.background = lvl.color;
        fill.setAttribute("aria-label", lvl.label);
        if (label) { label.textContent = "Password strength: " + lvl.label; label.style.color = lvl.color; }
        checkMatch();
    });

    const confirm = document.getElementById("register-confirm-password") || document.getElementById("reset-confirm-password");
    const matchEl = document.getElementById("password-match-indicator");
    function checkMatch() {
        if (!confirm || !matchEl) return;
        if (!confirm.value) { matchEl.textContent = ""; matchEl.className = "password-match-hint"; return; }
        const ok = confirm.value === pw.value;
        matchEl.textContent = ok ? "✓ Passwords match" : "✗ Passwords don't match yet";
        matchEl.className = "password-match-hint " + (ok ? "match" : "no-match");
    }
    confirm?.addEventListener("input", checkMatch);
})();
