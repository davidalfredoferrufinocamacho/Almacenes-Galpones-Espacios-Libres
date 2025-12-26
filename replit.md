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

## Environment Variables
- `PORT` - Server port (default: 5000)
- `JWT_SECRET` - JWT signing secret

## Running the Project
```bash
node server/index.js
```

## Recent Changes
- 2025-12-26: Complete frozen contractual data implementation
  - Added 11 FROZEN fields to reservations and contracts tables
  - payments.js captures full snapshot at deposit time
  - contracts.js uses ONLY frozen data (no live space reads)
  - SQLite triggers prevent UPDATE/DELETE on frozen fields
  - Audit logging with IP, user-agent, timestamp
- 2025-12-26: Corrected email to admin@almacenes-galpones-espacios-libres.com
- 2025-12-26: Replaced all "AlmacenesBO" with "Almacenes, Galpones, Espacios Libres"
