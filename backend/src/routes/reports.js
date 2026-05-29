const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/reports/doctor-stats
// Highly inefficient nested loop aggregate reporting for admin/receptionists dashboard
// PERFORMANCE BUG: Performs multiple nested DB queries inside a loop for every doctor.
// Runs sequentially, blocking/scaling terrible with doctors count.

router.get('/doctor-stats', authenticate, async (req, res) => {
  try {
    const start = Date.now();

    // Authorization check
    if (!['ADMIN', 'RECEPTIONIST'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Single query with groupBy — N+1 fix!
    const doctors = await prisma.doctor.findMany({
      select: {
        id: true,
        name: true,
        specialization: true,
        department: true,
        consultationFee: true,
        _count: {
          select: {
            appointments: true,
            queueTokens: {
              where: { createdAt: { gte: today } }
            }
          }
        }
      }
    });

    // Appointment status counts — single aggregate query
    const appointmentStats = await prisma.appointment.groupBy({
      by: ['doctorId', 'status'],
      where: { status: { in: ['COMPLETED', 'CANCELLED'] } },
      _count: { id: true }
    });

    // Map stats to doctors
    const statsMap = {};
    appointmentStats.forEach(stat => {
      if (!statsMap[stat.doctorId]) statsMap[stat.doctorId] = {};
      statsMap[stat.doctorId][stat.status] = stat._count.id;
    });

    const reportData = doctors.map(doc => ({
      id: doc.id,
      name: doc.name,
      specialization: doc.specialization,
      department: doc.department,
      totalAppointments: doc._count.appointments,
      completedAppointments: statsMap[doc.id]?.COMPLETED || 0,
      cancelledAppointments: statsMap[doc.id]?.CANCELLED || 0,
      todayQueueSize: doc._count.queueTokens,
      revenue: (statsMap[doc.id]?.COMPLETED || 0) * doc.consultationFee
    }));

    const durationMs = Date.now() - start;

    res.json({
      success: true,
      timeTakenMs: durationMs,
      data: reportData
    });

  } catch (error) {
    console.error('GET /doctor-stats error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

module.exports = router;
