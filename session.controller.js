import firebase from "../services/firebase.js";
import jwt from "jsonwebtoken";
import { createAccessToken, createRefreshToken, hashRefreshToken } from "../utils/token.js";

// Función para obtener el rol del usuario
async function getUserRole(uid) {
  try {
    const userDoc = await firebase.firestore().collection("users").doc(uid).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      // Forzar admin para donantescontacto@gmail.com
      if (userData.email && userData.email === 'donantescontacto@gmail.com') {
        return 'admin';
      }
      // Manejar diferentes formatos de rol
      if (userData.roleId) {
        if (userData.roleId === '/roles/admin') return 'admin';
        if (userData.roleId === '/roles/user') return 'user';
      }
      if (userData.role) {
        return userData.role === 'admin' ? 'admin' : 'user';
      }
      return 'user';
    }
    return 'user';
  } catch (error) {
    console.error('Error al obtener rol del usuario:', error);
    return 'user';
  }
}

// Función para obtener roleId para el token
async function getUserRoleId(uid) {
  try {
    const userDoc = await firebase.firestore().collection("users").doc(uid).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      return userData.roleId || '/roles/user'; // Por defecto '/roles/user'
    }
    return '/roles/user';
  } catch (error) {
    console.error('Error al obtener roleId del usuario:', error);
    return '/roles/user';
  }
}

// Función para registrar un nuevo usuario
export async function register(req, res) {
  const { uid, email, displayName, role = 'user' } = req.body;

  try {
    const sid = firebase.firestore().collection("sessions").doc().id;
    const refreshToken = createRefreshToken({ uid, sid });
    const hash = hashRefreshToken(refreshToken);

    // Determinar roleId basado en el rol
    const finalRole = role === 'admin' ? 'admin' : 'user';
    const roleId = role === 'admin' ? '/roles/admin' : '/roles/user';

    // Crear el documento del usuario con rol y roleId
    await firebase.firestore().collection("users").doc(uid).set({
      email,
      displayName,
      role: finalRole,
      roleId: roleId,
      createdAt: Date.now()
    });

    await firebase.firestore().collection("sessions").doc(sid).set({
      uid,
      refreshTokenHash: hash,
      createdAt: Date.now(),
      revoked: false,
      userAgent: req.headers["user-agent"],
      ip: req.ip
    });

    // Incluir tanto role como roleId en el token de acceso
    const accessToken = createAccessToken({
      uid,
      role: finalRole,
      roleId: roleId
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: "Strict"
    });
    return res.json({ accessToken, refreshToken });
  } catch (error) {
    console.error('Error en registro:', error);
    return res.status(500).json({
      error: "Error al registrar usuario",
      code: "REGISTRATION_ERROR"
    });
  }
}

// Función para solicitar reset de contraseña
export async function requestPasswordReset(req, res) {
  const { email } = req.body;

  try {
    // En una implementación real, aquí enviarías el email
    // Por ahora solo simulamos éxito
    return res.json({
      message: "Si el email existe, recibirás instrucciones para restablecer tu contraseña"
    });
  } catch (error) {
    return res.status(500).json({
      error: "Error al procesar la solicitud",
      code: "RESET_REQUEST_ERROR"
    });
  }
}

// Función para resetear contraseña
export async function resetPassword(req, res) {
  const { token, newPassword } = req.body;

  try {
    // En una implementación real, aquí verificarías el token y cambiarías la contraseña
    // Por ahora solo simulamos éxito
    return res.json({
      message: "Contraseña actualizada correctamente"
    });
  } catch (error) {
    return res.status(500).json({
      error: "Error al restablecer contraseña",
      code: "RESET_PASSWORD_ERROR"
    });
  }
}

