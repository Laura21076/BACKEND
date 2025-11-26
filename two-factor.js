import crypto from 'crypto';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';

// Base de datos temporal en memoria para 2FA (en producción usar Firebase/DB)
const twoFactorData = new Map();

// Generar secreto para 2FA
export function generate2FASecret(userId, email) {
  const secret = speakeasy.generateSecret({
    name: `Donantes (${email})`,
    service: 'Donantes Universidad',
    length: 32
  });

  twoFactorData.set(userId, {
    secret: secret.base32,
    verified: false,
    backupCodes: generateBackupCodes(),
    createdAt: new Date()
  });

  return {
    secret: secret.base32,
    qrCode: secret.otpauth_url,
    backupCodes: twoFactorData.get(userId).backupCodes
  };
}

// Generar códigos de respaldo
function generateBackupCodes() {
  const codes = [];
  for (let i = 0; i < 8; i++) {
    codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
  }
  return codes;
}

// Verificar código 2FA
export function verify2FACode(userId, code) {
  const userData = twoFactorData.get(userId);
  if (!userData) {
    return { success: false, error: 'Usuario sin 2FA configurado' };
  }

  // Verificar código TOTP
  const verified = speakeasy.totp.verify({
    secret: userData.secret,
    encoding: 'base32',
    token: code,
    window: 2 // Permitir 2 ventanas de tiempo (60 segundos)
  });

  if (verified) {
    return { success: true, method: 'totp' };
  }

  // Verificar código de respaldo
  const backupIndex = userData.backupCodes.indexOf(code.toUpperCase());
  if (backupIndex !== -1) {
    // Eliminar código de respaldo usado
    userData.backupCodes.splice(backupIndex, 1);
    twoFactorData.set(userId, userData);
    return { success: true, method: 'backup' };
  }

  return { success: false, error: 'Código inválido' };
}

// Middleware para requerir 2FA
export function require2FA(req, res, next) {
  const userId = req.user?.uid;
  
  if (!userId) {
    return res.status(401).json({
      error: 'Usuario no autenticado',
      code: 'UNAUTHENTICATED'
    });
  }

  const userData = twoFactorData.get(userId);
  
  // Si no tiene 2FA configurado, permitir acceso pero recomendar configuración
  if (!userData) {
    req.recommend2FA = true;
    return next();
  }

  // Si tiene 2FA pero no ha verificado en esta sesión
  if (!req.session?.twoFactorVerified) {
    return res.status(403).json({
      error: 'Se requiere verificación de dos factores',
      code: 'TWO_FACTOR_REQUIRED',
      setup2FA: false
    });
  }

  next();
}

// Middleware opcional de 2FA (recomienda pero no requiere)
export function optional2FA(req, res, next) {
  const userId = req.user?.uid;
  const userData = twoFactorData.get(userId);
  
  req.has2FA = !!userData;
  req.recommend2FA = !userData;
  
  next();
}

// Generar QR Code para configuración
export async function generateQRCode(secret, email) {
  const otpauth_url = `otpauth://totp/Donantes%20(${encodeURIComponent(email)})?secret=${secret}&issuer=Donantes%20Universidad`;
  
  try {
    const qrCodeDataURL = await qrcode.toDataURL(otpauth_url);
    return qrCodeDataURL;
  } catch (error) {
    throw new Error('Error generando código QR: ' + error.message);
  }
}

// Validar y configurar 2FA
export function setup2FA(userId, verificationCode) {
  const userData = twoFactorData.get(userId);
  if (!userData) {
    return { success: false, error: 'No hay configuración 2FA iniciada' };
  }

  const verified = speakeasy.totp.verify({
    secret: userData.secret,
    encoding: 'base32',
    token: verificationCode,
    window: 2
  });

  if (verified) {
    userData.verified = true;
    userData.verifiedAt = new Date();
    twoFactorData.set(userId, userData);
    
    return { 
      success: true, 
      backupCodes: userData.backupCodes,
      message: '2FA configurado exitosamente'
    };
  }

  return { success: false, error: 'Código de verificación inválido' };
}

// Deshabilitar 2FA
export function disable2FA(userId, verificationCode) {
  const userData = twoFactorData.get(userId);
  if (!userData) {
    return { success: false, error: '2FA no está configurado' };
  }

  const verified = verify2FACode(userId, verificationCode);
  if (!verified.success) {
    return verified;
  }

  twoFactorData.delete(userId);
  return { success: true, message: '2FA deshabilitado exitosamente' };
}

// Regenerar códigos de respaldo
export function regenerateBackupCodes(userId, verificationCode) {
  const userData = twoFactorData.get(userId);
  if (!userData) {
    return { success: false, error: '2FA no está configurado' };
  }

  const verified = verify2FACode(userId, verificationCode);
  if (!verified.success) {
    return verified;
  }

  userData.backupCodes = generateBackupCodes();
  userData.backupCodesRegeneratedAt = new Date();
  twoFactorData.set(userId, userData);

  return { 
    success: true, 
    backupCodes: userData.backupCodes,
    message: 'Códigos de respaldo regenerados'
  };
}

// Obtener estado de 2FA para un usuario
export function get2FAStatus(userId) {
  const userData = twoFactorData.get(userId);
  
  if (!userData) {
    return {
      enabled: false,
      verified: false,
      backupCodesCount: 0
    };
  }

  return {
    enabled: true,
    verified: userData.verified,
    backupCodesCount: userData.backupCodes.length,
    createdAt: userData.createdAt,
    verifiedAt: userData.verifiedAt
  };
}