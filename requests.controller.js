import firebase from "../services/firebase.js";
import { 
  sendNewRequestNotification,
  sendRequestApprovedNotification 
} from "./notifications.controller.js";

// Generar código de acceso aleatorio de 4 dígitos
function generateAccessCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// Solicitar un artículo
export async function requestArticle(req, res) {
  try {
    const { articleId, message } = req.body;
    const requesterId = req.user?.uid;

    if (!requesterId) {
      return res.status(401).json({ 
        error: "No autenticado",
        code: "UNAUTHORIZED" 
      });
    }

    if (!articleId) {
      return res.status(400).json({ 
        error: "ID de artículo requerido",
        code: "MISSING_ARTICLE_ID" 
      });
    }

    // Verificar que el artículo existe y está disponible
    const articleDoc = await firebase.firestore().collection("articles").doc(articleId).get();
    
    if (!articleDoc.exists) {
      return res.status(404).json({ 
        error: "Artículo no encontrado",
        code: "ARTICLE_NOT_FOUND" 
      });
    }

    const article = articleDoc.data();
    
    if (article.status !== "disponible") {
      return res.status(400).json({ 
        error: "El artículo no está disponible",
        code: "ARTICLE_NOT_AVAILABLE" 
      });
    }

    // Verificar que no sea el dueño solicitando su propio artículo
    if (article.uid === requesterId) {
      return res.status(400).json({ 
        error: "No puedes solicitar tu propio artículo",
        code: "CANNOT_REQUEST_OWN_ARTICLE" 
      });
    }

    // Generar código de acceso
    const accessCode = generateAccessCode();

    // Crear la solicitud
    const requestRef = await firebase.firestore().collection("requests").add({
      articleId,
      articleTitle: article.title,
      donorId: article.uid,
      requesterId,
      message: message || "",
      accessCode,
      status: "pendiente", // pendiente, aprobada, rechazada, completada
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Actualizar estado del artículo a reservado
    await articleDoc.ref.update({
      status: "reservado",
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Obtener información del solicitante para la notificación
    try {
      const requesterDoc = await firebase.firestore().collection("users").doc(requesterId).get();
      const requesterName = requesterDoc.exists ? 
        requesterDoc.data().displayName || req.user.name || "Usuario" : 
        req.user.name || "Usuario";

      // Enviar notificación al dueño del artículo
      await sendNewRequestNotification(article.uid, article.title, requesterName);
      console.log(`📧 Notificación enviada al propietario del artículo ${articleId}`);
    } catch (notifError) {
      console.error("Error al enviar notificación:", notifError);
      // No fallar la solicitud por error de notificación
    }

    res.status(201).json({ 
      message: "Solicitud enviada exitosamente",
      requestId: requestRef.id,
      accessCode
    });
  } catch (error) {
    console.error("Error al solicitar artículo:", error);
    res.status(500).json({ 
      error: "Error al procesar solicitud",
      code: "REQUEST_ERROR",
      details: error.message 
    });
  }
}

// Obtener mis solicitudes (como solicitante) - DATOS REALES DE FIRESTORE
export async function getMyRequests(req, res) {
  try {
    const uid = req.user?.uid;

    if (!uid) {
      return res.status(401).json({ 
        error: "No autenticado",
        code: "UNAUTHORIZED" 
      });
    }

    console.log("🔍 Buscando mis solicitudes en Firestore para usuario:", uid);

    try {
      // Intentar consulta con orderBy primero
      const snapshot = await firebase.firestore()
        .collection("requests")
        .where("requesterId", "==", uid)
        .orderBy("createdAt", "desc")
        .get();

      const requests = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        let createdAt;
        if (data.createdAt) {
          if (typeof data.createdAt.toDate === 'function') {
            createdAt = data.createdAt.toDate().toISOString();
          } else if (data.createdAt instanceof Date) {
            createdAt = data.createdAt.toISOString();
          } else if (typeof data.createdAt === 'string') {
            createdAt = data.createdAt;
          } else {
            createdAt = new Date().toISOString();
          }
        } else {
          createdAt = new Date().toISOString();
        }
        requests.push({ 
          id: doc.id, 
          ...data,
          createdAt
        });
      });

      console.log("✅ Mis solicitudes encontradas en Firestore:", requests.length);
      
      if (requests.length === 0) {
        console.log("📋 No se encontraron solicitudes, mostrando datos de ejemplo");
        // Si no hay datos reales, mostrar ejemplos
        const exampleRequests = [
          {
            id: "example-1",
            articleTitle: "Laptop Dell Inspiron",
            articleDescription: "Laptop en buen estado para estudiante",
            status: "pendiente",
            createdAt: new Date(),
            donorId: "example-donor-1",
            donorEmail: "donador@example.com",
            message: "Necesito una laptop para mis estudios universitarios",
            articleId: "laptop-001"
          },
          {
            id: "example-2", 
            articleTitle: "Silla de oficina",
            articleDescription: "Silla ergonómica para trabajar",
            status: "aprobada",
            createdAt: new Date(Date.now() - 86400000),
            donorId: "example-donor-2",
            donorEmail: "donador2@example.com", 
            message: "Para mi oficina en casa",
            accessCode: "1234",
            lockerId: "A01",
            articleId: "chair-001"
          }
        ];
        return res.json(exampleRequests);
      }
      
      res.json(requests);

    } catch (firestoreError) {
      // Si falla por índices, usar consulta simple sin orderBy
      console.log("⚠️ Error de índices, usando consulta simple:", firestoreError.message);
      
      const snapshot = await firebase.firestore()
        .collection("requests")
        .where("requesterId", "==", uid)
        .get();

      const requests = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        requests.push({ 
          id: doc.id, 
          ...data,
          createdAt: data.createdAt ? data.createdAt.toDate() : new Date()
        });
      });

      // Ordenar en memoria
      requests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      console.log("✅ Mis solicitudes encontradas (sin orderBy):", requests.length);
      res.json(requests);
    }

  } catch (error) {
    console.error("❌ Error al obtener mis solicitudes:", error);
    res.status(500).json({ 
      error: "Error al obtener solicitudes",
      code: "FETCH_ERROR",
      details: error.message 
    });
  }
}

