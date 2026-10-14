# Librowse Book Exchange: Project Overview & Demo Guide

**Course:** ITS122P: Web Systems and Technologies  
**Project:** Librowse Book Exchange Web Application  
**Tech Stack:** HTML5 / CSS3 / Vanilla JavaScript / PHP 8+ / MySQL & TiDB Cloud / XML Sessions / Resend API  

---

## 1. Project Overview

### 1.1 The Problem
Buying and trading used books through chat groups or social media channels is unorganized, fragmented, and insecure:
- No centralized catalog, real-time inventory tracking, or verified listings.
- No structured mechanism to pair prospective buyers, sellers, or trading partners.
- Lack of order lifecycle visibility, resulting in missed handoffs or unfulfilled transactions.
- Absence of built-in channels for dispute mediation, refund claims, or seller verification.
- Inadequate protection against account enumeration, credential brute-forcing, or lost credentials.

### 1.2 The Solution
**Librowse** is a full-stack web-based book exchange platform that provides a single, moderated environment for purchasing, selling, and trading books:
- **Role-Based Access Control (RBAC):** Three distinct permission tiers for **Customer**, **Staff**, and **Administrator**.
- **Account Security & Verification:** Email verification on registration, secure time-limited password resets via transactional email, and brute-force protection that locks accounts after repeated incorrect password attempts.
- **Searchable Catalog & Bookshelf View:** Multi-criteria book browsing with keyword search, strict multi-category selection, condition ratings (`New`, `Good`, `Acceptable`), dynamic cover rendering, and quick-view modals.
- **Order & Trade Lifecycle Management:** Structured progression across explicit states (`Pending`, `Accepted`, `Completed`, `Cancelled`, `Disputed`).
- **Customer Activity Dashboard:** Centralized activity hub showing live listing counts, order history, refund statuses, categorized personal inventory distribution, and search/sort filters.
- **Staff Moderation Tools:** Dedicated portals for reviewing user dispute reports, verifying seller requests, arbitrating transaction disputes, and approving or rejecting refund claims.
- **Administrative Governance:** System-wide management over user accounts, master book metadata, category taxonomies, formatted audit trail logs, and password reset records.
- **Dual-Mode Cloud & Local Architecture:** Native execution on standard local PHP/MySQL stacks, with production-ready compatibility for Vercel serverless hosting and TiDB Cloud (MySQL over TLS/SSL).

---

## 2. System Architecture

```text
               +----------------------------------------------------+
               |                 Browser (Client)                   |
               |  HTML5 / Modular CSS3 / Vanilla JavaScript (ES6+)  |
               +-------------------------+--------------------------+
                                         |
                                         | HTTP Requests (JSON + Bearer Token)
                                         v
               +----------------------------------------------------+
               |         Routing & Dispatch Gateway                 |
               |   Local: PHP Built-in Server / XAMPP               |
               |   Cloud: Vercel Serverless (api/index.php Gateway) |
               +-------------------------+--------------------------+
                                         |
                                         v
               +----------------------------------------------------+
               |                PHP 8+ REST API Core                |
               |  - dispatch.php: Request routing & validation      |
               |  - Response.php: Standard JSON envelope            |
               |  - Crud.php: Parameterized PDO database engine     |
               |  - mailer.php: Resend REST API (cURL HTTP client)  |
               +-------------+----------------------+---------------+
                             |                      |
            SQL over TLS/SSL |                      | File Lock (flock)
                             v                      v
+------------------------------------+   +------------------------------------+
|       MySQL 8+ / TiDB Cloud        |   |         XML Session Store          |
|  - Relational tables & constraints |   |  - Token SHA-256 hashes            |
|  - ISRG Root X1 TLS encryption     |   |  - Role & expiration metadata      |
|  - InnoDB transactional integrity  |   |  - data/security.xml               |
+------------------------------------+   +------------------------------------+
```

### 2.1 Technology Breakdown

- **Frontend (Client-side):**
  - **HTML5 & Modular CSS3:** Semantic elements, responsive CSS grid and flexbox layouts, accessible color contrast ratios meeting WCAG AA requirements, and button micro-animations.
  - **Vanilla JavaScript (ES6+):** Zero third-party runtime frameworks. Modular controllers handle authentication (`auth.js`), session state and route guarding (`session.js`), interactive bookshelf rendering (`browse-shelf.js`), book cover processing (`book-covers.js`), cookie/privacy consent notices (`consent.js`), staff/admin operations (`management.js`), and customer metrics (`customer-dashboard.js`).
  - **Client Token Storage:** Session tokens reside in `sessionStorage` and are automatically attached to outgoing HTTP requests via the `Authorization: Bearer <token>` header.

