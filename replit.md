# Almacenes, Galpones, Espacios Libres

## Overview
Plataforma web para la intermediación tecnológica de alquiler temporal de almacenes, galpones y espacios libres en Bolivia.

## Project Architecture
- **Language**: Node.js 20
- **Backend**: Express.js + SQLite (better-sqlite3)
- **Frontend**: React + Vite
- **Port**: 5000 (bound to 0.0.0.0)
- **Email Admin**: admin@almacenes-galpones-espacios-libres.com

## Directory Structure
```
/
├── server/
│   ├── index.js           # Main server entry point
│   ├── config/
│   │   └── database.js    # SQLite configuration and schema
│   ├── routes/
│   │   ├── auth.js        # Authentication endpoints
│   │   ├── payments.js    # Payment/escrow endpoints
│   │   ├── contracts.js   # Contract creation/signing
│   │   └── ...
│   ├── middleware/
│   │   ├── auth.js        # JWT authentication
│   │   └── audit.js       # Audit logging
│   └── utils/
│       ├── helpers.js     # OTP, date calculations
│       └── frozenDataProtection.js  # Immutable data triggers
├── client/
│   ├── src/
│   │   ├── pages/         # React pages
│   │   └── components/    # Reusable components
│   └── dist/              # Built frontend
├── database/
│   └── app.sqlite         # SQLite database
└── uploads/               # User uploaded files
```

## Key Features

### Frozen Contractual Data (IMMUTABLE)
When a deposit is paid, a snapshot of all contractual data is captured:
- Space details, conditions, location
- All pricing per m² (day, week, month, quarter, semester, year)
- Deposit and commission percentages
- Video URL and validated duration
- Timestamp, IP, user-agent of snapshot creation

**These FROZEN fields cannot be modified after creation** (enforced by SQLite triggers).
Changes by HOST after confirmation do NOT affect existing contracts.

### Audit Events
- `CONTRACT_SNAPSHOT_CREATED` - When deposit is paid
- `CONTRACT_CREATED` - When contract is generated from frozen data
- `CONTRACT_PDF_GENERATED` - When PDF is downloaded
- `REFUND_BLOCKED_CONTRACT_SIGNED` - When refund is blocked post-signature
- `LEGAL_IDENTITY_INCOMPLETE` - When contract/invoice blocked due to missing CI/NIT
- `ADMIN_EXPORT_DATA` - When ADMIN exports data
- `ADMIN_CONTACT_RESPONSE` - When ADMIN responds to contact message
- `ADMIN_REFUND_REVIEW` - When ADMIN approves/rejects refund

### Contract PDF Export
- Endpoint: `GET /contracts/:id/pdf`
- Generates PDF with:
  - GUEST and HOST data
  - Frozen space data
  - m², prices, period, conditions
  - Full legal clauses (liability, applicable law, anti-bypass)
- Saved to: `uploads/contracts/`

### Dynamic Legal Text Management (legal_texts table)
All legal texts are now managed dynamically in the database with versioning.

**Legal Text Types (12 types):**
- `aviso_legal` - Legal notice
- `terminos_condiciones` - Terms and conditions
- `privacidad` - Privacy policy
- `pagos_reembolsos` - Payment and refund policy
- `intermediacion` - Technological intermediation declaration
- `anti_bypass_guest` - Anti-bypass clause for GUESTs
- `anti_bypass_host` - Anti-bypass clause for HOSTs
- `disclaimer_contrato` - Contract disclaimer
- `disclaimer_firma` - Signature disclaimer
- `disclaimer_factura` - Invoice disclaimer
- `liability_limitation` - Platform limitation of responsibility
- `applicable_law` - Bolivian law (Civil Code, Commercial Code)

**Version Tracking:**
- Each type can have multiple versions, but only ONE active at a time
- Contracts, invoices, and appointments store frozen legal text snapshots
- PDFs render the version in effect at creation time, not the current version
- Active texts cannot be edited (must deactivate first or create new version)

**Helper Module (server/utils/legalTexts.js):**
- `getLegalClausesForContract()` - Returns all clauses for contract PDF
- `getInvoiceDisclaimer()` - Returns active invoice disclaimer
- `getAntiBypassForRole(role)` - Returns anti-bypass text for GUEST/HOST
- `getActiveLegalText(type)` - Returns active text by type
- `getAllActiveLegalTexts()` - Returns all active texts

