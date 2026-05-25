# GuardianPath AI

GuardianPath AI is an AI-powered real-time safety navigation and emergency response MVP. This repository is organized as a two-app workspace:

- `frontend`: React + Vite + Tailwind CSS client
- `server`: Node.js + Express + MongoDB + Socket.IO API

## Step 1 Features

- React + Vite frontend scaffold
- Express backend scaffold using MVC-style folders
- MongoDB Atlas connection helper
- Environment variable examples for frontend and backend
- API health route for frontend/backend connectivity
- Socket.IO server bootstrap for later live tracking features
- Tailwind CSS and responsive starter UI
- Root scripts for running frontend and backend together

## Step 2 Features

- User signup and login
- Password hashing with bcrypt
- JWT token creation and validation
- Protected `/dashboard` route
- Authenticated `/api/auth/me` endpoint
- Trusted guardian contact storage
- Logout from the frontend session

## Step 3 Features

- Leaflet + OpenStreetMap dashboard map
- Browser geolocation with `watchPosition`
- Current-location marker with auto-center
- Live latitude, longitude, accuracy, and timestamp updates
- Manual pause/start tracking control
- Responsive map and coordinate panel

## Step 4 Features

- JWT-authenticated Socket.IO connections
- Live coordinate emit every few seconds from the dashboard
- Backend `location-update` handling and MongoDB `currentLocation` updates
- Connected users snapshot
- Private user and guardian rooms
- Socket handlers for `danger-alert`, `sos-alert`, `guardian-joined`, and user disconnects

## Step 5 Features

- Destination search with OpenStreetMap Nominatim
- Route alternatives with OSRM public routing
- Safety scoring utility using demo risk zones
- Route comparison engine for score, distance, and ETA
- Safest route highlighting on the Leaflet map
- Destination marker and selectable route cards

## Step 6 Features

- Local crime-risk dataset for MVP danger zones
- Geo-distance calculation around the user location
- Risk score and LOW/MEDIUM/HIGH/CRITICAL classification
- Danger-zone circles on the Leaflet map
- Frontend warning panel when entering HIGH or CRITICAL zones
- Short alarm tone for danger alerts
- Realtime `danger-alert` socket emit for guardians/backend listeners

## Step 7 Features

- SOS emergency button in the dashboard
- MongoDB emergency log records
- Live location attached to each SOS event
- Guardian contact snapshot attached to the emergency
- Active emergency popup UI
- Resolve or cancel emergency status
- Realtime `sos-alert` socket emit for guardian rooms

## Step 8 Features

- Twilio SMS service for trusted guardians
- Emergency SMS includes a Google Maps location link
- SMS status is saved on each emergency record
- Failed or skipped SMS alerts can be retried
- SOS still works safely when Twilio credentials are not configured

## Installation

```bash
npm install
```

On this Windows machine, if PowerShell blocks `npm`, use:

```bash
npm.cmd install
npm.cmd run dev
```

## Environment Setup

Create local env files from the examples:

```bash
copy server\.env.example server\.env
copy frontend\.env.example frontend\.env
```

The local `server/.env` file stores your MongoDB Atlas URI and development secrets. Do not commit `.env` files.

The map uses OpenStreetMap tiles through Leaflet, so no billing account or map token is required.
Route planning uses public Nominatim and OSRM endpoints for MVP development, so avoid heavy automated request traffic.
Location access works on `localhost` during development. In production, browser geolocation requires HTTPS.

Twilio SMS requires real values in `server/.env`:

```env
TWILIO_ACCOUNT_SID=your_real_account_sid
TWILIO_AUTH_TOKEN=your_real_auth_token
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
```

If those values are placeholders, SOS records are still created and SMS alerts are marked `SKIPPED`.

## Run Commands

Run both apps in development mode:

```bash
npm run dev
```

Use this while building the MVP. `npm run build` is only for creating the production frontend bundle.

Run only the backend:

```bash
npm run dev:backend
```

Run only the frontend:

```bash
npm run dev:frontend
```

Default URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:5000`
- Health API: `http://localhost:5000/api/health`

## API Routes

```text
POST /api/auth/signup
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
PUT  /api/auth/guardian-contacts
POST /api/emergencies/sos
GET  /api/emergencies
POST /api/emergencies/:emergencyId/retry-sms
PATCH /api/emergencies/:emergencyId/resolve
GET  /api/health
```

## Socket Events

```text
user-connected
connected-users
location-update
guardian-joined
danger-alert
sos-alert
user-disconnected
disconnect
```

## Project Structure

```text
GuardianPath-AI/
  frontend/
    src/
      components/
      context/
      hooks/
      pages/
      services/
      sockets/
      utils/
  server/
    config/
    controllers/
    middleware/
    models/
    routes/
    services/
    sockets/
    utils/
```

## Next Step

Step 9 will add live guardian tracking dashboards.
"# GuardianPath-AI" 
