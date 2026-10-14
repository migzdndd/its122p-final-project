# Librowse Book Exchange: ITS122P Final Project

An integrated, full-stack web platform for peer-to-peer book listing, purchasing, trading, and transaction management, built for **ITS122P: Web Systems and Technologies**.

---

## Group Members

- **Advincula, Jordan Christopher**
- **Domingo, Nicholas Reuben**
- **Lualhati, Jethro Lee**
- **Medina, Gabriel Aze**
- **Riovaldez, Miguel**

---

## Key Features

- **Role-Based Access Control (RBAC):** Tiered permissions across **Customer**, **Staff**, and **Administrator** roles.
- **Account Security & Verification:** Email verification links dispatched upon registration, token-driven password recovery via transactional email (Resend API), and automatic account lockouts after 3 consecutive failed login attempts.
- **Interactive Marketplace & Bookshelf:** Multi-criteria book search, strict multi-category tag filtering, condition ratings, book cover rendering, and a toggleable wooden bookshelf view alongside standard card grids.
- **Customer Activity Dashboard (`customer-dashboard.html`):** Real-time counters (Total Listings, Active, Sold, Pending Transactions, Refund Tickets), personal category distribution stats, inventory search, and sortable order history.
- **Staff Moderation Portal (`staff.html`):** Adjudicate customer dispute filings, verify seller applications, mediate order progression, and process refund tickets with staff notes.
- **Admin Governance Panel (`admin.html`):** Full CRUD control over user accounts (including unlocking brute-force locked users), category taxonomies, master book catalog, formatted audit trail logs, and password reset records.
- **Structured Transaction Lifecycle:** Transparent state progression (`Pending`, `Accepted`, `Completed`, `Cancelled`, `Disputed`) with audit tracking.
- **Dual-Mode Local & Cloud Deployment:** Runs locally on PHP 8+ built-in server or XAMPP with MySQL, and deploys natively to **Vercel** serverless functions (`api/index.php`) backed by **TiDB Cloud** (MySQL with TLS/SSL encryption).

---

## Repository Structure

```text
its122p-final-project/
├── api/                             # Serverless routing gateway for Vercel
│   ├── index.php                    # Serverless router dispatching to backend endpoints
│   └── unlock_request.php           # Account unlock request endpoint
├── book-marketplace-backend/        # PHP REST API Backend
│   ├── api/                         # Backend API handlers (auth, user, books, transactions, reports, etc.)
│   ├── config/                      # Database configuration & TLS certificate (isrgrootx1.pem)
│   ├── data/                        # XML session backup & security rules (data/security.xml)
│   ├── lib/                         # Bootstrap, Crud engine, dispatch router, Response, security, mailer
│   ├── sql/                         # Database seed scripts & query reference
│   ├── BOOK DATABASE/               # Database schema spreadsheets, queries, populated data
│   ├── REMOVE_ON_SUBMISSION/        # Submission schema & reference documentation
│   ├── books.xml                    # Master XML book database
│   ├── index.php                    # Backend health check & route directory
│   ├── setup.php                    # One-click browser database installer & seeder
│   └── vercel.json                  # Standalone backend Vercel configuration
├── book-marketplace-frontend/       # Client-side Web Application
│   ├── assets/                      # Diagrams & static images (ERD.png)
│   ├── css/                         # Modular CSS stylesheets (layout, buttons, bookshelf, dashboard, auth)
│   ├── admin.html                   # Administrator management dashboard
│   ├── staff.html                   # Staff moderation & verification dashboard
│   ├── customer-dashboard.html      # Customer personal activity & metrics dashboard
│   ├── index.html                   # Marketplace home landing page
│   ├── browse.html                  # Catalog browsing & bookshelf filtering
│   ├── list-book.html               # Book listing form with photo upload & validation
│   ├── transactions.html            # User transaction history & order progression
│   ├── support.html                 # Refund request & issue reporting form
│   ├── login.html                   # User authentication login
│   ├── register.html                # User registration with email verification notice
│   ├── verify-email.html            # Email token verification landing page
│   ├── forgot-password.html         # Password reset request form
│   ├── reset-password.html          # Token-validated password reset form
│   ├── auth.js                      # Authentication & token management logic
│   ├── browse-shelf.js              # Interactive wooden bookshelf rendering
│   ├── book-covers.js               # Dynamic book cover rendering & fallback handlers
│   ├── consent.js                   # Privacy policy & cookie consent notice banner
│   ├── script.js                    # Marketplace client interactions & catalog search
│   ├── management.js                # Admin & Staff dashboard logic with log formatters
│   ├── customer-dashboard.js        # Customer dashboard metrics & category charts
│   ├── session.js                   # Client-side session guarding & role redirection
│   ├── style.css                    # Consolidated marketplace stylesheet
│   └── management.css               # Management dashboard stylesheet
├── docs/                            # Project Documentation
│   ├── ProjectDraft.md              # Original project specification & requirements draft
│   └── ADMIN_STAFF_GUIDE.md         # Guide to Admin and Staff management panels
├── PROJECT_OVERVIEW_AND_DEMO_GUIDE.md # Comprehensive demo presentation & architecture guide
├── vercel.json                      # Root Vercel configuration (routing, rewrites, PHP runtime)
└── README.md                        # Project documentation (this file)
```

