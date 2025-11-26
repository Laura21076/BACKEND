import jwt from "jsonwebtoken";
import crypto from "crypto";
import dotenv from "dotenv";

// Cargar variables de entorno
dotenv.config();

const ACCESS_SECRET = process.env.ACCESS_SECRET;
const REFRESH_SECRET = process.env.REFRESH_SECRET;

// Debug
console.log('🔑 ACCESS_SECRET en token.js:', ACCESS_SECRET ? 'EXISTE' : 'NO EXISTE');

export const createAccessToken = (payload) => {
  if (!ACCESS_SECRET) {
    console.error('❌ ACCESS_SECRET is undefined in createAccessToken');
    throw new Error('ACCESS_SECRET must have a value');
  }
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: "15m" });
};

export const createRefreshToken = (payload) => {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: "30d" });
};

export const hashRefreshToken = (token) => {
  return crypto
    .createHmac("sha256", process.env.REFRESH_SECRET)
    .update(token)
    .digest("hex");
};