**ADMIN Endpoints:**
- `GET /admin/legal-texts` - List all legal texts (with active/inactive filter)
- `POST /admin/legal-texts` - Create new legal text (version auto-incremented)
- `GET /admin/legal-texts/:id` - Get specific legal text
- `PUT /admin/legal-texts/:id` - Update legal text (inactive only)
- `PUT /admin/legal-texts/:id/activate` - Activate (deactivates other versions of same type)
- `PUT /admin/legal-texts/:id/deactivate` - Deactivate

**Audit Events:**
- `LEGAL_TEXT_CREATED` - When new text is created
- `LEGAL_TEXT_UPDATED` - When inactive text is edited
- `LEGAL_TEXT_ACTIVATED` - When text is activated
- `LEGAL_TEXT_DEACTIVATED` - When text is deactivated

### Invoice Generation (PDF Normal)
- Endpoint: `POST /invoices/generate/:contract_id` - Generate invoice
- Endpoint: `GET /invoices/:id/pdf` - Download PDF
- Endpoint: `GET /invoices/my-invoices` - List user's invoices
- Saved to: `uploads/invoices/`
- Audit events: `INVOICE_GENERATED`, `INVOICE_PDF_DOWNLOADED`
- Note: SIAT not implemented (disclaimer included in PDF)

## Environment Variables
- `PORT` - Server port (default: 5000)
- `JWT_SECRET` - JWT signing secret

## Running the Project
```bash
node server/index.js
```

### Admin Panel (ADMIN role only)
All `/admin/*` endpoints require JWT + ADMIN role.

**Endpoints:**
- `GET /admin/dashboard` - Platform statistics
- `GET /admin/users` - List all users
- `PUT /admin/users/:id/status` - Activate/deactivate user
- `GET /admin/spaces` - List all spaces
- `GET /admin/reservations` - List all reservations
- `GET /admin/contracts` - List all contracts
- `GET /admin/payments` - List all payments
- `GET /admin/invoices` - List all invoices
- `GET /admin/config` - View system configuration
- `PUT /admin/config/:key` - Update configuration (deposit_percentage, commission_percentage 0-100%)
- `GET /admin/audit-log` - Audit log with filters (from_date, to_date, user_id, event_type, limit)
- `GET /admin/contact-messages` - List contact messages
- `PUT /admin/contact-messages/:id/respond` - Respond to contact message
- `GET /admin/export/:type` - Export data (users, spaces, reservations, contracts, payments, invoices, audit)
- `GET /admin/payments/deposits/:id` - Detail of specific deposit
- `GET /admin/payments/refunds/:id` - Detail of specific refund
- `GET /admin/refunds/pending` - List pending refunds
- `PUT /admin/refunds/:id/review` - Approve/reject refund (MOCK, administrative status only)
- `GET /admin/accounting/summary` - Accounting summary with date filters (from_date, to_date)

**Accounting Summary returns:**
- Deposits (anticipos), remaining payments, refunds, commissions, host payouts
- Escrow held funds
- Totals: gross income, net after refunds, platform revenue

### Centralized Notification System (notification_templates, notification_log)
All official platform communications are channeled through a centralized notification service.

**Design Principle:**
- Prevents direct HOST ↔ GUEST contact outside the platform
- All communications go through notificationsService.js
- MOCK implementation (console.log) - no real email/SMS/WhatsApp yet

**Notification Events (12 templates seeded):**
- `appointment_requested` - When GUEST requests appointment
- `appointment_accepted` - When HOST accepts appointment
- `appointment_rejected` - When HOST rejects appointment
- `appointment_rescheduled` - When appointment is rescheduled
- `deposit_paid` - When GUEST pays deposit
- `deposit_received` - When HOST receives deposit notification
- `remaining_paid` - When GUEST pays remaining balance
- `remaining_received` - When HOST receives remaining notification
- `contract_created` - When contract is generated
- `contract_signed` - When either party signs
- `refund_processed` - When refund is processed
- `invoice_generated` - When invoice is created

**Template System:**
- Templates stored in notification_templates table
- Variables interpolated using {{variable_name}} syntax
- Supports: recipient_name, space_title, amount, formatted_amount, date, period, etc.
- Channels: email, sms, whatsapp (all MOCK)
- is_active flag controls which templates are used

**Helper Module (server/utils/notificationsService.js):**
- `sendNotification(recipientId, eventType, channel, variables, req)` - Core function
- `notifyAppointmentRequested(appointmentId, req)` - Triggers for appointments
- `notifyAppointmentAccepted/Rejected/Rescheduled(appointmentId, req)`
- `notifyDepositPaid(reservationId, amount, req)` - Triggers for payments
- `notifyRemainingPaid(reservationId, amount, req)`
- `notifyContractCreated(contractId, req)` - Triggers for contracts
- `notifyContractSigned(contractId, signerRole, req)`
- `notifyRefundProcessed(refundId, amount, status, req)`
- `notifyInvoiceGenerated(invoiceId, req)`

