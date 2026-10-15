/* LIBROWSE BOOK EXCHANGE - Main JavaScript */


/* BACK-END LOCATION */

/*
   HTML Live Preview runs separately from PHP.
   PHP back-end will run at: http://127.0.0.1:8000/
   API files are served from: /api/
*/
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

/* Escape text before putting it into HTML. Titles, authors, names and
   reasons are typed by users, so they must never be inserted raw. */
function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}


/* FEEDBACK SYSTEM */

async function submitFeedback(transactionId, rating, comment) {
    try {
        await apiRequest("feedback.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                transaction_id: transactionId,
                rating: rating,
                comment: comment
            })
        });
        alert("Thank you for your feedback!");
        return true;
    } catch (error) {
        alert("Unable to submit feedback: " + error.message);
        return false;
    }
}

function showFeedbackModal(transactionId) {
    let modal = document.getElementById("feedback-modal");
    if (!modal) {
        // Inject modal HTML if it doesn't exist
        modal = document.createElement("div");
        modal.id = "feedback-modal";
        modal.className = "modal";
        modal.style.display = "none";
        modal.innerHTML = `
            <div class="modal-content">
                <span class="close-modal" id="close-feedback">&times;</span>
                <h2>Share Your Experience</h2>
                <p>We'd love to hear your thoughts on this transaction!</p>
                <form id="feedback-form">
                    <div class="form-group">
                        <label for="feedback-rating">Rating</label>
                        <select id="feedback-rating" required>
                            <option value="5">5 Stars (Excellent)</option>
                            <option value="4">4 Stars (Good)</option>
                            <option value="3">3 Stars (Average)</option>
                            <option value="2">2 Stars (Poor)</option>
                            <option value="1">1 Star (Terrible)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="feedback-comment">Comments</label>
                        <textarea id="feedback-comment" rows="4" placeholder="Tell us more..."></textarea>
                    </div>
                    <button type="submit" class="btn-primary">Submit Feedback</button>
                </form>
            </div>
        `;
        document.body.appendChild(modal);
        
        document.getElementById("close-feedback").onclick = () => modal.style.display = "none";
        window.onclick = (event) => { if (event.target == modal) modal.style.display = "none"; };
        
        const form = document.getElementById("feedback-form");
        form.onsubmit = async (e) => {
            e.preventDefault();
            const rating = document.getElementById("feedback-rating").value;
            const comment = document.getElementById("feedback-comment").value;
            const success = await submitFeedback(transactionId, rating, comment);
            if (success) modal.style.display = "none";
        };
    }
    
    modal.style.display = "block";
}


/* Temporary storage for API data */

let bookListings = [];

let booksCatalog = [];

let users = [];

let transactions = [];


/* Quick lookup maps for IDs */

let bookMap = {};

let userMap = {};

let inventoryMap = {};

let categoryMap = {};

let currentUser = null;
const SESSION_TOKEN_KEY = "librowseSessionToken";
const SESSION_USER_KEY = "librowseCurrentUser";


/* AUTH HELPERS */

function loadCurrentUser() {

    try {

        const stored =
            sessionStorage.getItem(
                SESSION_USER_KEY
            );

        currentUser =
            stored ? JSON.parse(stored) : null;

    } catch {

        currentUser = null;

    }

}


function updateAuthStatusUI() {

    const authStatus =
        document.getElementById(
            "auth-status"
        );


    if (!authStatus) {
        return;
    }


    if (!currentUser || !sessionStorage.getItem(SESSION_TOKEN_KEY)) {

        authStatus.innerHTML = `
            <a href="login.html">
                Sign in
            </a>
            <a href="register.html">
                Create account
            </a>
        `;

        return;

    }


    authStatus.innerHTML = `
        <span>
            Signed in as <strong>${currentUser.username}</strong>
        </span>

        <button id="logout-button" type="button">
            Log out
        </button>
    `;


    const logoutButton =
        document.getElementById(
            "logout-button"
        );


    if (logoutButton) {

        logoutButton.addEventListener(
            "click",
            async function () {
                if (window.librowseAuth) {
                    await window.librowseAuth.logout();
                }
                currentUser = null;
                updateAuthStatusUI();
                alert("You have been logged out.");
                window.location.replace("login.html");
            }
        );

    }

}


function requireAuthenticatedCustomer(message = "Please sign in or create an account to continue.") {
    if (!currentUser) {
        const proceed = confirm(
            `${message}\n\nWould you like to sign in or create an account now?`
        );
        if (proceed) {
            window.location.href = "login.html";
        }
        return false;
    }

    if (currentUser.role !== "Customer") {
        alert(
            "This action currently supports Customer accounts only."
        );
        return false;
    }

    return true;
}


function applyCurrentUserToForms() {

    if (!currentUser) {
        return;
    }


    const customerIdInput =
        document.getElementById(
            "customer-id"
        );

    if (customerIdInput) {
        customerIdInput.value =
            currentUser.user_id;

        customerIdInput.readOnly = true;
    }


    const submittedByInput =
        document.getElementById(
            "submitted-by"
        );

    if (submittedByInput) {
        submittedByInput.value =
            currentUser.user_id;

        submittedByInput.readOnly = true;
    }

}


/* GENERAL API FUNCTION */

/* Handles all communication with PHP back-end */
/*
   GET    = retrieve data
   POST   = create data
   PUT    = update data
   DELETE = remove data
*/

async function apiRequest(endpoint, options = {}) {

    const url = `${API_BASE}/${endpoint}`;

    /* Abort the request if the server takes too long to respond, so the
       UI shows an error instead of hanging on "Loading..." forever.
       Use 25s default to accommodate serverless cold starts & cloud DB handshakes */

    const controller = new AbortController();
    const timeoutMs = typeof options.timeoutMs === "number" ? options.timeoutMs : 25000;

    const timeoutId = setTimeout(function () {
        controller.abort();
    }, timeoutMs);

    try {

        const token = sessionStorage.getItem(SESSION_TOKEN_KEY);
        const requestHeaders = new Headers(options.headers || {});
        if (token) requestHeaders.set("Authorization", `Bearer ${token}`);
        requestHeaders.set("Cache-Control", "no-store");

        const response = await fetch(url, {
            ...options,
            headers: requestHeaders,
            signal: controller.signal,
            cache: "no-store"
        });

        /* PHP API returns JSON */
        const text = await response.text();

        let data;

        try {

            data = JSON.parse(text);

        } catch {

            throw new Error(
                "The server did not return valid JSON."
            );

        }


        if (response.status === 401) {
            if (window.librowseAuth) window.librowseAuth.clearSession();
            else { sessionStorage.removeItem(SESSION_TOKEN_KEY); sessionStorage.removeItem(SESSION_USER_KEY); }
            const isPublicPage = document.documentElement.hasAttribute("data-public-page");
            if (!isPublicPage) {
                window.location.replace("login.html");
            }
            throw new Error("Your session has expired or authentication is required.");
        }

        /* response.ok = success */
        if (!response.ok) {

            throw new Error(
                data.error || "Something went wrong."
            );

        }

        return data;

    } catch (error) {

        if (error.name === "AbortError") {
            const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
            const tip = isLocal
                ? "Is the PHP server running (php -S 127.0.0.1:8000) and reachable?"
                : "The server is taking longer than expected to respond. Please check your connection or try again.";
            error = new Error(
                `Request to ${url} timed out. ${tip}`
            );

        }

        console.error(
            "API Error:",
            error
        );

        throw error;

    } finally {

        clearTimeout(timeoutId);

    }

}


/* FORMAT FUNCTIONS */

/* Convert database values to readable text */
/*
   Example: For_sale becomes For Sale
*/

function formatListingType(type) {

    if (type === "For_sale") {
        return "For Sale";
    }

    if (type === "For_trade") {
        return "For Trade";
    }

    if (type === "Both") {
        return "Sale / Trade";
    }

    return type;

}


/* Format price to Philippine Peso */
/*
   Example: 500 becomes ₱500.00
*/

function formatPrice(price) {

    if (
        price === null ||
        price === "" ||
        price === undefined
    ) {

        return "Trade Only";

    }

    const amount = Number(price);

    return `₱${amount.toFixed(2)}`;

}


/* LOAD BOOKS */

/* Fetch books, catalog, and user data from API */

