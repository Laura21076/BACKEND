import jwt from "jsonwebtoken";
import { firebase } from "../services/firebase.js";

// Cache para tokens en blacklist (temporalmente hasta que expiren)
const tokenBlacklist = new Map();

// Limpiar tokens expirados del blacklist cada hora
setInterval(() => {
  const now = Date.now() / 1000;
  for (const [token, exp] of tokenBlacklist.entries()) {
    if (exp < now) {
      tokenBlacklist.delete(token);
    }
  }
}, 3600000); // 1 hora

export function verifyToken(token, secret) {
  if (tokenBlacklist.has(token)) {
    throw new Error("Token revocado");
  }
  return jwt.verify(token, secret);
}

export function blacklistToken(token) {
  try {
    const decoded = jwt.decode(token);
    if (decoded && decoded.exp) {
      tokenBlacklist.set(token, decoded.exp);
    }
  } catch (error) {
    console.error("Error al agregar token a blacklist:", error);
  }
}

export async function verifyUserRole(uid, requiredRole) {
  try {
    const userDoc = await firebase.firestore()
      .collection("users")
      .doc(uid)
      .get();

    if (!userDoc.exists) {
      throw new Error("Usuario no encontrado");
    }

    const userData = userDoc.data();
    return userData.role === requiredRole;
  } catch (error) {
    console.error("Error al verificar rol de usuario:", error);
    return false;
  }
}

// Middleware para verificar roles
export function requireRole(role) {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.uid) {
        return res.status(401).json({
          error: "No autorizado",
          code: "UNAUTHORIZED"
        });
      }

      const hasRole = await verifyUserRole(req.user.uid, role);
      if (!hasRole) {
        return res.status(403).json({
          error: "Acceso denegado",
          code: "FORBIDDEN",
          message: "No tiene los permisos necesarios"
        });
      }

      next();
    } catch (error) {
      console.error("Error al verificar rol:", error);
      return res.status(500).json({
        error: "Error al verificar permisos",
        code: "ROLE_VERIFICATION_ERROR"
      });
    }
  };
}