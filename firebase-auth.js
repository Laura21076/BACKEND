import firebase from "../services/firebase.js";

export async function firebaseAuth(req, res, next) {
  try {
    const header = req.headers.authorization?.split(" ")[1];
    if (!header) {
      return res.status(401).json({ 
        error: "Token no proporcionado", 
        code: "NO_TOKEN" 
      });
    }

    try {
      // Verificar Firebase ID Token usando Firebase Admin SDK
      const decodedToken = await firebase.auth().verifyIdToken(header);
      
      // Agregar información del usuario al request
      req.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        email_verified: decodedToken.email_verified,
        firebase: decodedToken
      };
      
      console.log('✅ Firebase token verificado para usuario:', req.user.uid);
      return next();
    } catch (err) {
      console.error('❌ Error verificando Firebase token:', err.message);
      return res.status(401).json({ 
        error: "Token inválido", 
        code: "INVALID_TOKEN",
        message: "Por favor, inicie sesión nuevamente" 
      });
    }
  } catch (error) {
    console.error('❌ Error en middleware de autenticación:', error);
    return res.status(500).json({ 
      error: "Error interno del servidor", 
      code: "INTERNAL_ERROR" 
    });
  }
}