**ADMIN Endpoints:**
- `GET /admin/notification-templates` - List templates (with filters: is_active, event_type, channel)
- `GET /admin/notification-templates/:id` - Get specific template
- `POST /admin/notification-templates` - Create new template
- `PUT /admin/notification-templates/:id` - Update template (subject, body)
- `PUT /admin/notification-templates/:id/activate` - Activate template
- `PUT /admin/notification-templates/:id/deactivate` - Deactivate template
- `GET /admin/notification-log` - View notification history (with filters: recipient_id, event_type, channel, from_date, to_date)

**Audit Events:**
- `NOTIFICATION_SENT` - Every notification sent (with recipient_id, event_type, channel, template_id)
- `NOTIFICATION_TEMPLATE_CREATED` - When ADMIN creates template
- `NOTIFICATION_TEMPLATE_UPDATED` - When ADMIN updates template
- `NOTIFICATION_TEMPLATE_ACTIVATED` - When ADMIN activates template
- `NOTIFICATION_TEMPLATE_DEACTIVATED` - When ADMIN deactivates template

### Contract Extensions / Annexes (contract_extensions table)
Extensions do NOT modify the original contract. They create separate annex documents.

**Design Principle:**
- Original contract remains IMMUTABLE after signing
- Extensions are stored in `contract_extensions` table as annexes
- Each extension calculates new end date based on previous extension (or original contract)
- All legal texts (anti-bypass, disclaimer) are frozen at extension time

**Extension Fields (FROZEN):**
- `frozen_anti_bypass_text`, `frozen_anti_bypass_version`, `frozen_anti_bypass_legal_text_id`
- `frozen_disclaimer_text`, `frozen_disclaimer_version`
- `ip_address`, `user_agent` (captured at creation)
- `sqm`, `price_per_sqm_applied` (from original contract)

**Endpoints:**
- `POST /contracts/:id/extend` - Create extension (GUEST only, generates payment + invoice + annex)
- `GET /contracts/extensions` - List user's extensions
- `GET /contracts/extensions/:id` - Get extension details
- `GET /contracts/extensions/:id/pdf` - Download annex PDF

**Extension PDF Contains:**
- Reference to original contract number
- Extension period and amounts
- Frozen anti-bypass clause (reaffirmed)
- Disclaimer text
- IP, user-agent, date

**Invoice Generation:**
- Extensions automatically generate invoices with `invoice_type = 'extension'`
- Invoices linked via `contract_extension_id` field
- Frozen disclaimer captured at creation

**Audit Events:**
- `CONTRACT_EXTENSION_CREATED` - When extension is created
- `CONTRACT_EXTENSION_PDF_GENERATED` - When annex PDF is downloaded
- `INVOICE_GENERATED` - With `invoice_type: 'extension'`

## Recent Changes
- 2025-12-26: Contract Extension System (PASO 12)
  - Original contract NO LONGER modified during extension
  - contract_extensions table stores annexes with frozen legal texts
  - Automatic invoice generation for extensions
  - PDF annex endpoint with anti-bypass reaffirmation
  - Full audit trail for extension operations
- 2025-12-26: Centralized Notification System (PASO 11)
  - Created notification_templates and notification_log tables
  - Built notificationsService.js with sendNotification() and 10 helper functions
  - Seeded 12 default notification templates for all critical events
  - Integrated triggers across appointments, payments, contracts, invoices
  - ADMIN CRUD endpoints for template management
  - Full audit trail for all notification operations
- 2025-12-26: Dynamic Legal Text Management System
  - Created versioned legal_texts table with 12 types
  - ADMIN CRUD endpoints with activation/deactivation logic
  - Helper module (legalTexts.js) for retrieving active texts
  - Contracts, invoices, appointments now use database legal texts
  - Invoices freeze disclaimer text/version at creation (immutability)
  - Audit trail for all legal text operations
- 2025-12-26: Complete frozen contractual data implementation
  - Added 11 FROZEN fields to reservations and contracts tables
  - payments.js captures full snapshot at deposit time
  - contracts.js uses ONLY frozen data (no live space reads)
  - SQLite triggers prevent UPDATE/DELETE on frozen fields
  - Audit logging with IP, user-agent, timestamp
- 2025-12-26: Corrected email to admin@almacenes-galpones-espacios-libres.com
- 2025-12-26: Replaced all "AlmacenesBO" with "Almacenes, Galpones, Espacios Libres"
