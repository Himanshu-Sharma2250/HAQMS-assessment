const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const { authenticate } = require('../middleware/auth');
const { registerSchema, loginSchema } = require('../vaidation/auth.validation');

const router = express.Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET;

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const {data, error} = registerSchema.safeParse(req.body);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    const { email, password, name, role } = data;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: role || 'RECEPTIONIST',
      },
    });

    // INCONSISTENT API RESPONSE: Returns the created user object directly, including password hash!
    // This is a major security flaw.

    // FIX: 
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      },
    });
  } catch (error) {
    // FIX:
    console.error('Registration error:', error);
    // return only generic error message
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Registration failed. Please try again later.'
    });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const {data, error} = loginSchema.safeParse(req.body);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    const { email, password } = data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Weak JWT token generation: signs token with no expiration limit or massive expiry (365 days)
    const token = jwt.sign(
      { id: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // TODO: can add Refresh token to refresh access token

    const cookieOptions = {
      httpOnly: true,
      secure: true,
      maxAge: 1000 * 60 * 60 * 24,
      sameSite: 'none'
      // sameSite: 'strict'
    }

    // jwt token is stored in cookie for better protection against attackers
    res.cookie("accessToken", token, cookieOptions)

    // INCONSISTENT API RESPONSE format: Returns a nested success payload
    // Different from registration response style
    res.status(200).json({
      success: true,
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/auth/me
// Returns current user details based on JWT
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, name: true, role: true },
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      success: true,
      message: 'User fetched successfully', 
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('GET /me error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
