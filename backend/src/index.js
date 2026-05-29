const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser')
const { exec } = require('child_process');

// Load environment variables
dotenv.config({ path: './.env' });

const authRoutes = require('./routes/auth');
const patientRoutes = require('./routes/patients');
const doctorRoutes = require('./routes/doctors');
const appointmentRoutes = require('./routes/appointments');
const queueRoutes = require('./routes/queue');
const reportRoutes = require('./routes/reports');

const app = express();
const PORT = process.env.PORT || 5000;
// BASE_URL='http://localhost:3000'

// Enable CORS for all origins (weak/broad CORS config)
app.use(cors({
  origin: process.env.BASE_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'PUT', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
}));

// Body parser
app.use(express.json());
app.use(cookieParser())
app.use(express.urlencoded({ extended: true }));

// Simple request logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Register routes
app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/reports', reportRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'Hospital Appointment and Queue Management System (HAQMS) Backend API',
    status: 'Running',
    version: '1.0.0-deliberate-bugs'
  });
});

app.use((err, req, res, next) => {
  // 1. Server pe full error log karo (internal use)
  console.error('[CRITICAL-ERROR]:', err);
  
  // 2. Error ID generate karo (tracing ke liye)
  const errorId = crypto.randomUUID();
  
  // 3. Client ko sirf generic response bhejo
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    errorId: errorId  // Support team trace kar sake
  });
});

app.get('/admin/seed', async (req, res) => {
  const secretKey = req.query.key;
  
  // Check secret key so nobody can randomly seed your DB
  if (secretKey !== process.env.SEED_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  exec('npm run prisma:seed', { cwd: __dirname }, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error}`);
      return res.status(500).json({ error: 'Seeding failed', details: stderr });
    }
    res.json({ message: 'Seeding completed!', output: stdout });
  });
});


// Listen on port
app.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(`   HAQMS BACKEND SERVER IS RUNNING ON PORT ${PORT}`);
  console.log(`   ENVIRONMENT: ${process.env.NODE_ENV}`);
  console.log(`===================================================`);
});

// Catch unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Intentionally do not exit process so candidates see unhandled promise logs

  // Development mein crash karo — developer ko pata chale
  process.exit(1);
});
