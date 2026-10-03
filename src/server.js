const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { connectMongo } = require('./config/db');
const apiRoutes = require('./routes/api');
const { initCronScheduler } = require('./services/cronService');

const app = express();
const server = http.createServer(app);

// Connect to MongoDB Atlas Cluster on startup
connectMongo();

// CORS configuration for React Vite frontend & client apps
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Socket.io initialization
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.set('io', io);

io.on('connection', (socket) => {
  console.log(`[Socket.io] Client connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`[Socket.io] Client disconnected: ${socket.id}`);
  });
});

// Root route for Vercel deployment & Health check
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'OK',
    service: 'AI-Based Smart Attendance System Backend API',
    mongodb: 'Connected to MongoDB Atlas Cluster (smartasys.e5pujmm.mongodb.net)',
    endpoints: {
      health: '/health',
      networkStatus: '/api/system/network-status',
      adminLogin: 'POST /api/system/admin-login',
      studentLogin: 'POST /api/students/login',
      studentsList: '/api/students',
      dailyAttendance: '/api/attendance/daily',
      exportCsv: '/api/attendance/export'
    }
  });
});

// API Routes
app.use('/api', apiRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    message: 'Smart Attendance System API is running smoothly.',
    mongodb: 'Connected to MongoDB Atlas Cluster (smartasys.e5pujmm.mongodb.net)'
  });
});

// Production Static Frontend Serving (Express 5 compatible fallback)
const distPath = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(distPath)) {
  console.log('📦 Production build detected! Serving static frontend from frontend/dist...');
  app.use(express.static(distPath));
  
  // SPA Fallback Middleware
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      res.sendFile(path.join(distPath, 'index.html'));
    } else {
      next();
    }
  });
}

// Initialize Cron Scheduler
initCronScheduler(io);

const PORT = process.env.PORT || 5000;

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`\n⚠️  Port ${PORT} is already in use by a running backend process.`);
    console.log(`👉 Access your application at: http://localhost:${PORT}`);
    console.log(`💡 To restart fresh, run: Stop-Process -Name "node" -Force\n`);
  } else {
    console.error('Server error:', err);
  }
});

// Listen on port if not running as serverless function
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  server.listen(PORT, () => {
    console.log(`🚀 Smart Attendance System Backend listening on http://localhost:${PORT}`);
  });
}

// Export for Vercel serverless functions
module.exports = app;
