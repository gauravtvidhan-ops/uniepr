const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
    : {
        host:     process.env.DB_HOST     || 'localhost',
        port:     process.env.DB_PORT     || 5432,
        database: process.env.DB_NAME     || 'uniepr',
        user:     process.env.DB_USER     || 'postgres',
        password: process.env.DB_PASS     || '',
      }
);

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      email       TEXT UNIQUE NOT NULL,
      password    TEXT NOT NULL,
      role        TEXT NOT NULL CHECK (role IN ('teacher','student')),
      class_name  TEXT,
      subjects    TEXT[],
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS lectures (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title        TEXT NOT NULL,
      subject      TEXT NOT NULL,
      class_name   TEXT NOT NULL,
      teacher_id   INT REFERENCES users(id) ON DELETE SET NULL,
      teacher_name TEXT NOT NULL,
      status       TEXT DEFAULT 'live' CHECK (status IN ('live','completed')),
      pdf_path     TEXT,
      slide_count  INT DEFAULT 0,
      duration_min INT DEFAULT 0,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Seed demo data if empty
  const { rowCount } = await pool.query('SELECT id FROM users LIMIT 1');
  if (rowCount === 0) {
    const bcrypt = require('bcryptjs');
    const h = (p) => bcrypt.hashSync(p, 10);

    await pool.query(`
      INSERT INTO users (name, email, password, role, class_name, subjects) VALUES
      ('Prof. Sharma',  'teacher@demo.com',  $1, 'teacher', NULL,     ARRAY['Data Structures','Operating Systems','Computer Networks']),
      ('Prof. Verma',   'teacher2@demo.com', $2, 'teacher', NULL,     ARRAY['Machine Learning','Web Technologies']),
      ('Rahul Sharma',  'student@demo.com',  $3, 'student', 'CSE-6A', ARRAY['Data Structures','Operating Systems','Computer Networks']),
      ('Priya Patel',   'student2@demo.com', $4, 'student', 'CSE-6A', ARRAY['Data Structures','Machine Learning']),
      ('Aman Gupta',    'student3@demo.com', $5, 'student', 'CSE-6B', ARRAY['Operating Systems','Computer Networks','Web Technologies'])
    `, [h('teacher123'), h('teacher123'), h('student123'), h('student123'), h('student123')]);

    console.log('[DB] Demo users seeded.');
    console.log('     Teacher  → teacher@demo.com  / teacher123');
    console.log('     Student  → student@demo.com  / student123');
  }

  console.log('[DB] Ready.');
}

module.exports = { pool, initDB };
