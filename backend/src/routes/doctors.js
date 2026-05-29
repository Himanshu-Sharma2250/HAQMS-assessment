const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/doctors
// Retrieve list of doctors with special search filtering
// SECURITY BUG: SQL Injection vulnerability in the search parameter!
// Uses queryRawUnsafe with string concatenation instead of parameterized inputs.
router.get('/', authenticate, async (req, res) => {
  try {
    const { search, specialization } = req.query;

    const where = {};

    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    if (specialization && specialization !== 'All') {
      where.specialization = specialization;
    }

    const doctors = await prisma.doctor.findMany({ where });

    if (!doctors || doctors.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No doctors found matching your criteria"
      });
    }

    res.json({
      success: true,
      count: doctors.length,
      data: doctors
    });
  } catch (error) {
    console.error('GET /doctors error:', error);
    res.status(500).json({ error: 'Failed to retrieve doctors' });
  }
});

// GET /api/doctors/stats
// Returns aggregation details about available doctors
// PERFORMANCE BUG: Sequential async calls instead of Promise.all()
router.get('/stats', authenticate, async (req, res) => {
  try {
    const start = Date.now();

    // run all the queries in parallel unlike before
    const [totalDoctors, surgeonsCount, averageFee, highestExperience] = await Promise.all([
      prisma.doctor.count(),
      prisma.doctor.count({ where: { department: 'Surgery' } }),
      prisma.doctor.aggregate({ _avg: { consultationFee: true } }),
      prisma.doctor.aggregate({ _max: { experience: true } })
    ]);

    const durationMs = Date.now() - start;

    res.json({
      success: true,
      data: {
        total: totalDoctors,
        surgeons: surgeonsCount,
        averageFee: Math.round(averageFee._avg.consultationFee || 0),
        maxExperience: highestExperience._max.experience || 0,
      },
      meta: {
        executionTimeMs: durationMs
      }
    });
  } catch (error) {
    console.error('GET /doctors/stats error:', error);
    res.status(500).json({ error: 'Failed to load doctor statistics' });
  }
});

// GET /api/doctors/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const doctor = await prisma.doctor.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        name: true,
        specialization: true,
        department: true,
        consultationFee: true,
        experience: true,
        availableFrom: true,
        availableTo: true,
        createdAt: true
      }
    });

    if (!doctor) {
      return res.status(404).json({ 
        success: false, 
        error: 'Doctor not found' 
      });
    }

    res.json({
      success: true,
      data: doctor
    });
  } catch (error) {
    console.error('GET /doctors/:id error:', error);
    res.status(500).json({ error: 'Failed to retrieve doctor' });
  }
});

module.exports = router;