- **Backend (Server-side):**
  - **PHP 8+ REST API:** Modular endpoints structured under `book-marketplace-backend/api/`, returning unified JSON envelopes through `Response.php`.
  - **Centralized Dispatcher (`dispatch.php`):** Resolves routes, validates request methods, verifies role permissions, and normalizes input payloads.
  - **Transactional Mailer (`mailer.php`):** Transmits email verification and password reset notifications through the Resend HTTP REST API using native PHP cURL, circumventing outbound SMTP port restrictions on serverless cloud platforms. Includes a local fallback logger for offline development.
  - **XML Session Engine (`security.php`):** Issues cryptographically random 64-character tokens. Tokens are stored as SHA-256 hashes with expiry timestamps in `data/security.xml` using exclusive file locking (`flock`) to prevent race conditions.

- **Database (MySQL 8+ InnoDB & TiDB Cloud):**
  - `USER`: User profiles, role assignments (`Customer`, `Staff`, `Admin`), account statuses (`Active`, `Pending Verification`, `Suspended`, `Banned`, `Locked`), and password hashes (`PASSWORD_BCRYPT`).
  - `BOOKS_CATALOG`: Master catalog containing titles, authors, ISBNs, and publication metadata.
  - `BOOK_CATEGORIES` & `BOOK_CATEGORY_MAP`: Category taxonomy supporting many-to-many book categorizations.
  - `USER_BOOKS`: User inventory entries specifying condition (`New`, `Good`, `Acceptable`), price, listing type (`For_sale`, `For_trade`, `Both`), status (`Available`, `Reserved`, `Sold`), and custom cover photo URLs.
  - `TRANSACTIONS`: Order and trade records linking buyer, seller, items, monetary amount, status, and timestamps.
  - `REFUND_REQUEST`: Customer refund tickets linked to transactions, tracking staff review actions and resolutions.
  - `REPORTS`: Customer and staff issue reports, dispute filings, and seller verification applications.
  - `SYSTEM_RECORDS`: Administrative audit logs recording critical actions, system modifications, and administrative updates.
  - `LOGIN_ATTEMPTS`: Tracks consecutive failed login attempts per user ID, enabling automated account lockout after 3 consecutive invalid credentials.
  - `EMAIL_VERIFICATION_TOKENS`: Stores 64-character verification tokens and expiration windows for pending accounts.
  - `PASSWORD_RESET_TOKENS`: Manages secure, one-hour expiration password reset tokens with single-use invalidation.

---

## 3. Key Modules & Capabilities

### 3.1 Backend Services

- **Authentication & Security Engine (`auth.php`, `security.php`):**
  - **Registration & Verification:** Creates accounts in `Pending Verification` status and dispatches an activation token via email.
  - **Brute-Force Rate Limiting:** Tracks failed authentication attempts. A fourth incorrect attempt sets `USER.status = 'Locked'`, requiring administrative unlocking.
  - **Password Recovery:** Validates user identity, generates secure reset tokens, dispatches reset links, and invalidates tokens upon successful password changes.
  - **XML Session Security:** Validates `Authorization: Bearer <token>` headers against SHA-256 digests in `security.xml`.
- **Database Engine (`Crud.php`):**
  - Executes parameterized prepared statements with column whitelisting, preventing SQL injection vulnerabilities.
- **REST API Endpoints (`/api/`):**
  - `auth.php`: Sign in, registration, email verification, password reset, session validation, and logout.
  - `books_catalog.php`: Master catalog search and administration.
  - `book_categories.php`: Taxonomy management and book-to-category associations.
  - `user_books.php`: Personal inventory management for sellers.
  - `transactions.php`: Order submission, trade proposals, and transaction lifecycle transitions.
  - `refund_request.php`: Customer refund ticket submission and staff adjudication.
  - `reports.php`: Dispute ticket submission, moderation management, and seller verification.
  - `user.php`: Profile details, role adjustments, account unlocking, and customer status updates.
  - `system_records.php`: Audit trail retrieval with event formatters.

