// Controller para manejar notificaciones push
import admin from 'firebase-admin';
import webpush from 'web-push';

// Configuración de VAPID keys para web-push
webpush.setVapidDetails(
  'mailto:donantes@app.com',
  process.env.VAPID_PUBLIC_KEY || 'BP-PX1TZ9YTrnbPR5ZB6sEEDXp_hdje0jvCQssl6tCWOYCS952lr0v3iLEH4NGwn_NisI4rDBqsn-rxZgr8KgiE',
  process.env.VAPID_PRIVATE_KEY || 'Pf3dQylh1hcTn-HbROO8GR5tmVD3NioU4_G-7Rbs1jo'
);

// ================== SUSCRIPCIONES ==================

/**
 * Suscribir usuario a notificaciones push
 */
const subscribeUser = async (req, res) => {
  try {
    const { subscription, userId } = req.body;
    
    if (!subscription || !userId) {
      return res.status(400).json({
        success: false,
        message: 'Suscripción y userId son requeridos'
      });
    }

    // Verificar que el usuario autenticado coincida
    if (req.user.uid !== userId) {
      return res.status(403).json({
        success: false,
        message: 'No autorizado para suscribir este usuario'
      });
    }

    // Guardar suscripción en Firestore
    const db = admin.firestore();
    const userRef = db.collection('users').doc(userId);
    
    // Verificar si el usuario existe, si no, crearlo
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      await userRef.set({
        email: req.user.email,
        displayName: req.user.name,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    // Guardar suscripción
    await userRef.collection('pushSubscriptions').add({
      subscription: subscription,
      endpoint: subscription.endpoint,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastUsed: admin.firestore.FieldValue.serverTimestamp(),
      active: true
    });

    console.log(`✅ Usuario ${userId} suscrito a notificaciones push`);

    res.status(200).json({
      success: true,
      message: 'Suscripción guardada exitosamente'
    });

  } catch (error) {
    console.error('❌ Error al suscribir usuario:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * Desuscribir usuario de notificaciones
 */
const unsubscribeUser = async (req, res) => {
  try {
    const { userId, endpoint } = req.body;
    
    if (!userId || !endpoint) {
      return res.status(400).json({
        success: false,
        message: 'userId y endpoint son requeridos'
      });
    }

    // Verificar autorización
    if (req.user.uid !== userId) {
      return res.status(403).json({
        success: false,
        message: 'No autorizado'
      });
    }

    const db = admin.firestore();
    const subscriptionsRef = db.collection('users').doc(userId).collection('pushSubscriptions');
    
    // Buscar y desactivar suscripción
    const query = await subscriptionsRef.where('endpoint', '==', endpoint).get();
    
    if (!query.empty) {
      const batch = db.batch();
      query.docs.forEach(doc => {
        batch.update(doc.ref, { active: false });
      });
      await batch.commit();
    }

    res.status(200).json({
      success: true,
      message: 'Desuscripción exitosa'
    });

  } catch (error) {
    console.error('❌ Error al desuscribir:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

// ================== ENVÍO DE NOTIFICACIONES ==================

/**
 * Enviar notificación de solicitud aprobada
 */
const sendRequestApprovedNotification = async (userId, articleTitle, accessCode) => {
  try {
    const notification = {
      title: '🎉 ¡Solicitud Aprobada!',
      body: `Tu solicitud para "${articleTitle}" ha sido aprobada. Código: ${accessCode}`,
      icon: '/assets/icon-192x192.png',
      badge: '/assets/icon-72x72.png',
      tag: 'request-approved',
      data: {
        type: 'request-approved',
        articleTitle: articleTitle,
        accessCode: accessCode,
        url: '/pages/requests.html'
      },
      actions: [
        {
          action: 'view-code',
          title: 'Ver Código',
          icon: '/assets/icon-72x72.png'
        },
        {
          action: 'find-locker',
          title: 'Ubicar Casillero',
          icon: '/assets/icon-72x72.png'
        }
      ],
      requireInteraction: true,
      vibrate: [100, 50, 100, 50, 100]
    };

    await sendNotificationToUser(userId, notification);
    console.log(`✅ Notificación de aprobación enviada a ${userId}`);

  } catch (error) {
    console.error('❌ Error al enviar notificación de aprobación:', error);
  }
};

/**
 * Enviar notificación de nueva solicitud al propietario
 */
const sendNewRequestNotification = async (ownerId, articleTitle, requesterName) => {
  try {
    const notification = {
      title: '📥 Nueva Solicitud',
      body: `${requesterName} está interesado en tu artículo "${articleTitle}"`,
      icon: '/assets/icon-192x192.png',
      badge: '/assets/icon-72x72.png',
      tag: 'new-request',
      data: {
        type: 'new-request',
        articleTitle: articleTitle,
        requesterName: requesterName,
        url: '/pages/requests.html'
      },
      actions: [
        {
          action: 'approve',
          title: 'Aprobar',
          icon: '/assets/icon-72x72.png'
        },
        {
          action: 'view-details',
          title: 'Ver Detalles',
          icon: '/assets/icon-72x72.png'
        }
      ],
      vibrate: [200, 100, 200]
    };

    await sendNotificationToUser(ownerId, notification);
    console.log(`✅ Notificación de nueva solicitud enviada a ${ownerId}`);

  } catch (error) {
    console.error('❌ Error al enviar notificación de nueva solicitud:', error);
  }
};

/**
 * Enviar notificación de recordatorio de retiro
 */
const sendPickupReminderNotification = async (userId, articleTitle, hoursLeft) => {
  try {
    const notification = {
      title: '⏰ Recordatorio de Retiro',
      body: `Recuerda retirar "${articleTitle}". Quedan ${hoursLeft} horas.`,
      icon: '/assets/icon-192x192.png',
      badge: '/assets/icon-72x72.png',
      tag: 'pickup-reminder',
      data: {
        type: 'pickup-reminder',
        articleTitle: articleTitle,
        hoursLeft: hoursLeft,
        url: '/pages/requests.html'
      },
      vibrate: [100, 50, 100]
    };

    await sendNotificationToUser(userId, notification);
    console.log(`✅ Recordatorio de retiro enviado a ${userId}`);

  } catch (error) {
    console.error('❌ Error al enviar recordatorio:', error);
  }
};

// ================== FUNCIONES AUXILIARES ==================

/**
 * Enviar notificación a un usuario específico
 */
const sendNotificationToUser = async (userId, notificationPayload) => {
  try {
    const db = admin.firestore();
    const subscriptionsRef = db.collection('users').doc(userId).collection('pushSubscriptions');
    
    // Obtener todas las suscripciones activas del usuario
    const subscriptionsSnapshot = await subscriptionsRef.where('active', '==', true).get();
    
    if (subscriptionsSnapshot.empty) {
      console.log(`⚠️ No hay suscripciones activas para el usuario ${userId}`);
      return;
    }

    // Enviar notificación a cada suscripción
    const promises = subscriptionsSnapshot.docs.map(async (doc) => {
      const subscriptionData = doc.data();
      const subscription = subscriptionData.subscription;

      try {
        await webpush.sendNotification(
          subscription,
          JSON.stringify(notificationPayload)
        );

        // Actualizar último uso
        await doc.ref.update({
          lastUsed: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`✅ Notificación enviada a endpoint: ${subscription.endpoint.substring(0, 50)}...`);

      } catch (error) {
        console.error(`❌ Error enviando a endpoint ${subscription.endpoint}:`, error);
        
        // Si es un error 410 (endpoint no válido), desactivar suscripción
        if (error.statusCode === 410) {
          await doc.ref.update({ active: false });
          console.log(`🗑️ Suscripción inválida desactivada: ${subscription.endpoint}`);
        }
      }
    });

    await Promise.all(promises);

  } catch (error) {
    console.error('❌ Error al enviar notificación al usuario:', error);
    throw error;
  }
};

/**
 * Limpiar suscripciones inactivas (ejecutar periódicamente)
 */
const cleanInactiveSubscriptions = async () => {
  try {
    const db = admin.firestore();
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - 1); // 1 mes de inactividad

    // Buscar suscripciones antiguas
    const oldSubscriptions = await db.collectionGroup('pushSubscriptions')
      .where('lastUsed', '<', cutoffDate)
      .where('active', '==', true)
      .get();

    if (!oldSubscriptions.empty) {
      const batch = db.batch();
      oldSubscriptions.docs.forEach(doc => {
        batch.update(doc.ref, { active: false });
      });
      await batch.commit();
      
      console.log(`🧹 ${oldSubscriptions.size} suscripciones inactivas limpiadas`);
    }

  } catch (error) {
    console.error('❌ Error limpiando suscripciones:', error);
  }
};

/**
 * Enviar notificación de nuevo mensaje de contacto a administradores
 */
const sendNewContactNotification = async (contactData) => {
  try {
    const db = admin.firestore();
    
    // Buscar administradores
    const adminsSnapshot = await db.collection('users')
      .where('admin', '==', true)
      .where('notifications_enabled', '==', true)
      .get();

    if (adminsSnapshot.empty) {
      console.log('ℹ️ No hay administradores para notificar sobre mensaje de contacto');
      return;
    }

    // Crear el mensaje de notificación
    const notificationPayload = {
      title: '📩 Nuevo Mensaje de Contacto',
      body: `${contactData.name} envió: "${contactData.subject}"`,
      icon: '/assets/icons/icon-192x192.png',
      badge: '/assets/icons/icon-72x72.png',
      data: {
        type: 'contact_message',
        contactId: contactData.id,
        name: contactData.name,
        email: contactData.email,
        subject: contactData.subject,
        url: '/admin/contact-messages',
        timestamp: Date.now()
      },
      actions: [
        {
          action: 'view',
          title: 'Ver Mensaje',
          icon: '/assets/icons/view.png'
        },
        {
          action: 'respond',
          title: 'Responder',
          icon: '/assets/icons/reply.png'
        }
      ],
      requireInteraction: true,
      vibrate: [200, 100, 200]
    };

    // Enviar a cada administrador
    let successCount = 0;
    let failCount = 0;

    for (const adminDoc of adminsSnapshot.docs) {
      const adminId = adminDoc.id;
      
      try {
        // Buscar suscripciones activas del administrador
        const subscriptionsSnapshot = await db.collection('users')
          .doc(adminId)
          .collection('pushSubscriptions')
          .where('active', '==', true)
          .get();

        // Enviar notificación a cada suscripción
        for (const subDoc of subscriptionsSnapshot.docs) {
          const subscriptionData = subDoc.data();
          
          try {
            await webpush.sendNotification(
              subscriptionData.subscription,
              JSON.stringify(notificationPayload)
            );
            
            // Actualizar último uso
            await subDoc.ref.update({
              lastUsed: admin.firestore.FieldValue.serverTimestamp()
            });
            
            successCount++;
          } catch (pushError) {
            console.error(`❌ Error enviando push al admin ${adminId}:`, pushError);
            
            // Si la suscripción es inválida, marcarla como inactiva
            if (pushError.statusCode === 410 || pushError.statusCode === 404) {
              await subDoc.ref.update({ active: false });
            }
            
            failCount++;
          }
        }

        // Registrar notificación en historial del admin
        await db.collection('users')
          .doc(adminId)
          .collection('notifications')
          .add({
            ...notificationPayload,
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });

      } catch (adminError) {
        console.error(`❌ Error procesando admin ${adminId}:`, adminError);
        failCount++;
      }
    }

    console.log(`📩 Notificación de contacto enviada: ${successCount} éxitos, ${failCount} fallos`);

  } catch (error) {
    console.error('❌ Error enviando notificación de contacto:', error);
    throw error;
  }
};

export {
  subscribeUser,
  unsubscribeUser,
  sendRequestApprovedNotification,
  sendNewRequestNotification,
  sendNewContactNotification,
  sendPickupReminderNotification,
  sendNotificationToUser,
  cleanInactiveSubscriptions
};