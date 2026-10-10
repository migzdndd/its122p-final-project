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
const MANAGEMENT_API_BASE = librowseApiBase();

const managementState = {
    user: null,
    role: null,
    users: [],
    categories: [],
    books: [],
    listings: [],
    reports: [],
    transactions: [],
    refunds: [],
    records: [],
    activityLogs: [],
    activeTab: null,
    editingCategoryId: null,
    editingBookId: null
};

function mgEscape(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function mgRole(value) {
    return String(value || "").toLowerCase();
}

async function mgApi(endpoint, options = {}) {
    const token = sessionStorage.getItem("librowseSessionToken");
    const headers = new Headers(options.headers || {});
    if (token) headers.set("Authorization", `Bearer ${token}`);
    headers.set("Cache-Control", "no-store");
    const response = await fetch(`${MANAGEMENT_API_BASE}/${endpoint}`, { ...options, headers, cache: "no-store" });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; }
    catch { throw new Error("Backend returned invalid JSON."); }

    if (response.status === 401) {
        if (window.librowseAuth) window.librowseAuth.clearSession();
        window.location.replace("login.html");
        throw new Error("Your session has expired.");
    }
    if (!response.ok) {
        throw new Error(data.error || `Request failed (${response.status}).`);
    }
    return data;
}

