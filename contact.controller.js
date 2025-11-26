import firebase from "../services/firebase.js";
import { 
  sendNewContactNotification 
} from "./notifications.controller.js";

/**
 * Crear un nuevo mensaje de contacto
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
export async function submitContact(req, res) {
  try {
    const { name, email, phone, subject, message } = req.body;
    
    // Validación de campos requeridos
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ 
        error: "Todos los campos son requeridos excepto el teléfono",
        code: "MISSING_REQUIRED_FIELDS",
        missing_fields: {
          name: !name,
          email: !email,
          subject: !subject,
          message: !message
        }
      });
    }

    // Validación de formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        error: "Formato de email inválido",
        code: "INVALID_EMAIL_FORMAT" 
      });
    }

    // Validación de longitud de campos
    if (name.length < 2 || name.length > 100) {
      return res.status(400).json({ 
        error: "El nombre debe tener entre 2 y 100 caracteres",
        code: "INVALID_NAME_LENGTH" 
      });
    }

    if (subject.length < 5 || subject.length > 200) {
      return res.status(400).json({ 
        error: "El asunto debe tener entre 5 y 200 caracteres",
        code: "INVALID_SUBJECT_LENGTH" 
      });
    }

    if (message.length < 10 || message.length > 2000) {
      return res.status(400).json({ 
        error: "El mensaje debe tener entre 10 y 2000 caracteres",
        code: "INVALID_MESSAGE_LENGTH" 
      });
    }

    // Validación de teléfono (opcional)
    if (phone && phone.length > 0) {
      const phoneRegex = /^[+]?[\d\s\-\(\)]{7,20}$/;
      if (!phoneRegex.test(phone)) {
        return res.status(400).json({ 
          error: "Formato de teléfono inválido",
          code: "INVALID_PHONE_FORMAT" 
        });
      }
    }

    // Crear el documento de contacto
    const contactData = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone ? phone.trim() : null,
      subject: subject.trim(),
      message: message.trim(),
      status: 'nuevo',
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('User-Agent'),
      source: 'website_contact_form'
    };

    // Guardar en Firestore
    const contactRef = await firebase.firestore()
      .collection("contact_messages")
      .add(contactData);

    // Enviar notificación a los administradores
    try {
      await sendNewContactNotification({
        id: contactRef.id,
        ...contactData
      });
    } catch (notificationError) {
      console.error("Error enviando notificación de contacto:", notificationError);
      // No fallar la operación principal por error en notificación
    }

    // Respuesta exitosa
    res.status(201).json({
      message: "Mensaje de contacto enviado exitosamente",
      contact_id: contactRef.id,
      status: "success"
    });

  } catch (error) {
    console.error("Error en submitContact:", error);
    
    // Manejo específico de errores de Firebase
    if (error.code === 'permission-denied') {
      return res.status(403).json({
        error: "No tienes permisos para enviar mensajes de contacto",
        code: "PERMISSION_DENIED"
      });
    }

    if (error.code === 'unavailable') {
      return res.status(503).json({
        error: "Servicio temporalmente no disponible. Intenta de nuevo más tarde.",
        code: "SERVICE_UNAVAILABLE"
      });
    }

    // Error genérico
    res.status(500).json({
      error: "Error interno del servidor",
      code: "INTERNAL_SERVER_ERROR"
    });
  }
}

/**
 * Obtener mensajes de contacto (solo para administradores)
 * @param {Object} req - Request object  
 * @param {Object} res - Response object
 */
export async function getContactMessages(req, res) {
  try {
    const { page = 1, limit = 20, status = null } = req.query;
    
    // Verificar que el usuario es administrador
    if (!req.user || !req.user.admin) {
      return res.status(403).json({
        error: "Solo los administradores pueden ver los mensajes de contacto",
        code: "ADMIN_REQUIRED"
      });
    }

    // Construir la consulta
    let query = firebase.firestore()
      .collection("contact_messages")
      .orderBy("timestamp", "desc");

    // Filtrar por estado si se especifica
    if (status && ['nuevo', 'leido', 'respondido', 'cerrado'].includes(status)) {
      query = query.where("status", "==", status);
    }

    // Paginación
    const pageSize = Math.min(parseInt(limit), 50); // Máximo 50 por página
    const offset = (parseInt(page) - 1) * pageSize;
    
    if (offset > 0) {
      const countSnapshot = await query.limit(offset).get();
      if (countSnapshot.docs.length > 0) {
        query = query.startAfter(countSnapshot.docs[countSnapshot.docs.length - 1]);
      }
    }

    query = query.limit(pageSize);

    // Ejecutar la consulta
    const snapshot = await query.get();
    
    const messages = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate()?.toISOString()
    }));

    // Contar total de mensajes para paginación
    const totalSnapshot = await firebase.firestore()
      .collection("contact_messages")
      .get();

    res.status(200).json({
      messages,
      pagination: {
        current_page: parseInt(page),
        page_size: pageSize,
        total_messages: totalSnapshot.size,
        total_pages: Math.ceil(totalSnapshot.size / pageSize)
      }
    });

  } catch (error) {
    console.error("Error en getContactMessages:", error);
    
    res.status(500).json({
      error: "Error obteniendo mensajes de contacto",
      code: "INTERNAL_SERVER_ERROR"
    });
  }
}

/**
 * Marcar mensaje como leído
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
export async function markAsRead(req, res) {
  try {
    const { messageId } = req.params;
    
    // Verificar que el usuario es administrador
    if (!req.user || !req.user.admin) {
      return res.status(403).json({
        error: "Solo los administradores pueden marcar mensajes",
        code: "ADMIN_REQUIRED"
      });
    }

    await firebase.firestore()
      .collection("contact_messages")
      .doc(messageId)
      .update({
        status: 'leido',
        read_at: firebase.firestore.FieldValue.serverTimestamp(),
        read_by: req.user.uid
      });

    res.status(200).json({
      message: "Mensaje marcado como leído",
      status: "success"
    });

  } catch (error) {
    console.error("Error en markAsRead:", error);
    
    res.status(500).json({
      error: "Error marcando mensaje como leído",
      code: "INTERNAL_SERVER_ERROR"
    });
  }
}