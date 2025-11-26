import { 
  generate2FASecret, 
  verify2FACode, 
  setup2FA, 
  disable2FA, 
  regenerateBackupCodes, 
  get2FAStatus,
  generateQRCode
} from '../middleware/two-factor.js';

// Iniciar configuración de 2FA
export async function setup2FAController(req, res) {
  try {
    const userId = req.user.uid;
    const email = req.user.email;

    console.log('🔐 Iniciando setup 2FA para usuario:', userId);

    const twoFactorData = generate2FASecret(userId, email);
    const qrCodeDataURL = await generateQRCode(twoFactorData.secret, email);

    res.json({
      success: true,
      secret: twoFactorData.secret,
      qrCode: qrCodeDataURL,
      backupCodes: twoFactorData.backupCodes,
      instructions: {
        step1: 'Escanea el código QR con tu aplicación de autenticación (Google Authenticator, Authy, etc.)',
        step2: 'Ingresa el código de 6 dígitos generado por la aplicación para verificar',
        step3: 'Guarda los códigos de respaldo en un lugar seguro'
      }
    });
  } catch (error) {
    console.error('❌ Error en setup 2FA:', error);
    res.status(500).json({
      error: 'Error al configurar autenticación de dos factores',
      code: 'TWO_FACTOR_SETUP_ERROR'
    });
  }
}

// Verificar y completar configuración de 2FA
export function verify2FASetup(req, res) {
  try {
    const { code } = req.body;
    const userId = req.user.uid;

    if (!code) {
      return res.status(400).json({
        error: 'Código de verificación requerido',
        code: 'CODE_REQUIRED'
      });
    }

    console.log('🔐 Verificando código 2FA para usuario:', userId);

    const result = setup2FA(userId, code);
    
    if (result.success) {
      console.log('✅ 2FA configurado exitosamente para:', userId);
      
      // Marcar sesión como verificada con 2FA
      req.session = req.session || {};
      req.session.twoFactorVerified = true;
      
      res.json({
        success: true,
        message: result.message,
        backupCodes: result.backupCodes,
        warning: 'Guarda estos códigos de respaldo en un lugar seguro. No se mostrarán nuevamente.'
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        code: 'VERIFICATION_FAILED'
      });
    }
  } catch (error) {
    console.error('❌ Error verificando 2FA:', error);
    res.status(500).json({
      error: 'Error al verificar código de dos factores',
      code: 'TWO_FACTOR_VERIFICATION_ERROR'
    });
  }
}

// Verificar código 2FA durante login
export function verify2FALogin(req, res) {
  try {
    const { code } = req.body;
    const userId = req.user.uid;

    if (!code) {
      return res.status(400).json({
        error: 'Código de verificación requerido',
        code: 'CODE_REQUIRED'
      });
    }

    console.log('🔐 Verificando código 2FA en login para usuario:', userId);

    const result = verify2FACode(userId, code);
    
    if (result.success) {
      console.log(`✅ 2FA verificado exitosamente (${result.method}) para:`, userId);
      
      // Marcar sesión como verificada con 2FA
      req.session = req.session || {};
      req.session.twoFactorVerified = true;
      req.session.twoFactorMethod = result.method;
      
      res.json({
        success: true,
        message: '2FA verificado exitosamente',
        method: result.method,
        redirectTo: '/pages/donationcenter.html'
      });
    } else {
      console.log('❌ Verificación 2FA fallida para:', userId);
      res.status(400).json({
        success: false,
        error: result.error,
        code: 'TWO_FACTOR_INVALID'
      });
    }
  } catch (error) {
    console.error('❌ Error verificando 2FA en login:', error);
    res.status(500).json({
      error: 'Error al verificar código de dos factores',
      code: 'TWO_FACTOR_LOGIN_ERROR'
    });
  }
}

// Deshabilitar 2FA
export function disable2FAController(req, res) {
  try {
    const { code } = req.body;
    const userId = req.user.uid;

    if (!code) {
      return res.status(400).json({
        error: 'Código de verificación requerido para deshabilitar 2FA',
        code: 'CODE_REQUIRED'
      });
    }

    console.log('🔐 Deshabilitando 2FA para usuario:', userId);

    const result = disable2FA(userId, code);
    
    if (result.success) {
      console.log('✅ 2FA deshabilitado exitosamente para:', userId);
      
      // Limpiar sesión
      if (req.session) {
        req.session.twoFactorVerified = false;
        delete req.session.twoFactorMethod;
      }
      
      res.json({
        success: true,
        message: result.message
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        code: 'DISABLE_2FA_FAILED'
      });
    }
  } catch (error) {
    console.error('❌ Error deshabilitando 2FA:', error);
    res.status(500).json({
      error: 'Error al deshabilitar autenticación de dos factores',
      code: 'TWO_FACTOR_DISABLE_ERROR'
    });
  }
}

// Regenerar códigos de respaldo
export function regenerateBackupCodesController(req, res) {
  try {
    const { code } = req.body;
    const userId = req.user.uid;

    if (!code) {
      return res.status(400).json({
        error: 'Código de verificación requerido',
        code: 'CODE_REQUIRED'
      });
    }

    console.log('🔐 Regenerando códigos de respaldo para usuario:', userId);

    const result = regenerateBackupCodes(userId, code);
    
    if (result.success) {
      console.log('✅ Códigos de respaldo regenerados para:', userId);
      
      res.json({
        success: true,
        message: result.message,
        backupCodes: result.backupCodes,
        warning: 'Los códigos anteriores ya no son válidos. Guarda estos nuevos códigos.'
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        code: 'BACKUP_CODES_REGENERATION_FAILED'
      });
    }
  } catch (error) {
    console.error('❌ Error regenerando códigos de respaldo:', error);
    res.status(500).json({
      error: 'Error al regenerar códigos de respaldo',
      code: 'BACKUP_CODES_ERROR'
    });
  }
}

// Obtener estado de 2FA
export function get2FAStatusController(req, res) {
  try {
    const userId = req.user.uid;
    const status = get2FAStatus(userId);

    res.json({
      success: true,
      status: status,
      sessionVerified: req.session?.twoFactorVerified || false
    });
  } catch (error) {
    console.error('❌ Error obteniendo estado 2FA:', error);
    res.status(500).json({
      error: 'Error al obtener estado de 2FA',
      code: 'TWO_FACTOR_STATUS_ERROR'
    });
  }
}