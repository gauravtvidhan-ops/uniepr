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

// Multer - organized by subject/unit
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { subject, unit_name } = req.body;
    const safeSubject = (subject || 'General').replace(/[^a-zA-Z0-9 ]/g, '').trim();
    const safeUnit    = (unit_name || 'Unit1').replace(/[^a-zA-Z0-9 ]/g, '').trim();
    const dir = path.join('uploads', 'lectures', safeSubject, safeUnit);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_, __, cb) => cb(null, `${uuidv4()}.pdf`),
});
const upload = multer({ storage, limits: { fileSize: 150 * 1024 * 1024 } });

// Manual PDF upload (no slides, direct file)
const uploadDirect = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const { subject, unit_name } = req.body;
      const safeSubject = (subject || 'General').replace(/[^a-zA-Z0-9 ]/g, '').trim();
      const safeUnit    = (unit_name || 'Unit1').replace(/[^a-zA-Z0-9 ]/g, '').trim();
      const dir = path.join('uploads', 'lectures', safeSubject, safeUnit);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_, __, cb) => cb(null, `${uuidv4()}.pdf`),
  }),
  limits: { fileSize: 150 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Sirf PDF files allowed hain'));
  }
});

const active = {};
const captureCodes = {};
function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ══════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════
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

// ══════════════════════════════════════════════════
//  LECTURE COUNT (auto lecture number)
// ══════════════════════════════════════════════════
app.get('/api/lecture/count', authMiddleware, requireRole('teacher'), async (req, res) => {
  const { subject, unit_name, class_name } = req.query;
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*) as count FROM lectures
       WHERE teacher_id=$1 AND subject=$2 AND unit_name=$3 AND class_name=$4 AND status='completed'`,
      [req.user.id, subject, unit_name, class_name]
    );
    res.json({ next_lecture_no: parseInt(rows[0].count) + 1 });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ══════════════════════════════════════════════════
//  LECTURES
// ══════════════════════════════════════════════════
app.post('/api/lecture/start', authMiddleware, requireRole('teacher'), async (req, res) => {
  const { title, subject, unit_name, lecture_no, class_name } = req.body;
  if (!title || !subject || !class_name) return res.status(400).json({ error: 'Title, subject, class chahiye' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO lectures (title,subject,unit_name,lecture_no,class_name,teacher_id,teacher_name,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'live') RETURNING *`,
      [title, subject, unit_name||'Unit 1', lecture_no||1, class_name, req.user.id, req.user.name]
    );
    const lec = rows[0];
    active[lec.id] = { startTime: Date.now(), slideCount: 0 };
    // Generate unique capture code
    const code = generateCode();
    captureCodes[code] = lec.id;
    setTimeout(() => delete captureCodes[code], 6 * 60 * 60 * 1000); // expire in 6hrs
    io.emit('lecture:started', lec);
    res.json({ success: true, lecture: lec, captureCode: code });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/lecture/slide', authMiddleware, requireRole('teacher'), (req, res) => {
  const { lectureId, slideNumber } = req.body;
  if (active[lectureId]) active[lectureId].slideCount = slideNumber;
  io.emit('lecture:slide', { lectureId, slideNumber });
  res.json({ success: true });
});

app.post('/api/lecture/trigger-capture', authMiddleware, requireRole('teacher'), (req, res) => {
  const { lectureId } = req.body;
  if (!lectureId) return res.status(400).json({ error: 'lectureId required' });
  io.emit('capture:trigger', { lectureId });
  res.json({ success: true });
});

// No-login capture trigger via code
app.get('/api/capture-code/:code', (req, res) => {
  const lectureId = captureCodes[req.params.code.toUpperCase()];
  if (!lectureId) return res.status(404).json({ error: 'Code galat hai ya expire ho gaya' });
  res.json({ success: true, lectureId });
});

app.post('/api/capture-code/:code/trigger', (req, res) => {
  const lectureId = captureCodes[req.params.code.toUpperCase()];
  if (!lectureId) return res.status(404).json({ error: 'Code galat hai ya expire ho gaya' });
  io.emit('capture:trigger', { lectureId });
  res.json({ success: true });
});