export async function login(req, res) {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ error: "Falta idToken" });
  }

  let uid;
  try {
    const decodedToken = await firebase.auth().verifyIdToken(idToken);
    uid = decodedToken.uid;
    console.log('🔓 Token verificado para UID:', uid);
  } catch (error) {
    console.error('❌ Error al verificar token:', error);
    return res.status(401).json({ error: "Token inválido" });
  }

  console.log('🔑 Login iniciado para UID:', uid);

  try {
    // Verificar si el usuario existe en Firestore, si no, crearlo
    const userDoc = await firebase.firestore().collection("users").doc(uid).get();

    if (!userDoc.exists) {
      console.log('👤 Creando usuario nuevo para UID:', uid);
      // Crear usuario básico si no existe
      await firebase.firestore().collection("users").doc(uid).set({
        role: 'user',
        roleId: '/roles/user',
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }

    // Obtener el rol y roleId del usuario
    const userRole = await getUserRole(uid);
    const userRoleId = await getUserRoleId(uid);

    const sid = firebase.firestore().collection("sessions").doc().id;
    const refreshToken = createRefreshToken({ uid, sid });
    const hash = hashRefreshToken(refreshToken);

    await firebase.firestore().collection("sessions").doc(sid).set({
      uid,
      refreshTokenHash: hash,
      createdAt: Date.now(),
      revoked: false,
      userAgent: req.headers["user-agent"],
      ip: req.ip
    });

    // Incluir tanto role como roleId en el token de acceso
    const accessToken = createAccessToken({
      uid,
      role: userRole,
      roleId: userRoleId
    });

    res.cookie("refreshToken", refreshToken, { httpOnly: true, sameSite: "Strict" });
    console.log('✅ Login exitoso para UID:', uid, 'Rol:', userRole);
    return res.json({ accessToken, refreshToken });
  } catch (error) {
    console.error('❌ Error en login:', error.message);
    return res.status(500).json({
      error: "Error al iniciar sesión",
      code: "LOGIN_ERROR",
      details: error.message
    });
  }
}

// lista sesiones del usuario
export async function listSessions(req, res) {
  const { uid } = req.user;
  const snap = await firebase.firestore()
    .collection("sessions")
    .where("uid", "==", uid).get();

  const sessions = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  res.json(sessions);
}

// revocar una sesión específica
export async function revokeSession(req, res) {
  const { id } = req.params;
  await firebase.firestore().collection("sessions").doc(id).update({ revoked: true });
  res.json({ message: "Sesión revocada" });
}
// revocar todas las sesiones del usuario
export async function revokeAllSessions(req, res) {
  const { uid } = req.user;
  const snap = await firebase.firestore()
    .collection("sessions")
    .where("uid", "==", uid).get();
  const batch = firebase.firestore().batch();
  snap.docs.forEach(doc => {
    batch.update(doc.ref, { revoked: true });
  });
  await batch.commit();
  res.json({ message: "Todas las sesiones revocadas" });
}

// Refresh endpoint (body-based for development)
export async function refresh(req, res) {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ message: "Falta refresh token" });

  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_SECRET);
    const { uid, sid } = decoded;

    const snap = await firebase.firestore().collection("sessions").doc(sid).get();
    if (!snap.exists || snap.data().revoked) {
      return res.status(401).json({ message: "Sesión no válida" });
    }

    // Obtener el rol y roleId del usuario para el nuevo token
    const userRole = await getUserRole(uid);
    const userRoleId = await getUserRoleId(uid);

    const accessToken = createAccessToken({
      uid,
      role: userRole,
      roleId: userRoleId
    });

    // No rotamos refresh token aquí; en producción se recomienda rotarlo.
    return res.json({ accessToken, refreshToken });
  } catch (err) {
    return res.status(401).json({ message: "Refresh token inválido" });
  }
}

// Logout endpoint (acepta refreshToken en body o cookie)
export async function logout(req, res) {
  const refreshFromBody = req.body?.refreshToken;
  const refresh = refreshFromBody || req.cookies?.refreshToken;

  if (refresh) {
    try {
      const decoded = jwt.verify(refresh, process.env.REFRESH_SECRET);
      const { sid } = decoded;
      await firebase.firestore().collection("sessions").doc(sid).update({ revoked: true });
    } catch (e) {
      // ignore errors
    }
  }

  res.clearCookie("refreshToken");
  res.json({ message: "Logged out" });
}