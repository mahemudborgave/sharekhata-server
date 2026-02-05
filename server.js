const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');

// const rateLimit = require('express-rate-limit'); // Commented out
require('dotenv').config();

const authRoutes = require('./routes/auth');
const ledgerRoutes = require('./routes/ledger');
const personalExpenseRoutes = require('./routes/personalExpense');
const { authenticateToken } = require('./middleware/auth');

const app = express();
const server = http.createServer(app);

// CORS configuration (unchanged)
const allowedOrigins = [
  process.env.CLIENT_URL || "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
  "http://localhost:8080",
  "https://sharekhata.vercel.app",
  "https://sharekhata.live",
  "https://www.sharekhata.live",
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

// ===================================
// ALL RATE LIMITING REMOVED FOR TESTING
// ===================================

console.log('⚠️  WARNING: All rate limiting has been disabled for testing');
console.log('🔍 Monitor server performance and watch for abuse');

// Add request logging to monitor traffic
// app.use((req, res, next) => {
//   console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - IP: ${req.ip}`);
//   next();
// });

// Error handling (simplified - no rate limit errors)
app.use((err, req, res, next) => {
  if (err.message === 'Not allowed by CORS') {
    console.log('❌ CORS Error:', {
      origin: req.get('Origin'),
      ip: req.ip,
      timestamp: new Date().toISOString()
    });
    return res.status(403).json({ 
      error: 'CORS: Origin not allowed',
      origin: req.get('Origin') 
    });
  }
  
  // Log all errors for debugging
  console.error('❌ Server Error:', {
    message: err.message,
    stack: err.stack,
    ip: req.ip,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });
  
  res.status(500).json({ error: 'Internal server error' });
});


app.use('/personal-expense', authenticateToken, personalExpenseRoutes);

// Routes (unchanged)
app.use('/auth', authRoutes);
app.use('/ledger', authenticateToken, ledgerRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    rateLimiting: 'DISABLED'
  });
});

// Socket.IO connection handling (unchanged)
io.on('connection', (socket) => {
  console.log('🔌 SOCKET CONNECTED:', socket.id);

  socket.on('join-ledger', (ledgerId) => {
    // console.log('📋 JOIN LEDGER:', { socketId: socket.id, ledgerId });
    socket.join(ledgerId);
    // console.log(`✅ User ${socket.id} joined ledger ${ledgerId}`);
  });

  socket.on('leave-ledger', (ledgerId) => {
    // console.log('📋 LEAVE LEDGER:', { socketId: socket.id, ledgerId });
    socket.leave(ledgerId);
    // console.log(`✅ User ${socket.id} left ledger ${ledgerId}`);
  });

  socket.on('disconnect', () => {
    console.log('🔌 SOCKET DISCONNECTED:', socket.id);
  });
});

// Make io available to routes
app.set('io', io);

// MongoDB connection with better error handling
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB');
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1); // Exit if DB connection fails
  });

// Monitor MongoDB connection
mongoose.connection.on('disconnected', () => {
  console.log('⚠️  MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  console.log('✅ MongoDB reconnected');
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log('🌐 Allowed CORS origins:', allowedOrigins);
  console.log('⚠️  Rate limiting: COMPLETELY DISABLED');
  console.log('🔍 Request logging: ENABLED');
  console.log('📊 Monitor /health endpoint for server status');
});