app.post('/api/lecture/end', authMiddleware, requireRole('teacher'), upload.single('pdf'), async (req, res) => {
  const { lectureId } = req.body;
  const a = active[lectureId];
  try {
    const mins   = a ? Math.floor((Date.now() - a.startTime) / 60000) : 0;
    const slides = a?.slideCount || 0;
    const pdfPath = req.file
      ? `/uploads/lectures/${req.file.destination.split('lectures/')[1]}/${req.file.filename}`.replace(/\/\//g, '/')
      : null;

    const { rows } = await pool.query(
      `UPDATE lectures SET status='completed', pdf_path=$1, slide_count=$2, duration_min=$3
       WHERE id=$4 AND teacher_id=$5 RETURNING *`,
      [req.file ? `/uploads/${path.relative('uploads', req.file.path).replace(/\\/g,'/')}` : null,
       slides, mins, lectureId, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Lecture nahi mili' });
    delete active[lectureId];
    io.emit('lecture:ended', { lectureId, pdfPath: rows[0].pdf_path, slideCount: slides, durationMin: mins });
    res.json({ success: true, lecture: rows[0] });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// Teacher: Delete lecture
app.delete('/api/lecture/:id', authMiddleware, requireRole('teacher'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM lectures WHERE id=$1 AND teacher_id=$2',
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Lecture nahi mili' });

    // Delete PDF file from disk
    if (rows[0].pdf_path) {
      const filePath = path.join(__dirname, rows[0].pdf_path);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await pool.query('DELETE FROM lectures WHERE id=$1', [req.params.id]);
    io.emit('lecture:deleted', { lectureId: req.params.id });
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// Teacher: Manual PDF upload
app.post('/api/lecture/upload', authMiddleware, requireRole('teacher'), uploadDirect.single('pdf'), async (req, res) => {
  const { title, subject, unit_name, class_name } = req.body;
  if (!title || !subject || !class_name || !req.file)
    return res.status(400).json({ error: 'Title, subject, class aur PDF chahiye' });
  try {
    const pdfPath = `/uploads/${path.relative('uploads', req.file.path).replace(/\\/g,'/')}`;
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) as count FROM lectures WHERE teacher_id=$1 AND subject=$2 AND unit_name=$3 AND class_name=$4`,
      [req.user.id, subject, unit_name||'Unit 1', class_name]
    );
    const lectureNo = parseInt(countRows[0].count) + 1;

    const { rows } = await pool.query(
      `INSERT INTO lectures (title,subject,unit_name,lecture_no,class_name,teacher_id,teacher_name,status,pdf_path,slide_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'completed',$8,0) RETURNING *`,
      [title, subject, unit_name||'Unit 1', lectureNo, class_name, req.user.id, req.user.name, pdfPath]
    );
    io.emit('lecture:ended', { lectureId: rows[0].id, pdfPath });
    res.json({ success: true, lecture: rows[0] });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// Get lectures - subject/unit/date organized
app.get('/api/lectures', authMiddleware, async (req, res) => {
  try {
    let rows;
    if (req.user.role === 'teacher') {
      ({ rows } = await pool.query(
        `SELECT * FROM lectures WHERE teacher_id=$1 ORDER BY subject, unit_name, lecture_no, created_at DESC`,
        [req.user.id]
      ));
    } else {
      const subjects   = req.user.subjects || [];
      const className  = req.user.class_name || '';
      ({ rows } = await pool.query(
        `SELECT * FROM lectures
         WHERE status='completed' AND (class_name=$1 OR subject=ANY($2))
         ORDER BY subject, unit_name, lecture_no, created_at DESC`,
        [className, subjects]
      ));
    }
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/lecture/active', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM lectures WHERE status='live' ORDER BY created_at DESC LIMIT 1`
    );
    res.json(rows[0] || null);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// PAGES
const pub = (f) => path.join(__dirname, 'public', f);
app.get('/',         (_, r) => r.sendFile(pub('index.html')));
app.get('/login',    (_, r) => r.sendFile(pub('login.html')));
app.get('/register', (_, r) => r.sendFile(pub('register.html')));
app.get('/teacher',  (_, r) => r.sendFile(pub('teacher.html')));
app.get('/student',  (_, r) => r.sendFile(pub('student.html')));
app.get('/capture',  (_, r) => r.sendFile(pub('capture.html')));
app.get('/c/:code',  (_, r) => r.sendFile(pub('capture.html')));

// SOCKET
io.on('connection', (s) => {
  console.log(`[WS] ${s.id} connected`);
  s.on('disconnect', () => console.log(`[WS] ${s.id} disconnected`));
});

const PORT = process.env.PORT || 3000;
initDB().then(() => {
  server.listen(PORT, () => console.log(`\n🚀  http://localhost:${PORT}\n`));
}).catch(e => { console.error('DB failed:', e); process.exit(1); });
