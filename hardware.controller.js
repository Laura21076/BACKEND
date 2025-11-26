/**
 * CONTROLADOR PARA HARDWARE - CASILLEROS INTELIGENTES
 * Sistema de Donaciones - Universidad Tecnológica
 * 
 * Endpoints para comunicación con Arduino/ESP32
 */

import { db } from '../services/firebase.js';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * Verificar código de acceso desde casillero
 * POST /api/hardware/verify-code
 */
export const verifyAccessCode = async (req, res) => {
  try {
    const { access_code, locker_id, location, timestamp } = req.body;

    // Validar datos requeridos
    if (!access_code || !locker_id) {
      return res.status(400).json({
        success: false,
        error: 'Código de acceso y ID de casillero requeridos'
      });
    }

    // Validar formato del código
    if (access_code.length !== 4 || !/^\d{4}$/.test(access_code)) {
      return res.status(400).json({
        success: false,
        error: 'Código debe tener 4 dígitos'
      });
    }

    console.log(`🔐 Verificando código ${access_code} para casillero ${locker_id}`);

    // Buscar código en la colección de códigos activos
    const codesQuery = await db.collection('access_codes')
      .where('code', '==', access_code)
      .where('status', '==', 'active')
      .where('expires_at', '>', new Date())
      .get();

    if (codesQuery.empty) {
      // Registrar intento fallido
      await logAccessAttempt(locker_id, access_code, null, false, 'Código inválido o expirado');
      
      return res.status(400).json({
        success: false,
        error: 'Código inválido o expirado'
      });
    }

    const codeDoc = codesQuery.docs[0];
    const codeData = codeDoc.data();

    // Verificar que el código es para este casillero específico
    if (codeData.locker_id && codeData.locker_id !== locker_id) {
      await logAccessAttempt(locker_id, access_code, codeData.user_id, false, 'Casillero incorrecto');
      
      return res.status(400).json({
        success: false,
        error: 'Código no válido para este casillero'
      });
    }

    // Verificar si es de un solo uso y ya fue utilizado
    if (codeData.single_use && codeData.used_at) {
      await logAccessAttempt(locker_id, access_code, codeData.user_id, false, 'Código ya utilizado');
      
      return res.status(400).json({
        success: false,
        error: 'Código ya utilizado'
      });
    }

    // Obtener datos del usuario
    const userDoc = await db.collection('users').doc(codeData.user_id).get();
    if (!userDoc.exists) {
      return res.status(400).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    const userData = userDoc.data();

    // Obtener datos del artículo si existe
    let articleData = null;
    if (codeData.article_id) {
      const articleDoc = await db.collection('articles').doc(codeData.article_id).get();
      if (articleDoc.exists) {
        articleData = articleDoc.data();
      }
    }

    // Marcar código como utilizado si es de un solo uso
    if (codeData.single_use) {
      await codeDoc.ref.update({
        used_at: FieldValue.serverTimestamp(),
        used_location: location,
        used_locker: locker_id
      });
    }

    // Registrar acceso exitoso
    await logAccessAttempt(locker_id, access_code, codeData.user_id, true, 'Acceso concedido');

    // Actualizar estadísticas del casillero
    await updateLockerStats(locker_id, codeData.action);

    // Enviar notificación al usuario (opcional)
    if (userData.notification_token) {
      await sendAccessNotification(userData, codeData.action, locker_id);
    }

    // Respuesta exitosa
    const response = {
      success: true,
      user: {
        name: `${userData.firstName} ${userData.lastName}`,
        email: userData.email
      },
      action: codeData.action, // 'DONATE' or 'RECEIVE'
      message: `Acceso concedido para ${codeData.action === 'DONATE' ? 'depositar' : 'recoger'} artículo`,
      access_granted_at: new Date().toISOString()
    };

    // Agregar información del artículo si existe
    if (articleData) {
      response.article = {
        id: codeData.article_id,
        title: articleData.title,
        description: articleData.description,
        category: articleData.category
      };
    }

    console.log(`✅ Acceso concedido para ${userData.firstName} ${userData.lastName}`);
    res.json(response);

  } catch (error) {
    console.error('❌ Error al verificar código:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};

/**
 * Obtener estado del casillero
 * GET /api/hardware/status/:lockerId
 */
export const getLockerStatus = async (req, res) => {
  try {
    const { lockerId } = req.params;

    // Obtener información del casillero
    const lockerDoc = await db.collection('lockers').doc(lockerId).get();
    
    if (!lockerDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Casillero no encontrado'
      });
    }

    const lockerData = lockerDoc.data();

    // Obtener códigos activos para este casillero
    const activeCodesQuery = await db.collection('access_codes')
      .where('locker_id', '==', lockerId)
      .where('status', '==', 'active')
      .where('expires_at', '>', new Date())
      .get();

    const activeCodes = activeCodesQuery.docs.length;

    // Obtener últimos accesos (últimas 24 horas)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentAccessQuery = await db.collection('access_logs')
      .where('locker_id', '==', lockerId)
      .where('timestamp', '>', twentyFourHoursAgo)
      .orderBy('timestamp', 'desc')
      .limit(10)
      .get();

    const recentAccess = recentAccessQuery.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate?.() || doc.data().timestamp
    }));

    res.json({
      success: true,
      locker: {
        id: lockerId,
        name: lockerData.name,
        location: lockerData.location,
        status: lockerData.status || 'active',
        last_maintenance: lockerData.last_maintenance,
        total_uses: lockerData.total_uses || 0
      },
      active_codes: activeCodes,
      recent_access: recentAccess
    });

  } catch (error) {
    console.error('❌ Error al obtener estado del casillero:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};

/**
 * Registrar evento de casillero (apertura, cierre, error)
 * POST /api/hardware/event
 */
export const registerLockerEvent = async (req, res) => {
  try {
    const { locker_id, event_type, details, timestamp } = req.body;

    if (!locker_id || !event_type) {
      return res.status(400).json({
        success: false,
        error: 'ID de casillero y tipo de evento requeridos'
      });
    }

    // Registrar evento en la base de datos
    await db.collection('locker_events').add({
      locker_id,
      event_type, // 'door_opened', 'door_closed', 'emergency_open', 'error', 'maintenance'
      details: details || '',
      timestamp: timestamp ? new Date(timestamp) : FieldValue.serverTimestamp(),
      ip_address: req.ip
    });

    // Actualizar último evento en el documento del casillero
    await db.collection('lockers').doc(locker_id).update({
      last_event: event_type,
      last_event_time: FieldValue.serverTimestamp(),
      last_seen: FieldValue.serverTimestamp()
    });

    console.log(`📝 Evento registrado: ${event_type} para casillero ${locker_id}`);

    res.json({
      success: true,
      message: 'Evento registrado correctamente'
    });

  } catch (error) {
    console.error('❌ Error al registrar evento:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};

/**
 * Configurar casillero (registro inicial)
 * POST /api/hardware/setup
 */
export const setupLocker = async (req, res) => {
  try {
    const { 
      locker_id, 
      name, 
      location, 
      ip_address, 
      mac_address, 
      firmware_version 
    } = req.body;

    if (!locker_id || !name || !location) {
      return res.status(400).json({
        success: false,
        error: 'ID, nombre y ubicación del casillero requeridos'
      });
    }

    // Verificar si el casillero ya existe
    const existingLocker = await db.collection('lockers').doc(locker_id).get();
    
    const lockerData = {
      name,
      location,
      ip_address: ip_address || req.ip,
      mac_address,
      firmware_version,
      status: 'active',
      total_uses: 0,
      created_at: FieldValue.serverTimestamp(),
      last_seen: FieldValue.serverTimestamp()
    };

    if (existingLocker.exists) {
      // Actualizar casillero existente
      await db.collection('lockers').doc(locker_id).update({
        ...lockerData,
        updated_at: FieldValue.serverTimestamp()
      });
      
      console.log(`🔄 Casillero ${locker_id} actualizado`);
    } else {
      // Crear nuevo casillero
      await db.collection('lockers').doc(locker_id).set(lockerData);
      console.log(`✨ Nuevo casillero ${locker_id} registrado`);
    }

    res.json({
      success: true,
      message: existingLocker.exists ? 'Casillero actualizado' : 'Casillero registrado',
      locker_id
    });

  } catch (error) {
    console.error('❌ Error en setup del casillero:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};

/**
 * Health check para casilleros
 * GET /api/hardware/health
 */
export const hardwareHealthCheck = async (req, res) => {
  try {
    const { locker_id } = req.query;
    
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      server_time: Date.now(),
      api_version: '1.0.0'
    };

    // Si se proporciona ID de casillero, actualizar last_seen
    if (locker_id) {
      await db.collection('lockers').doc(locker_id).update({
        last_seen: FieldValue.serverTimestamp(),
        last_health_check: FieldValue.serverTimestamp()
      });
      
      health.locker_updated = true;
    }

    res.json(health);

  } catch (error) {
    console.error('❌ Error en health check:', error);
    res.status(500).json({
      status: 'error',
      error: 'Error interno del servidor'
    });
  }
};

// ===== FUNCIONES AUXILIARES =====

/**
 * Registrar intento de acceso
 */
async function logAccessAttempt(lockerId, code, userId, success, reason) {
  try {
    await db.collection('access_logs').add({
      locker_id: lockerId,
      access_code: code,
      user_id: userId,
      success,
      reason,
      timestamp: FieldValue.serverTimestamp(),
      ip_address: req?.ip || 'unknown'
    });
  } catch (error) {
    console.error('Error al registrar log de acceso:', error);
  }
}

/**
 * Actualizar estadísticas del casillero
 */
async function updateLockerStats(lockerId, action) {
  try {
    const increment = FieldValue.increment(1);
    const updateData = {
      total_uses: increment,
      last_used: FieldValue.serverTimestamp()
    };

    if (action === 'DONATE') {
      updateData.total_donations = increment;
    } else if (action === 'RECEIVE') {
      updateData.total_pickups = increment;
    }

    await db.collection('lockers').doc(lockerId).update(updateData);
  } catch (error) {
    console.error('Error al actualizar estadísticas:', error);
  }
}

/**
 * Enviar notificación de acceso al usuario
 */
async function sendAccessNotification(userData, action, lockerId) {
  try {
    // Aquí se implementaría el envío de notificación push
    // usando Firebase Cloud Messaging o similar
    console.log(`📱 Notificación enviada a ${userData.email}: ${action} en ${lockerId}`);
  } catch (error) {
    console.error('Error al enviar notificación:', error);
  }
}