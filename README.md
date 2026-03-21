# UniEPR — Lecture Capture System

Teacher smartboard pe screen share karta hai → slides capture karta hai → PDF ban ke students ke dashboard pe aa jaati hai.

---

## 🚀 Railway pe Deploy kaise karein (Free)

### Step 1 — GitHub pe daalo
```bash
cd uniepr
git init
git add .
git commit -m "UniEPR v2 — lecture capture system"
# GitHub pe naya repo banao, phir:
git remote add origin https://github.com/YOUR_USERNAME/uniepr.git
git push -u origin main
```

### Step 2 — Railway pe jao
1. **railway.app** pe jao → GitHub se login karo
2. **"New Project"** → **"Deploy from GitHub repo"** → apna repo chunao
3. Railway automatically detect karega ki Node.js project hai
4. **Deploy** click karo — 2-3 minute mein live ho jaayega

### Step 3 — PostgreSQL add karo
1. Railway dashboard mein apne project pe jao
2. **"+ New"** → **"Database"** → **"PostgreSQL"** select karo
3. PostgreSQL add hone ke baad, **Variables** tab mein jao
4. `DATABASE_URL` automatically set ho jaayegi ✅

### Step 4 — Environment Variables set karo
Railway dashboard → apna service → **Variables** tab:
```
JWT_SECRET = koi-bhi-lamba-random-string-jaise-uniepr2024secretkey
```

### Step 5 — Done! 🎉
Railway ek URL dega jaise: `https://uniepr-production.up.railway.app`

Yahi URL teachers aur students use karenge.

---

## 💻 Local Development

```bash
# 1. Dependencies install karo
npm install

# 2. .env file banao
cp .env.example .env
# .env mein DATABASE_URL ya DB_ variables set karo

# 3. PostgreSQL locally chahiye (ya Railway ka URL use karo)

# 4. Run karo
npm run dev   # development (auto-restart)
npm start     # production
```

---

## 📁 Project Structure

```
uniepr/
├── server.js          # Express backend + Socket.io
├── db.js              # PostgreSQL setup + schema
├── auth.js            # JWT middleware
├── package.json
├── .env.example
├── uploads/
│   └── lectures/      # PDFs yahan store hongi
└── public/
    ├── index.html     # Landing page
    ├── login.html     # Login page
    ├── register.html  # Register page
    ├── teacher.html   # Teacher portal
    ├── student.html   # Student dashboard
    ├── css/style.css
    └── js/utils.js
```

---

## 👥 Roles & Flow

**Teacher:**
1. `/login` → teacher@demo.com / teacher123
2. Title, subject, class bharo
3. "Lecture Shuru Karo" → screen share select karo
4. Board pe padhao → "Capture Slide" dabao (ya Spacebar)
5. "Lecture Khatam Karo" → PDF automatically upload

**Student:**
1. `/login` → student@demo.com / student123
2. Dashboard pe apne subjects ke lectures dikhenge
3. "PDF Dekho" → in-browser viewer
4. "⬇" → download

---

## 🔑 Demo Accounts (auto-created)

| Role | Email | Password |
|------|-------|----------|
| Teacher | teacher@demo.com | teacher123 |
| Teacher | teacher2@demo.com | teacher123 |
| Student | student@demo.com | student123 |
| Student | student2@demo.com | student123 |
| Student | student3@demo.com | student123 |

---

## ⚡ Tech Stack

| Layer | Tech |
|-------|------|
| Backend | Node.js + Express |
| Database | PostgreSQL (Railway addon) |
| Real-time | Socket.io |
| Auth | JWT + bcryptjs |
| Screen Capture | Browser Screen Capture API |
| PDF Generation | jsPDF (client-side) |
| File Upload | Multer |
| Hosting | Railway (free tier) |
