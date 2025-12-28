# Almacenes, Galpones, Espacios Libres

## Overview
This project is a web platform designed for the technological intermediation of temporary rental of warehouses, sheds, and free spaces in Bolivia. Its main purpose is to connect individuals and businesses with available spaces for temporary use, streamlining the rental process through an online portal. The platform aims to provide a robust, transparent, and legally compliant system for both hosts and guests, including features for immutable contract data, dynamic legal text management, and a centralized notification system.

## User Preferences
I want the agent to use a formal and professional tone. When making significant changes or architectural decisions, please ask for confirmation first. I prefer clear and concise explanations for any proposed solutions or code modifications. Do not make changes to the `uploads/` folder.

## System Architecture
The project uses a Node.js 20 backend with Express.js and SQLite (better-sqlite3) for data persistence. The frontend is built with React and Vite. The application runs on port 5000.

**Key Architectural Decisions and Features:**

*   **Immutable Contractual Data:** Once a deposit is paid, all contractual data (space details, pricing, conditions, etc.) is frozen and cannot be modified, ensuring legal and financial integrity. This is enforced by SQLite triggers.
*   **Dynamic Legal Text Management:** All legal texts (Terms & Conditions, Privacy Policy, Anti-Bypass Clause, etc.) are stored and managed in the database with version control. Only one version of each text type can be active at a time. Contracts and invoices capture a snapshot of the legal texts active at their creation time.
*   **Centralized Notification System:** All official platform communications (appointments, payments, contract events) are managed through a centralized system using parameterized templates. This prevents direct host-guest contact outside the platform and ensures consistent messaging.
*   **Audit Logging:** Comprehensive audit trails are maintained for critical events such as contract creation, legal text changes, admin actions, and notification sends, capturing timestamps, IP addresses, and user agents.
*   **Contract PDF Export & Invoice Generation:** The platform generates legally compliant PDF contracts and invoices, incorporating frozen data and applicable legal clauses.
*   **Contract Extensions/Annexes:** Extensions do not modify the original contract but create separate annex documents. These annexes reference the original contract, specify the extension period, and freeze relevant legal texts at the time of creation.
*   **Anti-Bypass Clause:** A unified anti-bypass clause is enforced for both guests and hosts to prevent direct dealings outside the platform, protecting commission structures. This clause is a core part of legal texts and reaffirmed in extensions.
    *   **HOST Anti-Bypass Endpoint:** `PUT /api/users/me/accept-anti-bypass` (JWT required). Stores: `anti_bypass_accepted`, `anti_bypass_accepted_at`, `anti_bypass_legal_text_id`, `anti_bypass_legal_version`, `anti_bypass_ip`, `anti_bypass_user_agent`. Audit event: `ANTI_BYPASS_HOST_ACCEPTED` (or `ANTI_BYPASS_GUEST_ACCEPTED` for GUEST). HOST must accept before publishing spaces.
*   **Admin Panel:** A comprehensive admin interface with 27 sections: Dashboard, Reportes Avanzados (KPIs, graficos), **Clientes** (GUEST user management), **Hosts** (HOST user management), Verificacion de Hosts (document verification workflow), Users (CRUD with activate/deactivate, role changes), Roles y Permisos (granular permissions matrix: 27 sections x 4 permission types), Spaces, Reservations, Contracts (PDF download, extensions), Disputas/Reclamos (full lifecycle, evidence, resolution), Payments, Depositos de Seguridad (hold/release/claim), Invoices (PDF download, SIAT disclaimer), Estados de Cuenta Hosts, **Metodos de Pago** (CRUD for payment methods), Campanas Email/SMS (audience targeting, MOCK sending), Badges/Insignias (manual/auto awarding), FAQ/Centro de Ayuda, Alertas Admin (real-time with read/dismiss), Config, Legal Texts (CRUD with versioning), Notifications (templates, log), Audit Log (filterable by date/user/event_type), Accounting (balance summary by period), Export (JSON with audit), and Messages. All admin actions are audit-logged.
*   **Dynamic Payment Methods:** Payment methods (card, QR, bank transfer, etc.) are dynamically managed through the admin panel. The admin can:
    *   Add new payment methods with code, name, description, instructions, and icon
    *   Edit existing payment methods
    *   Activate/deactivate methods without deleting them
    *   Delete methods only if no historical payments use them
    *   Set display order for payment options
    *   **Database Table:** `payment_methods` with fields: id, code, name, description, instructions, icon, is_active, order_index
    *   **API Endpoints:** GET/POST/PUT/DELETE `/admin/payment-methods` (admin), GET `/payments/methods` (public - returns active methods)
    *   Default methods: card (Tarjeta de Credito/Debito), qr (Codigo QR)
    *   **Client/Host Separation:** Independent management panels for Clients (GUEST) and Hosts (HOST) with role-specific statistics, filters, and detail views.
    *   **useUserPanel Hook:** Shared hook providing common functionality (load, edit, filter, export) for both client and host sections.
    *   **UserPanelContent Component:** Reusable component for displaying user lists and details with role-aware tabs (Hosts see "Espacios" tab, Clients do not).
    *   **UserEditModal/ItemEditModal:** Modal components for editing users and related items (spaces, reservations, contracts, payments, invoices).
