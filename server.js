require('dotenv').config();
const express      = require('express');
const http         = require('http');
const { Server }   = require('socket.io');
const multer       = require('multer');
const path         = require('path');
const fs           = require('fs');
const bcrypt       = require('bcryptjs');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');

const { pool, initDB }                           = require('./db');
const { authMiddleware, requireRole, signToken } = require('./auth');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Multer ────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_, __, cb) => {
    const dir = 'uploads/lectures';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_, __, cb) => cb(null, `${uuidv4()}.pdf`),
});
const upload = multer({ storage, limits: { fileSize: 150 * 1024 * 1024 } });

// active lectures in memory: id → { startTime, slideCount }
const active = {};

// ══════════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════════
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email aur password chahiye' });
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [email.trim().toLowerCase()]);
    const user = rows[0];
    if (!user || !bcrypt.compareSync(password, user.password))
      return res.status(401).json({ error: 'Email ya password galat hai' });
    const token = signToken(user);
    res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 864e5 })
       .json({ success: true, user: { id: user.id, name: user.name, role: user.role, class_name: user.class_name, subjects: user.subjects } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, role, class_name, subjects } = req.body;
  if (!name || !email || !password || !role) return res.status(400).json({ error: 'Sab fields bharein' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const subArr = Array.isArray(subjects) ? subjects : (subjects ? subjects.split(',').map(s=>s.trim()) : []);
    const { rows } = await pool.query(
      'INSERT INTO users (name,email,password,role,class_name,subjects) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [name.trim(), email.trim().toLowerCase(), hash, role, class_name||null, subArr]
    );
    const token = signToken(rows[0]);
    res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 864e5 })
       .json({ success: true, user: { id: rows[0].id, name: rows[0].name, role: rows[0].role } });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Yeh email already registered hai' });
    console.error(e); res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/logout', (_, res) => res.clearCookie('token').json({ success: true }));
app.get('/api/auth/me', authMiddleware, (req, res) => res.json({ user: req.user }));

// ══════════════════════════════════════════════════════════
//  LECTURES
// ══════════════════════════════════════════════════════════

// Teacher: start
app.post('/api/lecture/start', authMiddleware, requireRole('teacher'), async (req, res) => {
  const { title, subject, class_name } = req.body;
  if (!title || !subject || !class_name) return res.status(400).json({ error: 'Title, subject, class chahiye' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO lectures (title,subject,class_name,teacher_id,teacher_name,status)
       VALUES ($1,$2,$3,$4,$5,'live') RETURNING *`,
      [title, subject, class_name, req.user.id, req.user.name]
    );
    const lec = rows[0];
    active[lec.id] = { startTime: Date.now(), slideCount: 0 };
    io.emit('lecture:started', lec);
    console.log(`[LIVE] "${title}" — ${req.user.name} — ${class_name}`);
    res.json({ success: true, lecture: lec });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// Teacher: slide count update
app.post('/api/lecture/slide', authMiddleware, requireRole('teacher'), (req, res) => {
  const { lectureId, slideNumber } = req.body;
  if (active[lectureId]) active[lectureId].slideCount = slideNumber;
  io.emit('lecture:slide', { lectureId, slideNumber });
  res.json({ success: true });
});

// Teacher: end + PDF upload
app.post('/api/lecture/end', authMiddleware, requireRole('teacher'), upload.single('pdf'), async (req, res) => {
  const { lectureId } = req.body;
  const a = active[lectureId];
  try {
    const mins = a ? Math.floor((Date.now() - a.startTime) / 60000) : 0;
    const slides = a?.slideCount || 0;
    const pdfPath = req.file ? `/uploads/lectures/${req.file.filename}` : null;

    const { rows } = await pool.query(
      `UPDATE lectures SET status='completed', pdf_path=$1, slide_count=$2, duration_min=$3
       WHERE id=$4 AND teacher_id=$5 RETURNING *`,
      [pdfPath, slides, mins, lectureId, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Lecture nahi mili' });

    delete active[lectureId];
    io.emit('lecture:ended', { lectureId, pdfPath, slideCount: slides, durationMin: mins, subject: rows[0].subject, class_name: rows[0].class_name });
    console.log(`[DONE] "${rows[0].title}" — ${mins}min, ${slides} slides`);
    res.json({ success: true, lecture: rows[0] });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// Student: get lectures for their subjects + class
app.get('/api/lectures', authMiddleware, async (req, res) => {
  try {
    let rows;
    if (req.user.role === 'teacher') {
      // Teacher sees their own lectures
      ({ rows } = await pool.query(
        `SELECT * FROM lectures WHERE teacher_id=$1 ORDER BY created_at DESC`,
        [req.user.id]
      ));
    } else {
      // Student sees lectures matching their subjects OR their class
      const subjects = req.user.subjects || [];
      const className = req.user.class_name || '';
      ({ rows } = await pool.query(
        `SELECT * FROM lectures
         WHERE status='completed'
           AND (class_name=$1 OR subject=ANY($2))
         ORDER BY created_at DESC`,
        [className, subjects]
      ));
    }
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// Active lecture
app.get('/api/lecture/active', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM lectures WHERE status='live' ORDER BY created_at DESC LIMIT 1`
    );
    res.json(rows[0] || null);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ── Pages ─────────────────────────────────────────────────
const pub = (f) => path.join(__dirname, 'public', f);
app.get('/',         (_, r) => r.sendFile(pub('index.html')));
app.get('/login',    (_, r) => r.sendFile(pub('login.html')));
app.get('/register', (_, r) => r.sendFile(pub('register.html')));
app.get('/teacher',  (_, r) => r.sendFile(pub('teacher.html')));
app.get('/student',  (_, r) => r.sendFile(pub('student.html')));

// ── Socket ────────────────────────────────────────────────
io.on('connection', (s) => {
  console.log(`[WS] ${s.id} connected`);
  s.on('disconnect', () => console.log(`[WS] ${s.id} disconnected`));
});

// ── Boot ──────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
initDB().then(() => {
  server.listen(PORT, () => {
    console.log(`\n🚀  http://localhost:${PORT}`);
    console.log(`    /login  /register  /teacher  /student\n`);
  });
}).catch(e => { console.error('DB failed:', e); process.exit(1); });
