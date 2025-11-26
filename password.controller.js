import firebase from "../services/firebase.js";

export async function requestPasswordReset(req, res) {
  try {
    const { email } = req.body;
    
    // Verificar si el usuario existe
    const userRecord = await firebase.auth().getUserByEmail(email);
    if (!userRecord) {
      return res.status(404).json({
        error: "Usuario no encontrado",
        code: "USER_NOT_FOUND"
      });
    }

    // Generar token de reset
    const resetToken = await firebase.auth().generatePasswordResetLink(email, {
      url: `${process.env.FRONTEND_URL}/reset-password`,
      handleCodeInApp: true
    });

    // Enviar email con el link de reset
    await firebase.auth().sendPasswordResetEmail(email, {
      url: resetToken,
      handleCodeInApp: true
    });

    return res.status(200).json({
      message: "Se ha enviado un correo con las instrucciones para restablecer su contraseña"
    });
  } catch (error) {
    console.error("Error al solicitar reset de contraseña:", error);
    return res.status(500).json({
      error: "Error al procesar la solicitud",
      code: "RESET_REQUEST_ERROR"
    });
  }
}

export async function resetPassword(req, res) {
  try {
    const { oobCode, newPassword } = req.body;

    // Verificar el código OOB (out-of-band code)
    await firebase.auth().verifyPasswordResetCode(oobCode);

    // Confirmar el cambio de contraseña
    await firebase.auth().confirmPasswordReset(oobCode, newPassword);

    // Revocar todas las sesiones existentes por seguridad
    const user = await firebase.auth().getUserByEmail(email);
    await firebase.auth().revokeRefreshTokens(user.uid);

    // Limpiar sesiones en Firestore
    const sessionsRef = firebase.firestore().collection("sessions");
    const sessions = await sessionsRef.where("uid", "==", user.uid).get();
    
    const batch = firebase.firestore().batch();
    sessions.forEach(doc => {
      batch.update(doc.ref, { revoked: true });
    });
    await batch.commit();

    return res.status(200).json({
      message: "Contraseña actualizada correctamente"
    });
  } catch (error) {
    console.error("Error al resetear contraseña:", error);
    return res.status(400).json({
      error: "Error al restablecer la contraseña",
      code: "RESET_ERROR",
      message: "El enlace ha expirado o es inválido"
    });
  }
}