# Almacenes, Galpones, Espacios Libres

## Overview
This project is a web platform for the technological intermediation of temporary rental of warehouses, sheds, and free spaces in Bolivia. Its main purpose is to connect individuals and businesses with available spaces, streamlining the rental process through an online portal. The platform aims to provide a robust, transparent, and legally compliant system for both hosts and guests, incorporating features for immutable contract data, dynamic legal text management, and a centralized notification system. The business vision is to modernize and formalize the temporary space rental market in Bolivia.

## User Preferences
I want the agent to use a formal and professional tone. When making significant changes or architectural decisions, please ask for confirmation first. I prefer clear and concise explanations for any proposed solutions or code modifications. Do not make changes to the `uploads/` folder.

**Flujo de trabajo para correcciones:**
1. **Analizar** el problema primero
2. **Presentar un resumen** con el diagnóstico y la solución propuesta
3. **Esperar confirmación** del usuario antes de proceder con los cambios
4. **Aplicar** los cambios solo después de recibir aprobación
5. **Verificar** que funcione correctamente

## System Architecture
The project utilizes a Node.js 20 backend with Express.js and SQLite for data persistence, while the frontend is built with React and Vite. Key architectural decisions and features include:

*   **Immutable Contractual Data:** Contract details are frozen post-deposit to ensure legal and financial integrity.
*   **Dynamic Legal Text Management:** All legal texts are database-managed with version control, ensuring contracts and invoices reflect active legal terms at creation.
*   **Centralized Notification System:** Official platform communications are handled via parameterized templates, preventing direct host-guest contact.
*   **Audit Logging:** Critical events are comprehensively logged for security and compliance.
*   **Contract PDF Export & Invoice Generation:** Legally compliant PDF documents are generated from platform data.
*   **Contract Extensions/Annexes:** Extensions create separate annexes referencing the original contract without modifying it.
*   **Anti-Bypass Clause:** Enforced for both guests and hosts to protect platform commissions.
*   **Dual-Confirmation Appointment System:** Complete workflow for physical property visits:
    - Client requests appointment → status 'solicitada'
    - Client accepts anti-bypass clause → `anti_bypass_guest_accepted = 1`
    - Host accepts appointment → `host_accepted_at` timestamp saved, status 'aceptada'
    - Both must accept before physical visit can proceed (shown with ✅ indicators)
    - After physical visit, both must click "Cita Realizada Físicamente" button
    - When both confirm (`host_completed = 1` and `guest_completed = 1`) → status 'realizada'
    - Client sees "Cerrar Contrato" button to pay remaining 90%
    - After payment, contract is auto-generated with status 'pending'
    - Client signs first (guest_signed = 1), then host signs (host_signed = 1)
    - Contract status becomes 'signed' after both signatures
    - Email notifications sent at each signature step
*   **Email Verification System:** New user registration requires email verification for account activation.
*   **Admin Panel:** A comprehensive interface for managing users (Clients/Hosts), spaces, reservations, contracts, payments, legal texts, notifications, and system configuration, with role-based access and audit logging.
*   **Hierarchical Admin System:** Two-tier admin structure with Super Admin (full access to all 27 sections including config, legal texts, accounting, roles, payment methods) and Admin (limited to operational sections like users, spaces, reservations). Backend protection via `requireSuperAdmin` middleware on all sensitive endpoints.
*   **Dynamic Payment Methods:** Payment options are configurable and manageable via the admin panel.
*   **Map Search:** Interactive map functionality using Leaflet allows geographic space discovery.
*   **Featured Spaces System:** Admin-controlled promotional system for the homepage:
    - Admins can mark/unmark spaces as "Featured" from the Spaces section using a star button (★/☆)
    - Only featured spaces appear in the "Espacios Destacados" section on the public homepage
    - Independent from the general search functionality
    - Toggle endpoint: PUT /admin/spaces/:id/featured
