# 📍 Nexus Tracker — Family & Group GPS Location Safety

> A real-time, family- and group-oriented location tracking and safety application built with React, Vite, Leaflet, and Firebase.

Designed for families, parents, children, travel groups, and friends to stay connected, safe, and aware of each other's whereabouts.

---

## ✨ Features

- **👨‍👩‍👧‍👦 Family Circles & Groups**: Join or create a family group using a simple 6-character Circle Code. One-click code copying and sharing via WhatsApp, SMS, or link.
- **🗺️ Live Interactive Map**:
  - Custom member markers displaying avatars, roles, names, battery %, and status halos.
  - Multi-layer support: Standard Streets, Satellite Imagery, and Modern Dark maps.
  - "Fit All Members" and "Center on Me" quick actions.
  - One-tap directions to any family member directly via Google Maps or Apple Maps.
- **🏡 Safe Places & Geofencing**:
  - Add places like "Home 🏠", "School 🏫", "Work 🏢", or "Grandma's 🏡" with custom radii (100m, 250m, 500m, 1000m).
  - Automatically identifies when members arrive at or leave safe zones.
- **🚨 Emergency SOS System**:
  - One-tap SOS button with a safety countdown guard.
  - Instant high-priority alert broadcast to all circle members with coordinates and immediate navigation buttons.
- **💬 Family Check-ins & Feed**:
  - 1-tap quick status updates ("Arrived safely 🏡", "Heading home 🚗", "Need a ride 🙋", "Running late ⏱️").
  - Live activity feed showing updates and relative timestamps.
- **⏱️ Location History & Trip Timeline**:
  - Chronological movement history with timestamps, speeds, and place names.
  - Total distance logged calculation.
- **🔋 Device & Battery Intelligence**:
  - Real-time battery status and charging indicators (via Browser Battery API with graceful fallbacks).
  - Movement status (Stationary, Walking, Cycling, Driving).
- **🔒 Privacy Controls**:
  - "Pause Location Sharing" toggle for privacy whenever needed.
- **✨ Instant Demo Mode**:
  - Test and explore all features immediately with simulated family members (Mom, Dad, Kid) without needing multiple physical devices!

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js**: v18 or higher
- **npm** or **pnpm**

### 2. Installation
```bash
npm install
```

### 3. Run Locally
```bash
npm run dev
```

Open your browser at `http://localhost:3000`.

---

## 📱 Background Tracking Guide

### Android (Chrome / Firefox)
1. Tap the site info/lock icon in your browser address bar &gt; **Permissions** &gt; **Location**.
2. Set Location permission to **"Allow all the time"** (or "Allow while using app").
3. Go to Android Settings &gt; Apps &gt; Browser &gt; Battery &gt; Set to **"Unrestricted"**.
4. Disable Battery Saver mode for uninterrupted updates.

### iOS (Safari)
1. Tap the **Share** button in Safari &gt; **"Add to Home Screen"** to install as a standalone web app.
2. Ensure Location Services are turned on in iOS Settings &gt; Privacy & Security &gt; Location Services &gt; Safari.

---

## 🛠️ Tech Stack
- **Frontend**: React 19, TypeScript, Tailwind CSS
- **Map & Geodata**: Leaflet, React-Leaflet, Open-Meteo Weather API
- **Backend**: Firebase Firestore & Realtime Sync
- **Icons**: Lucide React
- **Build Tool**: Vite 6
