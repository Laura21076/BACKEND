import admin from "firebase-admin";
import { readFileSync } from "fs";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// This file initializes the Firebase Admin SDK for server-side usage.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Support providing service account JSON via the FIREBASE_SERVICE_ACCOUNT
// environment variable (as a JSON string). If not provided, fall back to
// reading from firebase-service-account.json file.
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
      storageBucket: 'donantes-400ba.firebasestorage.app',
      databaseURL: 'https://donantes-400ba-default-rtdb.firebaseio.com'
    });
    console.log("✅ Firebase Admin inicializado con variable de entorno");
  } catch (err) {
    console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT:", err);
    // try file-based initialization below
    initializeFromFile();
  }
} else {
  // Initialize from service account file
  initializeFromFile();
}

function initializeFromFile() {
  try {
    const serviceAccountPath = join(__dirname, '..', 'firebase-service-account.json');
    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
      storageBucket: 'donantes-400ba.firebasestorage.app',
      databaseURL: 'https://donantes-400ba-default-rtdb.firebaseio.com'
    });
    console.log("✅ Firebase Admin inicializado con archivo de service account");
  } catch (err) {
    console.error("Failed to initialize Firebase Admin:", err);
    // Last resort: try default initialization
    admin.initializeApp({
      projectId: "donantes-400ba",
      storageBucket: 'donantes-400ba.firebasestorage.app',
      databaseURL: 'https://donantes-400ba-default-rtdb.firebaseio.com'
    });
    console.log("⚠️ Firebase Admin inicializado con configuración mínima");
  }
}

export default admin;
export const db = admin.database();
export const auth = admin.auth();
export const storage = admin.storage();