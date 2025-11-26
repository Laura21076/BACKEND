import crypto from 'crypto';

// Algoritmo de encriptación
const ALGORITHM = 'aes-256-gcm';
const SECRET_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32); // 32 bytes key
const IV_LENGTH = 16; // Para AES, esto es siempre 16

// Encriptar datos sensibles
export function encrypt(text) {
  if (!text || typeof text !== 'string') return text;
  
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipher(ALGORITHM, SECRET_KEY);
    cipher.setAAD(Buffer.from('additional_data', 'utf8'));
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Retornar iv + authTag + datos encriptados como string hex
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('❌ Error al encriptar:', error);
    return text; // Retornar texto original si falla la encriptación
  }
}

// Desencriptar datos
export function decrypt(encryptedData) {
  if (!encryptedData || typeof encryptedData !== 'string' || !encryptedData.includes(':')) {
    return encryptedData; // Retornar tal como viene si no está encriptado
  }
  
  try {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) return encryptedData;
    
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const decipher = crypto.createDecipher(ALGORITHM, SECRET_KEY);
    decipher.setAuthTag(authTag);
    decipher.setAAD(Buffer.from('additional_data', 'utf8'));
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('❌ Error al desencriptar:', error);
    return encryptedData; // Retornar datos originales si falla la desencriptación
  }
}

// Encriptar campos sensibles de un objeto
export function encryptSensitiveFields(userData) {
  if (!userData || typeof userData !== 'object') return userData;
  
  const sensitiveFields = ['phone', 'address', 'dateOfBirth', 'occupation'];
  const encrypted = { ...userData };
  
  sensitiveFields.forEach(field => {
    if (encrypted[field]) {
      encrypted[field] = encrypt(encrypted[field]);
    }
  });
  
  return encrypted;
}

// Desencriptar campos sensibles de un objeto
export function decryptSensitiveFields(userData) {
  if (!userData || typeof userData !== 'object') return userData;
  
  const sensitiveFields = ['phone', 'address', 'dateOfBirth', 'occupation'];
  const decrypted = { ...userData };
  
  sensitiveFields.forEach(field => {
    if (decrypted[field]) {
      decrypted[field] = decrypt(decrypted[field]);
    }
  });
  
  return decrypted;
}