async function loadBooks() {
    const bookList = document.getElementById("book-list");
    try {
        if (bookList) {
            bookList.innerHTML = `<tr class="loading-row"><td colspan="10"><span class="inline-spinner" aria-hidden="true"></span> Loading books…</td></tr>`;
        }
        const results = await Promise.all([
            apiRequest("user_books.php"),
            apiRequest("books_catalog.php"),
            apiRequest("user.php")
        ]);
        bookListings = results[0];
        booksCatalog = results[1];
        users = results[2];
        bookMap = {};
        userMap = {};
        inventoryMap = {};
        booksCatalog.forEach(book => { bookMap[book.book_id] = book; });
        users.forEach(user => { userMap[user.user_id] = user; });
        bookListings.forEach(listing => { inventoryMap[listing.inventory_id] = listing; });
        if (bookList) renderBooks(bookListings);
    } catch (error) {
        console.error(error);
        const msg = "Couldn't load books right now.";
        if (bookList) bookList.innerHTML = `<tr><td colspan="10">${msg} Please refresh the page.</td></tr>`;
        const shelf = document.getElementById("bookshelf");
        if (shelf) {
            shelf.innerHTML = `<div class="shelf-empty"><h3>${msg}</h3><p>Check your connection, then try again.</p>
                <button type="button" id="shelf-retry">Try again</button></div>`;
            document.getElementById("shelf-retry")?.addEventListener("click", async () => {
                shelf.innerHTML = '<span class="shelf-skeleton"></span>'.repeat(6);
                await loadBooks();
                if (typeof filterBooks === "function") filterBooks();
            });
        }
        const count = document.getElementById("shelf-count");
        if (count) count.textContent = msg;
    }
}

/* DISPLAY BOOKS */

function renderBooks(listings) {

    const bookList =
        document.getElementById("book-list");


    /* No books found */
    if (listings.length === 0) {
        bookList.innerHTML = `
            <tr>
                <td colspan="10" style="text-align: center; padding: 42px 16px;">
                    <p style="font-size: 16px; font-weight: 700; color: var(--ink); margin: 0 0 6px;">No books found matching your filters</p>
                    <p style="font-size: 13.5px; color: var(--muted); margin: 0 0 16px;">Try adjusting your keywords, author, or ISBN, or reset your current filters.</p>
                    <button type="button" class="btn-clear" onclick="if(window.clearFilters){window.clearFilters();}else{const f=document.getElementById('search-form');if(f)f.reset();if(typeof filterBooks==='function')filterBooks();}">Clear all filters</button>
                </td>
            </tr>
        `;
        return;
    }


    /* Clear previous contents */

    bookList.innerHTML = "";


    /* Loop through listings */

    listings.forEach(function (listing) {

        const book =
            bookMap[listing.book_id];

        const seller =
            userMap[listing.seller_id];


        /* Use fallback if no match */

        const title =
            book ? book.title : "Unknown Book";

        const author =
            book ? book.author : "Unknown Author";

        const categoryNames =
            book ? formatCategoryNames(book) : "Uncategorized";

        const sellerName =
            seller
                ? seller.username
                : `User #${listing.seller_id}`;


        /* Create table row */

        const row =
            document.createElement("tr");


        row.innerHTML = `

            <td>
                ${listing.book_id}
            </td>

            <td>
                ${escapeHTML(title)}
            </td>

            <td>
                ${escapeHTML(author)}
            </td>

            <td>
                ${escapeHTML(categoryNames)}
            </td>

            <td>
                ${escapeHTML(sellerName)}
            </td>

            <td>
                ${formatListingType(
            listing.listing_type
        )}
            </td>

            <td>
                ${escapeHTML(listing.condition)}
            </td>

            <td>
                ${formatPrice(
            listing.price
        )}
            </td>

            <td>
                ${escapeHTML(String(listing.status).replace('_', ' '))}
            </td>

            <td class="book-actions"></td>

        `;


        /* Show action buttons only when available */

        const actionCell =
            row.querySelector(".book-actions");


        const isOwnListing = currentUser && Number(listing.seller_id) === Number(currentUser.user_id);
        if (isOwnListing) {
            actionCell.textContent = "Your listing";
        } else if (listing.status === "Available") {

            /* Show Buy button if available for purchase */

            if (
                listing.listing_type === "For_sale" ||
                listing.listing_type === "Both"
            ) {

                const buyButton =
                    document.createElement("button");

                buyButton.textContent = "Buy";

                buyButton.addEventListener("click", async function () {
                if (buyButton.disabled) return;
                buyButton.disabled = true;
                buyButton.textContent = "Requesting…";
                try { await buyBook(listing); }
                finally { if (buyButton.isConnected) { buyButton.disabled = false; buyButton.textContent = "Buy"; } }
            });

                actionCell.appendChild(
                    buyButton
                );

            }


            /* Show Trade button if available for trade */

            if (
                listing.listing_type === "For_trade" ||
                listing.listing_type === "Both"
            ) {

                const tradeButton =
                    document.createElement("button");

                tradeButton.textContent = "Trade";

                tradeButton.addEventListener("click", async function () {
                if (tradeButton.disabled) return;
                tradeButton.disabled = true;
                tradeButton.textContent = "Requesting…";
                try { await tradeBook(listing); }
                finally { if (tradeButton.isConnected) { tradeButton.disabled = false; tradeButton.textContent = "Trade"; } }
            });

                actionCell.appendChild(
                    tradeButton
                );

            }

        } else {

            actionCell.textContent =
                "Not Available";

        }


        /* Add row to table */

        bookList.appendChild(row);

    });

}


/* SEARCH AND FILTER BOOKS */

function normalizeSearchText(str) {
    return String(str || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
}

function debounce(fn, wait = 150) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), wait);
    };
}

function filterBooks() {
    const searchEl = document.getElementById("search-book");
    const typeEl = document.getElementById("filter-type");
    const condEl = document.getElementById("filter-condition");

    const rawSearch = searchEl ? searchEl.value : "";
    const searchValue = normalizeSearchText(rawSearch);
    const searchTokens = searchValue.split(/\s+/).filter(Boolean);

    const listingType = typeEl ? typeEl.value : "";
    const condition = condEl ? condEl.value : "";
    const selectedCategoryIds = getSelectedFilterCategoryIds();

    const filtered = (bookListings || []).filter(function (listing) {
        if (!listing) return false;

        const book = (typeof bookMap !== "undefined" && bookMap) ? bookMap[listing.book_id] : null;
        const seller = (typeof userMap !== "undefined" && userMap) ? userMap[listing.seller_id] : null;

        /* 1. Multi-token Search Matching */
        let matchesSearch = true;
        if (searchTokens.length > 0) {
            const title = book ? normalizeSearchText(book.title) : "";
            const author = book ? normalizeSearchText(book.author) : "";
            const isbn = book && book.isbn ? String(book.isbn).toLowerCase() : "";
            const cleanIsbn = isbn.replace(/[\s-]+/g, "");
            const sellerName = seller ? normalizeSearchText(seller.username) : "";

            const bookCatIds = [];
            if (book && Array.isArray(book.category_ids)) {
                bookCatIds.push(...book.category_ids);
            }
            if (book && book.category_id) {
                bookCatIds.push(book.category_id);
            }
            const catNames = (typeof categoryMap !== "undefined" && categoryMap)
                ? bookCatIds.map(id => normalizeSearchText(categoryMap[id])).filter(Boolean)
                : [];

            const typeLabel = normalizeSearchText(
                listing.listing_type === "For_sale" ? "for sale" :
                listing.listing_type === "For_trade" ? "for trade" :
                "sale trade both"
            );
            const conditionLabel = normalizeSearchText(listing.condition);

            const corpus = [
                title,
                author,
                isbn,
                cleanIsbn,
                sellerName,
                `@${sellerName}`,
                ...catNames,
                typeLabel,
                conditionLabel
            ].join(" ");

            matchesSearch = searchTokens.every(function (token) {
                const cleanToken = token.replace(/[\s-]+/g, "");
                return corpus.includes(token) || (cleanToken.length >= 4 && cleanIsbn.includes(cleanToken));
            });
        }

        /* 2. Listing Type Matching (properly includes 'Both') */
        let matchesType = true;
        if (listingType) {
            const normType = String(listingType).toLowerCase();
            const lType = String(listing.listing_type || "").toLowerCase();
            if (normType === "for_sale" || normType === "sale") {
                matchesType = lType === "for_sale" || lType === "both";
            } else if (normType === "for_trade" || normType === "trade") {
                matchesType = lType === "for_trade" || lType === "both";
            } else if (normType === "both") {
                matchesType = lType === "both";
            }
        }

        /* 3. Condition Matching */
        let matchesCondition = true;
        if (condition) {
            matchesCondition = String(listing.condition || "").toLowerCase() === condition.toLowerCase();
        }

        /* 4. Category Matching (completely filters out books with unchecked categories) */
        let matchesCategory = true;
        if (selectedCategoryIds.length > 0) {
            const bookCatIds = [];
            if (book && Array.isArray(book.category_ids)) {
                bookCatIds.push(...book.category_ids);
            }
            if (book && book.category_id) {
                bookCatIds.push(book.category_id);
            }
            const numericBookCatIds = Array.from(new Set(bookCatIds.map(Number)));
            if (numericBookCatIds.length === 0) {
                matchesCategory = false;
            } else {
                matchesCategory = numericBookCatIds.every(function (bookCatId) {
                    return selectedCategoryIds.includes(bookCatId);
                });
            }
        }

        return (
            matchesSearch &&
            matchesType &&
            matchesCondition &&
            matchesCategory
        );
    });

    renderBooks(filtered);
}


