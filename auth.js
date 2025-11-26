import jwt from "jsonwebtoken";
import firebase from "../services/firebase.js";
import { createAccessToken, hashRefreshToken } from "../utils/token.js";

export async function auth(req, res, next) {
  try {
    const header = req.headers.authorization?.split(" ")[1];
    if (!header) {
      return res.status(401).json({ 
        error: "Token no proporcionado", 
        code: "NO_TOKEN" 
      });
    }

    try {
      const decoded = jwt.verify(header, process.env.ACCESS_SECRET);
      
      // Verificar si el token está cerca de expirar (5 minutos)
      const timeToExpire = decoded.exp * 1000 - Date.now();
      if (timeToExpire < 300000) { // 5 minutos
        req.tokenNeedsRefresh = true;
      }
      
      req.user = decoded;
      return next();
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        const refresh = req.cookies.refreshToken;
        if (!refresh) {
          return res.status(401).json({ 
            error: "Sesión expirada", 
            code: "SESSION_EXPIRED",
            message: "Por favor, inicie sesión nuevamente" 
          });
        }

        try {
          const decodedRefresh = jwt.verify(refresh, process.env.REFRESH_SECRET);
          const tokenHash = hashRefreshToken(refresh);

          const session = await firebase.firestore()
            .collection("sessions")
            .doc(decodedRefresh.sid).get();

          if (!session.exists || session.data().revoked) {
            res.clearCookie('refreshToken');
            return res.status(401).json({ 
              error: "Sesión inválida", 
              code: "INVALID_SESSION",
              message: "Su sesión ha sido cerrada por seguridad" 
            });
          }

          // Generar nuevo access token y actualizar refresh token
          const newAccessToken = await createAccessToken(decodedRefresh.uid);
          const newRefreshToken = jwt.sign(
            { uid: decodedRefresh.uid, sid: decodedRefresh.sid },
            process.env.REFRESH_SECRET,
            { expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d' }
          );

          // Actualizar hash del refresh token en la base de datos
          await firebase.firestore()
            .collection("sessions")
            .doc(decodedRefresh.sid)
            .update({
              refreshToken: hashRefreshToken(newRefreshToken),
              updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

          // Establecer nuevas cookies
          res.cookie('refreshToken', newRefreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 días
          });

          req.user = jwt.decode(newAccessToken);
          req.newAccessToken = newAccessToken;
          return next();
        } catch (refreshErr) {
          res.clearCookie('refreshToken');
          return res.status(401).json({ 
            error: "Error al renovar sesión", 
            code: "REFRESH_ERROR",
            message: "Por favor, inicie sesión nuevamente" 
          });
        }
      }

      return res.status(401).json({ 
        error: "Token inválido", 
        code: "INVALID_TOKEN",
        message: "Por favor, inicie sesión nuevamente" 
      });
    }
  } catch (err) {
    return res.status(500).json({ 
      error: "Error interno del servidor", 
      code: "SERVER_ERROR" 
    });
  }
}
