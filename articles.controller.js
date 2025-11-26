import firebase from "../services/firebase.js";
import multer from 'multer';

// Middleware para subir una sola imagen de artículo
export const uploadArticleImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo se permiten archivos de imagen'));
  }
}).single('image');

// Crear un nuevo artículo para donar
export async function createArticle(req, res) {
  try {
    const { title, description, location, category, condition } = req.body;
    const uid = req.user?.uid;
    let imageUrl = null;
    if (!uid) {
      return res.status(401).json({ 
        error: "No autenticado",
        code: "UNAUTHORIZED" 
      });
    }
    // Validar campos requeridos
    if (!title || !description) {
      return res.status(400).json({ 
        error: "Título y descripción son requeridos",
        code: "MISSING_FIELDS" 
      });
    }
    // Si se subió imagen, guardarla en Storage
    if (req.file) {
      const bucket = firebase.storage().bucket();
      const fileName = `article_images/${uid}_${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`;
      const file = bucket.file(fileName);
      await file.save(req.file.buffer, {
        metadata: {
          contentType: req.file.mimetype,
          cacheControl: 'public,max-age=31536000',
        },
        public: true
      });
      imageUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(fileName)}?alt=media`;
    } else if (req.body.imageUrl) {
      imageUrl = req.body.imageUrl;
    }
    const now = new Date();
    const expirationDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 días
    // Guardar artículo (RTDB o Firestore según migración)
    let articleId;
    if (firebase.database) {
      // RTDB
      const ref = await firebase.database().ref('articles').push({
        title,
        description,
        imageUrl,
        location: location || null,
        category: category || "general",
        condition: condition || "bueno",
        uid,
        status: "disponible",
        expiresAt: expirationDate.getTime(),
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      articleId = ref.key;
    } else {
      // Firestore (fallback)
      const docRef = await firebase.firestore().collection("articles").add({
        title,
        description,
        imageUrl,
        location: location || null,
        category: category || "general",
        condition: condition || "bueno",
        uid,
        status: "disponible",
        expiresAt: firebase.firestore.Timestamp.fromDate(expirationDate),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      articleId = docRef.id;
    }
    res.status(201).json({ 
      message: "Artículo publicado exitosamente",
      id: articleId,
      expiresAt: expirationDate.toISOString(),
      imageUrl
    });
  } catch (error) {
    console.error("Error al crear artículo:", error);
    res.status(500).json({ 
      error: "Error al publicar artículo",
      code: "CREATE_ERROR",
      details: error.message 
    });
  }
}

// Obtener todos los artículos disponibles
export async function getArticles(req, res) {
  try {
    const { category, status, userId } = req.query;
    let query = firebase.firestore().collection("articles");

    // Filtros opcionales
    if (category) query = query.where("category", "==", category);
    if (status) query = query.where("status", "==", status);
    if (userId) query = query.where("uid", "==", userId);

    try {
      // Intentar con orderBy primero
      const snapshot = await query.orderBy("createdAt", "desc").get();
      
      const articles = [];
      const now = new Date();
      
      snapshot.forEach(doc => {
        const data = doc.data();
        let articleStatus = data.status;
        
        // Verificar si el artículo ha expirado
        if (data.expiresAt && data.expiresAt.toDate() < now && data.status === "disponible") {
          articleStatus = "no_disponible";
          
          // Actualizar estado en Firestore de forma asíncrona
          firebase.firestore().collection("articles").doc(doc.id).update({
            status: "no_disponible",
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          }).catch(err => console.log("Error actualizando estado:", err));
        }
        
        articles.push({ 
          id: doc.id, 
          ...data,
          status: articleStatus,
          timeRemaining: data.expiresAt ? Math.max(0, data.expiresAt.toDate() - now) : null,
          createdAt: data.createdAt?.toDate(),
          expiresAt: data.expiresAt?.toDate()
        });
      });

      res.json(articles);
      
    } catch (orderByError) {
      console.log("⚠️ Error con orderBy, consultando sin ordenar:", orderByError.message);
      
      // Fallback sin orderBy
      const snapshot = await query.get();
      const articles = [];
      const now = new Date();
      
      snapshot.forEach(doc => {
        const data = doc.data();
        let articleStatus = data.status;
        
        if (data.expiresAt && data.expiresAt.toDate() < now && data.status === "disponible") {
          articleStatus = "no_disponible";
        }
        
        articles.push({ 
          id: doc.id, 
          ...data,
          status: articleStatus,
          timeRemaining: data.expiresAt ? Math.max(0, data.expiresAt.toDate() - now) : null,
          createdAt: data.createdAt?.toDate(),
          expiresAt: data.expiresAt?.toDate()
        });
      });
      
      // Ordenar manualmente por fecha
      articles.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      res.json(articles);
    }

  } catch (error) {
    console.error("Error al obtener artículos:", error);
    res.status(500).json({ 
      error: "Error al obtener artículos",
      code: "FETCH_ERROR",
      details: error.message 
    });
  }
}

// Obtener un artículo específico
export async function getArticleById(req, res) {
  try {
    const { id } = req.params;
    const doc = await firebase.firestore().collection("articles").doc(id).get();

    if (!doc.exists) {
      return res.status(404).json({ 
        error: "Artículo no encontrado",
        code: "NOT_FOUND" 
      });
    }

    res.json({ id: doc.id, ...doc.data() });
  } catch (error) {
    console.error("Error al obtener artículo:", error);
    res.status(500).json({ 
      error: "Error al obtener artículo",
      code: "FETCH_ERROR",
      details: error.message 
    });
  }
}

// Actualizar un artículo
export async function updateArticle(req, res) {
  try {
    const { id } = req.params;
    const { title, description, imageUrl, location, category, condition, status } = req.body;
    const uid = req.user?.uid;

    if (!uid) {
      return res.status(401).json({ 
        error: "No autenticado",
        code: "UNAUTHORIZED" 
      });
    }

    const doc = await firebase.firestore().collection("articles").doc(id).get();

    if (!doc.exists) {
      return res.status(404).json({ 
        error: "Artículo no encontrado",
        code: "NOT_FOUND" 
      });
    }

    // Verificar que el usuario sea el dueño del artículo
    if (doc.data().uid !== uid) {
      return res.status(403).json({ 
        error: "No autorizado para editar este artículo",
        code: "FORBIDDEN" 
      });
    }

    const updateData = {
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (title) updateData.title = title;
    if (description) updateData.description = description;
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl;
    if (location !== undefined) updateData.location = location;
    if (category) updateData.category = category;
    if (condition) updateData.condition = condition;
    if (status) updateData.status = status;

    await doc.ref.update(updateData);

    res.json({ 
      message: "Artículo actualizado exitosamente",
      id 
    });
  } catch (error) {
    console.error("Error al actualizar artículo:", error);
    res.status(500).json({ 
      error: "Error al actualizar artículo",
      code: "UPDATE_ERROR",
      details: error.message 
    });
  }
}

// Eliminar un artículo

// Obtener los artículos del usuario actual
export async function getMyArticles(req, res) {
  try {
    const uid = req.user?.uid;

    if (!uid) {
      return res.status(401).json({ 
        error: "No autenticado",
        code: "UNAUTHORIZED" 
      });
    }

    const snapshot = await firebase.firestore()
      .collection("articles")
      .where("uid", "==", uid)
      .orderBy("createdAt", "desc")
      .get();

    const articles = [];
    const now = new Date();
    
    snapshot.forEach(doc => {
      const data = doc.data();
      let articleStatus = data.status;
      
      // Verificar si el artículo ha expirado
      if (data.expiresAt && data.expiresAt.toDate() < now && data.status === "disponible") {
        articleStatus = "no_disponible";
        
        // Actualizar estado en Firestore de forma asíncrona
        firebase.firestore().collection("articles").doc(doc.id).update({
          status: "no_disponible",
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(err => console.log("Error actualizando estado:", err));
      }
      
      articles.push({ 
        id: doc.id, 
        ...data,
        status: articleStatus,
        timeRemaining: data.expiresAt ? Math.max(0, data.expiresAt.toDate() - now) : null,
        createdAt: data.createdAt?.toDate(),
        expiresAt: data.expiresAt?.toDate()
      });
    });

    res.json(articles);
  } catch (error) {
    console.error("Error al obtener mis artículos:", error);
    res.status(500).json({ 
      error: "Error al obtener artículos",
      code: "FETCH_ERROR",
      details: error.message 
    });
  }
}

// Limpiar artículos expirados
export async function cleanExpiredArticles(req, res) {
  try {
    const now = firebase.firestore.Timestamp.now();
    
    // Buscar artículos expirados
    const expiredSnapshot = await firebase.firestore()
      .collection("articles")
      .where("expiresAt", "<=", now)
      .where("status", "==", "disponible")
      .get();

    if (expiredSnapshot.empty) {
      return res.json({ 
        message: "No hay artículos expirados para limpiar",
        cleaned: 0
      });
    }

    // Marcar como no disponible en lugar de eliminar
    const batch = firebase.firestore().batch();
    const cleanedIds = [];

    expiredSnapshot.forEach((doc) => {
      batch.update(doc.ref, {
        status: "no disponible",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      cleanedIds.push(doc.id);
    });

    await batch.commit();

    res.json({ 
      message: `Se han marcado ${cleanedIds.length} artículos como no disponibles`,
      cleaned: cleanedIds.length,
      cleanedIds
    });
  } catch (error) {
    console.error("Error al limpiar artículos expirados:", error);
    res.status(500).json({ 
      error: "Error al limpiar artículos expirados",
      code: "CLEANUP_ERROR",
      details: error.message 
    });
  }
}

// Eliminar un artículo


// Eliminar un art�culo
export async function deleteArticle(req, res) {
  try {
    const { id } = req.params;
    const uid = req.user?.uid;
    
    if (!uid) {
      return res.status(401).json({ 
        error: "No autenticado",
        code: "UNAUTHORIZED" 
      });
    }

    if (!id) {
      return res.status(400).json({ 
        error: "ID de art�culo requerido",
        code: "MISSING_ARTICLE_ID" 
      });
    }

    // Verificar que el art�culo existe
    const articleDoc = await firebase.firestore().collection("articles").doc(id).get();
    
    if (!articleDoc.exists) {
      return res.status(404).json({ 
        error: "Art�culo no encontrado",
        code: "ARTICLE_NOT_FOUND" 
      });
    }

    const article = articleDoc.data();
    
    // Verificar que el usuario es el propietario
    if (article.uid !== uid) {
      return res.status(403).json({ 
        error: "No tienes permisos para eliminar este art�culo",
        code: "FORBIDDEN" 
      });
    }

    // Eliminar el art�culo
    await articleDoc.ref.delete();
    
    console.log(` Art�culo eliminado: ${id} por usuario: ${uid}`);
    
    res.json({ 
      message: "Art�culo eliminado exitosamente",
      id
    });
  } catch (error) {
    console.error("Error al eliminar art�culo:", error);
    res.status(500).json({ 
      error: "Error al eliminar art�culo",
      code: "DELETE_ERROR",
      details: error.message 
    });
  }
}