// Obtener solicitudes recibidas (como donador)
export async function getReceivedRequests(req, res) {
  try {
    const uid = req.user?.uid;

    if (!uid) {
      return res.status(401).json({ 
        error: "No autenticado",
        code: "UNAUTHORIZED" 
      });
    }

    console.log("🔍 Buscando solicitudes recibidas en Firestore para usuario:", uid);

    try {
      // Intentar consulta con orderBy primero
      const snapshot = await firebase.firestore()
        .collection("requests")
        .where("donorId", "==", uid)
        .orderBy("createdAt", "desc")
        .get();

      const requests = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        requests.push({ 
          id: doc.id, 
          ...data,
          // Convertir timestamp a fecha legible
          createdAt: data.createdAt ? data.createdAt.toDate() : new Date()
        });
      });

      console.log("✅ Solicitudes recibidas encontradas en Firestore:", requests.length);
      
      if (requests.length === 0) {
        console.log("📋 No se encontraron solicitudes recibidas, mostrando datos de ejemplo");
        // Si no hay datos reales, mostrar ejemplos
        const exampleRequests = [
          {
            id: "received-example-1",
            articleTitle: "Escritorio de madera",
            articleDescription: "Escritorio en excelente estado",
            status: "pendiente",
            createdAt: new Date(),
            requesterId: "example-requester-1",
            requesterEmail: "estudiante@example.com",
            requesterName: "Ana García",
            message: "Necesito un escritorio para estudiar en casa",
            articleId: "article-1"
          },
          {
            id: "received-example-2",
            articleTitle: "Monitor Samsung 24''",
            articleDescription: "Monitor para computadora",
            status: "pendiente", 
            createdAt: new Date(Date.now() - 3600000), // 1 hora atrás
            requesterId: "example-requester-2",
            requesterEmail: "programador@example.com",
            requesterName: "Carlos López",
            message: "Para trabajo remoto",
            articleId: "article-2"
          },
          {
            id: "received-example-3",
            articleTitle: "Silla ergonómica",
            articleDescription: "Silla de oficina en buen estado",
            status: "aprobada", 
            createdAt: new Date(Date.now() - 7200000), // 2 horas atrás
            requesterId: "example-requester-3",
            requesterEmail: "trabajador@example.com",
            requesterName: "María Rodríguez",
            message: "Para mi oficina en casa",
            articleId: "article-3",
            accessCode: "4567",
            lockerId: "B02"
          }
        ];

        console.log("✅ Solicitudes recibidas generadas:", exampleRequests.length);
        res.json(exampleRequests);
      } else {
        res.json(requests);
      }
      
    } catch (orderByError) {
      // Si falla el orderBy, intentar sin él
      console.log("⚠️ OrderBy falló, intentando sin orderBy:", orderByError.message);
      
      const snapshot = await firebase.firestore()
        .collection("requests")
        .where("donorId", "==", uid)
        .get();

      const requests = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        requests.push({ 
          id: doc.id, 
          ...data,
          createdAt: data.createdAt ? data.createdAt.toDate() : new Date()
        });
      });

      // Ordenar manualmente por fecha
      requests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      console.log("✅ Solicitudes recibidas encontradas (sin orderBy):", requests.length);
      res.json(requests);
    }
  } catch (error) {
    console.error("❌ Error al obtener solicitudes recibidas:", error);
    res.status(500).json({ 
      error: "Error al obtener solicitudes",
      code: "FETCH_ERROR",
      details: error.message 
    });
  }
}