### 3.2 Frontend Interfaces

- **Authentication Suite:**
  - `login.html`: Dual-identifier login (username or email), credential lockout warning dialogs, and automated role-based routing.
  - `register.html`: Client-side validation, password confirmation, and verification dispatch notices.
  - `verify-email.html`: Automated verification token validation with status indicators.
  - `forgot-password.html` & `reset-password.html`: Token-driven password recovery with real-time feedback.
- **Marketplace & Bookshelf:**
  - `index.html`: Marketplace landing page highlighting featured listings and platform overview.
  - `browse.html`: Live searchable book catalog supporting dual display modes (standard card grid and interactive bookshelf view), strict category filtering, condition selection, and modal book details.
  - `list-book.html`: Seller listing form with image preview, master catalog lookup, and trade preference options.
- **Customer Activity Dashboard:**
  - `customer-dashboard.html`: Live metric cards (Total Listings, Active, Sold, Pending Transactions, Refund Tickets), personal category breakdown charts, inventory search, and sortable order lists.
- **Staff Moderation Portal:**
  - `staff.html`: Transaction progression panel, customer dispute review, refund claim arbitration, and staff escalation forms.
- **Administrator Governance Portal:**
  - `admin.html`: Complete user account administration (role modifications, account activation, unlocking locked accounts), master catalog editing, category creation, audit trail logs with human-readable event formatters, and password reset history.

---

## 4. Role Permissions Matrix

| Platform Capability | Customer | Staff | Administrator |
|---|:---:|:---:|:---:|
| Register Account & Verify Email | Yes | Yes | Yes |
| Request Password Reset | Yes | Yes | Yes |
| Browse & Search Marketplace Catalog | Yes | Yes | Yes |
| Filter by Multiple Categories & Condition | Yes | Yes | Yes |
| Create Personal Book Listings (Sale / Trade) | Yes | No | No |
| Purchase or Propose Book Trades | Yes | No | No |
| View Personal Activity Dashboard | Yes | No | No |
| Submit Refund or Dispute Tickets | Yes | No | No |
| Moderate Customer Reports & Verification Forms | No | Yes | Yes |
| Update Transaction Status (Advance / Mediate) | No | Yes | Yes |
| Adjudicate & Process Refund Requests | No | Yes | Yes |
| Submit Internal Staff Reports to Administrators | No | Yes | No |
| Manage User Roles & Account Statuses | No | No | Yes |
| Unlock Brute-Force Locked User Accounts | No | No | Yes |
| Edit Master Books Catalog & Taxonomy | No | No | Yes |
| Inspect System Audit Records & Reset Logs | No | No | Yes |

---

## 5. Live Demonstration Guide

### Demo Test Accounts

| Role | Username | Password | Default Landing Page |
|---|---|---|---|
| **Customer** | `emma_clarke` | `password` | `customer-dashboard.html` |
| **Customer** | `liam_smith` | `password` | `customer-dashboard.html` |
| **Staff Moderator** | `priya_singh` | `password` | `staff.html` |
| **Administrator** | `alice_wong` | `password` | `admin.html` |

---

### Step-by-Step Demo Walkthrough

#### Step 1: Customer Journey (Authentication, Browsing, Orders, Dashboard)
1. **Sign In:** Open `login.html`, enter `emma_clarke` / `password`.
   - The client verifies credentials and automatically redirects to `customer-dashboard.html`.
2. **Customer Dashboard Review:**
   - Review live summary indicators (Listings count, Active items, Sold books, Pending Orders, Refund claims).
   - Inspect the personal category breakdown cards and sort personal inventory items by title, status, or date.
3. **Catalog & Bookshelf Browsing:** Navigate to `browse.html`.
   - Use the search bar to query by title or author (for example, "Silent").
   - Toggle category checkboxes (for example, "Fiction" or "Computer Science") to demonstrate strict multi-tag filtering.
   - Filter by condition (`New`, `Good`, `Acceptable`) and toggle between standard grid view and the interactive wooden bookshelf display.
   - Click a book listing to open the detailed modal showing condition ratings, seller notes, and listing mode.
4. **Place an Order or Trade Proposal:**
   - Click **Buy** or **Trade** on an available book listing.
   - Open `transactions.html` to confirm the transaction is initiated in `Pending` status.
