import firebase from "../services/firebase.js";

export async function listStorageFiles(req, res) {
  try {
    const { prefix } = req.query;
    const uid = req.user?.uid;
    
    if (!uid) {
      return res.status(401).json({ 
        error: "No autenticado",
        code: "UNAUTHORIZED" 
      });
    }

    // Usar el prefix proporcionado o el directorio del usuario actual
    const searchPrefix = prefix || `articles/${uid}`;
    
    // Obtener referencia al bucket de storage
    const bucket = firebase.storage().bucket();
    
    // Listar archivos en el prefix especificado
    const [files] = await bucket.getFiles({
      prefix: searchPrefix
    });

    const fileList = files.map(file => ({
      name: file.name,
      size: file.metadata.size,
      updated: file.metadata.updated,
      contentType: file.metadata.contentType,
      downloadUrl: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(file.name)}?alt=media`
    }));

    res.json({
      prefix: searchPrefix,
      totalFiles: fileList.length,
      files: fileList
    });

  } catch (error) {
    console.error("Error al listar archivos de storage:", error);
    res.status(500).json({ 
      error: "Error al acceder al storage",
      code: "STORAGE_ERROR",
      details: error.message
    });
  }
}