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

### Legal Clauses (LEGAL_CLAUSES constant)
- `liability_limitation` - Platform limitation of responsibility
- `applicable_law` - Bolivian law (Civil Code, Commercial Code)
- `intermediary` - Technological intermediation clause
- `anti_bypass` - Anti-bypass clause

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

## Recent Changes
- 2025-12-26: Complete frozen contractual data implementation
  - Added 11 FROZEN fields to reservations and contracts tables
  - payments.js captures full snapshot at deposit time
  - contracts.js uses ONLY frozen data (no live space reads)
  - SQLite triggers prevent UPDATE/DELETE on frozen fields
  - Audit logging with IP, user-agent, timestamp
- 2025-12-26: Corrected email to admin@almacenes-galpones-espacios-libres.com
- 2025-12-26: Replaced all "AlmacenesBO" with "Almacenes, Galpones, Espacios Libres"
