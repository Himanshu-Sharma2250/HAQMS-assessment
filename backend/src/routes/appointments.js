const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const { getAppointmentSchema, createAppointmentSchema, updateAppointmentSchema } = require('../vaidation/appointment.validation');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/appointments
// List all appointments
// PERFORMANCE BUG: Classic N+1 Query Issue!
// Instead of using Prisma's include, it loops through each appointment and executes
// individual select statements for Patient and Doctor details.
router.get('/', authenticate, async (req, res) => {
  try {
    const {data, error} = getAppointmentSchema.safeParse(req.params);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    const { doctorId, status } = data;

    const where = {};
    if (doctorId) where.doctorId = doctorId;
    if (status) where.status = status;

    // FIX: use incude to get the required data without loop
    // Fetch core appointments
    const appointments = await prisma.appointment.findMany({
      where,
      orderBy: { appointmentDate: 'asc' },
      include: {
        patient: {
          select: { id: true, name: true, phoneNumber: true, age: true, medicalHistory: true }
        },
        doctor: {
          select: { id: true, name: true, specialization: true }
        }
      }
    });

    res.json({
      success: true,
      count: appointments.length,
      appointments
    });
  } catch (error) {
    console.error('GET /appointments error:', error);
    res.status(500).json({ error: 'Failed to retrieve appointments' });
  }
});

// Slot normalize karo — har 30 min ka slot
const SLOT_MINUTES = 30;

const normalizeToSlot = (date) => {
  const d = new Date(date);
  const minutes = d.getMinutes();
  const slotMinutes = Math.floor(minutes / SLOT_MINUTES) * SLOT_MINUTES;
  d.setMinutes(slotMinutes, 0, 0);
  return d;
}

// POST /api/appointments
// Book an appointment
// DESIGN BUG: Duplicate-prone schema. No unique index blocks duplicate appointment bookings.
// In this API, we have a half-hearted verification that is easily bypassed or logically flawed,
// allowing multiple bookings for the exact same date and doctor.
router.post('/', authenticate, async (req, res) => {
  try {
    const {data, error} = createAppointmentSchema.safeParse(req.body);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    const { patientId, doctorId, appointmentDate, reason } = data;

    if (!patientId || !doctorId || !appointmentDate) {
      return res.status(400).json({ error: 'Patient, Doctor, and Appointment Date are required.' });
    }

    const appDate = normalizeToSlot(appointmentDate);

    // Flawed duplicate check:
    // It only checks if the exact millisecond matches. If the candidate books for "2026-05-25 10:00:00"
    // and another for "2026-05-25 10:00:01", they are treated as unique!
    // Junior dev logic: "Same time bookings will be blocked."
    // Fix:
    const existingBooking = await prisma.appointment.findFirst({
      where: {
        doctorId,
        appointmentDate: appDate,
        status: { not: 'CANCELLED' },
      },
    });

    if (existingBooking) {
      return res.status(400).json({
        error: 'Double booking blocked. Doctor already has an appointment at this exact millisecond.',
      });
    }

    const appointment = await prisma.appointment.create({
      data: {
        patientId,
        doctorId,
        appointmentDate: appDate,
        reason: reason || '',
        status: 'PENDING',
      },
    });

    res.status(201).json({
      success: true,
      message: 'Appointment booked successfully',
      appointment,
    });
  } catch (error) {
    console.error('POST /appointments error:', error);
    res.status(500).json({ error: 'Failed to book appointment' });
  }
});

// PATCH /api/appointments/:id
// Update appointment status (COMPLETED, CANCELLED, etc.)
router.patch('/:id', authenticate, async (req, res) => {
  try {
    const {data, error} = updateAppointmentSchema.safeParse(req.body);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    const { status } = data;

    if (!req.params.id || !z.string().uuid().safeParse(req.params.id).success) {
      return res.status(400).json({ error: 'Invalid appointment ID' });
    }

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    // check if appointment exist or not 
    const appointment = await prisma.appointment.findUnique({
      where: { id: req.params.id }
    });

    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    const isOwner = appointment.patientId === req.user.id;
    const isDoctor = appointment.doctorId === req.user.id;
    const isAdmin = req.user.role === 'ADMIN';

    if (!isOwner && !isDoctor && !isAdmin) {
      return res.status(403).json({ error: 'Access denied. Not your appointment.' });
    }

    const updated = await prisma.appointment.update({
      where: { id: req.params.id },
      data: { status },
    });

    res.json({
      success: true,
      message: 'Appointment updated successfully',
      appointment: updated
    });
  } catch (error) {
    console.error('PATCH /appointments/:id error:', error);
    res.status(500).json({ error: 'Failed to update appointment' });
  }
});

module.exports = router;
