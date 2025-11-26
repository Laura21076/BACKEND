import firebase from "../services/firebase.js";
import multer from 'multer';
import { encryptSensitiveFields, decryptSensitiveFields } from "../utils/encryption.js";

// Configurar multer para manejar archivos en memoria
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen'));
    }
  }
});

// Middleware para subir una sola imagen
export const uploadSingle = upload.single('photo');

// Obtener perfil del usuario actual
export async function getProfile(req, res) {
  try {
    const uid = req.user?.uid;

    if (!uid) {
      return res.status(401).json({ 
        error: "No autenticado",
        code: "UNAUTHORIZED" 
      });
    }

    // Obtener datos del usuario de Firestore
    const userDoc = await firebase.firestore().collection("users").doc(uid).get();

    if (!userDoc.exists) {
      // Si no existe el perfil, crear uno básico con los datos de Auth
      const authUser = await firebase.auth().getUser(uid);
      
      const basicProfile = {
        email: authUser.email,
        displayName: authUser.displayName || "",
        photoURL: authUser.photoURL || "",
        firstName: authUser.displayName?.split(' ')[0] || "",
        lastName: authUser.displayName?.split(' ').slice(1).join(' ') || "",
        phone: "",
        address: "",
        city: "",
        state: "",
        zipCode: "",
        dateOfBirth: "",
        gender: "",
        occupation: "",
        interests: [],
        notifications: {
          email: true,
          push: true,
          sms: false
        },
        privacy: {
          profileVisible: true,
          showEmail: false,
          showPhone: false
        },
        createdAt: authUser.metadata.creationTime,
        lastLoginAt: authUser.metadata.lastSignInTime
      };

      // Guardar perfil básico en Firestore
      await firebase.firestore().collection("users").doc(uid).set({
        ...basicProfile,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      console.log("✅ Perfil básico creado para usuario:", uid);
      return res.json({ uid, ...basicProfile });
    }

    const userData = userDoc.data();
    
    // Asegurar que todos los campos existen con valores por defecto
    const completeProfile = {
      uid,
      email: userData.email || "",
      displayName: userData.displayName || "",
      photoURL: userData.photoURL || "",
      firstName: userData.firstName || "",
      lastName: userData.lastName || "",
      phone: userData.phone || "",
      address: userData.address || "",
      city: userData.city || "", 
      state: userData.state || "",
      zipCode: userData.zipCode || "",
      dateOfBirth: userData.dateOfBirth || "",
      gender: userData.gender || "",
      occupation: userData.occupation || "",
      interests: userData.interests || [],
      notifications: userData.notifications || {
        email: true,
        push: true,
        sms: false
      },
      privacy: userData.privacy || {
        profileVisible: true,
        showEmail: false,
        showPhone: false
      },
      createdAt: userData.createdAt,
      updatedAt: userData.updatedAt,
      lastLoginAt: userData.lastLoginAt
    };

    console.log("✅ Perfil completo obtenido para usuario:", uid);
    
    // Intentar desencriptar campos sensibles antes de enviar al cliente
    let decryptedProfile;
    try {
      decryptedProfile = decryptSensitiveFields(completeProfile);
    } catch (decryptError) {
      console.warn("⚠️ Error al desencriptar campos sensibles, enviando datos sin desencriptar:", decryptError.message);
      // Si falla la desencriptación, enviar los datos sin desencriptar
      decryptedProfile = completeProfile;
    }
    
    res.json(decryptedProfile);
  } catch (error) {
    console.error("Error al obtener perfil:", error);
    res.status(500).json({ 
      error: "Error al obtener perfil",
      code: "FETCH_ERROR",
      details: error.message 
    });
  }
}

// Actualizar perfil del usuario
export async function updateProfile(req, res) {
  try {
    const uid = req.user?.uid;

    if (!uid) {
      return res.status(401).json({ 
        error: "No autenticado",
        code: "UNAUTHORIZED" 
      });
    }

    const {
      firstName,
      lastName,
      displayName,
      phone,
      address,
      city,
      state,
      zipCode,
      photoURL
    } = req.body;

    // Preparar datos para actualizar
    const updateData = {
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (displayName !== undefined) updateData.displayName = displayName;
    if (phone !== undefined) updateData.phone = phone;
    if (address !== undefined) updateData.address = address;
    if (city !== undefined) updateData.city = city;
    if (state !== undefined) updateData.state = state;
    if (zipCode !== undefined) updateData.zipCode = zipCode;
    if (photoURL !== undefined) updateData.photoURL = photoURL;

    // Si se proporciona nombre completo, actualizar también en displayName
    if (firstName && lastName) {
      updateData.displayName = `${firstName} ${lastName}`;
    }

    // Encriptar campos sensibles antes de guardar en la base de datos
    const encryptedData = encryptSensitiveFields(updateData);
    console.log("🔐 Datos encriptados para almacenamiento seguro");

    // Actualizar en Firestore con datos encriptados
    await firebase.firestore().collection("users").doc(uid).set(
      encryptedData,
      { merge: true }
    );

    // Actualizar displayName en Firebase Auth si cambió (sin encriptar)
    if (updateData.displayName) {
      await firebase.auth().updateUser(uid, {
        displayName: updateData.displayName
      });
    }

    // Actualizar photoURL en Firebase Auth si cambió (sin encriptar)
    if (photoURL) {
      await firebase.auth().updateUser(uid, {
        photoURL: photoURL
      });
    }

    console.log("✅ Perfil actualizado con encriptación para usuario:", uid);

    // Retornar datos sin encriptar al cliente
    res.json({ 
      message: "Perfil actualizado exitosamente",
      data: updateData 
    });
  } catch (error) {
    console.error("Error al actualizar perfil:", error);
    res.status(500).json({ 
      error: "Error al actualizar perfil",
      code: "UPDATE_ERROR",
      details: error.message 
    });
  }
}

// Actualizar email del usuario
export async function updateEmail(req, res) {
  try {
    const uid = req.user?.uid;
    const { newEmail } = req.body;

    if (!uid) {
      return res.status(401).json({ 
        error: "No autenticado",
        code: "UNAUTHORIZED" 
      });
    }

    if (!newEmail) {
      return res.status(400).json({ 
        error: "Email requerido",
        code: "MISSING_EMAIL" 
      });
    }

    // Actualizar en Firebase Auth
    await firebase.auth().updateUser(uid, {
      email: newEmail
    });

    // Actualizar en Firestore
    await firebase.firestore().collection("users").doc(uid).update({
      email: newEmail,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    res.json({ 
      message: "Email actualizado exitosamente",
      email: newEmail 
    });
  } catch (error) {
    console.error("Error al actualizar email:", error);
    res.status(500).json({ 
      error: "Error al actualizar email",
      code: "UPDATE_EMAIL_ERROR",
      details: error.message 
    });
  }
}

// Cambiar contraseña
export async function updatePassword(req, res) {
  try {
    const uid = req.user?.uid;
    const { newPassword } = req.body;

    if (!uid) {
      return res.status(401).json({ 
        error: "No autenticado",
        code: "UNAUTHORIZED" 
      });
    }

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ 
        error: "La contraseña debe tener al menos 6 caracteres",
        code: "INVALID_PASSWORD" 
      });
    }

    // Actualizar contraseña en Firebase Auth
    await firebase.auth().updateUser(uid, {
      password: newPassword
    });

    res.json({ message: "Contraseña actualizada exitosamente" });
  } catch (error) {
    console.error("Error al actualizar contraseña:", error);
    res.status(500).json({ 
      error: "Error al actualizar contraseña",
      code: "UPDATE_PASSWORD_ERROR",
      details: error.message 
    });
  }
}

// Subir foto de perfil - TEMPORAL: usando base64 hasta que Firebase Storage esté configurado
export async function uploadProfilePhoto(req, res) {
  try {
    const uid = req.user?.uid;
    if (!uid) {
      return res.status(401).json({ 
        error: "No autenticado",
        code: "UNAUTHORIZED" 
      });
    }
    if (!req.file) {
      return res.status(400).json({ 
        error: "No se proporcionó ningún archivo",
        code: "MISSING_FILE" 
      });
    }
    console.log("📸 Subiendo foto para usuario:", uid);
    console.log("📄 Archivo:", req.file.originalname, req.file.size, "bytes");

    // Subir a Firebase Storage
    const bucket = req.file.bucket
      ? firebase.storage().bucket(req.file.bucket)
      : firebase.storage().bucket();
    const fileName = `profile_photos/${uid}_${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`;
    const file = bucket.file(fileName);
    await file.save(req.file.buffer, {
      metadata: {
        contentType: req.file.mimetype,
        cacheControl: 'public,max-age=31536000',
      },
      public: true
    });
    // Obtener URL pública
    const photoURL = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(fileName)}?alt=media`;

    // Guardar URL en el perfil del usuario (en RTDB o Firestore según migración)
    if (firebase.database) {
      // RTDB
      await firebase.database().ref(`users/${uid}`).update({
        photoURL,
        updatedAt: Date.now()
      });
    } else {
      // Firestore (fallback)
      await firebase.firestore().collection("users").doc(uid).update({
        photoURL,
        updatedAt: new Date()
      });
    }

    res.json({ 
      message: "Foto de perfil actualizada exitosamente en Firebase Storage",
      photoURL
    });
  } catch (error) {
    console.error("❌ Error al subir foto:", error);
    res.status(500).json({ 
      error: "Error interno del servidor",
      code: "UPLOAD_ERROR",
      details: error.message
    });
  }
}
