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
*   **Admin Panel:** A comprehensive admin interface provides tools for managing users, spaces, reservations, contracts, payments, invoices, system configuration, audit logs, and an accounting summary.
*   **Map Search:** Interactive map search using Leaflet/react-leaflet allows users to find spaces by geographic location. Spaces with latitude/longitude coordinates are displayed as pins on a map centered on Bolivia. The GET /api/spaces/map endpoint filters by geographic bounds.

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