// Aprobar una solicitud y asignar casillero
export async function approveRequest(req, res) {
  try {
    const { id } = req.params;
    const { lockerId, lockerLocation } = req.body;
    const uid = req.user?.uid;

    if (!uid) {
      return res.status(401).json({ 
        error: "No autenticado",
        code: "UNAUTHORIZED" 
      });
    }

    const requestDoc = await firebase.firestore().collection("requests").doc(id).get();

    if (!requestDoc.exists) {
      return res.status(404).json({ 
        error: "Solicitud no encontrada",
        code: "REQUEST_NOT_FOUND" 
      });
    }

    const requestData = requestDoc.data();

    // Verificar que el usuario sea el donador
    if (requestData.donorId !== uid) {
      return res.status(403).json({ 
        error: "No autorizado",
        code: "FORBIDDEN" 
      });
    }

    // Actualizar la solicitud
    await requestDoc.ref.update({
      status: "aprobada",
      lockerId: lockerId || null,
      lockerLocation: lockerLocation || null,
      approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Notificar al ESP8266 (si está configurado)
    if (lockerId) {
      await notifyESP8266({
        lockerId,
        accessCode: requestData.accessCode,
        action: "ACTIVATE",
        message: `Codigo: ${requestData.accessCode}`
      });
    }

    // Enviar notificación push al solicitante
    try {
      await sendRequestApprovedNotification(
        requestData.requesterId, 
        requestData.articleTitle, 
        requestData.accessCode
      );
      console.log(`📧 Notificación de aprobación enviada al usuario ${requestData.requesterId}`);
    } catch (notifError) {
      console.error("Error al enviar notificación de aprobación:", notifError);
      // No fallar la aprobación por error de notificación
    }

    res.json({ 
      message: "Solicitud aprobada",
      accessCode: requestData.accessCode
    });
  } catch (error) {
    console.error("Error al aprobar solicitud:", error);
    res.status(500).json({ 
      error: "Error al aprobar solicitud",
      code: "APPROVE_ERROR",
      details: error.message 
    });
  }
}

// Rechazar una solicitud
export async function rejectRequest(req, res) {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const uid = req.user?.uid;

    if (!uid) {
      return res.status(401).json({ 
        error: "No autenticado",
        code: "UNAUTHORIZED" 
      });
    }

    const requestDoc = await firebase.firestore().collection("requests").doc(id).get();

    if (!requestDoc.exists) {
      return res.status(404).json({ 
        error: "Solicitud no encontrada",
        code: "REQUEST_NOT_FOUND" 
      });
    }

    const requestData = requestDoc.data();

    if (requestData.donorId !== uid) {
      return res.status(403).json({ 
        error: "No autorizado",
        code: "FORBIDDEN" 
      });
    }

    // Actualizar la solicitud
    await requestDoc.ref.update({
      status: "rechazada",
      rejectionReason: reason || "",
      rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Liberar el artículo
    await firebase.firestore().collection("articles").doc(requestData.articleId).update({
      status: "disponible",
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    res.json({ message: "Solicitud rechazada" });
  } catch (error) {
    console.error("Error al rechazar solicitud:", error);
    res.status(500).json({ 
      error: "Error al rechazar solicitud",
      code: "REJECT_ERROR",
      details: error.message 
    });
  }
}

// Confirmar retiro del artículo (marca como completado)
export async function confirmPickup(req, res) {
  try {
    const { id } = req.params;
    const uid = req.user?.uid;

    if (!uid) {
      return res.status(401).json({ 
        error: "No autenticado",
        code: "UNAUTHORIZED" 
      });
    }

    const requestDoc = await firebase.firestore().collection("requests").doc(id).get();

    if (!requestDoc.exists) {
      return res.status(404).json({ 
        error: "Solicitud no encontrada",
        code: "REQUEST_NOT_FOUND" 
      });
    }

    const requestData = requestDoc.data();

    // Puede confirmar tanto el donador como el solicitante
    if (requestData.donorId !== uid && requestData.requesterId !== uid) {
      return res.status(403).json({ 
        error: "No autorizado",
        code: "FORBIDDEN" 
      });
    }

    // Actualizar la solicitud
    await requestDoc.ref.update({
      status: "completada",
      completedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Actualizar artículo como donado
    await firebase.firestore().collection("articles").doc(requestData.articleId).update({
      status: "donado",
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    res.json({ message: "Retiro confirmado" });
  } catch (error) {
    console.error("Error al confirmar retiro:", error);
    res.status(500).json({ 
      error: "Error al confirmar retiro",
      code: "CONFIRM_ERROR",
      details: error.message 
    });
  }
}

// Función auxiliar para notificar al ESP8266
async function notifyESP8266(data) {
  try {
    // Aquí se implementaría la comunicación con el ESP8266
    // Podría ser mediante MQTT, HTTP request, o Firebase Realtime Database
    
    // Ejemplo: Guardar en Firebase Realtime Database para que el ESP8266 lo escuche
    await firebase.database().ref(`lockers/${data.lockerId}`).set({
      accessCode: data.accessCode,
      action: data.action,
      message: data.message,
      timestamp: Date.now()
    });
    
    console.log("ESP8266 notificado:", data);
  } catch (error) {
    console.error("Error al notificar ESP8266:", error);
  }
}

// Verificar código de acceso desde el ESP32
export async function verifyAccessCode(req, res) {
  try {
    const { lockerId, accessCode, location } = req.body;

    console.log(`🔑 Verificando código ${accessCode} para casillero ${lockerId}`);

    if (!accessCode) {
      return res.status(400).json({ 
        error: "accessCode es requerido",
        code: "MISSING_PARAMETERS" 
      });
    }

    // Buscar solicitud con ese código
    const snapshot = await firebase.firestore()
      .collection("requests")
      .where("accessCode", "==", accessCode)
      .where("status", "==", "aprobada")
      .limit(1)
      .get();

    if (snapshot.empty) {
      console.log(`❌ Código ${accessCode} no encontrado o no válido`);
      return res.status(401).json({ 
        valid: false,
        error: "Código de acceso inválido",
        message: "El código no existe o ha expirado"
      });
    }

    const requestDoc = snapshot.docs[0];
    const requestData = requestDoc.data();

    // Obtener información del usuario (quien solicita el artículo)
    const requesterDoc = await firebase.auth().getUser(requestData.requesterId);
    const donorDoc = await firebase.auth().getUser(requestData.donorId);

    // Obtener información del artículo
    const articleDoc = await firebase.firestore()
      .collection("articles")
      .doc(requestData.articleId)
      .get();

    const articleData = articleDoc.exists ? articleDoc.data() : {};

    // Determinar acción: DONATE (donador deposita) o RECEIVE (receptor retira)
    // Para simplificar, asumimos que es RECEIVE (receptor retirando)
    const action = "RECEIVE";
    
    console.log(`✅ Código válido para ${requesterDoc.displayName || requesterDoc.email}`);

    // Actualizar solicitud con información de acceso
    await requestDoc.ref.update({
      lastAccessAt: firebase.firestore.FieldValue.serverTimestamp(),
      accessLocation: location || lockerId,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    res.json({ 
      valid: true,
      message: "Acceso concedido",
      action: action,
      user: {
        name: requesterDoc.displayName || requesterDoc.email?.split('@')[0] || "Usuario",
        email: requesterDoc.email
      },
      article: {
        title: requestData.articleTitle || "Artículo",
        id: requestData.articleId
      },
      donor: {
        name: donorDoc.displayName || donorDoc.email?.split('@')[0] || "Donador"
      },
      locker: {
        id: lockerId,
        location: location
      }
    });

  } catch (error) {
    console.error("❌ Error al verificar código:", error);
    res.status(500).json({ 
      error: "Error al verificar código",
      code: "VERIFY_ERROR",
      details: error.message 
    });
  }
}
