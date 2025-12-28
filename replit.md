# Almacenes, Galpones, Espacios Libres

## Overview
This project is a web platform for the technological intermediation of temporary rental of warehouses, sheds, and free spaces in Bolivia. Its main purpose is to connect individuals and businesses with available spaces, streamlining the rental process through an online portal. The platform aims to provide a robust, transparent, and legally compliant system for both hosts and guests, incorporating features for immutable contract data, dynamic legal text management, and a centralized notification system. The business vision is to modernize and formalize the temporary space rental market in Bolivia.

## User Preferences
I want the agent to use a formal and professional tone. When making significant changes or architectural decisions, please ask for confirmation first. I prefer clear and concise explanations for any proposed solutions or code modifications. Do not make changes to the `uploads/` folder.

## System Architecture
The project utilizes a Node.js 20 backend with Express.js and SQLite for data persistence, while the frontend is built with React and Vite. Key architectural decisions and features include:

*   **Immutable Contractual Data:** Contract details are frozen post-deposit to ensure legal and financial integrity.
*   **Dynamic Legal Text Management:** All legal texts are database-managed with version control, ensuring contracts and invoices reflect active legal terms at creation.
*   **Centralized Notification System:** Official platform communications are handled via parameterized templates, preventing direct host-guest contact.
*   **Audit Logging:** Critical events are comprehensively logged for security and compliance.
*   **Contract PDF Export & Invoice Generation:** Legally compliant PDF documents are generated from platform data.
*   **Contract Extensions/Annexes:** Extensions create separate annexes referencing the original contract without modifying it.
*   **Anti-Bypass Clause:** Enforced for both guests and hosts to protect platform commissions.
*   **Email Verification System:** New user registration requires email verification for account activation.
*   **Admin Panel:** A comprehensive interface for managing users (Clients/Hosts), spaces, reservations, contracts, payments, legal texts, notifications, and system configuration, with role-based access and audit logging.
*   **Dynamic Payment Methods:** Payment options are configurable and manageable via the admin panel.
*   **Map Search:** Interactive map functionality using Leaflet allows geographic space discovery.
*   **Client Portal (Portal del Cliente):** A dedicated dashboard for guests to manage reservations, contracts, payments, invoices, favorites, and profile, including account deletion with safety checks.
*   **Owner Portal (Portal de Propietarios):** A dedicated dashboard for hosts to manage spaces (CRUD), reservations, earnings, calendar, statements, and profile, also including account deletion with safety checks.
*   **Editable Site Configuration:** Contact information and footer content are dynamically managed via the admin panel.
*   **Bolivian Professional Accounting Module:** A comprehensive accounting system compliant with Bolivian tax regulations, including tax calculations (IVA, IT, IUE, RC-IVA), ledger management, and financial reporting.

The UI/UX emphasizes a responsive and interactive user experience through React, with a clear separation of frontend and backend concerns.

## External Dependencies
*   **Database:** SQLite (`better-sqlite3`)
*   **Backend Framework:** Express.js
*   **Frontend Framework:** React
*   **Build Tool:** Vite
*   **Authentication:** JSON Web Tokens (JWT)
*   **Email Service:** Gmail integration via Google APIs
*   **Map Libraries:** Leaflet and react-leaflet