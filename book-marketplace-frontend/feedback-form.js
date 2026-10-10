/* LIBROWSE — Feedback form (feedback.html + admin/staff "Feedback" tab).
   Looks for #feedback-form on the page; every other element is optional. */
(function () {
    "use strict";

    var MAX_COMMENT = 1000;
    var MIN_COMMENT = 10;
    var RATING_WORDS = { 1: "Poor", 2: "Fair", 3: "Okay", 4: "Good", 5: "Excellent" };
    var TOPIC_LABELS = {
        Overall_Experience: "Overall experience", Browsing_Search: "Browsing & search",
        Listing_A_Book: "Listing a book", Transactions: "Transactions",
        Refunds_Support: "Refunds & support", Website_Design: "Website design",
        Bug_Report: "Bug report", Suggestion: "Suggestion", Other: "Other"
    };

    function $(id) { return document.getElementById(id); }

    function esc(value) {
        return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
    }

    function apiBase() {
        if (window.librowseAuth && window.librowseAuth.API_BASE) return window.librowseAuth.API_BASE;
        if (window.LIBROWSE_API_BASE) return String(window.LIBROWSE_API_BASE).replace(/\/$/, "");
        return window.location.port === "8000"
            ? window.location.protocol + "//" + (window.location.hostname || "127.0.0.1") + ":8000/api"
            : "/api";
    }

    async function api(endpoint, options) {
        options = options || {};
        var headers = new Headers(options.headers || {});
        var token = sessionStorage.getItem("librowseSessionToken");
        if (token) headers.set("Authorization", "Bearer " + token);
        headers.set("Cache-Control", "no-store");
        var response;
        try {
            response = await fetch(apiBase() + "/" + endpoint, Object.assign({}, options, { headers: headers, cache: "no-store" }));
        } catch (err) {
            throw new Error("Could not reach the server. Check your connection and try again.");
        }
        var text = await response.text();
        var data = {};
        try { data = text ? JSON.parse(text) : {}; } catch (e) { throw new Error("The server sent an unexpected reply."); }
        if (response.status === 401) {
            if (window.librowseAuth) window.librowseAuth.clearSession();
            window.location.replace("login.html");
            throw new Error("Your session has expired. Please sign in again.");
        }
        if (!response.ok) throw new Error(data.error || "Request failed (" + response.status + ").");
        return data;
    }

    function setError(fieldId, message) {
        var el = $(fieldId);
        if (!el) return;
        el.textContent = message || "";
        el.style.display = message ? "block" : "none";
    }

    function banner(kind, message) {
        var box = $("feedback-status");
        if (!box) return;
        box.className = "feedback-status" + (kind ? " " + kind : "");
        box.textContent = message || "";
        box.setAttribute("role", kind === "error" ? "alert" : "status");
    }

    function ratingValue() {
        var checked = document.querySelector('#feedback-form input[name="rating"]:checked');
        return checked ? Number(checked.value) : 0;
    }

    function radioValue(name) {
        var checked = document.querySelector('#feedback-form input[name="' + name + '"]:checked');
        return checked ? checked.value : "";
    }

    function stars(n) {
        n = Number(n) || 0;
        return n ? "\u2605".repeat(n) + "\u2606".repeat(5 - n) : "";
    }

    function formatDate(value) {
        if (!value) return "";
        var d = new Date(String(value).replace(" ", "T") + "Z");
        return isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    }

    async function loadHistory() {
        var list = $("feedback-history-list");
        if (!list) return;
        try {
            var rows = await api("feedback.php");
            if (!Array.isArray(rows) || !rows.length) {
                list.innerHTML = '<li class="feedback-empty">You haven\u2019t sent any feedback yet.</li>';
                return;
            }
            list.innerHTML = rows.map(function (r) {
                return '<li class="feedback-history-item">' +
                    '<div class="feedback-history-meta">' +
                    (r.rating ? '<span class="feedback-history-stars" aria-label="' + r.rating + ' out of 5 stars">' + stars(r.rating) + "</span>" : "") +
                    '<span class="feedback-badge">' + esc(TOPIC_LABELS[r.topic] || String(r.topic || "").replace(/_/g, " ")) + "</span>" +
                    "<span>" + esc(formatDate(r.submitted_at)) + "</span>" +
                    '<span class="feedback-badge">' + esc(String(r.status || "").replace(/_/g, " ")) + "</span>" +
                    "</div>" +
                    (r.comment ? "<p>" + esc(r.comment) + "</p>" : "") +
                    "</li>";
            }).join("");
        } catch (err) {
            list.innerHTML = '<li class="feedback-empty">' + esc(err.message) + "</li>";
        }
    }

    async function loadTransactions() {
        var select = $("feedback-transaction");
        if (!select) return;
        try {
            var txs = await api("transactions.php");
            var me = window.librowseAuth && window.librowseAuth.getUser();
            var mine = (Array.isArray(txs) ? txs : []).filter(function (t) {
                return !me || Number(t.buyer_id) === Number(me.user_id);
            });
            select.innerHTML = '<option value="">Not about a specific transaction</option>' + mine.map(function (t) {
                return '<option value="' + esc(t.transaction_id) + '">#' + esc(t.transaction_id) + " \u2014 " +
                    esc(t.transaction_type) + " (" + esc(t.status) + ")</option>";
            }).join("");
        } catch (err) {
            select.innerHTML = '<option value="">Not about a specific transaction</option>';
        }
    }

    function validate() {
        var ok = true;
        setError("err-feedback-topic", "");
        setError("err-feedback-rating", "");
        setError("err-feedback-comment", "");

        if (!$("feedback-topic").value) {
            setError("err-feedback-topic", "Please choose what your feedback is about."); ok = false;
        }
        if (!ratingValue()) {
            setError("err-feedback-rating", "Please choose a star rating."); ok = false;
        }
        var comment = $("feedback-comment").value.trim();
        if (!comment) {
            setError("err-feedback-comment", "Please tell us a little about your experience."); ok = false;
        } else if (comment.length < MIN_COMMENT) {
            setError("err-feedback-comment", "Please write at least " + MIN_COMMENT + " characters."); ok = false;
        }
        return ok;
    }

    function resetForm(form) {
        form.reset();
        updateCounter();
        updateRatingText();
        setError("err-feedback-topic", "");
        setError("err-feedback-rating", "");
        setError("err-feedback-comment", "");
    }

    function updateCounter() {
        var area = $("feedback-comment"), counter = $("feedback-counter");
        if (!area || !counter) return;
        var len = area.value.length;
        counter.textContent = len + " / " + MAX_COMMENT;
        counter.classList.toggle("is-near-limit", len >= MAX_COMMENT - 50);
    }

    function updateRatingText() {
        var out = $("feedback-rating-text");
        if (out) out.textContent = RATING_WORDS[ratingValue()] || "";
    }

    function init() {
        var form = $("feedback-form");
        if (!form) return;

        var submit = $("feedback-submit");
        var comment = $("feedback-comment");
        if (comment) {
            comment.maxLength = MAX_COMMENT;
            comment.addEventListener("input", function () { updateCounter(); setError("err-feedback-comment", ""); });
        }
        $("feedback-topic").addEventListener("change", function () { setError("err-feedback-topic", ""); });
        form.querySelectorAll('input[name="rating"]').forEach(function (r) {
            r.addEventListener("change", function () { setError("err-feedback-rating", ""); updateRatingText(); });
        });
        var clear = $("feedback-clear");
        if (clear) clear.addEventListener("click", function () { resetForm(form); banner("", ""); });

        form.addEventListener("submit", async function (event) {
            event.preventDefault();
            banner("", "");
            if (!validate()) return;

            var payload = {
                topic: $("feedback-topic").value,
                rating: ratingValue(),
                comment: $("feedback-comment").value.trim(),
                recommend: radioValue("recommend"),
                contact_ok: !!($("feedback-contact") && $("feedback-contact").checked)
            };
            var tx = $("feedback-transaction");
            if (tx && tx.value) payload.transaction_id = Number(tx.value);

            submit.disabled = true;
            var label = submit.textContent;
            submit.textContent = "Sending\u2026";
            try {
                await api("feedback.php", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                banner("success", "Thank you! Your feedback was sent to the Librowse team.");
                resetForm(form);
                loadHistory();
            } catch (err) {
                banner("error", err.message);
            } finally {
                submit.disabled = false;
                submit.textContent = label;
            }
        });

        updateCounter();
        updateRatingText();

        // Wait for the shared session check before calling the API.
        var ready = window.librowseAuthReady || Promise.resolve();
        ready.then(function () {
            if (window.librowseAuth && !window.librowseAuth.getToken()) return;
            loadTransactions();
            loadHistory();
        });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();