/* LOAD BOOK CATEGORIES (for the List a Book form) */
/* Rendered as checkboxes, since a book can belong to more than one category */

/* Builds a row of checkboxes for one category list inside a container */

function renderCategoryCheckboxes(container, categories, idPrefix) {

    if (categories.length === 0) {

        container.innerHTML = `
            <p class="checkbox-group-empty">
                No categories available.
            </p>
        `;

        return;

    }

    container.innerHTML = "";

    categories.forEach(function (category) {

        const optionWrapper =
            document.createElement("label");

        optionWrapper.className =
            "checkbox-option";

        const checkbox =
            document.createElement("input");

        checkbox.type = "checkbox";
        checkbox.name = "category_ids";
        checkbox.value = category.category_id;
        checkbox.id = `${idPrefix}-${category.category_id}`;

        optionWrapper.appendChild(checkbox);

        optionWrapper.appendChild(
            document.createTextNode(
                ` ${category.category_name}`
            )
        );

        container.appendChild(optionWrapper);

    });

}


async function loadCategories() {

    const categoryOptions =
        document.getElementById(
            "book-category-options"
        );

    const filterCategoryOptions =
        document.getElementById(
            "filter-category-options"
        );

    if (!categoryOptions && !filterCategoryOptions) {
        return;
    }

    try {

        const categories =
            await apiRequest(
                "book_categories.php"
            );

        /* Keep a lookup of category_id -> category_name for display
           elsewhere (e.g. the browse table) */

        categoryMap = {};

        categories.forEach(function (category) {

            categoryMap[category.category_id] =
                category.category_name;

        });


        if (Array.isArray(categories) && categories.length > 0) {
            try {
                localStorage.setItem("librowse_cached_categories", JSON.stringify(categories));
            } catch (_) {}
        }

        if (categoryOptions) {

            renderCategoryCheckboxes(
                categoryOptions,
                categories,
                "book-category"
            );

        }


        if (filterCategoryOptions) {

            renderCategoryCheckboxes(
                filterCategoryOptions,
                categories,
                "filter-category"
            );

            /* Re-run the search whenever a filter checkbox is toggled */

            filterCategoryOptions
                .querySelectorAll('input[name="category_ids"]')
                .forEach(function (checkbox) {

                    checkbox.addEventListener(
                        "change",
                        filterBooks
                    );

                });

        }

    } catch (error) {

        let cachedCategories = null;
        try {
            const raw = localStorage.getItem("librowse_cached_categories");
            if (raw) cachedCategories = JSON.parse(raw);
        } catch (_) {}

        if (Array.isArray(cachedCategories) && cachedCategories.length > 0) {
            categoryMap = {};
            cachedCategories.forEach(function (category) {
                categoryMap[category.category_id] = category.category_name;
            });
            if (categoryOptions) {
                renderCategoryCheckboxes(categoryOptions, cachedCategories, "book-category");
            }
            if (filterCategoryOptions) {
                renderCategoryCheckboxes(filterCategoryOptions, cachedCategories, "filter-category");
                filterCategoryOptions
                    .querySelectorAll('input[name="category_ids"]')
                    .forEach(function (checkbox) {
                        checkbox.addEventListener("change", filterBooks);
                    });
            }
            return;
        }

        const message = `
            <p class="checkbox-group-empty">
                Unable to load categories.
            </p>
        `;

        if (categoryOptions) {
            categoryOptions.innerHTML = message;
        }

        if (filterCategoryOptions) {
            filterCategoryOptions.innerHTML = message;
        }

        console.error(
            "Unable to load categories.",
            error
        );

    }

}


/* Reads the checked category checkboxes from the List a Book form */

function getSelectedCategoryIds() {

    const checkedBoxes =
        document.querySelectorAll(
            '#book-category-options input[name="category_ids"]:checked'
        );

    return Array.from(checkedBoxes).map(function (checkbox) {
        return Number(checkbox.value);
    });

}


/* Reads the checked category checkboxes from the Browse Books filters */

function getSelectedFilterCategoryIds() {

    const checkedBoxes =
        document.querySelectorAll(
            '#filter-category-options input[name="category_ids"]:checked'
        );

    return Array.from(checkedBoxes).map(function (checkbox) {
        return Number(checkbox.value);
    });

}


/* Turns a book's category_ids into a readable, comma-separated list
   of category names, using the categoryMap loaded above */

function formatCategoryNames(book) {

    if (!book || !Array.isArray(book.category_ids) || book.category_ids.length === 0) {
        return "Uncategorized";
    }

    return book.category_ids
        .map(function (categoryId) {
            return categoryMap[categoryId] || `Category #${categoryId}`;
        })
        .join(", ");

}


/* LIST A BOOK */

async function submitBookListing(event) {

    /* Prevent page refresh on submit */

    event.preventDefault();


    /* Must be logged in - seller ID comes from the session, never from a text field */

    if (!requireAuthenticatedCustomer("Please sign in to list a book.")) {
        return;
    }


    const title =
        document
            .getElementById("book-title")
            .value
            .trim();


    const author =
        document
            .getElementById("book-author")
            .value
            .trim();


    const isbn =
        document
            .getElementById("book-isbn")
            .value
            .trim();


    const categoryIds =
        getSelectedCategoryIds();


    const listingType =
        document
            .getElementById("listing-type")
            .value;


    const price =
        document
            .getElementById("price")
            .value;


    const condition =
        document
            .getElementById("book-condition")
            .value;


    if (categoryIds.length === 0) {

        alert(
            "Please select at least one category."
        );

        return;

    }


    /* Sale listings require a price */

    if (
        (
            listingType === "For_sale" ||
            listingType === "Both"
        ) &&
        price === ""
    ) {

        alert(
            "Please enter a price for this listing."
        );

        return;

    }


    try {

        /* Step 1: create a new BOOKS_CATALOG entry for this title/author.
           Every listing creates its own catalog row - nothing here is
           limited to books that already exist in the database. */

        const catalogData = {

            category_ids:
                categoryIds,

            managed_by_admin_id:
                currentUser.user_id,

            title:
                title,

            author:
                author,

            isbn:
                isbn

        };

        const newBook =
            await apiRequest(
                "books_catalog.php",
                {

                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify(
                            catalogData
                        )

                }
            );


        /* Step 2: create the USER_BOOKS listing, pointing at the book
           we just created and the currently logged-in seller */

        const listingData = {

            book_id:
                newBook.book_id,

            seller_id:
                currentUser.user_id,

            listing_type:
                listingType,

            condition:
                condition,

            status:
                "Available"

        };

        /* Attach the cover photo chosen on the form (if any) */

        if (window.librowsePendingCover) {

            listingData.cover_image =
                window.librowsePendingCover;

        }

        /* Include price only if entered */

        if (price !== "") {

            listingData.price =
                Number(price);

        }

        const newListing =
            await apiRequest(
                "user_books.php",
                {

                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify(
                            listingData
                        )

                }
            );


        alert(
            "Book listed successfully!"
        );


        /* Show the newly created listing back to the user */

        showNewListingResult(
            newListing,
            newBook
        );


        /* Clear form after submission */

        document
            .getElementById(
                "list-book-form"
            )
            .reset();


        /* Refresh table to show new listing */

        await loadBooks();


    } catch (error) {

        alert(
            "Unable to list book.\n\n" +
            error.message
        );

    }

}


/* DISPLAY THE LISTING JUST CREATED */

function showNewListingResult(listing, book) {

    const resultPanel =
        document.getElementById(
            "new-listing-result"
        );

    const detailsBody =
        document.getElementById(
            "new-listing-details"
        );

    if (!resultPanel || !detailsBody) {
        return;
    }

    const rows = [

        ["Inventory ID", listing.inventory_id],
        ["Book ID", listing.book_id],
        ["Seller ID", listing.seller_id],
        ["Title", book.title],
        ["Author", book.author],
        ["ISBN", book.isbn],
        ["Categories", formatCategoryNames(book)],
        ["Listing Type", formatListingType(listing.listing_type)],
        ["Condition", listing.condition],
        ["Price", formatPrice(listing.price)],
        ["Status", listing.status]

    ];

    detailsBody.innerHTML =
        rows
            .map(function (row) {

                return `
                    <tr>
                        <th>${escapeHTML(row[0])}</th>
                        <td>${escapeHTML(row[1])}</td>
                    </tr>
                `;

            })
            .join("");

    resultPanel.style.display = "block";

}


