import { 
	uploadArticleImage, 
	createArticle, 
	getArticles, 
	getArticleById, 
	updateArticle, 
	getMyArticles, 
	cleanExpiredArticles, 
	deleteArticle 
} from "./controllers/articles.controller.js";
import { login, register, refresh, logout, requestPasswordReset, resetPassword } from "./controllers/session.controller.js";
import firebase from './services/firebase.js';
// ...existing code...

import dotenv from "dotenv";
dotenv.config();

// Configurar modo desarrollo
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
console.log('🌍 Modo:', process.env.NODE_ENV);

// Debug: verificar variables de entorno
console.log('🔑 JWT_SECRET cargado:', process.env.JWT_SECRET ? 'SÍ' : 'NO');
console.log('🔑 ACCESS_SECRET cargado:', process.env.ACCESS_SECRET ? 'SÍ' : 'NO');

import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import session from "express-session";
// Importar medidas de seguridad
import { 
	apiLimiter, 
	authLimiter, 
	helmetConfig, 
	sanitizeInput, 
	securityLogger, 
	preventTimingAttacks 
} from "./middleware/security.js";
import { 
	getReceivedRequests,
	approveRequest,
	rejectRequest,
	confirmPickup
} from "./controllers/requests.controller.js";
import {
	getProfile,
	updateProfile,
	updateEmail,
	updatePassword,
	uploadProfilePhoto,
	uploadSingle
} from "./controllers/profile.controller.js";

import { validateLogin, validateEmailLogin, validateRegistration } from "./middleware/validation.js";
import { auth } from "./middleware/auth.js";
import { firebaseAuth } from "./middleware/firebase-auth.js";
import {
	subscribeUser,
	unsubscribeUser
} from "./controllers/notifications.controller.js";
import {
	submitContact,
	getContactMessages,
	markAsRead
} from "./controllers/contact.controller.js";
import {
	verifyAccessCode,
	getLockerStatus,
	registerLockerEvent,
	setupLocker,
	hardwareHealthCheck
} from "./controllers/hardware.controller.js";
import {
	enable2FA,
	verify2FASetupSimple,
	requestLoginCode,
	verifyLoginCode,
	disable2FASimple,
	get2FAStatusSimple
} from './controllers/simple-2fa.controller.mjs';
import { listStorageFiles } from './controllers/storage.controller.js';

const app = express();

// 🔒 MEDIDAS DE SEGURIDAD OWASP TOP 10 ACTIVADAS
app.use(helmetConfig); // A05: Security Misconfiguration
app.use(securityLogger); // A09: Security Logging and Monitoring Failures  
app.use(preventTimingAttacks); // A07: Timing attacks prevention

// Middlewares globales
app.use(cors({
	origin: [
		"http://127.0.0.1:3000",
		"http://localhost:3000",
		"http://127.0.0.1:5500",
		"http://localhost:5500",
		"http://localhost",
		"http://127.0.0.1",
		"http://localhost:80",
		"http://127.0.0.1:80",
		process.env.FRONTEND_URL || "http://127.0.0.1:5500"
	],
	methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
	allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
	credentials: true
}));
app.use(express.json({ limit: '10mb' })); // Limitar payload
app.use(sanitizeInput); // A03: Injection protection
app.use(cookieParser());

// Configurar sesiones para 2FA
app.use(session({
	secret: process.env.SESSION_SECRET || 'fallback-secret-key-for-development',
	resave: false,
	saveUninitialized: false,
	cookie: {
		secure: process.env.NODE_ENV === 'production', // HTTPS en producción
		httpOnly: true, // Prevenir acceso desde JavaScript del cliente
		maxAge: 1000 * 60 * 60 * 24 // 24 horas
	}
}));

// Middleware de logging mejorado
app.use((req, res, next) => {
	const timestamp = new Date().toLocaleTimeString();
	console.log(`📥 [${timestamp}] ${req.method} ${req.url}`);
	if (Object.keys(req.body || {}).length > 0) {
		console.log(`📄 Body:`, req.body);
	}
	next();
});

// Health check endpoint
app.get("/api/auth/health", apiLimiter, (req, res) => {
	console.log('✅ Health check ejecutado');
	res.json({ 
		status: "ok", 
		server: "main", 
		timestamp: new Date().toISOString(),
		port: process.env.PORT || 8080,
		security: "OWASP Top 10 Active"
	});
});

// 🔐 Rutas de autenticación
app.post("/api/auth/login", authLimiter, validateLogin, login);
app.post("/api/auth/register", authLimiter, validateRegistration, register);
app.post("/api/auth/refresh", authLimiter, refresh);
app.post("/api/auth/logout", apiLimiter, auth, logout);
app.post("/api/auth/request-reset", requestPasswordReset);
app.post("/api/auth/reset-password", resetPassword);

// 🗂️ Rutas de artículos
app.post("/api/articles", apiLimiter, firebaseAuth, uploadArticleImage, createArticle);
app.get("/api/articles", apiLimiter, getArticles);
app.get("/api/articles/my", apiLimiter, firebaseAuth, getMyArticles);
app.get("/api/articles/:id", apiLimiter, getArticleById);
app.put("/api/articles/:id", apiLimiter, firebaseAuth, updateArticle);
app.delete("/api/articles/:id", apiLimiter, firebaseAuth, deleteArticle);
app.post("/api/articles/cleanup", apiLimiter, firebaseAuth, cleanExpiredArticles);

// ...resto de rutas (requests, profile, notifications, hardware, etc.) igual que en server.js...

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
	console.log('🔒 Medidas de seguridad OWASP Top 10 activadas');
	console.log('🛡️ Rate limiting, input sanitization y security headers aplicados');
	console.log('📊 Security logging activado');
	console.log(`Servidor listo en puerto ${PORT} ✅`);
});

export default app;
