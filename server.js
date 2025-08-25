const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const ledgerRoutes = require('./routes/ledger');
const { authenticateToken } = require('./middleware/auth');

const app = express();
const server = http.createServer(app);

// CORS configuration
const allowedOrigins = [
  process.env.CLIENT_URL || "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
  "http://localhost:8080",
  "https://sharekhata.vercel.app",
  "https://sharekhata-git-main-mahemud95.vercel.app",
  "https://sharekhata-mahemud95.vercel.app",
  ...(process.env.CLIENT_URLS ? process.env.CLIENT_URLS.split(',') : [])
].filter(Boolean);

const io = socketIo(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  }
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    if (origin.startsWith('http://localhost:')) {
      return callback(null, true);
    }
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());

// IMPROVED RATE LIMITING CONFIGURATION
// =================================

// 1. Strict Authentication Rate Limiter
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Only 10 auth attempts per 15 minutes
  message: {
    error: 'Too many authentication attempts. Please try again later.',
    retryAfter: Math.ceil(15 * 60 / 60) // minutes
  },
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,
  // Skip successful requests (optional)
  skipSuccessfulRequests: false,
  // Custom key generator (optional - can track by IP + user agent)
  keyGenerator: (req) => {
    return req.ip + ':' + (req.get('User-Agent') || '');
  }
});

// 2. General API Rate Limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Increased for legitimate API usage
  message: {
    error: 'Too many requests. Please slow down.',
    retryAfter: Math.ceil(15 * 60 / 60)
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Don't count successful GET requests as heavily
  skip: (req, res) => {
    return req.method === 'GET' && res.statusCode < 400;
  }
});

// 3. Ledger-specific Rate Limiter (for high-frequency operations)
const ledgerLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes window for more frequent operations
  max: 150, // Higher limit for ledger operations
  message: {
    error: 'Too many ledger operations. Please wait before making more changes.',
    retryAfter: Math.ceil(5 * 60 / 60)
  },
  standardHeaders: true,
  legacyHeaders: false
});

// 4. Global Fallback Limiter (very generous, catches edge cases)
const globalLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 1000, // Very high limit
  message: {
    error: 'Hourly limit exceeded. Contact support if you need higher limits.',
    retryAfter: 60
  }
});

// APPLY RATE LIMITERS IN ORDER OF SPECIFICITY
// ==========================================

// Apply global limiter first (most generous)
app.use(globalLimiter);

// Apply specific limiters to routes
app.use('/auth/login', authLimiter);
app.use('/auth/register', authLimiter);
app.use('/auth/forgot-password', authLimiter);
app.use('/auth/reset-password', authLimiter);

// Apply ledger-specific limiter
app.use('/ledger', ledgerLimiter);

// Apply general API limiter to remaining routes
app.use(apiLimiter);

// ALTERNATIVE APPROACH: Dynamic Rate Limiting
// =========================================
/*
const dynamicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: (req) => {
    // Different limits based on route
    if (req.path.includes('/auth/')) return 10;
    if (req.path.includes('/ledger/')) return 150;
    return 100;
  },
  message: (req) => {
    const isAuth = req.path.includes('/auth/');
    return {
      error: isAuth 
        ? 'Too many authentication attempts. Please try again later.'
        : 'Rate limit exceeded. Please slow down.',
      retryAfter: 15
    };
  }
});
*/

// ERROR HANDLING FOR RATE LIMITS
// =============================
app.use((err, req, res, next) => {
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ 
      error: 'CORS: Origin not allowed',
      origin: req.get('Origin') 
    });
  }
  
  // Handle other errors
  console.error('Error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Routes
app.use('/auth', authRoutes);
app.use('/ledger', authenticateToken, ledgerRoutes);

// Health check endpoint (not rate limited)
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('🔌 SOCKET CONNECTED:', socket.id);

  socket.on('join-ledger', (ledgerId) => {
    console.log('📋 JOIN LEDGER:', { socketId: socket.id, ledgerId });
    socket.join(ledgerId);
    console.log(`✅ User ${socket.id} joined ledger ${ledgerId}`);
  });

  socket.on('leave-ledger', (ledgerId) => {
    console.log('📋 LEAVE LEDGER:', { socketId: socket.id, ledgerId });
    socket.leave(ledgerId);
    console.log(`✅ User ${socket.id} left ledger ${ledgerId}`);
  });

  socket.on('disconnect', () => {
    console.log('🔌 SOCKET DISCONNECTED:', socket.id);
  });
});

// Make io available to routes
app.set('io', io);

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://mahemud:mahemud@cluster0.y3zrjtm.mongodb.net/sharekhata')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Allowed CORS origins:', allowedOrigins);
  console.log('Rate limiting configuration:');
  console.log('- Auth endpoints: 10 requests per 15 minutes');
  console.log('- Ledger endpoints: 150 requests per 5 minutes');
  console.log('- General API: 200 requests per 15 minutes');
  console.log('- Global fallback: 1000 requests per hour');
});