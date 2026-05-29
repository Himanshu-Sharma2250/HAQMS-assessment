const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate, authorizeAdminOnlyLegacy } = require('../middleware/auth');
const { registerPatientSchema } = require('../vaidation/patient.validation');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/patients
// Get all patients with search, filtering, and INEFICIENT IN-MEMORY PAGINATION
router.get('/', authenticate, async (req, res) => {
  try {
    const { search, gender } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const skip = (page - 1) * limit;

    const where = {};
    
    // Inefficient: Retrieve all matching rows without take/skip limits from the database.
    // Scales poorly as patient directory grows.
    const allPatients = await prisma.patient.findMany({
      orderBy: { createdAt: 'desc' },
    });

    let filteredPatients = allPatients;

    // In-memory filter for search (checks name/phone/email)
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phoneNumber: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } }
      ]
    }

    // In-memory filter for gender
    if (gender && gender !== 'All') {
      where.gender = { equals: gender, mode: 'insensitive' }
    }

    const [patients, totalCount] = await Promise.all([
      prisma.patient.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip
      }),
      prisma.patient.count({
        where
      })
    ])

    res.json({
      success: true,
      data: patients,
      pagination: {
        page,
        limit,
        totalPatients: totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    });
  } catch (error) {
    console.error('GET /patients error:', error);
    res.status(500).json({ error: 'Failed to fetch patients' });
  }
});

// GET /api/patients/:id
// Get patient details by ID. Notice N+1 issue could be placed here or in appointments,
// but let's make it fetch the patient with their appointments and tokens.
router.get('/:id', authenticate, async (req, res) => {
  try {
    const patient = await prisma.patient.findUnique({
      where: { id: req.params.id },
      include: {
        appointments: {
          select: { id: true, appointmentDate: true, status: true, reason: true, doctorId: true }
        },
        queueTokens: {
          select: { id: true, tokenNumber: true, status: true, createdAt: true }
        }
      }
    });

    if (!patient) {
      return res.status(404).json({ success: false, error: 'Patient not found' });
    }

    // Authorization check
    const isSelf = req.user.id === patient.id;
    const isAdmin = req.user.role === 'ADMIN';
    const isDoctor = patient.appointments.some(a => a.doctorId === req.user.id);

    if (!isSelf && !isAdmin && !isDoctor) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // Build response
    const response = {
      id: patient.id,
      name: patient.name,
      email: patient.email,
      phoneNumber: patient.phoneNumber,
      age: patient.age,
      gender: patient.gender,
      createdAt: patient.createdAt,
      appointments: patient.appointments,
      queueTokens: patient.queueTokens
    };

    // Sensitive field — authorized only
    if (isSelf || isAdmin || isDoctor) {
      response.medicalHistory = patient.medicalHistory;
    }

    res.json({
      success: true,
      data: response
    });

  } catch (error) {
    console.error('GET /patients/:id error:', error);
    res.status(500).json({ error: 'Failed to retrieve patient' });
  }
});

// POST /api/patients (Register patient)
router.post('/', authenticate, async (req, res) => {
  try {
    const {data, error} = registerPatientSchema.safeParse(req.body);

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    const { name, email, phoneNumber, age, gender, medicalHistory } = data;

    const patient = await prisma.patient.create({
      data: {
        name,
        email: email || null,
        phoneNumber,
        age,
        gender,
        medicalHistory: medicalHistory || null
      },
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        age: true,
        gender: true,
        createdAt: true
      }
    });

    res.status(201).json({
      success: true,
      message: 'Patient registered successfully',
      data: patient
    });
  } catch (error) {
    console.error('POST /patients error:', error);
    res.status(500).json({ error: 'Failed to register patient' });
  }
});

// DELETE /api/patients/:id
// SECURITY BUG: The route relies on authorizeAdminOnlyLegacy, which has the bypassed admin validation check!
// This allows any receptionist or doctor to delete a patient.
router.delete('/:id', authenticate, authorizeAdminOnlyLegacy, async (req, res) => {
  try {
    const { id } = req.params;

    const patient = await prisma.patient.findUnique({ where: { id } });
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    await prisma.patient.delete({ where: { id } });

    res.json({
      success: true,
      message: `Successfully deleted patient ${patient.name}`
    });
  } catch (error) {
    console.error('DELETE /patients/:id error:', error);
    res.status(500).json({ error: 'Failed to delete patient' });
  }
});

module.exports = router;
