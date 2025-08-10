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
  "http://localhost:5174", // Add the port your frontend is running on
  "http://localhost:3000", // Common alternative port
  "http://localhost:8080", // Another common alternative
  "https://sharekhata.vercel.app",
  "https://sharekhata-git-main-mahemud95.vercel.app",
  "https://sharekhata-mahemud95.vercel.app",
  // Add any additional production URLs here
  ...(process.env.CLIENT_URLS ? process.env.CLIENT_URLS.split(',') : [])
].filter(Boolean); // Remove any empty values

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
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Allow localhost on any port during development
    if (origin.startsWith('http://localhost:')) {
      return callback(null, true);
    }
    
    // Check against allowed origins
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

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Routes
app.use('/auth', authRoutes);
app.use('/ledger', authenticateToken, ledgerRoutes);

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
}); 