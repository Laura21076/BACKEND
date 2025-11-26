import { body, validationResult } from 'express-validator';

// Middleware para validar resultados
export const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('❌ Errores de validación:', errors.array());
    return res.status(400).json({ errors: errors.array() });
  }
  
  console.log('✅ Validación exitosa');
  next();
};

// Validaciones para login (usando UID de Firebase)
export const validateLogin = [
  body('idToken')
    .notEmpty()
    .withMessage('idToken es requerido'),
  validate
];

// Validaciones para registro de usuario
export const validateRegistration = [
  body('email')
    .isEmail()
    .withMessage('Email inválido')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 6 })
    .withMessage('La contraseña debe tener al menos 6 caracteres')
    .matches(/[a-zA-Z]/).withMessage('La contraseña debe contener al menos una letra')
    .matches(/\d/).withMessage('La contraseña debe contener al menos un número'),
  body('firstName')
    .trim()
    .notEmpty()
    .withMessage('El nombre es requerido')
    .isLength({ max: 50 })
    .withMessage('El nombre no puede exceder 50 caracteres'),
  body('lastName')
    .trim()
    .notEmpty()
    .withMessage('El apellido es requerido')
    .isLength({ max: 50 })
    .withMessage('El apellido no puede exceder 50 caracteres'),
  validate
];

// Validaciones para login tradicional (email/password) - si se necesita
export const validateEmailLogin = [
  body('email')
    .isEmail()
    .withMessage('Email inválido')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('La contraseña es requerida'),
  validate
];

// Validaciones para donaciones
export const validateDonation = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('El título es requerido')
    .isLength({ max: 100 })
    .withMessage('El título no puede exceder 100 caracteres'),
  body('description')
    .trim()
    .notEmpty()
    .withMessage('La descripción es requerida')
    .isLength({ max: 1000 })
    .withMessage('La descripción no puede exceder 1000 caracteres'),
  body('category')
    .trim()
    .notEmpty()
    .withMessage('La categoría es requerida'),
  body('location')
    .notEmpty()
    .withMessage('La ubicación es requerida'),
  validate
];