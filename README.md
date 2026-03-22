# UniEPR — Smart Lecture Capture System

> **Teacher boards pe padhao. Students ko PDF milti hai. Automatically.**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Railway-blueviolet?style=for-the-badge)](https://uniepr-production.up.railway.app)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green?style=for-the-badge&logo=node.js)](https://nodejs.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-blue?style=for-the-badge&logo=postgresql)](https://postgresql.org)
[![Socket.io](https://img.shields.io/badge/Socket.io-Realtime-black?style=for-the-badge&logo=socket.io)](https://socket.io)

---

## The Problem

Every day in colleges across India:

- Teachers write on smartboards — students scramble to copy notes
- "Sir notes bhejo WhatsApp pe" — every student, every class
- Students who miss class have no way to get the content
- Teachers waste time re-sharing, re-explaining, re-sending

**Notes sharing is broken. We fixed it.**

---

## The Solution

UniEPR captures every lecture automatically and delivers a clean PDF to every student's dashboard — the moment class ends.

```
Teacher starts lecture → shares smartboard screen
         ↓
Teacher uses phone to capture slides (one tap)
         ↓
Teacher ends lecture
         ↓
System generates PDF from all captured slides
         ↓
PDF appears on every student's dashboard instantly
```

**Zero extra effort for teachers. Zero missed notes for students.**

---

## Live Demo

Live: https://uniepr-production.up.railway.app

| Role | Email | Password |
|------|-------|----------|
| Teacher | teacher@demo.com | teacher123 |
| Student | student@demo.com | student123 |

Try it:
1. Login as Teacher → Start a lecture → Open `/capture` on your phone
2. Tap Capture a few times on your phone
3. End lecture → PDF generates
4. Login as Student → See the PDF instantly

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  CLIENT SIDE                     │
│                                                  │
│  Smartboard          Phone         Student       │
│  teacher.html    capture.html   student.html     │
│  Screen Share +   One-tap       View & Download  │
│  PDF Generation   Capture       PDF Dashboard    │
└──────────┬──────────────┬──────────────┬─────────┘
           │              │              │
           ▼              ▼              ▼
┌─────────────────────────────────────────────────┐
│             SERVER (Node.js + Express)           │
│                                                  │
│  REST API          +       Socket.io             │
│  /api/auth/*               Real-time events      │
│  /api/lecture/start        lecture:started       │
│  /api/lecture/trigger      capture:trigger       │
│  /api/lecture/end          lecture:ended         │
│  /api/lectures             PDF notification      │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
           ┌───────────────────────┐
           │  PostgreSQL Database  │
           │  users + lectures     │
           └───────────────────────┘
```

---

## Key Features

### For Teachers
- One-click lecture start
- Phone as wireless remote — tap to capture from phone, smartboard captures automatically
- Real-time slide strip with thumbnails
- PDF preview before uploading

### For Students
- Instant PDF delivery — appears the moment teacher ends lecture
- Subject-wise filtering — only see lectures for your subjects
- NEW badge for unread lectures
- In-browser PDF viewer + download
- Real-time notification when new lecture arrives

### Auth & Security
- JWT-based authentication with HTTP-only cookies
- Role-based access control (Teacher / Student)
- Subject-wise content filtering per student
- bcrypt password hashing

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express |
| Real-time | Socket.io |
| Database | PostgreSQL |
| Auth | JWT + bcryptjs |
| PDF Generation | jsPDF (client-side, no server cost) |
| Screen Capture | Browser Screen Capture API |
| Hosting | Railway |

---

## Project Structure

```
uniepr/
├── server.js           # Express + Socket.io + all API routes
├── db.js               # PostgreSQL schema + seed data
├── auth.js             # JWT middleware + role guards
├── package.json
├── .env.example
└── public/
    ├── index.html      # Landing page
    ├── login.html      # Login
    ├── register.html   # Register with subject selection
    ├── teacher.html    # Lecture capture portal (smartboard)
    ├── capture.html    # Mobile remote capture page (phone)
    ├── student.html    # Student PDF dashboard
    ├── css/style.css   # Global dark theme
    └── js/utils.js     # Shared auth + API utilities
```

---

## Run Locally

```bash
git clone https://github.com/gauravtvidhan-ops/uniepr.git
cd uniepr
npm install
cp .env.example .env
# Add DATABASE_URL and JWT_SECRET to .env
npm run dev
```


---

## Impact

| What | Result |
|------|--------|
| Teacher setup time | Less than 2 minutes |
| Extra effort per lecture | Zero (just tap phone) |
| Student wait time for notes | Under 30 seconds after class |
| Works on any smartboard | Yes, any Chrome browser |

---

Built for students who deserve better notes.