5. **Customer Support & Disputes:**
   - Navigate to `support.html` to file a sample dispute ticket or refund claim for a transaction.

#### Step 2: Staff Moderation (Disputes, Orders, and Refunds)
1. **Sign In:** Log out from the customer account and log in as `priya_singh` / `password`.
   - The application automatically opens `staff.html`.
2. **Review Customer Reports:**
   - Open the **Customer Forms / Reports** tab.
   - Locate the dispute filed during Step 1, inspect submitted details, and update status to `Under_Review` or `Resolved`.
3. **Transaction Mediation:**
   - Open the **Transactions** tab. Filter by status (`Pending`) to find the buyer's order from Step 1.
   - Advance the order status to `Accepted` or `Completed`.
4. **Process Refund Requests:**
   - Open the **Refunds** tab, inspect the refund claim details, and approve or reject the request with staff notes.
5. **Staff Escalation:**
   - Open the **Report an Issue** section to demonstrate how staff file internal reports directly to system administrators.

#### Step 3: Administrator Governance (Users, Catalog, and Audit Logs)
1. **Sign In:** Log out from the staff account and log in as `alice_wong` / `password`.
   - The application directs to `admin.html`.
2. **User Account Governance & Lockout Recovery:**
   - Open the **Users** tab to view the complete user roster with roles and statuses.
   - Demonstrate role promotion/demotion between Customer, Staff, and Admin tiers.
   - Demonstrate account unlocking for accounts flagged as `Locked` from failed login attempts.
3. **Master Catalog & Category Taxonomy:**
   - Under **Book Categories**, create a new category (for example, "Cybersecurity").
   - Under **Book Catalog**, add a new master title, specify ISBN and author, and link it to the newly created category.
4. **Audit Trail & System Monitoring:**
   - Open **System Records** to show recorded administrative actions, status transitions, and user modifications formatted with human-readable action tags.
   - Inspect the password reset and authentication token audit history.

---

## 6. Technical Defense Q&A

**Q: How does the application prevent SQL Injection attacks?**  
> **A:** All database operations inside `Crud.php` and standalone API endpoints use PDO prepared statements with explicitly bound parameters. User inputs are never directly concatenated into SQL query strings. Furthermore, table column identifiers are validated against strict whitelists before execution.

**Q: How are sessions maintained securely without third-party frameworks?**  
> **A:** Upon successful authentication, the server generates a cryptographically secure 64-character random token. The client stores this token in browser `sessionStorage` and sends it via the standard `Authorization: Bearer <token>` header. The server stores only SHA-256 digests of active tokens alongside expiration timestamps in `data/security.xml`. File writes are guarded with PHP `flock` to prevent concurrency conflicts.

**Q: How does the application protect against brute-force password guessing?**  
> **A:** The system implements a database-backed rate-limiting mechanism via the `LOGIN_ATTEMPTS` table. When a user submits three incorrect passwords, a fourth failed attempt immediately sets `USER.status = 'Locked'`. Because the lock is persisted in the database, it survives browser reloads, IP changes, or device switches. The account remains locked until an administrator manually unlocks it via the Admin portal.

**Q: How are transactional emails handled in serverless environments like Vercel?**  
> **A:** Serverless cloud providers commonly block traditional outbound SMTP ports (such as ports 25, 465, and 587) to curb spam. Librowse bypasses this limitation by routing transactional emails (email verification and password reset links) through the Resend HTTP REST API using PHP native cURL over HTTPS (port 443). If the API key is not configured in local development, the service falls back gracefully to local file logging in the system temporary directory without crashing.

**Q: How does the system handle database connectivity across local and cloud environments?**  
> **A:** `config/database.php` reads connection parameters from environment variables with `.env` file fallback. When connecting to cloud databases such as TiDB Cloud Serverless, the connection enforces TLS encryption using the bundled ISRG Root X1 certificate (`isrgrootx1.pem`) and configures `MYSQL_ATTR_SSL_CA` appropriately.

**Q: How is database referential integrity safeguarded?**  
> **A:** Relational integrity is enforced directly at the InnoDB engine level using foreign key constraints with explicit `ON DELETE RESTRICT` and `ON DELETE CASCADE` rules. For example, deleting a catalog entry cascades to its taxonomy mappings, while transactions reference inventory items with strict foreign keys to prevent orphan transaction records.
