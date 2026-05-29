const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const { createTokenSchema, updateTokenSchema } = require('../vaidation/queue.validation');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/queue
// List all active queue tokens
router.get('/', authenticate, async (req, res) => {
  try {
    const { doctorId, status } = req.query;

    const where = {};
    if (doctorId) where.doctorId = doctorId;
    if (status) where.status = status;

    const tokens = await prisma.queueToken.findMany({
      where,
      include: {
        patient: {
          select: { id: true, name: true, phoneNumber: true }
        },
        doctor: {
          select: { id: true, name: true, specialization: true }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    res.json({
      success: true,
      count: tokens.length,
      data: tokens
    });
  } catch (error) {
    console.error('GET /queue error:', error);
    res.status(500).json({ error: 'Failed to retrieve queue' });
  }
});

// POST /api/queue/checkin
// Generate a new queue token for a patient
// CONCURRENCY/RACE CONDITION BUG: Token increment uses aggregate read followed by create.
// Introduce a deliberate asynchronous delay (setTimeout) to force a wide race window
// where concurrent check-ins assign the exact same token number.
router.post('/checkin', authenticate, async (req, res) => {
  try {
    const { data, error } = createTokenSchema.safeParse(req.body);

    if (error) {
      return res.status(400).json({ 
        error: error?.errors?.map(e => e.message).join(', ') 
      });
    }

    const { patientId, doctorId, appointmentId } = data;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Atomic transaction — race condition fix
    const newToken = await prisma.$transaction(async (tx) => {
      const maxResult = await tx.queueToken.aggregate({
        where: { 
          doctorId, 
          createdAt: { gte: today } 
        },
        _max: { tokenNumber: true }
      });

      const nextTokenNumber = (maxResult._max.tokenNumber || 0) + 1;

      return tx.queueToken.create({
        data: {
          tokenNumber: nextTokenNumber,
          patientId,
          doctorId,
          appointmentId: appointmentId || null,
          status: 'WAITING',
          createdAt: today
        },
        include: {
          patient: { select: { id: true, name: true } },
          doctor: { select: { id: true, name: true, specialization: true } }
        }
      });
    });

    if (!newToken) {
      return res.status(400).json({
        success: false,
        message: "new token not created"
      })
    }

    res.status(201).json({
      success: true,
      message: 'Checked in successfully. Token generated.',
      data: {
        tokenNumber: newToken.tokenNumber,
        patient: newToken.patient,
        doctor: newToken.doctor,
        status: newToken.status
      }
    });

  } catch (error) {
    // Unique constraint violation = race condition caught
    if (error.code === 'P2002') {
      return res.status(409).json({ 
        success: false, 
        error: 'Token conflict. Please try again.' 
      });
    }
    
    console.error('Queue check-in error:', error);
    res.status(500).json({ error: 'Check-in failed' });
  }
});

// PATCH /api/queue/:id
// Update token status (WAITING -> CALLING -> COMPLETED / SKIPPED)
router.patch('/:id', authenticate, async (req, res) => {
  try {
    const result = updateTokenSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({ 
        success: false,
        error: result.error.errors.map(e => e.message).join(', ') 
      });
    }

    const { status } = result.data;

    const token = await prisma.queueToken.findUnique({
      where: { id: req.params.id },
      include: { doctor: { select: { id: true, userId: true } } }  
    });

    if (!token) {
      return res.status(404).json({ success: false, error: 'Token not found' });
    }

    const isDoctor = token.doctorId === req.user.id || token.doctor?.userId === req.user.id;
    const isAdmin = req.user.role?.toUpperCase() === 'ADMIN';
    const isReceptionist = req.user.role?.toUpperCase() === 'RECEPTIONIST';

    if (!isDoctor && !isAdmin && !isReceptionist) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const updatedToken = await prisma.queueToken.update({
      where: { id: req.params.id },
      data: { status },
      include: {
        patient: { select: { id: true, name: true } },
        doctor: { select: { id: true, name: true, specialization: true } }
      }
    });

    res.json({
      success: true,
      message: 'Token updated successfully',
      data: updatedToken
    });
  } catch (error) {
    console.error('PATCH /queue/:id error:', error);
    res.status(500).json({ success: false, error: 'Failed to update queue token' });
  }
});

module.exports = router;