function currentUserFromStorage() {
    try {
        const raw = sessionStorage.getItem("librowseCurrentUser");
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

async function requireManagementRole(expectedRole) {
    const user = window.librowseAuth ? await window.librowseAuth.requireRole(expectedRole) : currentUserFromStorage();

    if (!user || !user.user_id) {
        window.location.href = "login.html";
        return false;
    }

    const role = mgRole(user.role);
    const expected = Array.isArray(expectedRole) ? expectedRole : [expectedRole];

    if (!expected.includes(role)) {
        if (role === "admin") window.location.href = "admin.html";
        else if (role === "staff") window.location.href = "staff.html";
        else window.location.href = "index.html";
        return false;
    }

    managementState.user = user;
    managementState.role = role;
    return true;
}

function showMgmtAlert(message, type = "info") {
    const box = document.getElementById("management-alert");
    if (!box) return;
    box.textContent = message;
    box.className = `management-alert ${type}`;
    box.style.display = "block";
    clearTimeout(window.__mgAlertTimer);
    window.__mgAlertTimer = setTimeout(() => box.style.display = "none", 3200);
}

function setActiveTab(tab) {
    document.querySelectorAll(".management-section").forEach(section => {
        section.classList.toggle("active", section.dataset.section === tab);
    });
    document.querySelectorAll(".management-nav button[data-tab]").forEach(button => {
        button.classList.toggle("active", button.dataset.tab === tab);
    });
    managementState.activeTab = tab;
}

function goBackToMarketplace() {
    window.location.href = "index.html";
}

async function logoutManagement() {
    if (window.librowseAuth) await window.librowseAuth.logout();
    else { sessionStorage.removeItem("librowseSessionToken"); sessionStorage.removeItem("librowseCurrentUser"); }
    window.location.replace("login.html");
}

function renderSession() {
    const user = managementState.user;
    const name = document.getElementById("management-user-name");
    const role = document.getElementById("management-role-label");
    if (name) name.textContent = `${user.username} (${user.email || "no email"})`;
    if (role) role.textContent = managementState.role.toUpperCase();
}

function formatDate(value) {
    if (!value) return "-";
    const parsed = new Date(String(value).replace(" ", "T"));
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString();
}

function formatMoney(value) {
    if (value === null || value === undefined || value === "") return "-";
    return `₱${Number(value).toFixed(2)}`;
}

function badge(value) {
    const text = String(value ?? "-");
    let cls = "muted";
    if (["Active","Accepted","Approved","Completed","Resolved"].includes(text)) cls = "success";
    if (["Pending","Pending Verification","Under_Review","In_transaction","Disputed"].includes(text)) cls = "warning";
    if (["Suspended","Banned","Locked","Rejected","Cancelled","Removed","Dismissed"].includes(text)) cls = "danger";
    return `<span class="management-badge ${cls}">${mgEscape(text.replaceAll("_"," "))}</span>`;
}

function sortEntries(items, sortKey, textExtractor, idOrDateExtractor) {
    const list = [...items];
    switch (sortKey) {
        case "az":
            return list.sort((a, b) => String(textExtractor(a) || "").localeCompare(String(textExtractor(b) || ""), undefined, { numeric: true, sensitivity: "base" }));
        case "za":
            return list.sort((a, b) => String(textExtractor(b) || "").localeCompare(String(textExtractor(a) || ""), undefined, { numeric: true, sensitivity: "base" }));
        case "oldest":
            return list.sort((a, b) => {
                const valA = idOrDateExtractor(a);
                const valB = idOrDateExtractor(b);
                if (typeof valA === "number" && typeof valB === "number") return valA - valB;
                const timeA = new Date(valA || 0).getTime();
                const timeB = new Date(valB || 0).getTime();
                if (!Number.isNaN(timeA) && !Number.isNaN(timeB)) return timeA - timeB;
                return String(valA || "").localeCompare(String(valB || ""));
            });
        case "newest":
        default:
            return list.sort((a, b) => {
                const valA = idOrDateExtractor(a);
                const valB = idOrDateExtractor(b);
                if (typeof valA === "number" && typeof valB === "number") return valB - valA;
                const timeA = new Date(valA || 0).getTime();
                const timeB = new Date(valB || 0).getTime();
                if (!Number.isNaN(timeA) && !Number.isNaN(timeB)) return timeB - timeA;
                return String(valB || "").localeCompare(String(valA || ""));
            });
    }
}

function renderCategoryStats() {
    const tbody = document.getElementById("category-stats-body");
    if (!tbody) return;

    if (!managementState.categories || !managementState.categories.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="management-empty">No category data available yet.</td></tr>`;
        return;
    }

    const catMap = {};
    managementState.categories.forEach(c => {
        catMap[c.category_id] = {
            id: c.category_id,
            name: c.category_name,
            catalogBooks: 0,
            totalListed: 0,
            available: 0,
            sold: 0,
            traded: 0
        };
    });

    const bookToCats = {};
    (managementState.books || []).forEach(b => {
        const catIds = (b.category_ids && b.category_ids.length ? b.category_ids : [b.category_id]).map(Number);
        bookToCats[b.book_id] = catIds;
        catIds.forEach(cid => {
            if (catMap[cid]) catMap[cid].catalogBooks++;
        });
    });

    (managementState.listings || []).forEach(l => {
        const cids = bookToCats[l.book_id] || [];
        cids.forEach(cid => {
            if (catMap[cid]) {
                catMap[cid].totalListed++;
                if (l.status === "Available") catMap[cid].available++;
                else if (l.status === "Sold") catMap[cid].sold++;
                else if (l.status === "Traded") catMap[cid].traded++;
            }
        });
    });

    const rows = Object.values(catMap);
    let totalCatalog = 0;
    let totalListed = 0;
    let totalAvailable = 0;
    let totalSold = 0;
    let totalTraded = 0;

    rows.forEach(r => {
        totalCatalog += r.catalogBooks;
        totalListed += r.totalListed;
        totalAvailable += r.available;
        totalSold += r.sold;
        totalTraded += r.traded;
    });

    tbody.innerHTML = rows.map(r => `
        <tr>
            <td><strong>${mgEscape(r.name)}</strong></td>
            <td>${r.catalogBooks}</td>
            <td>${r.totalListed}</td>
            <td>${r.available ? `<span class="management-badge success">${r.available}</span>` : `<span class="muted">0</span>`}</td>
            <td>${r.sold ? `<span class="management-badge info">${r.sold}</span>` : `<span class="muted">0</span>`}</td>
            <td>${r.traded ? `<span class="management-badge warning">${r.traded}</span>` : `<span class="muted">0</span>`}</td>
        </tr>
    `).join("") + `
        <tr style="font-weight:700; background: rgba(0,0,0,0.03);">
            <td>Total Across Categories</td>
            <td>${totalCatalog}</td>
            <td>${totalListed}</td>
            <td>${totalAvailable}</td>
            <td>${totalSold}</td>
            <td>${totalTraded}</td>
        </tr>
    `;
}

function selected(a, b) {
    return String(a) === String(b) ? "selected" : "";
}

function userMap() {
    return Object.fromEntries(managementState.users.map(u => [u.user_id, u]));
}

function bookMap() {
    return Object.fromEntries(managementState.books.map(b => [b.book_id, b]));
}

function listingMap() {
    return Object.fromEntries(managementState.listings.map(l => [l.inventory_id, l]));
}

function parsePermissions(value) {
    if (!value) return {};
    if (typeof value === "object") return value;
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
        throw new Error("Permissions must contain valid JSON object syntax.");
    }
}

async function loadAllUsers() {
    managementState.users = await mgApi("user.php?limit=500&offset=0");
    return managementState.users;
}

async function loadCategories() {
    managementState.categories = await mgApi("book_categories.php?limit=500&offset=0");
    return managementState.categories;
}

async function loadBooks() {
    managementState.books = await mgApi("books_catalog.php?limit=500&offset=0");
    return managementState.books;
}

async function loadListings() {
    managementState.listings = await mgApi("user_books.php?limit=500&offset=0");
    return managementState.listings;
}

async function loadReports() {
    managementState.reports = await mgApi("reports.php?limit=500&offset=0");
    return managementState.reports;
}

async function loadTransactions() {
    managementState.transactions = await mgApi("transactions.php?limit=500&offset=0");
    return managementState.transactions;
}

async function loadRefunds() {
    managementState.refunds = await mgApi("refund_request.php?limit=500&offset=0");
    return managementState.refunds;
}

async function loadRecords() {
    managementState.records = await mgApi("system_records.php?limit=500&offset=0");
    return managementState.records;
}

async function loadActivityLogs() {
    const logs = await mgApi("activity_logs.php?limit=500&offset=0");
    managementState.activityLogs = (Array.isArray(logs) ? logs : []).filter(log => {
        const action = String(log.activity_action || "").toLowerCase();
        return !action.includes("resetpassword") && !action.includes("passwordreset");
    });
    return managementState.activityLogs;
}

async function reloadCoreData() {
    await Promise.all([loadAllUsers(), loadCategories(), loadBooks(), loadListings(), loadReports(), loadTransactions(), loadRefunds(), loadActivityLogs()]);
    try { await loadRecords(); } catch (e) { console.warn("Records unavailable:", e.message); }
}

function renderDashboardStats() {
    const target = document.getElementById("overview-stats");
    if (!target) return;

    const customers = managementState.users.filter(u => mgRole(u.role) === "customer");
    const staff = managementState.users.filter(u => mgRole(u.role) === "staff");
    const pendingReports = managementState.reports.filter(r => ["Pending","Under_Review"].includes(r.status));
    const pendingRefunds = managementState.refunds.filter(r => r.status === "Pending");
    const openTransactions = managementState.transactions.filter(t => ["Pending","Accepted","Disputed"].includes(t.status));
    const activeListings = managementState.listings.filter(l => l.status === "Available");
    const visitLogs = managementState.activityLogs.filter(log => mgRole(log.activity_type) === "visit").length;

    const cards = managementState.role === "admin" ? [
        ["Users", managementState.users.length],
        ["Catalog Books", managementState.books.length],
        ["Active Listings", activeListings.length],
        ["Open Transactions", openTransactions.length],
        ["Pending Reports", pendingReports.length],
        ["Pending Refunds", pendingRefunds.length],
        ["Staff", staff.length],
        ["Categories", managementState.categories.length],
        ["Visit Logs", visitLogs]
    ] : [
        ["Customers", customers.length],
        ["Pending Forms", managementState.reports.filter(r => ["Verification_Form","Seller_Application"].includes(r.report_category) && ["Pending","Under_Review"].includes(r.status)).length],
        ["Open Transactions", openTransactions.length],
        ["Pending Refunds", pendingRefunds.length]
    ];

    target.innerHTML = cards.map(([label, value]) => `
        <div class="management-card">
            <div class="management-stat-label">${mgEscape(label)}</div>
            <div class="management-stat-value">${value}</div>
        </div>
    `).join("");
}

function renderUsersTable() {
    const tbody = document.getElementById("users-body");
    if (!tbody) return;

    const search = (document.getElementById("users-search")?.value || "").toLowerCase().trim();
    const sort = document.getElementById("users-sort")?.value || "newest";
    let users = managementState.users.filter(u => {
        if (managementState.role === "staff" && mgRole(u.role) !== "customer") return false;
        if (!search) return true;
        return [u.user_id, u.username, u.email, u.role, u.status].some(x => String(x || "").toLowerCase().includes(search));
    });

    users = sortEntries(users, sort, u => u.username, u => u.user_id);

    if (!users.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="management-empty">No users found matching your search.</td></tr>`;
        return;
    }

    tbody.innerHTML = users.map(user => {
        const canDelete = managementState.role === "admin" && user.user_id !== managementState.user.user_id;
        const perms = typeof user.permission === "string" ? user.permission : JSON.stringify(user.permission || {}, null, 0);

        const roleOptions = managementState.role === "admin"
            ? ["Customer","Staff","Admin"]
            : ["Customer"];

        return `
            <tr>
                <td>${user.user_id}</td>
                <td><strong>${mgEscape(user.username)}</strong><div class="muted">${mgEscape(user.email)}</div></td>
                <td>
                    <select aria-label="Role for ${mgEscape(user.username)}" data-user-role="${user.user_id}" ${managementState.role === "staff" ? "disabled" : ""}>
                        ${roleOptions.map(r => `<option value="${r}" ${selected(r,user.role)}>${r}</option>`).join("")}
                    </select>
                </td>
                <td>
                    <select aria-label="Status for ${mgEscape(user.username)}" data-user-status="${user.user_id}" ${managementState.role === "staff" && user.status === "Locked" ? "disabled title=\"Only an administrator can unlock this account\"" : ""}>
                        ${(managementState.role === "staff" && user.status !== "Locked" ? ["Active","Suspended","Banned","Pending Verification"] : ["Active","Suspended","Banned","Pending Verification","Locked"]).map(s => `<option value="${s}" ${selected(s,user.status)}>${s}</option>`).join("")}
                    </select>
                </td>
                <td>
                    <textarea data-user-permission="${user.user_id}" ${managementState.role === "staff" ? "disabled" : ""} aria-label="Permissions for ${mgEscape(user.username)}">${mgEscape(perms)}</textarea>
                </td>
                <td>${badge(user.status)}</td>
                <td>${formatDate(user.created_at)}</td>
                <td>
                    <div class="management-actions">
                        ${user.status === "Locked" && managementState.role === "admin" ? `<button class="management-btn success small" onclick="unlockUser(${user.user_id})">Unlock</button>` : ""}
                        ${user.status === "Locked" && (managementState.reports || []).some(r => Number(r.submitted_by_id) === Number(user.user_id) && ["Pending","Under_Review"].includes(r.status) && parseFormData(r.form_data)?.type === "unlock_request") ? `<span class="management-badge warning">Requested unlock</span>` : ""}
                        ${managementState.role === "staff" && user.status === "Locked" ? `<span class="muted">Admin unlocks</span>` : `<button class="management-btn primary small" onclick="saveUser(${user.user_id})">Save</button>`}
                        ${canDelete ? `<button class="management-btn danger small" onclick="deleteUser(${user.user_id})">Archive</button>` : ""}
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

async function saveUser(userId) {
    try {
        const roleEl = document.querySelector(`[data-user-role="${userId}"]`);
        const statusEl = document.querySelector(`[data-user-status="${userId}"]`);
        const permissionEl = document.querySelector(`[data-user-permission="${userId}"]`);

        // Staff may only change the status; admins can also change permissions and role
        const payload = { status: statusEl.value };
        if (managementState.role === "admin") payload.permission = parsePermissions(permissionEl.value);

        if (managementState.role === "admin" && roleEl) payload.role = roleEl.value;

        await mgApi(`user.php?id=${userId}`, {
            method: "PUT",
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify(payload)
        });

        showMgmtAlert("User account updated.", "success");
        await loadAllUsers();
        renderUsersTable();
        renderDashboardStats();
    } catch (error) {
        showMgmtAlert(error.message, "error");
    }
}

async function unlockUser(userId) {
    try {
        await mgApi(`user.php?id=${userId}`, {
            method: "PUT",
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify({ status: "Active" })
        });
        // Close any open unlock requests from this user
        const openRequests = (managementState.reports || []).filter(r =>
            Number(r.submitted_by_id) === Number(userId) &&
            ["Pending","Under_Review"].includes(r.status) &&
            parseFormData(r.form_data)?.type === "unlock_request");
        for (const r of openRequests) {
            await mgApi(`reports.php?id=${r.report_id}`, {
                method: "PUT",
                headers: {"Content-Type":"application/json"},
                body: JSON.stringify({
                    status: "Resolved",
                    resolution_notes: "Account unlocked by an administrator.",
                    reviewed_by_id: managementState.user.user_id,
                    resolved_at: new Date().toISOString().slice(0,19).replace("T"," ")
                })
            });
        }
        showMgmtAlert(openRequests.length
            ? "Account unlocked and the unlock request marked as resolved."
            : "Account unlocked. The user can sign in again.", "success");
        await loadAllUsers();
        if (openRequests.length) await loadReports();
        renderUsersTable();
        if (typeof renderReportsTable === "function") renderReportsTable();
        renderDashboardStats();
    } catch (error) {
        showMgmtAlert(error.message, "error");
    }
}

async function deleteUser(userId) {
    if (!confirm(`Archive user #${userId}? They will no longer be able to sign in. It will be hidden from the app, but the record is kept in the database for logging.`)) return;

    try {
        await mgApi(`user.php?id=${userId}`, {method:"DELETE"});
        showMgmtAlert("User archived. The record is kept for logging.", "success");
        await loadAllUsers();
        renderUsersTable();
        renderDashboardStats();
    } catch (error) {
        showMgmtAlert(`Could not remove user: ${error.message}`, "error");
    }
}

function fillCategoryOptions(selectedIds = []) {
    const host = document.getElementById("book-category-editor");
    if (!host) return;
    host.innerHTML = managementState.categories.map(c => `
        <label>
            <input type="checkbox" name="book_category_ids" value="${c.category_id}" ${selectedIds.includes(Number(c.category_id)) ? "checked" : ""}>
            ${mgEscape(c.category_name)}
        </label>
    `).join("") || `<span class="muted">No categories available.</span>`;
}

function getBookCategoryIds() {
    return Array.from(document.querySelectorAll('input[name="book_category_ids"]:checked'))
        .map(el => Number(el.value));
}

function getBooksFilterCategoryIds() {
    return Array.from(document.querySelectorAll('input[name="filter_book_category_ids"]:checked'))
        .map(el => Number(el.value));
}

function renderBooksFilterCategories() {
    const host = document.getElementById("books-category-filter");
    if (!host) return;
    const currentChecked = getBooksFilterCategoryIds();
    host.innerHTML = (managementState.categories || []).map(c => `
        <label>
            <input type="checkbox" name="filter_book_category_ids" value="${c.category_id}" ${currentChecked.includes(Number(c.category_id)) ? "checked" : ""}>
            ${mgEscape(c.category_name)}
        </label>
    `).join("") || `<span class="muted">No categories available.</span>`;

    host.querySelectorAll('input[name="filter_book_category_ids"]').forEach(input => {
        input.addEventListener("change", renderBooksTable);
    });
}

function resetBookForm() {
    managementState.editingBookId = null;
    document.getElementById("book-form-title").textContent = "Add catalog book";
    document.getElementById("book-submit-button").textContent = "Add Book";
    document.getElementById("book-form")?.reset();
    fillCategoryOptions([]);
}

function editBook(bookId) {
    const book = managementState.books.find(b => Number(b.book_id) === Number(bookId));
    if (!book) return;
    managementState.editingBookId = bookId;
    document.getElementById("book-form-title").textContent = `Edit catalog book #${bookId}`;
    document.getElementById("book-submit-button").textContent = "Save Book";
    document.getElementById("book-title").value = book.title || "";
    document.getElementById("book-author").value = book.author || "";
    document.getElementById("book-isbn").value = book.isbn || "";
    fillCategoryOptions((book.category_ids || [book.category_id]).map(Number));
    document.getElementById("books-section")?.scrollIntoView({behavior:"smooth"});
}

async function submitBookForm(event) {
    event.preventDefault();

    try {
        const title = document.getElementById("book-title").value.trim();
        const author = document.getElementById("book-author").value.trim();
        const isbn = document.getElementById("book-isbn").value.trim();
        const categoryIds = getBookCategoryIds();

        if (!title || !author || !isbn || !categoryIds.length) {
            throw new Error("Title, author, ISBN, and at least one category are required.");
        }

        const payload = {
            title,
            author,
            isbn,
            category_ids: categoryIds,
            managed_by_admin_id: managementState.user.user_id
        };

        if (managementState.editingBookId) {
            delete payload.managed_by_admin_id;
            await mgApi(`books_catalog.php?id=${managementState.editingBookId}`, {
                method:"PUT",
                headers:{"Content-Type":"application/json"},
                body:JSON.stringify(payload)
            });
            showMgmtAlert("Catalog book updated.", "success");
        } else {
            await mgApi("books_catalog.php", {
                method:"POST",
                headers:{"Content-Type":"application/json"},
                body:JSON.stringify(payload)
            });
            showMgmtAlert("Catalog book added.", "success");
        }

        resetBookForm();
        await loadBooks();
        await loadCategories();
        fillCategoryOptions([]);
        renderBooksTable();
        renderDashboardStats();
    } catch (error) {
        showMgmtAlert(error.message, "error");
    }
}

function renderBooksTable() {
    const tbody = document.getElementById("books-body");
    if (!tbody) return;
    const map = userMap();

    const search = (document.getElementById("books-search")?.value || "").toLowerCase().trim();
    const sort = document.getElementById("books-sort")?.value || "newest";
    const selectedCategoryIds = getBooksFilterCategoryIds();

    let books = (managementState.books || []).filter(book => {
        if (selectedCategoryIds.length > 0) {
            const rawCatIds = (book.category_ids && book.category_ids.length > 0)
                ? book.category_ids
                : (book.category_id ? [book.category_id] : []);
            const numericBookCatIds = Array.from(new Set(rawCatIds.map(Number)));

            // If the book has no categories, it cannot match any category filter.
            // If it has categories, every category of the book must be among the checked categories
            // (completely filter out the unchecked).
            if (numericBookCatIds.length === 0) {
                return false;
            }
            const allChecked = numericBookCatIds.every(id => selectedCategoryIds.includes(id));
            if (!allChecked) {
                return false;
            }
        }

        if (!search) return true;
        const catNames = (book.category_ids || [book.category_id]).map(id => managementState.categories.find(c => Number(c.category_id) === Number(id))?.category_name || "").join(" ");
        const adminName = map[book.managed_by_admin_id]?.username || "";
        return [book.book_id, book.title, book.author, book.isbn, catNames, adminName].some(x => String(x || "").toLowerCase().includes(search));
    });

    books = sortEntries(books, sort, b => b.title, b => b.book_id);

    if (!books.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="management-empty">No catalog books found matching your search.</td></tr>`;
        return;
    }

    tbody.innerHTML = books.map(book => `
        <tr>
            <td>${book.book_id}</td>
            <td><strong>${mgEscape(book.title)}</strong></td>
            <td>${mgEscape(book.author)}</td>
            <td>${mgEscape(book.isbn)}</td>
            <td>${mgEscape((book.category_ids || [book.category_id]).map(id => managementState.categories.find(c => Number(c.category_id) === Number(id))?.category_name || `#${id}`).join(", "))}</td>
            <td>${mgEscape(map[book.managed_by_admin_id]?.username || `User #${book.managed_by_admin_id}`)}</td>
            <td>
                <div class="management-actions">
                    <button class="management-btn primary small" onclick="editBook(${book.book_id})">Edit</button>
                    <button class="management-btn danger small" onclick="deleteBook(${book.book_id})" title="Soft-delete: hides from catalog but keeps the record">Archive</button>
                </div>
            </td>
        </tr>
    `).join("");
}

async function deleteBook(bookId) {
    if (!confirm(`Archive catalog book #${bookId}? It will be hidden from the app, but the record is kept in the database for logging.`)) return;
    try {
        await mgApi(`books_catalog.php?id=${bookId}`, {method:"DELETE"});
        showMgmtAlert("Catalog book archived. The record is kept for logging.", "success");
        await loadBooks();
        await loadListings();
        renderBooksTable();
        renderListingsTable();
        renderDashboardStats();
    } catch (error) {
        showMgmtAlert(`Could not delete catalog book: ${error.message}`, "error");
    }
}

function editCategory(categoryId) {
    const c = managementState.categories.find(x => Number(x.category_id) === Number(categoryId));
    if (!c) return;
    managementState.editingCategoryId = categoryId;
    document.getElementById("category-name").value = c.category_name || "";
    document.getElementById("category-description").value = c.description || "";
    document.getElementById("category-submit-button").textContent = "Save Category";
    document.getElementById("categories-section")?.scrollIntoView({behavior:"smooth"});
}

function resetCategoryForm() {
    managementState.editingCategoryId = null;
    document.getElementById("category-form")?.reset();
    document.getElementById("category-submit-button").textContent = "Add Category";
}

async function submitCategoryForm(event) {
    event.preventDefault();
    try {
        const category_name = document.getElementById("category-name").value.trim();
        const description = document.getElementById("category-description").value.trim();
        if (!category_name) throw new Error("Category name is required.");

        if (managementState.editingCategoryId) {
            await mgApi(`book_categories.php?id=${managementState.editingCategoryId}`, {
                method:"PUT",
                headers:{"Content-Type":"application/json"},
                body:JSON.stringify({category_name, description})
            });
            showMgmtAlert("Category updated.", "success");
        } else {
            await mgApi("book_categories.php", {
                method:"POST",
                headers:{"Content-Type":"application/json"},
                body:JSON.stringify({
                    category_name,
                    description,
                    created_by_admin_id: managementState.user.user_id
                })
            });
            showMgmtAlert("Category created.", "success");
        }

        resetCategoryForm();
        await loadCategories();
        fillCategoryOptions([]);
        renderCategoriesTable();
        renderBooksTable();
        renderDashboardStats();
    } catch (error) {
        showMgmtAlert(error.message, "error");
    }
}

function renderCategoriesTable() {
    const tbody = document.getElementById("categories-body");
    if (!tbody) return;

    const bookCounts = {};
    const listedCounts = {};
    const soldCounts = {};

    const bookToCats = {};
    (managementState.books || []).forEach(book => {
        const catIds = (book.category_ids && book.category_ids.length ? book.category_ids : [book.category_id]).map(Number);
        bookToCats[book.book_id] = catIds;
        catIds.forEach(id => bookCounts[id] = (bookCounts[id] || 0) + 1);
    });

    (managementState.listings || []).forEach(l => {
        const cids = bookToCats[l.book_id] || [];
        cids.forEach(cid => {
            listedCounts[cid] = (listedCounts[cid] || 0) + 1;
            if (l.status === "Sold") soldCounts[cid] = (soldCounts[cid] || 0) + 1;
        });
    });

    const search = (document.getElementById("categories-search")?.value || "").toLowerCase().trim();
    const sort = document.getElementById("categories-sort")?.value || "newest";

    let categories = (managementState.categories || []).filter(c => {
        if (!search) return true;
        return [c.category_id, c.category_name, c.description].some(x => String(x || "").toLowerCase().includes(search));
    });

    categories = sortEntries(categories, sort, c => c.category_name, c => c.category_id);

    if (!categories.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="management-empty">No categories found matching your search.</td></tr>`;
        return;
    }

    tbody.innerHTML = categories.map(c => `
        <tr>
            <td>${c.category_id}</td>
            <td><strong>${mgEscape(c.category_name)}</strong></td>
            <td>${mgEscape(c.description || "-")}</td>
            <td>${bookCounts[c.category_id] || 0}</td>
            <td>${listedCounts[c.category_id] || 0}</td>
            <td>${soldCounts[c.category_id] ? `<span class="management-badge success">${soldCounts[c.category_id]}</span>` : `<span class="muted">0</span>`}</td>
            <td>
                <div class="management-actions">
                    <button class="management-btn primary small" onclick="editCategory(${c.category_id})">Edit</button>
                    <button class="management-btn danger small" onclick="deleteCategory(${c.category_id})">Archive</button>
                </div>
            </td>
        </tr>
    `).join("");
}

async function deleteCategory(categoryId) {
    if (!confirm(`Archive category #${categoryId}? It will be hidden from the app, but the record is kept in the database for logging.`)) return;
    try {
        await mgApi(`book_categories.php?id=${categoryId}`, {method:"DELETE"});
        showMgmtAlert("Category archived. The record is kept for logging.", "success");
        await loadCategories();
        await loadBooks();
        renderCategoriesTable();
        renderBooksTable();
        fillCategoryOptions([]);
    } catch (error) {
        showMgmtAlert(`Could not delete category: ${error.message}`, "error");
    }
}

function renderListingsTable() {
    const tbody = document.getElementById("listings-body");
    if (!tbody) return;
    const bm = bookMap();
    const um = userMap();

    const search = (document.getElementById("listings-search")?.value || "").toLowerCase().trim();
    const sort = document.getElementById("listings-sort")?.value || "newest";
    const typeFilter = document.getElementById("listings-filter-type")?.value || "";
    const conditionFilter = document.getElementById("listings-filter-condition")?.value || "";

    let listings = (managementState.listings || []).filter(l => {
        if (typeFilter && String(l.listing_type || "").toLowerCase() !== typeFilter.toLowerCase()) {
            return false;
        }
        if (conditionFilter && String(l.condition || "").toLowerCase() !== conditionFilter.toLowerCase()) {
            return false;
        }
        if (!search) return true;
        const bookTitle = bm[l.book_id]?.title || "";
        const seller = um[l.seller_id]?.username || "";
        return [l.inventory_id, bookTitle, seller, l.listing_type, l.condition, l.price, l.status].some(x => String(x || "").toLowerCase().includes(search));
    });

    listings = sortEntries(listings, sort, l => bm[l.book_id]?.title || "", l => l.inventory_id);

    if (!listings.length) {
        tbody.innerHTML = `<tr><td colspan="9" class="management-empty">No listings found matching your search.</td></tr>`;
        return;
    }

    tbody.innerHTML = listings.map(l => `
        <tr>
            <td>${l.inventory_id}</td>
            <td><strong>${mgEscape(bm[l.book_id]?.title || `Book #${l.book_id}`)}</strong></td>
            <td>${mgEscape(um[l.seller_id]?.username || `User #${l.seller_id}`)}</td>
            <td>${mgEscape(l.listing_type)}</td>
            <td>${mgEscape(l.condition)}</td>
            <td>${formatMoney(l.price)}</td>
            <td>
                <select aria-label="Status for listing #${l.inventory_id}" id="listing-status-${l.inventory_id}">
                    ${["Available","In_transaction","Sold","Traded","Removed"].map(s => `<option value="${s}" ${selected(s,l.status)}>${s.replaceAll("_"," ")}</option>`).join("")}
                </select>
            </td>
            <td>${formatDate(l.listed_at)}</td>
            <td>
                <button class="management-btn primary small" onclick="saveListing(${l.inventory_id})">Save</button>
            </td>
        </tr>
    `).join("");
}

async function saveListing(inventoryId) {
    try {
        const status = document.getElementById(`listing-status-${inventoryId}`).value;
        await mgApi(`user_books.php?id=${inventoryId}`, {
            method:"PUT",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({status})
        });
        showMgmtAlert("Listing status updated.", "success");
        await loadListings();
        renderListingsTable();
        renderDashboardStats();
    } catch (error) {
        showMgmtAlert(error.message, "error");
    }
}

function parseFormData(value) {
    if (!value) return {};
    if (typeof value === "object") return value;
    try {
        return JSON.parse(value);
    } catch {
        return {details: value};
    }
}

function renderReportsTable() {
    const tbody = document.getElementById("reports-body");
    if (!tbody) return;
    const um = userMap();

    const search = (document.getElementById("reports-search")?.value || "").toLowerCase().trim();
    const sort = document.getElementById("reports-sort")?.value || "newest";
    const formOnly = document.getElementById("reports-forms-only")?.checked;

    let reports = (managementState.reports || []).filter(r => {
        if (formOnly && !["Verification_Form","Seller_Application"].includes(r.report_category)) return false;
        if (!search) return true;
        const user = um[r.submitted_by_id]?.username || "";
        const dataStr = typeof r.form_data === "string" ? r.form_data : JSON.stringify(r.form_data || {});
        return [r.report_id, user, r.report_category, r.related_entity_type, r.status, r.resolution_notes, dataStr].some(x => String(x || "").toLowerCase().includes(search));
    });

    reports = sortEntries(reports, sort, r => r.report_category || "", r => r.report_id);

    if (!reports.length) {
        tbody.innerHTML = `<tr><td colspan="9" class="management-empty">No reports/forms found matching your search.</td></tr>`;
        return;
    }

    tbody.innerHTML = reports.map(r => {
        const data = parseFormData(r.form_data);
        const isUnlock = data && data.type === "unlock_request";
        const requester = um[r.submitted_by_id];
        const stillLocked = requester && requester.status === "Locked";
        const isFeedback = data && data.type === "website_feedback";
        const feedbackStars = isFeedback && Number(data.rating) ? "\u2605".repeat(Number(data.rating)) + "\u2606".repeat(5 - Number(data.rating)) : "";
        const feedbackCell = isFeedback
            ? `<div class="feedback-report-cell">
                 <div><span class="management-badge info">${mgEscape(String(data.topic || "Overall_Experience").replaceAll("_", " "))}</span>
                 ${feedbackStars ? `<span style="color:#d9a441;letter-spacing:2px;margin-left:6px" title="${Number(data.rating)} out of 5">${feedbackStars}</span>` : ""}</div>
                 ${data.comment ? `<div style="margin-top:6px;white-space:pre-wrap;overflow-wrap:anywhere">${mgEscape(data.comment)}</div>` : ""}
                 <div class="muted" style="margin-top:6px">${data.recommend ? `Would recommend: ${mgEscape(data.recommend)}. ` : ""}${data.contact_ok ? "OK to contact." : "Prefers no contact."}${data.transaction_id ? ` Transaction #${Number(data.transaction_id)}.` : ""}</div>
               </div>`
            : "";
        const detailsCell = isFeedback ? feedbackCell : isUnlock
            ? `<div class="unlock-request-cell"><span class="management-badge danger">Unlock request</span>
                 <div>${data.message ? `&ldquo;${mgEscape(data.message)}&rdquo;` : "<span class='muted'>No message</span>"}</div>
                 <div class="muted">Account is ${requester ? mgEscape(requester.status) : "unknown"}</div></div>`
            : `<span class="management-code">${mgEscape(JSON.stringify(data))}</span>`;
        const unlockBtn = isUnlock && stillLocked && managementState.role === "admin"
            ? `<button class="management-btn success small" onclick="unlockUser(${r.submitted_by_id})">Unlock account</button>`
            : "";
        return `
        <tr>
            <td>${r.report_id}</td>
            <td>${mgEscape(um[r.submitted_by_id]?.username || `User #${r.submitted_by_id}`)}</td>
            <td>${mgEscape(r.report_category.replaceAll("_"," "))}</td>
            <td>${mgEscape(r.related_entity_type)}</td>
            <td>${detailsCell}</td>
            <td>${formatDate(r.submitted_at)}</td>
            <td>
                <select aria-label="Status for report #${r.report_id}" id="report-status-${r.report_id}">
                    ${["Pending","Under_Review","Approved","Rejected","Resolved","Dismissed"].map(s => `<option value="${s}" ${selected(s,r.status)}>${s.replaceAll("_"," ")}</option>`).join("")}
                </select>
            </td>
            <td>
                <textarea aria-label="Resolution notes for report #${r.report_id}" id="report-notes-${r.report_id}" placeholder="Resolution/review notes">${mgEscape(r.resolution_notes || "")}</textarea>
            </td>
            <td>
                <div class="management-actions">
                    ${unlockBtn}
                    <button class="management-btn primary small" onclick="saveReport(${r.report_id})">Save</button>
                </div>
            </td>
        </tr>`;
    }).join("");
}

async function saveReport(reportId) {
    try {
        const status = document.getElementById(`report-status-${reportId}`).value;
        const resolution_notes = document.getElementById(`report-notes-${reportId}`).value.trim();
        await mgApi(`reports.php?id=${reportId}`, {
            method:"PUT",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({
                status,
                resolution_notes,
                reviewed_by_id: managementState.user.user_id,
                resolved_at: ["Approved","Rejected","Resolved","Dismissed"].includes(status) ? new Date().toISOString().slice(0,19).replace("T"," ") : null
            })
        });
        showMgmtAlert("Report/form review saved.", "success");
        await loadReports();
        renderReportsTable();
        renderDashboardStats();
    } catch (error) {
        showMgmtAlert(error.message, "error");
    }
}

/* Valid next statuses: the server enforces the same rules */
const TX_NEXT = {
    Pending:  ["Accepted", "Cancelled", "Disputed"],
    Accepted: ["Completed", "Cancelled", "Disputed"],
    Disputed: ["Completed", "Cancelled"],
    Completed: [],
    Cancelled: []
};

function renderTransactionsTable() {
    const tbody = document.getElementById("transactions-body");
    if (!tbody) return;
    const um = userMap();
    const lm = listingMap();
    const bm = bookMap();

    const search = (document.getElementById("transactions-search")?.value || "").toLowerCase().trim();
    const sort = document.getElementById("transactions-sort")?.value || "newest";
    const typeFilter = document.getElementById("transactions-filter-type")?.value || "";
    const statusFilter = document.getElementById("transactions-filter-status")?.value || "";

    let transactions = (managementState.transactions || []).filter(t => {
        if (typeFilter && String(t.transaction_type || "").toLowerCase() !== typeFilter.toLowerCase()) {
            return false;
        }
        if (statusFilter && String(t.status || "").toLowerCase() !== statusFilter.toLowerCase()) {
            return false;
        }
        if (!search) return true;
        const buyer = um[t.buyer_id]?.username || "";
        const staff = um[t.managed_by_staff_id]?.username || "";
        const listing = lm[t.requested_inventory_id];
        const bookTitle = listing ? (bm[listing.book_id]?.title || "") : "";
        return [t.transaction_id, buyer, bookTitle, t.transaction_type, t.amount_paid, t.status, staff].some(x => String(x || "").toLowerCase().includes(search));
    });

    transactions = sortEntries(transactions, sort, t => {
        const listing = lm[t.requested_inventory_id];
        return listing ? (bm[listing.book_id]?.title || "") : "";
    }, t => t.transaction_id);

    if (!transactions.length) {
        tbody.innerHTML = `<tr><td colspan="10" class="management-empty">No transactions found matching your search.</td></tr>`;
        return;
    }

    tbody.innerHTML = transactions.map(t => {
        const listing = lm[t.requested_inventory_id];
        const bookTitle = listing ? (bm[listing.book_id]?.title || `Book #${listing.book_id}`) : `Listing #${t.requested_inventory_id}`;
        return `
        <tr>
            <td>${t.transaction_id}</td>
            <td>${mgEscape(um[t.buyer_id]?.username || `User #${t.buyer_id}`)}</td>
            <td><strong>${mgEscape(bookTitle)}</strong></td>
            <td>${mgEscape(t.transaction_type)}</td>
            <td>${formatMoney(t.amount_paid)}</td>
            <td>${badge(t.status)}</td>
            <td>${mgEscape(um[t.managed_by_staff_id]?.username || "-")}</td>
            <td>${formatDate(t.created_at)}</td>
            <td>
                <select aria-label="Status for transaction #${t.transaction_id}" id="transaction-status-${t.transaction_id}" ${(TX_NEXT[t.status] || []).length ? "" : "disabled"}>
                    ${[t.status, ...(TX_NEXT[t.status] || [])].map(s => `<option value="${s}" ${selected(s,t.status)}>${s}</option>`).join("")}
                </select>
            </td>
            <td>${(TX_NEXT[t.status] || []).length ? `<button class="management-btn primary small" onclick="saveTransaction(${t.transaction_id})">Save</button>` : `<span class="muted">Final</span>`}</td>
        </tr>`;
    }).join("");
}

async function saveTransaction(transactionId) {
    try {
        const status = document.getElementById(`transaction-status-${transactionId}`).value;
        const payload = {status};
        if (managementState.role === "staff") payload.managed_by_staff_id = managementState.user.user_id;
        await mgApi(`transactions.php?id=${transactionId}`, {
            method:"PUT",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify(payload)
        });
        showMgmtAlert("Transaction status updated.", "success");
        await loadTransactions();
        renderTransactionsTable();
        renderDashboardStats();
    } catch (error) {
        showMgmtAlert(error.message, "error");
    }
}

function renderRefundsTable() {
    const tbody = document.getElementById("refunds-body");
    if (!tbody) return;
    const um = userMap();

    const search = (document.getElementById("refunds-search")?.value || "").toLowerCase().trim();
    const sort = document.getElementById("refunds-sort")?.value || "newest";

    let refunds = (managementState.refunds || []).filter(r => {
        if (!search) return true;
        const cust = um[r.customer_id]?.username || "";
        const staff = um[r.processed_by_staff_id]?.username || "";
        return [r.refund_id, r.transaction_id, cust, r.reason, r.status, staff].some(x => String(x || "").toLowerCase().includes(search));
    });

    refunds = sortEntries(refunds, sort, r => um[r.customer_id]?.username || "", r => r.refund_id);

    if (!refunds.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="management-empty">No refund requests found matching your search.</td></tr>`;
        return;
    }

    tbody.innerHTML = refunds.map(r => `
        <tr>
            <td>${r.refund_id}</td>
            <td>#${r.transaction_id}</td>
            <td>${mgEscape(um[r.customer_id]?.username || `User #${r.customer_id}`)}</td>
            <td>${mgEscape(r.reason)}</td>
            <td>${formatDate(r.requested_at)}</td>
            <td>${badge(r.status)}</td>
            <td>${mgEscape(um[r.processed_by_staff_id]?.username || "-")}</td>
            <td>
                ${managementState.role === "staff" && r.status === "Pending" ? `
                <select aria-label="Decision for refund #${r.refund_id}" id="refund-status-${r.refund_id}">
                    ${["Pending","Approved","Rejected"].map(s => `<option value="${s}" ${selected(s,r.status)}>${s}</option>`).join("")}
                </select>
                <button class="management-btn primary small" onclick="saveRefund(${r.refund_id})">Save</button>
                ` : badge(r.status)}
            </td>
        </tr>
    `).join("");
}

async function saveRefund(refundId) {
    try {
        const status = document.getElementById(`refund-status-${refundId}`).value;
        await mgApi(`refund_request.php?id=${refundId}`, {
            method:"PUT",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({status, processed_by_staff_id: managementState.user.user_id})
        });
        showMgmtAlert("Refund request updated.", "success");
        await loadRefunds();
        renderRefundsTable();
        renderDashboardStats();
    } catch (error) {
        showMgmtAlert(error.message, "error");
    }
}

function formatRecordDetails(r) {
    let details = r?.details;
    if (typeof details === "string") {
        try { details = JSON.parse(details); } catch (_) {}
    }
    if (!details || typeof details !== "object" || Object.keys(details).length === 0) {
        return '<span class="muted">No details</span>';
    }
    const items = Object.entries(details).map(([k, v]) => {
        let label = k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
        if (k.toLowerCase().endsWith("_id")) label = k.slice(0, -3).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) + " #";
        let valStr = String(v);
        if (k.toLowerCase() === "amount") valStr = formatMoney(v);
        return `<span class="management-log-item"><strong>${mgEscape(label)}:</strong> <span>${mgEscape(valStr)}</span></span>`;
    });
    return `<div class="management-log-details">${items.join("")}</div>`;
}

function formatActivityDetails(log) {
    if (!log) return '<span class="muted">None</span>';
    let details = log.details;
    if (typeof details === "string") {
        const trimmed = details.trim();
        if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
            try {
                details = JSON.parse(trimmed);
            } catch (_) {
                details = trimmed;
            }
        } else {
            details = trimmed;
        }
    }

    if (!details || (typeof details === "object" && Object.keys(details).length === 0)) {
        return '<span class="muted">No additional details</span>';
    }

    if (typeof details !== "object") {
        return `<span>${mgEscape(String(details))}</span>`;
    }

    const items = Object.entries(details).map(([k, v]) => {
        if (v === null || v === undefined || v === "") return "";
        let label = k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
        if (k.toLowerCase() === "id") label = "ID";
        if (k.toLowerCase().endsWith("_id")) {
            label = k.slice(0, -3).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) + " #";
        }

        let valStr = "";
        if (typeof v === "boolean") {
            valStr = v ? "Yes" : "No";
        } else if (k.toLowerCase() === "amount") {
            valStr = formatMoney(v);
        } else if (k.toLowerCase() === "policy" && String(v) === "privacy-cookie") {
            valStr = "Privacy & Cookie Policy";
        } else if (typeof v === "object") {
            if (Array.isArray(v)) {
                valStr = v.map(x => String(x)).join(", ");
            } else {
                valStr = Object.entries(v).map(([subK, subV]) => `${subK}: ${subV}`).join(", ");
            }
        } else {
            valStr = String(v);
            if (valStr.includes("_")) {
                valStr = valStr.replace(/_/g, " ");
            }
            if (/^[a-z0-9\s-]+$/.test(valStr)) {
                valStr = valStr.replace(/\b\w/g, c => c.toUpperCase());
            }
        }

        return `<span class="management-log-item"><strong>${mgEscape(label)}:</strong> <span>${mgEscape(valStr)}</span></span>`;
    }).filter(Boolean);

    if (items.length === 0) {
        return '<span class="muted">No additional details</span>';
    }

    return `<div class="management-log-details">${items.join("")}</div>`;
}

function formatActivityTarget(log) {
    if (!log) return "-";
    const type = log.target_type;
    const id = log.target_id;
    const page = log.page_path;
    if (type && id) {
        return `${type} #${id}`;
    }
    if (type && page) {
        return `${type}: ${page}`;
    }
    if (type) return type;
    if (page) return page;
    return "-";
}

function renderRecordsTable() {
    const tbody = document.getElementById("records-body");
    if (!tbody) return;
    const um = userMap();

    const search = (document.getElementById("records-search")?.value || "").toLowerCase().trim();
    const sort = document.getElementById("records-sort")?.value || "newest";

    let records = (managementState.records || []).filter(r => {
        if (!search) return true;
        const admin = um[r.admin_id]?.username || "";
        const detailsStr = typeof r.details === "string" ? r.details : JSON.stringify(r.details || {});
        return [r.record_id, admin, r.record_type, detailsStr].some(x => String(x || "").toLowerCase().includes(search));
    });

    records = sortEntries(records, sort, r => r.record_type || "", r => r.record_id);

    if (!records.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="management-empty">No system records found matching your search.</td></tr>`;
        return;
    }

    tbody.innerHTML = records.map(r => `
        <tr>
            <td>${r.record_id}</td>
            <td>${mgEscape(um[r.admin_id]?.username || `User #${r.admin_id}`)}</td>
            <td>${mgEscape(r.record_type.replaceAll("_"," "))}</td>
            <td>${formatRecordDetails(r)}</td>
            <td>${formatDate(r.created_at)}</td>
            <td><button class="management-btn danger small" onclick="deleteRecord(${r.record_id})" title="Soft-delete: hides from view but keeps the audit record">Archive</button></td>
        </tr>
    `).join("");
}

function renderActivityLogsTable() {
    const tbody = document.getElementById("activity-logs-body");
    if (!tbody) return;
    const um = userMap();

    const search = (document.getElementById("activity-logs-search")?.value || "").toLowerCase().trim();
    const sort = document.getElementById("activity-logs-sort")?.value || "newest";
    const typeFilter = document.getElementById("activity-logs-filter-type")?.value || "";

    let logs = (managementState.activityLogs || []).filter(log => {
        if (typeFilter && String(log.activity_type || "").toLowerCase() !== typeFilter.toLowerCase()) {
            return false;
        }
        if (!search) return true;
        const actor = um[log.actor_user_id]?.username || (log.visitor_key ? `Visitor ${log.visitor_key}` : "");
        const detailsStr = typeof log.details === "string" ? log.details : JSON.stringify(log.details || {});
        return [log.activity_id, actor, log.activity_type, log.activity_action, log.outcome, log.reason, log.target_type, log.target_id, log.page_path, detailsStr].some(x => String(x || "").toLowerCase().includes(search));
    });

    logs = sortEntries(logs, sort, log => log.activity_action || "", log => log.activity_id);

    if (!logs.length) {
        tbody.innerHTML = `<tr><td colspan="9" class="management-empty">No activity logs found matching your search.</td></tr>`;
        return;
    }

    tbody.innerHTML = logs.map(log => {
        const target = formatActivityTarget(log);
        const detailsHtml = formatActivityDetails(log);
        return `
            <tr>
                <td>${log.activity_id}</td>
                <td>${mgEscape(um[log.actor_user_id]?.username || (log.visitor_key ? `Visitor ${log.visitor_key}` : "-"))}</td>
                <td>${mgEscape(log.activity_type)}</td>
                <td>${mgEscape(log.activity_action)}</td>
                <td>${badge(log.outcome)}</td>
                <td>${mgEscape(log.reason || "-")}</td>
                <td>${mgEscape(target)}</td>
                <td>${detailsHtml}</td>
                <td>${formatDate(log.created_at)}</td>
            </tr>
        `;
    }).join("");
}

async function submitRecordForm(event) {
    event.preventDefault();
    try {
        const record_type = document.getElementById("record-type").value;
        const detailsText = document.getElementById("record-details").value.trim();
        let details = {};
        if (detailsText) details = JSON.parse(detailsText);
        await mgApi("system_records.php", {
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({admin_id:managementState.user.user_id, record_type, details})
        });
        showMgmtAlert("System record created.", "success");
        document.getElementById("record-form").reset();
        await loadRecords();
        renderRecordsTable();
    } catch (error) {
        showMgmtAlert(error.message.includes("JSON") ? "Record details must be valid JSON." : error.message, "error");
    }
}

async function deleteRecord(recordId) {
    if (!confirm(`Archive system record #${recordId}? It will be hidden from the app, but the record is kept in the database for logging.`)) return;
    try {
        await mgApi(`system_records.php?id=${recordId}`, {method:"DELETE"});
        showMgmtAlert("System record archived. The record is kept for logging.", "success");
        await loadRecords();
        renderRecordsTable();
    } catch (error) {
        showMgmtAlert(error.message, "error");
    }
}

async function submitStaffIssue(event) {
    event.preventDefault();
    try {
        const details = document.getElementById("staff-issue-details").value.trim();
        if (!details) throw new Error("Please describe the issue.");
        await mgApi("reports.php", {
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({
                submitted_by_id: managementState.user.user_id,
                report_category: "General_Feedback",
                related_entity_type: "None",
                form_data: JSON.stringify({issue_type:"Staff_System_Issue", details}),
                status: "Pending"
            })
        });
        showMgmtAlert("Issue reported to Administration.", "success");
        document.getElementById("staff-issue-form").reset();
    } catch (error) {
        showMgmtAlert(error.message, "error");
    }
}

function refreshRenderedData() {
    renderDashboardStats();
    renderCategoryStats();
    renderUsersTable();
    renderBooksFilterCategories();
    renderBooksTable();
    renderCategoriesTable();
    fillCategoryOptions(managementState.editingBookId ? [] : []);
    renderListingsTable();
    renderReportsTable();
    renderTransactionsTable();
    renderRefundsTable();
    renderRecordsTable();
    renderActivityLogsTable();
}

/* ── Loading placeholders while data arrives ───────────────────────────── */
function showLoadingPlaceholders() {
    document.querySelectorAll(".management-table tbody, tbody[id$='-body']").forEach(tbody => {
        const cols = tbody.closest("table")?.querySelectorAll("thead th").length || 6;
        tbody.innerHTML = `<tr class="management-loading-row"><td colspan="${cols}"><span class="mg-spinner" aria-hidden="true"></span> Loading…</td></tr>`;
    });
    const stats = document.getElementById("overview-stats");
    const statCount = managementState.role === "admin" ? 9 : 4;
    if (stats) stats.innerHTML = Array.from({ length: statCount }, () =>
        `<div class="management-card mg-skeleton"><div class="management-stat-label">Loading…</div><div class="management-stat-value">&nbsp;</div></div>`).join("");
}

/* ── Busy buttons: any action button is disabled until its request finishes ── */
let mgLastButton = null;
document.addEventListener("click", e => {
    const btn = e.target.closest("button");
    if (btn) mgLastButton = btn;
}, true);
function withBusyButton(fn, busyText) {
    return async function (...args) {
        const btn = mgLastButton;
        mgLastButton = null;
        if (btn && btn.dataset.busy === "1") return;          // ignore double clicks
        const label = btn ? btn.innerHTML : "";
        if (btn) { btn.dataset.busy = "1"; btn.disabled = true; btn.innerHTML = `<span class="mg-spinner" aria-hidden="true"></span> ${busyText}`; }
        try { return await fn.apply(this, args); }
        finally {
            mgDirty = false;
            if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = label; delete btn.dataset.busy; }
        }
    };
}
[["saveUser","Saving…"],["unlockUser","Unlocking…"],["deleteUser","Archiving…"],["saveListing","Saving…"],
 ["saveReport","Saving…"],["saveTransaction","Saving…"],["saveRefund","Saving…"],["deleteBook","Archiving…"],
 ["deleteCategory","Archiving…"],["deleteRecord","Archiving…"],["submitBookForm","Saving…"],
 ["submitCategoryForm","Saving…"],["submitRecordForm","Saving…"],["submitStaffIssue","Sending…"]
].forEach(([name, text]) => {
    if (typeof window[name] === "function") window[name] = withBusyButton(window[name], text);
});

/* ── Auto-refresh that never throws away unsaved edits ──────────────────── */
let mgDirty = false;
document.addEventListener("input", e => { if (e.target.closest(".management-section")) mgDirty = true; }, true);
document.addEventListener("change", e => { if (e.target.closest(".management-section")) mgDirty = true; }, true);
function safeToAutoRefresh() {
    if (document.hidden || mgDirty) return false;
    const active = document.activeElement;
    return !(active && active.closest && active.closest(".management-section") && /^(INPUT|SELECT|TEXTAREA)$/.test(active.tagName));
}

async function initManagementPage() {
    if (window.librowseAuthReady && !await window.librowseAuthReady) return;
    const expectedRole = document.body.dataset.managementRole;
    if (!await requireManagementRole(expectedRole)) return;

    renderSession();

    document.querySelectorAll(".management-nav button[data-tab]").forEach(button => {
        button.addEventListener("click", () => setActiveTab(button.dataset.tab));
    });

    document.getElementById("management-logout")?.addEventListener("click", logoutManagement);
    document.getElementById("marketplace-link")?.addEventListener("click", goBackToMarketplace);

    // Search and Sort controls
    document.getElementById("users-search")?.addEventListener("input", renderUsersTable);
    document.getElementById("users-sort")?.addEventListener("change", renderUsersTable);
    document.getElementById("books-search")?.addEventListener("input", renderBooksTable);
    document.getElementById("books-sort")?.addEventListener("change", renderBooksTable);
    document.getElementById("categories-search")?.addEventListener("input", renderCategoriesTable);
    document.getElementById("categories-sort")?.addEventListener("change", renderCategoriesTable);
    document.getElementById("listings-search")?.addEventListener("input", renderListingsTable);
    document.getElementById("listings-sort")?.addEventListener("change", renderListingsTable);
    document.getElementById("listings-filter-type")?.addEventListener("change", renderListingsTable);
    document.getElementById("listings-filter-condition")?.addEventListener("change", renderListingsTable);
    document.getElementById("reports-search")?.addEventListener("input", renderReportsTable);
    document.getElementById("reports-sort")?.addEventListener("change", renderReportsTable);
    document.getElementById("reports-forms-only")?.addEventListener("change", renderReportsTable);
    document.getElementById("transactions-search")?.addEventListener("input", renderTransactionsTable);
    document.getElementById("transactions-sort")?.addEventListener("change", renderTransactionsTable);
    document.getElementById("transactions-filter-type")?.addEventListener("change", renderTransactionsTable);
    document.getElementById("transactions-filter-status")?.addEventListener("change", renderTransactionsTable);
    document.getElementById("refunds-search")?.addEventListener("input", renderRefundsTable);
    document.getElementById("refunds-sort")?.addEventListener("change", renderRefundsTable);
    document.getElementById("records-search")?.addEventListener("input", renderRecordsTable);
    document.getElementById("records-sort")?.addEventListener("change", renderRecordsTable);
    document.getElementById("activity-logs-search")?.addEventListener("input", renderActivityLogsTable);
    document.getElementById("activity-logs-sort")?.addEventListener("change", renderActivityLogsTable);
    document.getElementById("activity-logs-filter-type")?.addEventListener("change", renderActivityLogsTable);

    document.getElementById("book-form")?.addEventListener("submit", submitBookForm);
    document.getElementById("book-cancel-edit")?.addEventListener("click", resetBookForm);
    document.getElementById("category-form")?.addEventListener("submit", submitCategoryForm);
    document.getElementById("category-cancel-edit")?.addEventListener("click", resetCategoryForm);
    document.getElementById("record-form")?.addEventListener("submit", submitRecordForm);
    document.getElementById("staff-issue-form")?.addEventListener("submit", submitStaffIssue);

    setActiveTab("overview");
    showLoadingPlaceholders();

    try {
        await reloadCoreData();
        refreshRenderedData();
    } catch (error) {
        showMgmtAlert(`Unable to load management data: ${error.message}`, "error");
    }

    setInterval(async () => {
        if (!safeToAutoRefresh()) return;      // someone is editing - try again next time
        try {
            await reloadCoreData();
            refreshRenderedData();
        } catch (e) {
            console.warn("Auto-refresh failed:", e.message);
        }
    }, 30000);
}

document.addEventListener("DOMContentLoaded", initManagementPage);