*   **Client Portal (Portal del Cliente):** A dedicated dashboard for guests to manage reservations, contracts, payments, invoices, favorites, and profile, including account deletion with safety checks.
*   **Owner Portal (Portal de Propietarios):** A dedicated dashboard for hosts to manage spaces (full CRUD with delete functionality), reservations, earnings, calendar, statements, and profile, also including account deletion with safety checks. Space management includes comprehensive pricing (day/week/month/quarter/semester/year per m2), conditions (roof, rain/dust protection, security), rental day limits, and availability date ranges (available_from/available_until).
*   **Public Search Privacy Protection:** Public space listings hide sensitive information for non-authenticated users:
    - Address field is omitted from API responses for guests (only city/department visible)
    - Calculator and payment options are replaced with login/register prompt
    - Availability dates are shown publicly when configured
    - Full details revealed only after user authentication
*   **Editable Site Configuration:** Contact information and footer content are dynamically managed via the admin panel.
*   **Editable Homepage Content (Super Admin):** All public homepage text content is fully editable via the Admin Panel → "Contenido Homepage" section, including:
    - Hero section (title, subtitle, button texts)
    - "Como Funciona" section (title, 3 steps with titles and descriptions)
    - "Espacios Destacados" section (title, "Ver todos" link text)
    - "Intermediacion Segura" section (title, 4 features with titles and descriptions)
    - Footer section (copyright text, disclaimer text)
*   **Bolivian Professional Accounting Module:** A comprehensive accounting system compliant with Bolivian tax regulations, including tax calculations (IVA, IT, IUE, RC-IVA), ledger management, and financial reporting.
*   **Backup and Recovery System (NEW):** Comprehensive data protection system accessible only to Super Admins:
    - Manual backup creation with one click
    - Automatic scheduled backups with configurable frequency (daily/weekly/monthly/quarterly/semestral/yearly)
    - Backup retention policy with automatic cleanup of old backups
    - Full recovery/restore functionality with double confirmation and pre-restore backup
    - Backup download capability for external storage
    - Super Admin notifications on backup success/failure
    - Audit logging of all backup operations
    - Backups stored in `/backups/` directory (persisted outside temp folders)

*   **Fully Responsive Design:** The entire application is optimized for all devices and screen sizes:
    - Desktop-first approach with consistent breakpoints: 768px (tablet) and 480px (mobile)
    - Hamburger menu for mobile navigation in Header
    - Responsive tables with horizontal scroll containers for data-heavy sections
    - Touch-friendly accessibility with minimum 44px touch targets
    - CSS organized with global responsive utilities in `index.css` and page-specific responsive styles scoped to their components (e.g., `.admin-content .data-table`)
    - Tested across iOS, Android, macOS, and Windows viewports

The UI/UX emphasizes a responsive and interactive user experience through React, with a clear separation of frontend and backend concerns.

## External Dependencies
*   **Database:** SQLite (`better-sqlite3`)
*   **Backend Framework:** Express.js
*   **Frontend Framework:** React
*   **Build Tool:** Vite
*   **Authentication:** JSON Web Tokens (JWT)
*   **Email Service:** Gmail integration via Google APIs
*   **Map Libraries:** Leaflet and react-leaflet

## Deployment & Environment Variables

### Required Environment Variables
When deploying this application outside of Replit, configure the following environment variables:

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port (default: 5000) | Optional |
| `JWT_SECRET` | Secret key for JWT token signing | **Required** |
| `APP_NAME` | Application name | Optional |
| `APP_ENV` | Environment (development/production) | Optional |

### Email Service (Gmail Integration)
The email service uses Replit's Gmail integration. For external deployment, you'll need to configure:
- Google OAuth credentials (Client ID, Client Secret)
- Gmail API access

### Files Excluded from Repository (.gitignore)
- `node_modules/` - Dependencies (run `npm install` after cloning)
- `.env` - Environment variables
- `*.sqlite`, `*.db` - Database files
- `backups/` - Backup files
- `uploads/` - User uploaded files
- `.replit`, `replit.nix` - Replit configuration

### Setup Instructions for New Environment
1. Clone the repository
2. Run `npm install` in root directory
3. Run `npm install` in `client/` directory
4. Run `npm run build` in `client/` directory
5. Configure environment variables
6. Run `node server/index.js` to start the server

### Database
The application uses SQLite. The database file (`almacenes.sqlite`) is auto-created on first run with all required tables and initial data (admin user, legal texts, etc.)