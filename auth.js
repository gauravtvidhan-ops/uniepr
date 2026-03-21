const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'uniepr-dev-secret-change-in-prod';

function authMiddleware(req, res, next) {
  const token = req.cookies?.token || req.headers?.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role))
      return res.status(403).json({ error: 'Access denied' });
    next();
  };
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role,
      class_name: user.class_name, subjects: user.subjects },
    SECRET,
    { expiresIn: '7d' }
  );
}

module.exports = { authMiddleware, requireRole, signToken };
