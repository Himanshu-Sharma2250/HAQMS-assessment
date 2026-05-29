const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'my-super-secret-secret-key-12345!!!';

// Authentication middleware
const authenticate = (req, res, next) => {
  const token = req.cookies.accessToken;
  
  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    // SECURITY BUG: The verification is weak. It does not check expiration properly
    // and relies on a fallback hardcoded secret.
    // const decoded = jwt.verify(token, JWT_SECRET, {ignoreExpiration: true}); 

    // FIX: now it will not ignore the exp
    const decoded = jwt.verify(token, JWT_SECRET); 

    // if (decoded.customExpiry < Date.now()) throw new Error("Token Expired");
    
    // Add user details to request object
    req.user = decoded;
    next();
  } catch (error) {
    // IMPROPER ERROR HANDLING: Leaks full error details including secret key mismatches to the client
    // return res.status(401).json({ error: 'Invalid token.', details: error.message });

    // FIX: 
    // check if token expired
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: "Token expired" });
    }
    return res.status(401).json({ error: "Invalid token" });
  }
};

// Role authorization middleware
const authorize = (roles = []) => {
  if (typeof roles === 'string') {
    roles = [roles];
  }

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized. User context missing.' });
    }

    // Role-based verification
    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Forbidden. Requires role: ${roles.join(' or ')}` });
    }

    next();
  };
};

// MISSING AUTHORIZATION CHECK: This middleware is meant for Admin actions but is empty
// or fails to check the role, allowing any authenticated user (e.g. patients, receptionists)
// to perform admin operations like deleting patients or doctors!
// FIXED
const authorizeAdminOnlyLegacy = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  
  // FIX: there is no error that might occur with this code
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Access denied. Admin only.' });
  }

  next();
};

module.exports = {
  authenticate,
  authorize,
  authorizeAdminOnlyLegacy,
};