---

## Quick Start & Local Setup

### 1. Prerequisites
- **PHP 8.0+** with PDO MySQL and cURL extensions enabled
- **MySQL 8.0+** or a **TiDB Cloud** Serverless MySQL instance
- A modern web browser

### 2. Configure Environment Variables
Copy `.env.example` in `book-marketplace-backend/` to `.env` (or `.env.local`):
```ini
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=book_marketplace
DB_USER=root
DB_PASS=
DB_SSL=false

# Optional: Transactional email configuration via Resend
# If unset, outgoing emails will be logged locally to the system temp directory
RESEND_API_KEY=
MAIL_FROM="Librowse Book Exchange <onboarding@resend.dev>"
APP_URL=http://127.0.0.1:8000
```
*(If connecting to TiDB Cloud, set `DB_SSL=true` or use a host ending in `tidbcloud.com`)*.

### 3. Initialize the Database
- **Option A (One-Click Setup via Browser)**:
  Start the PHP backend server:
  ```bash
  php -S 127.0.0.1:8000 -t book-marketplace-backend
  ```
  Visit `http://127.0.0.1:8000/setup.php` in your browser. This will automatically execute database migrations, apply column checks, and seed default users, categories, master catalog books, inventory listings, and transactions.
- **Option B (MySQL CLI)**:
  Import `book-marketplace-backend/REMOVE_ON_SUBMISSION/schema.sql` and `book-marketplace-backend/sql/queries.sql`.

### 4. Run the Application
1. **Start the Backend**:
   ```bash
   php -S 127.0.0.1:8000 -t book-marketplace-backend
   ```
2. **Open the Frontend**:
   Open `book-marketplace-frontend/index.html` in your browser, or serve it via VS Code Live Server or an HTTP server. The frontend automatically detects local environments and directs API calls to `http://127.0.0.1:8000/api`.

---

## Demo Accounts (Seeded Data)

| Role | Username | Password | Default Landing Page |
|---|---|---|---|
| **Administrator** | `alice_wong` | `password` | `admin.html` |
| **Staff Moderator** | `priya_singh` | `password` | `staff.html` |
| **Customer** | `emma_clarke` | `password` | `customer-dashboard.html` |
| **Customer** | `liam_smith` | `password` | `customer-dashboard.html` |

---

## Cloud Deployment (Vercel & TiDB Cloud)

This repository is pre-configured for serverless deployment on **Vercel**:
- `vercel.json` maps incoming requests to static frontend files in `book-marketplace-frontend/` and routes all `/api/*` traffic through `api/index.php` using the `vercel-php@0.9.0` runtime.
- Set the following Environment Variables in your Vercel Project Settings:
  - `DB_HOST`: Your TiDB Cloud / MySQL host (e.g. `gateway01.ap-southeast-1.prod.aws.tidbcloud.com`)
  - `DB_PORT`: `4000` (or `3306`)
  - `DB_NAME`: `book_marketplace`
  - `DB_USER`: Database username
  - `DB_PASS`: Database password
  - `DB_SSL`: `true`
  - `RESEND_API_KEY`: Your Resend API key for verification and reset emails
  - `MAIL_FROM`: Verified sender email address

---

## Additional Documentation

- [Project Overview & Demo Presentation Guide](PROJECT_OVERVIEW_AND_DEMO_GUIDE.md)
- [Admin & Staff Guide](docs/ADMIN_STAFF_GUIDE.md)
- [Project Draft & Functional Specification](docs/ProjectDraft.md)
