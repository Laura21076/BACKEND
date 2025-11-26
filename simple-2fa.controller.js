import crypto from 'crypto';
import firebase, { db, auth, storage } from '../services/firebase.js';

// ...existing code...
/**
 * Activar 2FA para un usuario
 */
export async function enable2FA(req, res) {
  try {
    // Archivo renombrado a simple-2fa.controller.mjs para compatibilidad ES Module. No usar este archivo.