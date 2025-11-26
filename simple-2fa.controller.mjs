import crypto from 'crypto';
import firebase, { db, auth, storage } from '../services/firebase.js';

/**
 * Activar 2FA para un usuario
 */
export async function enable2FA(req, res) {
	try {
		const userId = req.user.uid;
		const email = req.user.email;
		const { method } = req.body; // 'email' o 'sms'

		// Generar código de verificación
		const code = generateVerificationCode();
		const expiry = Date.now() + 5 * 60 * 1000; // 5 minutos

		// Guardar código temporalmente en RTDB
		await firebase.database().ref(`2fa/codes/${userId}_setup`).set({
			code,
			expiry,
			method,
			email,
			attempts: 0
		});

		// Enviar código
		let result;
		if (method === 'email') {
			result = await sendVerificationEmail(email, code);
		} else {
			// SMS no implementado por simplicidad
			return res.status(400).json({
				error: 'Método SMS no disponible actualmente',
				code: 'METHOD_NOT_SUPPORTED'
			});
		}

		res.json({
			success: true,
			message: 'Código de verificación enviado',
			method: result.method,
			destination: result.message,
			expiresIn: 300 // 5 minutos
		});
	} catch (error) {
		console.error('❌ Error activando 2FA:', error);
		res.status(500).json({
			error: 'Error al activar autenticación de dos factores',
			code: 'TWO_FACTOR_ENABLE_ERROR'
		});
	}
}

// ...agregar aquí el resto de funciones exportadas y helpers necesarios...

// Helpers y funciones adicionales
function generateVerificationCode() {
	return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationEmail(email, code) {
	// Simulación de envío de email
	console.log(`📧 Código de verificación para ${email}: ${code}`);
	await new Promise(resolve => setTimeout(resolve, 100));
	return {
		success: true,
		method: 'email',
		message: `Código enviado a ${email.substring(0, 3)}***${email.substring(email.indexOf('@'))}`
	};
}

export async function disable2FASimple(req, res) {
	res.status(501).json({ error: 'No implementado en este stub' });
}
export async function verify2FASetupSimple(req, res) {
	res.status(501).json({ error: 'No implementado en este stub' });
}
export async function requestLoginCode(req, res) {
	res.status(501).json({ error: 'No implementado en este stub' });
}
export async function verifyLoginCode(req, res) {
	res.status(501).json({ error: 'No implementado en este stub' });
}
export async function get2FAStatusSimple(req, res) {
	res.status(501).json({ error: 'No implementado en este stub' });
}
