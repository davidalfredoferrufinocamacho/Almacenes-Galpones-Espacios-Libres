# Almacenes, Galpones, Espacios Libres

## Overview
Plataforma web para la intermediación tecnológica de alquiler temporal de almacenes, galpones y espacios libres en Bolivia.

## Project Architecture
- **Language**: Node.js 20
- **Server**: Native HTTP server (no external dependencies)
- **Frontend**: Static HTML/CSS served from `/public`
- **Port**: 5000 (bound to 0.0.0.0)

## Directory Structure
```
/
├── src/
│   └── index.js      # Main server file
├── public/
│   ├── index.html    # Landing page
│   └── styles.css    # Stylesheet
├── database/         # SQLite database (future)
├── package.json      # Project configuration
└── .env.example      # Environment variables template
```

## Environment Variables
- `PORT` - Server port (default: 5000)
- `APP_NAME` - Application name
- `APP_ENV` - Environment (development/production)

## Running the Project
```bash
node src/index.js
```

## Recent Changes
- 2025-12-26: Initial project setup with Node.js web server and landing page