/* BUY A BOOK */

async function buyBook(listing) {

    if (!requireAuthenticatedCustomer("Please sign in to buy this book.")) {
        return;
    }

    const buyerId =
        String(currentUser.user_id);


    if (!buyerId) {
        return;
    }


    const confirmed =
        confirm(
            "Do you want to purchase this book?"
        );


    if (!confirmed) {
        return;
    }


    const transactionData = {

        buyer_id:
            Number(buyerId),

        requested_inventory_id:
            Number(
                listing.inventory_id
            ),

        transaction_type:
            "Purchase",

        amount_paid:
            listing.price
                ? Number(listing.price)
                : 0,

        status:
            "Pending"

    };


    try {

        const createdTx = await apiRequest(
            "transactions.php",
            {

                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body:
                    JSON.stringify(
                        transactionData
                    )

            }
        );


        alert(
            "Purchase request submitted!"
        );


        if (document.getElementById("book-list")) { await loadBooks(); filterBooks(); }
        await loadTransactions();

        if (createdTx && createdTx.transaction_id) {
            showFeedbackModal(createdTx.transaction_id);
        }

    } catch (error) {

        alert(
            "Unable to create transaction.\n\n" +
            error.message
        );

    }

}


/* TRADE A BOOK */

async function tradeBook(listing) {

    if (!requireAuthenticatedCustomer("Please sign in to trade for this book.")) {
        return;
    }

    const buyerId =
        String(currentUser.user_id);


    if (!buyerId) {
        return;
    }


    /* Trade requires offering own inventory item */

    const offeredInventoryId =
        prompt(
            "Enter the Inventory ID of the book you want to offer:"
        );


    if (!offeredInventoryId) {
        return;
    }


    const transactionData = {

        buyer_id:
            Number(buyerId),

        requested_inventory_id:
            Number(
                listing.inventory_id
            ),

        offered_inventory_id:
            Number(
                offeredInventoryId
            ),

        transaction_type:
            "Trade",

        amount_paid:
            0,

        status:
            "Pending"

    };


    try {

        const createdTx = await apiRequest(
            "transactions.php",
            {

                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body:
                    JSON.stringify(
                        transactionData
                    )

            }
        );


        alert(
            "Trade request submitted!"
        );


        if (document.getElementById("book-list")) { await loadBooks(); filterBooks(); }
        await loadTransactions();

        if (createdTx && createdTx.transaction_id) {
            showFeedbackModal(createdTx.transaction_id);
        }

    } catch (error) {

        alert(
            "Unable to create trade request.\n\n" +
            error.message
        );

    }

}


/* ==========================================================================
   TRANSACTIONS (transactions.html)
   Shows the purchases/trades you requested AND requests made for your books.
   ========================================================================== */
function loadingRow(colspan, text) {
    return `<tr class="loading-row"><td colspan="${colspan}"><span class="inline-spinner" aria-hidden="true"></span> ${escapeHTML(text)}</td></tr>`;
}

function listingTitle(inventoryId) {
    const listing = inventoryMap[inventoryId];
    const book = listing ? bookMap[listing.book_id] : null;
    return book ? book.title : `Listing #${inventoryId}`;
}

function isMyListing(inventoryId) {
    const listing = inventoryMap[inventoryId];
    return !!(listing && currentUser && Number(listing.seller_id) === Number(currentUser.user_id));
}

const TX_STATUS_TEXT = {
    Pending:   "Pending — waiting for seller to confirm",
    Accepted:  "Accepted — being arranged",
    Completed: "Completed",
    Cancelled: "Cancelled",
    Disputed:  "Disputed — staff are reviewing"
};

async function loadTransactions() {
    const list = document.getElementById("transaction-list");
    if (!list) return;
    if (!currentUser || !sessionStorage.getItem(SESSION_TOKEN_KEY)) {
        list.innerHTML = `<tr><td colspan="8">Sign in to view your transaction history.</td></tr>`;
        return;
    }
    list.innerHTML = loadingRow(8, "Loading your transactions…");
    try {
        const all = await apiRequest("transactions.php");
        const me = Number(currentUser.user_id);
        transactions = (Array.isArray(all) ? all : []).filter(t =>
            Number(t.buyer_id) === me || Number(t.seller_id) === me || isMyListing(t.requested_inventory_id) || isMyListing(t.offered_inventory_id)
        ).sort((x, y) => Number(y.transaction_id) - Number(x.transaction_id));
        renderTransactions(transactions);

        // Check if navigated with ?settle={id} or ?tx={id}
        const params = new URLSearchParams(window.location.search);
        const settleId = params.get("settle") || params.get("tx");
        if (settleId) {
            const target = transactions.find(t => String(t.transaction_id) === String(settleId));
            if (target) {
                openSettlementModal(target);
            }
        }
    } catch (error) {
        list.innerHTML = `<tr><td colspan="8">Couldn't load your transactions: ${escapeHTML(error.message)}
            <button type="button" class="inline-retry" id="tx-retry">Try again</button></td></tr>`;
        document.getElementById("tx-retry")?.addEventListener("click", loadTransactions);
    }
}

function renderTransactions(transactionData) {
    const list = document.getElementById("transaction-list");
    if (!list) return;
    if (!transactionData.length) {
        list.innerHTML = `<tr><td colspan="8">No transactions yet. <a href="browse.html">Browse books</a> to buy or trade.</td></tr>`;
        return;
    }
    const me = Number(currentUser.user_id);
    list.innerHTML = "";
    transactionData.forEach(t => {
        const iAmBuyer = Number(t.buyer_id) === me;
        const iAmSeller = Number(t.seller_id) === me || isMyListing(t.requested_inventory_id);
        const isTrade = t.transaction_type === "Trade";
        let book = escapeHTML(t.requested_book_title || listingTitle(t.requested_inventory_id));
        if (isTrade && t.offered_inventory_id) {
            book += `<div class="tx-sub">in exchange for ${escapeHTML(listingTitle(t.offered_inventory_id))}</div>`;
        }

        // Payment status badge
        let paymentBadge = "";
        if (isTrade) {
            paymentBadge = `<span class="payment-badge payment-trade">Trade</span>`;
        } else if (t.payment_status === "Payment_Received") {
            paymentBadge = `<span class="payment-badge payment-received">✓ Received</span>`;
        } else if (t.payment_status === "Payment_Sent") {
            paymentBadge = `<span class="payment-badge payment-sent">⏳ Verification Pending</span>`;
        } else {
            paymentBadge = `<span class="payment-badge payment-unpaid">● Unpaid</span>`;
        }

        let roleLabel = "Participant";
        if (iAmBuyer && iAmSeller) {
            roleLabel = "Buyer & Seller";
        } else if (iAmBuyer) {
            roleLabel = "Buyer";
        } else if (iAmSeller) {
            roleLabel = "Seller (Listed Book)";
        }

        // Context-aware order status text
        let statusText = TX_STATUS_TEXT[t.status] || t.status;
        if (t.status === "Pending") {
            if (isTrade) {
                statusText = iAmSeller ? "Pending — trade proposal for your book" : "Pending — waiting for seller to accept";
            } else if (t.payment_status === "Payment_Sent") {
                statusText = iAmSeller ? "Payment sent — verify now" : "Payment sent — waiting for seller to confirm";
            } else if (t.payment_status === "Payment_Received") {
                statusText = "Payment confirmed by seller";
            } else {
                statusText = iAmBuyer ? "Pending — payment needed" : "Pending — waiting for buyer payment";
            }
        }

        const row = document.createElement("tr");
        row.innerHTML = `
            <td>#${escapeHTML(t.transaction_id)}</td>
            <td>${book}</td>
            <td>${escapeHTML(t.transaction_type)}</td>
            <td>${isTrade ? "—" : escapeHTML(formatPrice(t.amount_paid))}</td>
            <td><span class="tx-status tx-${escapeHTML(String(t.status).toLowerCase())}">${escapeHTML(statusText)}</span></td>
            <td>${paymentBadge}</td>
            <td>${roleLabel}</td>
            <td class="transaction-action"></td>`;

        const action = row.querySelector(".transaction-action");

        if (!isTrade) {
            const settleBtn = document.createElement("button");
            settleBtn.type = "button";
            settleBtn.className = "btn-small btn-settle";

            if (iAmBuyer && (!t.payment_status || t.payment_status === "Unpaid")) {
                settleBtn.className += " btn-primary-solid";
                settleBtn.textContent = "💳 Settle Payment";
            } else if (iAmSeller && t.payment_status === "Payment_Sent") {
                settleBtn.className += " btn-primary-solid";
                settleBtn.textContent = "🔍 Verify Payment";
            } else if (iAmSeller && (!t.payment_status || t.payment_status === "Unpaid")) {
                settleBtn.textContent = "Update Payment Info";
            } else if (t.payment_status === "Payment_Received") {
                settleBtn.textContent = "✓ Payment Info";
            } else {
                settleBtn.textContent = "Payment Details";
            }

            settleBtn.addEventListener("click", () => openSettlementModal(t));
            action.appendChild(settleBtn);
        }

        // Seller quick complete when order is accepted/paid
        if (iAmSeller && t.status === "Accepted") {
            const compBtn = document.createElement("button");
            compBtn.type = "button";
            compBtn.className = "btn-small btn-success-solid";
            compBtn.textContent = "Complete";
            compBtn.style.marginLeft = "4px";
            compBtn.title = "Mark order as delivered/completed";
            compBtn.addEventListener("click", () => completeOrderAsSeller(t.transaction_id, compBtn));
            action.appendChild(compBtn);
        }

        if (iAmBuyer && t.status === "Pending") {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "btn-small";
            btn.textContent = "Cancel";
            btn.style.marginLeft = "4px";
            btn.addEventListener("click", () => cancelTransaction(t.transaction_id, btn));
            action.appendChild(btn);
        }

        if (iAmSeller && t.status === "Pending") {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "btn-small btn-danger-outline";
            btn.textContent = "Decline";
            btn.style.marginLeft = "4px";
            btn.title = "Decline request and return book to shelf";
            btn.addEventListener("click", () => cancelTransaction(t.transaction_id, btn));
            action.appendChild(btn);
        }

        if (!action.hasChildNodes()) {
            action.textContent = "—";
        }

        list.appendChild(row);
    });
}

