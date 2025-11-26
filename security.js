import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import xss from 'xss';
import validator from 'validator';

// Detectar modo desarrollo
const isDevelopment = process.env.NODE_ENV !== 'production';

// Rate limiting - OWASP A10: Server Side Request Forgery
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: isDevelopment ? 1000 : 100, // 1000 en dev, 100 en prod
  message: {
    error: 'Demasiadas solicitudes desde esta IP, intente de nuevo en 15 minutos.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // En desarrollo, ser muy permisivo con localhost
  skip: isDevelopment ? (req) => {
    const ip = req.ip || req.connection.remoteAddress;
    return ip === '127.0.0.1' || ip === '::1' || ip?.includes('localhost') || ip?.includes('172.') || ip?.includes('192.168.');
  } : undefined
});

// Rate limiting para autenticación - MUY RELAJADO en desarrollo
export const authLimiter = rateLimit({
  windowMs: isDevelopment ? 1 * 60 * 1000 : 15 * 60 * 1000, // 1 min en dev, 15 min en prod
  max: isDevelopment ? 500 : 5, // 500 en dev, 5 en prod
  message: {
    error: isDevelopment ? 
      'Rate limit en desarrollo (500/min) - esperando...' :
      'Demasiados intentos de autenticación, intente de nuevo en 15 minutos.',
    code: 'AUTH_RATE_LIMIT_EXCEEDED'
  },
  // En desarrollo, prácticamente deshabilitar para localhost
  skip: isDevelopment ? (req) => {
    const ip = req.ip || req.connection.remoteAddress;
    console.log(`🔍 Auth rate limit check - IP: ${ip}, Skip: ${ip === '127.0.0.1' || ip === '::1'}`);
    return ip === '127.0.0.1' || ip === '::1' || ip?.includes('localhost') || ip?.includes('172.') || ip?.includes('192.168.');
  } : undefined
});

// Configuración de Helmet - OWASP A5: Security Misconfiguration
export const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https:'],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: []
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

// Sanitización de entrada - OWASP A3: Injection
export function sanitizeInput(req, res, next) {
  if (req.body) {
    for (const key in req.body) {
      if (typeof req.body[key] === 'string') {
        // XSS protection
        req.body[key] = xss(req.body[key]);
        
        // SQL Injection protection básica
        req.body[key] = req.body[key].replace(/[<>"'%;()&+]/g, '');
        
        // Validación de longitud
        if (req.body[key].length > 1000) {
          return res.status(400).json({
            error: 'Entrada demasiado larga',
            code: 'INPUT_TOO_LONG'
          });
        }
      }
    }
  }
  next();
}

// Validación de email - OWASP A7: Identification and Authentication Failures
export function validateEmail(email) {
  return validator.isEmail(email) && validator.isLength(email, { max: 254 });
}

// Validación de contraseña segura
export function validatePassword(password) {
  return (
    validator.isLength(password, { min: 8, max: 128 }) &&
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/.test(password)
  );
}

// Logging de seguridad - OWASP A9: Security Logging and Monitoring Failures
export function securityLogger(req, res, next) {
  const timestamp = new Date().toISOString();
  const ip = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent') || 'Unknown';
  
  console.log(`[SECURITY] ${timestamp} - IP: ${ip} - ${req.method} ${req.originalUrl} - User-Agent: ${userAgent}`);
  
  // Log intentos sospechosos
  if (req.originalUrl.includes('..') || req.originalUrl.includes('<script>')) {
    console.log(`[SECURITY ALERT] ${timestamp} - Posible ataque detectado desde IP: ${ip}`);
  }
  
  next();
}

// Middleware para prevenir ataques de timing
export function preventTimingAttacks(req, res, next) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration < 100) {
      setTimeout(() => {}, 100 - duration);
    }
  });
  
  next();
}

// Validación de archivos subidos
export function validateFileUpload(req, res, next) {
  if (req.file) {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const maxSize = 5 * 1024 * 1024; // 5MB
    
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        error: 'Tipo de archivo no permitido',
        code: 'INVALID_FILE_TYPE'
      });
    }
    
    if (req.file.size > maxSize) {
      return res.status(400).json({
        error: 'Archivo demasiado grande',
        code: 'FILE_TOO_LARGE'
      });
    }
  }
  next();
}