*   **Map Search:** Interactive map search using Leaflet/react-leaflet allows users to find spaces by geographic location. Spaces with latitude/longitude coordinates are displayed as pins on a map centered on Bolivia. The GET /api/spaces/map endpoint filters by geographic bounds.
*   **Owner Portal (Portal de Propietarios):** A dedicated dashboard for property owners (HOST users) to manage their business on the platform:
    *   **Dashboard:** KPIs showing spaces count (total/published/draft), reservations stats (total/active/pending/completed), earnings summary (total/escrow/released), recent reservations table, and monthly earnings chart.
    *   **Mis Espacios:** Full CRUD for spaces with card grid view, publish/unpublish workflow (requires anti-bypass acceptance), form with type/pricing/location/coordinates/amenities.
    *   **Reservaciones:** Filterable table of reservations for owner's spaces with detail modal showing guest info, payments, and status.
    *   **Pagos/Ingresos:** Payment history with summary stats (total received, in escrow, released, transactions count) and transaction table with filters.
    *   **Calendario:** Interactive monthly calendar showing reservation events across all owner's spaces with navigation and event display.
    *   **Estados de Cuenta:** View host statements with period, reservations, gross earnings, commissions, withholdings, and net payout.
    *   **Mi Perfil:** Personal info display, verification status, and badges earned.
    *   **API Endpoints:** All under `/api/owner/*` with JWT authentication and HOST role requirement. Endpoints: /dashboard, /spaces (CRUD), /spaces/:id/publish, /spaces/:id/unpublish, /reservations, /reservations/:id, /payments, /calendar, /statements, /statements/:id, /profile.
    *   **Route:** `/propietario/*` accessible only to HOST users via Header navigation.
*   **Bolivian Professional Accounting Module:** A comprehensive accounting system compliant with Bolivian tax regulations including:
    *   **Tax Calculations:** IVA (13%), IT (3%), IUE (25%), RC-IVA (13% with 12.5% withholding on dividends)
    *   **Database Tables:** shareholders, accounting_entries, tax_periods, tax_payments, dividend_distributions, dividend_details, capital_transactions, chart_of_accounts
    *   **Fiscal Fields:** taxable_base, iva_amount, it_amount added to payments and invoices tables
    *   **API Endpoints:** /accounting/dashboard, /accounting/entries, /accounting/tax-periods, /accounting/tax-payments, /accounting/shareholders, /accounting/dividends, /accounting/capital, /accounting/chart-of-accounts (all with full CRUD)
    *   **AdminAccounting UI:** 5 tabs - Resumen (KPIs), Transacciones (ledger), IVA (monthly/annual), IT (monthly/annual), Capital/Dividendos (shareholders, capital movements, dividend distributions)
    *   **Chart of Accounts:** Pre-populated with Bolivian accounting structure (assets/liabilities/equity/income/expense)

**UI/UX Decisions:**
The project structure indicates a clear separation between `client/` (frontend) and `server/` (backend), suggesting a modern web application design with a focus on a responsive and interactive user experience provided by React.

## External Dependencies
*   **Database:** SQLite (using `better-sqlite3` driver)
*   **Backend Framework:** Express.js
*   **Frontend Framework:** React
*   **Build Tool:** Vite
*   **Authentication:** JSON Web Tokens (JWT)
*   **Email Service:** Currently a MOCK implementation; future integration with actual email service is implied.
*   **SMS/WhatsApp:** Currently MOCK implementations; future integration with actual messaging services is implied.
*   **Payment Gateway:** Not explicitly detailed but implied by payment and escrow features.
*   **PDF Generation Libraries:** Implied by the functionality to generate contract and invoice PDFs.
*   **Map Libraries:** Leaflet and react-leaflet for interactive map visualization.