function openSettlementModal(t) {
    const dialog = document.getElementById("settlement-dialog");
    if (!dialog) return;

    const me = currentUser ? Number(currentUser.user_id) : 0;
    const iAmBuyer = Number(t.buyer_id) === me;
    const iAmSeller = Number(t.seller_id) === me || isMyListing(t.requested_inventory_id);
    const bookTitle = t.requested_book_title || listingTitle(t.requested_inventory_id);
    const formattedPrice = formatPrice(t.amount_paid);
    const isTrade = t.transaction_type === "Trade";
    const paymentStatus = t.payment_status || "Unpaid";
    const paymentMethod = t.payment_method || "GCash";
    const paymentReference = t.payment_reference || "";
    const paymentNotes = t.payment_notes || "";

    // Stepper logic
    let s1 = "step-complete";
    let s2 = "", s3 = "", s4 = "";
    let l1 = "step-line-active", l2 = "", l3 = "";

    if (paymentStatus === "Payment_Received") {
        s2 = "step-complete";
        s3 = "step-complete";
        l2 = "step-line-active";
        if (t.status === "Completed") {
            s4 = "step-complete";
            l3 = "step-line-active";
        } else {
            s4 = "step-active";
        }
    } else if (paymentStatus === "Payment_Sent") {
        s2 = "step-complete";
        s3 = "step-active";
        l2 = "step-line-active";
    } else {
        s2 = "step-active";
    }

    let roleBadge = "";
    if (iAmBuyer && iAmSeller) {
        roleBadge = `<span class="payment-badge" style="background:#e0e7ff;color:#3730a3;">Buyer & Seller</span>`;
    } else if (iAmBuyer) {
        roleBadge = `<span class="payment-badge" style="background:#dbeafe;color:#1e40af;">You are Buyer</span>`;
    } else if (iAmSeller) {
        roleBadge = `<span class="payment-badge" style="background:#fef3c7;color:#92400e;">You are Seller</span>`;
    } else {
        roleBadge = `<span class="payment-badge" style="background:#f3f4f6;color:#4b5563;">Participant</span>`;
    }

    let contentHTML = `
        <div class="settlement-header">
            <div>
                <h3 id="settlement-title">Payment Settlement &mdash; Order #${escapeHTML(t.transaction_id)}</h3>
                <div style="margin-top:4px;">${roleBadge}</div>
            </div>
            <button type="button" class="btn-small" id="settlement-close-btn" aria-label="Close dialog" style="font-size:18px;line-height:1;padding:4px 10px;cursor:pointer;">&times;</button>
        </div>
        <div class="settlement-content">
            <!-- Stepper -->
            <div class="settlement-stepper" aria-label="Settlement Progress">
                <div class="step ${s1}">
                    <div class="step-num">${s1 === "step-complete" ? "✓" : "1"}</div>
                    <div class="step-label">Order Placed</div>
                </div>
                <div class="step-line ${l1}"></div>
                <div class="step ${s2}">
                    <div class="step-num">${s2 === "step-complete" ? "✓" : "2"}</div>
                    <div class="step-label">Payment Sent</div>
                </div>
                <div class="step-line ${l2}"></div>
                <div class="step ${s3}">
                    <div class="step-num">${s3 === "step-complete" ? "✓" : "3"}</div>
                    <div class="step-label">Seller Verified</div>
                </div>
                <div class="step-line ${l3}"></div>
                <div class="step ${s4}">
                    <div class="step-num">${s4 === "step-complete" ? "✓" : "4"}</div>
                    <div class="step-label">Completed</div>
                </div>
            </div>

            <!-- Order Summary -->
            <div class="settlement-summary">
                <div class="settlement-summary-main">
                    <h4>${escapeHTML(bookTitle)}</h4>
                    <p><strong>Order Status:</strong> ${escapeHTML(t.status)}</p>
                    <p><strong>Buyer:</strong> ${escapeHTML(t.buyer_username || (iAmBuyer ? currentUser.username : "Buyer #" + t.buyer_id))} &nbsp;&bull;&nbsp; <strong>Seller:</strong> ${escapeHTML(t.seller_username || (iAmSeller ? currentUser.username : "Seller #" + (t.seller_id || "—")))}</p>
                </div>
                <div class="settlement-summary-price">
                    <span style="font-size:11.5px;color:var(--muted);text-transform:uppercase;font-weight:700;">Settlement Amount</span>
                    <span class="settlement-price-amount">${escapeHTML(formattedPrice)}</span>
                </div>
            </div>
    `;

    if (isTrade) {
        contentHTML += `
            <div class="payment-alert payment-alert-neutral">
                <h4>Book Exchange (Trade)</h4>
                <p>This transaction is a book exchange. No cash settlement is required. Please coordinate hand-off or delivery with the other party.</p>
            </div>
        `;
    } else {
        // Buyer experience
        if (iAmBuyer) {
            if (paymentStatus === "Payment_Received") {
                contentHTML += `
                    <div class="payment-alert payment-alert-success">
                        <h4>✓ Payment Confirmed by Seller</h4>
                        <p>The seller verified receipt of your payment on <strong>${escapeHTML(t.payment_verified_at || "recently")}</strong>. Your order is being arranged.</p>
                    </div>
                    <div class="payment-details-card">
                        <p><strong>Payment Method:</strong> ${escapeHTML(t.payment_method || "—")}</p>
                        <p><strong>Reference Code:</strong> <span class="ref-badge">${escapeHTML(t.payment_reference || "—")}</span></p>
                        ${t.payment_notes ? `<p><strong>Notes / Remarks:</strong> ${escapeHTML(t.payment_notes)}</p>` : ""}
                        ${t.paid_at ? `<p><strong>Paid At:</strong> ${escapeHTML(t.paid_at)}</p>` : ""}
                    </div>
                `;
            } else if (paymentStatus === "Payment_Sent") {
                contentHTML += `
                    <div class="payment-alert payment-alert-info">
                        <h4>⏳ Payment Proof Submitted &mdash; Awaiting Seller Verification</h4>
                        <p>You have submitted payment details. The seller will verify receipt on their account and confirm.</p>
                    </div>
                    <div class="payment-details-card">
                        <p><strong>Payment Method:</strong> ${escapeHTML(t.payment_method || "—")}</p>
                        <p><strong>Reference / Transaction Code:</strong> <span class="ref-badge">${escapeHTML(t.payment_reference || "—")}</span></p>
                        ${t.payment_notes ? `<p><strong>Notes:</strong> ${escapeHTML(t.payment_notes)}</p>` : ""}
                        ${t.paid_at ? `<p><strong>Submitted At:</strong> ${escapeHTML(t.paid_at)}</p>` : ""}
                    </div>
                    <details style="margin-top:12px;background:#fff;border:1px solid var(--rule);padding:12px;border-radius:8px;">
                        <summary style="cursor:pointer;font-weight:600;font-size:13px;color:#2563eb;">Need to update your reference code or payment note?</summary>
                        <form id="settlement-buyer-form" style="margin-top:12px;">
                            <div class="form-group" style="margin-bottom:10px;">
                                <label for="buyer-p-method" style="font-weight:600;font-size:12.5px;">Payment Method</label>
                                <select id="buyer-p-method" class="form-control" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--rule);">
                                    <option value="GCash" ${paymentMethod === "GCash" ? "selected" : ""}>GCash</option>
                                    <option value="Maya" ${paymentMethod === "Maya" ? "selected" : ""}>Maya</option>
                                    <option value="Bank Transfer" ${paymentMethod === "Bank Transfer" ? "selected" : ""}>Bank Transfer (BDO / BPI / UnionBank)</option>
                                    <option value="Cash on Meetup" ${paymentMethod === "Cash on Meetup" ? "selected" : ""}>Cash on Meetup / Handshake</option>
                                </select>
                            </div>
                            <div class="form-group" style="margin-bottom:10px;">
                                <label for="buyer-p-ref" style="font-weight:600;font-size:12.5px;">Updated Reference / Receipt No.</label>
                                <input type="text" id="buyer-p-ref" class="form-control" value="${escapeHTML(paymentReference)}" required style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--rule);">
                            </div>
                            <div class="form-group" style="margin-bottom:12px;">
                                <label for="buyer-p-notes" style="font-weight:600;font-size:12.5px;">Notes</label>
                                <input type="text" id="buyer-p-notes" class="form-control" value="${escapeHTML(paymentNotes)}" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--rule);">
                            </div>
                            <button type="submit" class="btn-small btn-primary-solid">Update Reference</button>
                        </form>
                    </details>
                `;
            } else {
                // Unpaid
                contentHTML += `
                    <div class="payment-alert payment-alert-warning">
                        <h4>Payment Required</h4>
                        <p>Please transfer <strong>${escapeHTML(formattedPrice)}</strong> to the seller using their preferred payment instructions below. Once sent, enter your reference number so the seller can verify and release your order.</p>
                    </div>
                `;
                if (paymentNotes && !iAmSeller) {
                    contentHTML += `
                        <div class="seller-instructions-card">
                            <strong style="display:block;margin-bottom:4px;">Seller's Payment Instructions:</strong>
                            ${escapeHTML(paymentNotes)}
                        </div>
                    `;
                }
                contentHTML += `
                    <form id="settlement-buyer-form" style="background:#fff;border:1px solid var(--rule);padding:16px;border-radius:10px;">
                        <div class="form-group" style="margin-bottom:14px;">
                            <label style="display:block;font-weight:700;font-size:13px;margin-bottom:6px;">Select Payment Method:</label>
                            <div class="payment-method-selector">
                                <label><input type="radio" name="p-method" value="GCash" checked> GCash</label>
                                <label><input type="radio" name="p-method" value="Maya"> Maya</label>
                                <label><input type="radio" name="p-method" value="Bank Transfer"> Bank Transfer</label>
                                <label><input type="radio" name="p-method" value="Cash on Meetup"> Cash on Meetup</label>
                            </div>
                        </div>
                        <div class="form-group" style="margin-bottom:14px;">
                            <label for="buyer-p-ref" style="display:block;font-weight:700;font-size:13px;margin-bottom:4px;">Payment Reference / Receipt Number: <span style="color:#dc2626;">*</span></label>
                            <input type="text" id="buyer-p-ref" placeholder="e.g. 1002 9384 1029 or Instapay Ref" required style="width:100%;box-sizing:border-box;padding:10px;border-radius:6px;border:1px solid var(--rule);font-family:var(--font-mono, monospace);">
                            <small style="color:var(--muted);font-size:12px;margin-top:4px;display:block;">Found in your GCash / Maya / Bank app transaction confirmation.</small>
                        </div>
                        <div class="form-group" style="margin-bottom:18px;">
                            <label for="buyer-p-notes" style="display:block;font-weight:700;font-size:13px;margin-bottom:4px;">Additional Notes (Optional):</label>
                            <input type="text" id="buyer-p-notes" placeholder="e.g. Sent via Juan Dela Cruz, 0917-xxx-xxxx" style="width:100%;box-sizing:border-box;padding:9px;border-radius:6px;border:1px solid var(--rule);">
                        </div>
                        <button type="submit" class="btn-primary-solid btn-full" id="btn-submit-buyer-payment">Submit Payment Proof & Notify Seller</button>
                    </form>
                `;
            }
        }

        // Seller experience
        if (iAmSeller) {
            contentHTML += `
                <div style="margin-top:20px;border-top:1px dashed var(--rule);padding-top:16px;">
                    <h4 style="margin:0 0 10px;font-size:15px;color:var(--ink);">Seller Settlement Controls</h4>
            `;

            if (paymentStatus === "Payment_Sent") {
                contentHTML += `
                    <div class="payment-alert payment-alert-info">
                        <h4>Buyer Has Submitted Payment Proof!</h4>
                        <p>The buyer indicated they transferred <strong>${escapeHTML(formattedPrice)}</strong> via <strong>${escapeHTML(t.payment_method || "e-wallet")}</strong>. Please verify receipt in your account.</p>
                    </div>
                    <div class="payment-details-card">
                        <p><strong>Payment Method:</strong> ${escapeHTML(t.payment_method || "—")}</p>
                        <p><strong>Buyer Reference Code:</strong> <span class="ref-badge">${escapeHTML(t.payment_reference || "—")}</span></p>
                        ${t.payment_notes ? `<p><strong>Buyer Notes:</strong> ${escapeHTML(t.payment_notes)}</p>` : ""}
                        ${t.paid_at ? `<p><strong>Submitted At:</strong> ${escapeHTML(t.paid_at)}</p>` : ""}
                        <div class="seller-actions-group">
                            <button type="button" class="btn-success-solid" id="btn-seller-verify">✓ Confirm Payment Received (${escapeHTML(formattedPrice)})</button>
                            <button type="button" class="btn-danger-outline" id="btn-seller-reject">✗ Flag as Unpaid / Invalid Proof</button>
                        </div>
                    </div>
                `;
            } else if (paymentStatus === "Payment_Received") {
                contentHTML += `
                    <div class="payment-alert payment-alert-success">
                        <h4>✓ Payment Received & Confirmed</h4>
                        <p>You verified this payment on <strong>${escapeHTML(t.payment_verified_at || "recently")}</strong>. Order status: <strong>${escapeHTML(t.status)}</strong>.</p>
                    </div>
                    <div class="payment-details-card">
                        <p><strong>Method:</strong> ${escapeHTML(t.payment_method || "—")} &nbsp;&bull;&nbsp; <strong>Reference:</strong> <span class="ref-badge">${escapeHTML(t.payment_reference || "—")}</span></p>
                        ${t.status === "Accepted" ? `
                            <div style="margin-top:12px;padding-top:12px;border-top:1px dashed var(--rule);">
                                <p style="font-size:13px;margin:0 0 8px;font-weight:600;color:#166534;">Once you have handed over or delivered the book to the buyer, complete the transaction:</p>
                                <button type="button" class="btn-success-solid" id="btn-seller-complete-modal" style="width:100%;padding:10px;">📦 Mark Order as Completed / Delivered</button>
                            </div>
                        ` : ""}
                        <div class="seller-actions-group" style="margin-top:10px;">
                            <button type="button" class="btn-danger-outline" id="btn-seller-revert" style="font-size:12px;padding:6px 12px;">Change back to Unpaid</button>
                        </div>
                    </div>
                `;
            } else {
                contentHTML += `
                    <div class="payment-alert payment-alert-neutral">
                        <h4>Awaiting Buyer Payment</h4>
                        <p>The buyer has not yet submitted payment proof. Once the buyer sends payment, their reference code will show here for your verification.</p>
                    </div>
                    <div style="margin-bottom:14px;">
                        <button type="button" class="btn-small btn-success-solid" id="btn-seller-manual-paid">✓ Mark as Paid & Received (Manual / Outside Payment)</button>
                    </div>
                `;
            }

            contentHTML += `
                <details style="margin-top:14px;background:#fff;border:1px solid var(--rule);padding:12px;border-radius:8px;">
                    <summary style="cursor:pointer;font-weight:600;font-size:13px;color:#2563eb;">Configure Payment Instructions for Buyer</summary>
                    <form id="seller-instructions-form" style="margin-top:10px;">
                        <p style="font-size:12px;color:var(--muted);margin:0 0 8px;">Enter your GCash / Maya / Bank details so buyers know where to transfer:</p>
                        <textarea id="seller-instructions-text" rows="3" style="width:100%;box-sizing:border-box;padding:8px;border-radius:6px;border:1px solid var(--rule);font-size:13px;" placeholder="e.g. GCash: 0917-123-4567 (Juan D.) or BPI: 1234-5678-90">${escapeHTML(paymentNotes || "")}</textarea>
                        <button type="submit" class="btn-small btn-primary-solid" style="margin-top:8px;">Save Payment Instructions</button>
                    </form>
                </details>
            </div>
            `;
        } else if (!iAmBuyer) {
            // Participant or observer view
            contentHTML += `
                <div class="payment-details-card" style="margin-top:16px;">
                    <p><strong>Payment Status:</strong> ${escapeHTML(paymentStatus)}</p>
                    <p><strong>Method:</strong> ${escapeHTML(t.payment_method || "—")}</p>
                    <p><strong>Reference:</strong> <span class="ref-badge">${escapeHTML(t.payment_reference || "—")}</span></p>
                    ${t.payment_notes ? `<p><strong>Notes:</strong> ${escapeHTML(t.payment_notes)}</p>` : ""}
                </div>
            `;
        }
    }

    contentHTML += `</div>`; // end settlement-content

    dialog.innerHTML = contentHTML;

    // Attach event listeners
    const closeBtn = dialog.querySelector("#settlement-close-btn");
    closeBtn?.addEventListener("click", () => dialog.close());

    // Buyer submission listener
    const buyerForm = dialog.querySelector("#settlement-buyer-form");
    buyerForm?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const pMethodRadio = buyerForm.querySelector("input[name='p-method']:checked");
        const pMethodSelect = buyerForm.querySelector("#buyer-p-method");
        const pMethod = pMethodRadio ? pMethodRadio.value : (pMethodSelect ? pMethodSelect.value : "GCash");
        const pRef = buyerForm.querySelector("#buyer-p-ref")?.value.trim();
        const pNotes = buyerForm.querySelector("#buyer-p-notes")?.value.trim();

        if (!pRef) {
            alert("Please enter your payment reference code or transaction receipt number.");
            return;
        }

        const submitBtn = buyerForm.querySelector("button[type='submit']");
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = "Submitting proof…";
        }

        try {
            await apiRequest(`transactions.php?id=${t.transaction_id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "submit_payment",
                    payment_method: pMethod,
                    payment_reference: pRef,
                    payment_notes: pNotes
                })
            });
            alert("Payment proof submitted successfully! The seller has been notified to verify your payment.");
            dialog.close();
            await loadTransactions();
        } catch (err) {
            alert("Failed to submit payment: " + err.message);
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "Submit Payment Proof";
            }
        }
    });

    // Seller verify button
    const sellerVerifyBtn = dialog.querySelector("#btn-seller-verify");
    sellerVerifyBtn?.addEventListener("click", async () => {
        if (!confirm(`Confirm that you have received payment of ${formattedPrice} for Order #${t.transaction_id}?`)) return;
        sellerVerifyBtn.disabled = true;
        sellerVerifyBtn.textContent = "Verifying…";
        try {
            await apiRequest(`transactions.php?id=${t.transaction_id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "verify_payment",
                    payment_status: "Payment_Received",
                    advance_order: true
                })
            });
            alert("Payment confirmed received! Order is now updated.");
            dialog.close();
            await loadTransactions();
        } catch (err) {
            alert("Failed to verify payment: " + err.message);
            sellerVerifyBtn.disabled = false;
            sellerVerifyBtn.textContent = "✓ Confirm Payment Received";
        }
    });

    // Seller reject/flag button
    const sellerRejectBtn = dialog.querySelector("#btn-seller-reject");
    sellerRejectBtn?.addEventListener("click", async () => {
        const reason = prompt("Enter a reason for the buyer (e.g. Reference code not found in GCash):");
        if (reason === null) return;
        sellerRejectBtn.disabled = true;
        sellerRejectBtn.textContent = "Updating…";
        try {
            await apiRequest(`transactions.php?id=${t.transaction_id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "verify_payment",
                    payment_status: "Unpaid",
                    payment_notes: reason
                })
            });
            alert("Payment flagged as Unpaid. Buyer has been notified.");
            dialog.close();
            await loadTransactions();
        } catch (err) {
            alert("Failed to update status: " + err.message);
            sellerRejectBtn.disabled = false;
            sellerRejectBtn.textContent = "✗ Flag as Unpaid / Invalid Proof";
        }
    });

    // Seller manual mark as paid
    const sellerManualPaidBtn = dialog.querySelector("#btn-seller-manual-paid");
    sellerManualPaidBtn?.addEventListener("click", async () => {
        if (!confirm(`Mark payment of ${formattedPrice} as received manually?`)) return;
        sellerManualPaidBtn.disabled = true;
        sellerManualPaidBtn.textContent = "Updating…";
        try {
            await apiRequest(`transactions.php?id=${t.transaction_id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "verify_payment",
                    payment_status: "Payment_Received",
                    advance_order: true
                })
            });
            alert("Payment marked as received!");
            dialog.close();
            await loadTransactions();
        } catch (err) {
            alert("Failed to update status: " + err.message);
            sellerManualPaidBtn.disabled = false;
            sellerManualPaidBtn.textContent = "✓ Mark as Paid & Received";
        }
    });

    // Seller revert to unpaid
    const sellerRevertBtn = dialog.querySelector("#btn-seller-revert");
    sellerRevertBtn?.addEventListener("click", async () => {
        if (!confirm("Revert payment status back to Unpaid?")) return;
        sellerRevertBtn.disabled = true;
        try {
            await apiRequest(`transactions.php?id=${t.transaction_id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "verify_payment",
                    payment_status: "Unpaid"
                })
            });
            alert("Payment status reverted to Unpaid.");
            dialog.close();
            await loadTransactions();
        } catch (err) {
            alert("Failed to update status: " + err.message);
            sellerRevertBtn.disabled = false;
        }
    });

    // Seller payment instructions form
    const instructionsForm = dialog.querySelector("#seller-instructions-form");
    instructionsForm?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const instructions = dialog.querySelector("#seller-instructions-text")?.value.trim();
        const submitBtn = instructionsForm.querySelector("button[type='submit']");
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = "Saving…";
        }
        try {
            await apiRequest(`transactions.php?id=${t.transaction_id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "set_payment_details",
                    payment_notes: instructions
                })
            });
            alert("Payment instructions saved! Buyers will see this when settling payment.");
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "Saved ✓";
            }
        } catch (err) {
            alert("Failed to save instructions: " + err.message);
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "Save Payment Instructions";
            }
        }
    });

    // Seller complete order from modal
    const modalCompleteBtn = dialog.querySelector("#btn-seller-complete-modal");
    modalCompleteBtn?.addEventListener("click", async () => {
        if (!confirm(`Mark Order #${t.transaction_id} as completed? This confirms delivery and marks your listing as Sold.`)) return;
        modalCompleteBtn.disabled = true;
        modalCompleteBtn.textContent = "Completing…";
        try {
            await apiRequest(`transactions.php?id=${t.transaction_id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "Completed" })
            });
            alert("Order marked as completed! Thank you for selling on Librowse.");
            dialog.close();
            await loadBooks();
            await loadTransactions();
        } catch (err) {
            alert("Failed to complete order: " + err.message);
            modalCompleteBtn.disabled = false;
            modalCompleteBtn.textContent = "📦 Mark Order as Completed / Delivered";
        }
    });

    if (dialog.showModal) {
        dialog.showModal();
    } else {
        dialog.setAttribute("open", "");
    }
}

async function completeOrderAsSeller(transactionId, button) {
    if (!confirm(`Mark Order #${transactionId} as completed? This confirms delivery and marks your listing as Sold.`)) return;
    if (button) { button.disabled = true; button.textContent = "Completing…"; }
    try {
        await apiRequest(`transactions.php?id=${transactionId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "Completed" })
        });
        await loadBooks();
        await loadTransactions();
    } catch (error) {
        alert("Unable to complete order.\n\n" + error.message);
        if (button) { button.disabled = false; button.textContent = "Complete"; }
    }
}

async function cancelTransaction(transactionId, button) {
    if (!confirm("Cancel this request? The book will go back on the shelf.")) return;
    if (button) { button.disabled = true; button.textContent = "Cancelling…"; }
    try {
        await apiRequest(`transactions.php?id=${transactionId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "Cancelled" })
        });
        await loadBooks();
        await loadTransactions();
    } catch (error) {
        alert("Unable to cancel this request.\n\n" + error.message);
        if (button) { button.disabled = false; button.textContent = "Cancel"; }
    }
}


/* ==========================================================================
   REFUND FORM: pick from your completed purchases (support.html)
   ========================================================================== */
async function loadRefundOptions() {
    const select = document.getElementById("refund-transaction-id");
    if (!select || select.tagName !== "SELECT") return;
    const help = document.getElementById("refund-tx-help");
    if (!currentUser || !sessionStorage.getItem(SESSION_TOKEN_KEY)) {
        select.disabled = true;
        select.innerHTML = `<option value="">Sign in to request a refund</option>`;
        if (help) help.textContent = "Refunds are available after you sign in and complete a purchase.";
        return;
    }
    select.disabled = true;
    select.innerHTML = `<option value="">Loading your completed purchases…</option>`;
    try {
        const [txs, refunds] = await Promise.all([
            apiRequest("transactions.php"),
            apiRequest("refund_request.php")
        ]);
        const me = Number(currentUser.user_id);
        const blocked = new Set((refunds || [])
            .filter(r => ["Pending", "Approved"].includes(r.status))
            .map(r => Number(r.transaction_id)));
        const eligible = (txs || []).filter(t =>
            Number(t.buyer_id) === me && t.transaction_type === "Purchase" &&
            t.status === "Completed" && !blocked.has(Number(t.transaction_id)));
        if (!eligible.length) {
            select.innerHTML = `<option value="">No completed purchases to refund</option>`;
            if (help) help.textContent = "Only completed purchases without an open refund appear here.";
            return;
        }
        select.innerHTML = `<option value="">Choose a purchase</option>` + eligible.map(t =>
            `<option value="${escapeHTML(t.transaction_id)}">#${escapeHTML(t.transaction_id)} — ${escapeHTML(listingTitle(t.requested_inventory_id))} (${escapeHTML(formatPrice(t.amount_paid))})</option>`
        ).join("");
        select.disabled = false;
    } catch (error) {
        select.innerHTML = `<option value="">Couldn't load purchases — refresh to try again</option>`;
    }
}

/* REFUND REQUEST */

async function submitRefund(event) {

    event.preventDefault();


    if (!requireAuthenticatedCustomer("Please sign in to request a refund.")) {
        return;
    }


    const transactionId =
        document
            .getElementById(
                "refund-transaction-id"
            )
            .value;


    const customerId = currentUser.user_id;


    const reason =
        document
            .getElementById(
                "refund-reason"
            )
            .value
            .trim();


    const refundData = {

        transaction_id:
            Number(transactionId),

        customer_id:
            Number(customerId),

        reason:
            reason,

        status:
            "Pending"

    };


    try {

        await apiRequest(
            "refund_request.php",
            {

                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body:
                    JSON.stringify(
                        refundData
                    )

            }
        );


        alert(
            "Refund request submitted!"
        );


        document
            .getElementById(
                "refund-form"
            )
            .reset();
        await loadRefundOptions();


    } catch (error) {

        alert(
            "Unable to submit refund.\n\n" +
            error.message
        );

    }

}


/* SUBMIT REPORT */

async function submitReport(event) {

    event.preventDefault();


    if (!requireAuthenticatedCustomer("Please sign in to submit a report.")) {
        return;
    }


    const submittedBy = currentUser.user_id;


    const category =
        document
            .getElementById(
                "report-category"
            )
            .value;


    const relatedEntity =
        document
            .getElementById(
                "related-entity"
            )
            .value;


    const details =
        document
            .getElementById(
                "report-details"
            )
            .value
            .trim();


    /* form_data can contain JSON */

    const reportData = {

        submitted_by_id:
            Number(submittedBy),

        report_category:
            category,

        related_entity_type:
            relatedEntity,

        form_data: {
            details:
                details
        },

        status:
            "Pending"

    };


    try {

        await apiRequest(
            "reports.php",
            {

                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body:
                    JSON.stringify(
                        reportData
                    )

            }
        );


        alert(
            "Report submitted successfully!"
        );


        document
            .getElementById(
                "report-form"
            )
            .reset();


    } catch (error) {

        alert(
            "Unable to submit report.\n\n" +
            error.message
        );

    }

}


/* EVENT LISTENERS */
document.addEventListener("DOMContentLoaded", async function () {
    if (window.librowseAuthReady) {
        const authUser = await window.librowseAuthReady;
        const isPublicPage = document.documentElement.hasAttribute("data-public-page");
        if (!isPublicPage && !authUser) return;
    }

    loadCurrentUser();

    updateAuthStatusUI();
    applyCurrentUserToForms();

    const searchForm = document.getElementById("search-form");
    searchForm?.addEventListener("submit", event => { event.preventDefault(); filterBooks(); });
    document.getElementById("filter-type")?.addEventListener("change", filterBooks);
    document.getElementById("filter-condition")?.addEventListener("change", filterBooks);
    const debouncedFilter = debounce(filterBooks, 150);
    document.getElementById("search-book")?.addEventListener("input", debouncedFilter);
    document.getElementById("list-book-form")?.addEventListener("submit", submitBookListing);
    document.getElementById("refund-form")?.addEventListener("submit", submitRefund);
    document.getElementById("report-form")?.addEventListener("submit", submitReport);

    const hasBrowse = !!document.getElementById("book-list");
    const hasTransactions = !!document.getElementById("transaction-list");
    const hasCategories = !!document.getElementById("book-category-options") || !!document.getElementById("filter-category-options");

    const hasRefundPicker = !!document.getElementById("refund-transaction-id");
    if (hasBrowse || hasTransactions || hasRefundPicker) await loadBooks();
    if (hasRefundPicker) await loadRefundOptions();
    if (hasTransactions) await loadTransactions();
    if (hasCategories) await loadCategories();

    if (hasBrowse) {
        const params = new URLSearchParams(window.location.search);
        const urlSearch = params.get("search") || params.get("q");
        const urlCategory = params.get("category");
        const urlType = params.get("type") || params.get("listing_type");
        const urlCondition = params.get("condition");
        let shouldFilter = false;

        if (urlSearch) {
            const searchInput = document.getElementById("search-book");
            if (searchInput) {
                searchInput.value = urlSearch;
                shouldFilter = true;
            }
        }
        if (urlType) {
            const typeEl = document.getElementById("filter-type");
            if (typeEl) {
                const normType = urlType.trim().toLowerCase().replace(/[\s-]+/g, "_");
                for (const opt of typeEl.options) {
                    const optVal = opt.value.toLowerCase();
                    const optText = opt.textContent.trim().toLowerCase();
                    if (optVal === normType || optText.replace(/\s+/g, "_") === normType || (normType === "sale" && optVal === "for_sale") || (normType === "trade" && optVal === "for_trade")) {
                        typeEl.value = opt.value;
                        shouldFilter = true;
                        break;
                    }
                }
            }
        }
        if (urlCondition) {
            const condEl = document.getElementById("filter-condition");
            if (condEl) {
                const normCond = urlCondition.trim().toLowerCase();
                for (const opt of condEl.options) {
                    if (opt.value.toLowerCase() === normCond || opt.textContent.trim().toLowerCase() === normCond) {
                        condEl.value = opt.value;
                        shouldFilter = true;
                        break;
                    }
                }
            }
        }
        if (urlCategory) {
            const catBoxes = document.querySelectorAll('#filter-category-options input[type="checkbox"]');
            const targetCat = normalizeSearchText(urlCategory);
            catBoxes.forEach(box => {
                const label = box.closest('label');
                if (label && normalizeSearchText(label.textContent).includes(targetCat)) {
                    box.checked = true;
                    shouldFilter = true;
                }
            });
        }
        if (shouldFilter) filterBooks();
    }
});


/* ==========================================================================
   DOUBLE-SUBMISSION GUARD
   A form that is already sending is locked: extra clicks, Enter presses or
   Ctrl+S are ignored until the server answers, and the button shows
   "Processing…". This stops the same listing/refund/report being saved twice.
   ========================================================================== */
function guardFormSubmit(handler) {
    return async function (event) {
        if (event && typeof event.preventDefault === "function") event.preventDefault();
        const form = event && event.currentTarget instanceof HTMLFormElement
            ? event.currentTarget
            : (event && event.target && event.target.closest ? event.target.closest("form") : null);

        if (form && form.dataset.submitting === "true") return;   // already sending — ignore
        const button = form ? form.querySelector('button[type="submit"]') : null;
        const label = button ? button.textContent : "";

        if (form) {
            form.dataset.submitting = "true";
            form.setAttribute("aria-busy", "true");
        }
        if (button) {
            button.disabled = true;
            button.textContent = "Processing…";
        }
        try {
            return await handler.call(this, event);
        } finally {
            if (form) {
                delete form.dataset.submitting;
                form.removeAttribute("aria-busy");
            }
            if (button) {
                button.disabled = false;
                button.textContent = label;
            }
        }
    };
}

submitBookListing = guardFormSubmit(submitBookListing);
submitRefund = guardFormSubmit(submitRefund);
submitReport = guardFormSubmit(submitReport);
