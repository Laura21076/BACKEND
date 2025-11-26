import rateLimit from 'express-rate-limit';

// Detectar si estamos en modo desarrollo
const isDevelopment = process.env.NODE_ENV !== 'production';

// Rate limiting middleware - Configuración para desarrollo
export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: isDevelopment ? 1000 : 100, // 1000 en desarrollo, 100 en producción
  message: {
    error: 'Demasiadas peticiones desde esta IP, por favor intente de nuevo en 15 minutos'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // En desarrollo, permitir más flexibilidad
  skip: isDevelopment ? (req) => {
    // Permitir todas las peticiones desde localhost en desarrollo
    return req.ip === '127.0.0.1' || req.ip === '::1' || req.ip.includes('localhost');
  } : undefined
});

// Rate limiting específico para autenticación - MUY RELAJADO para desarrollo
export const authLimiter = rateLimit({
  windowMs: isDevelopment ? 1 * 60 * 1000 : 60 * 60 * 1000, // 1 min en dev, 1 hora en prod
  max: isDevelopment ? 500 : 20, // 500 intentos en dev, 20 en prod
  message: {
    error: isDevelopment ? 
      'Rate limit alcanzado en desarrollo - esperando...' :
      'Demasiados intentos de inicio de sesión. Por favor, intente de nuevo en 1 hora'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // En desarrollo, ser muy permisivo
  skip: isDevelopment ? (req) => {
    return req.ip === '127.0.0.1' || req.ip === '::1' || req.ip.includes('localhost');
  } : undefined
});