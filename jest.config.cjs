/**
 * CONFIGURACIÓN JEST - SISTEMA DE DONACIONES
 * Universidad Tecnológica
 * 
 * Configuración completa para pruebas:
 * - Unitarias
 * - Integración  
 * - Rendimiento
 * - Seguridad
 * - Funcionalidad
 */

module.exports = {
  // Entorno de pruebas
  testEnvironment: 'node',
  
  // Directorios de pruebas
  testMatch: [
    '**/testing/tests/**/*.test.mjs'
  ],
  
  // Archivos a ignorar
  testPathIgnorePatterns: [
    '/node_modules/',
    '/coverage/',
    '<rootDir>/testing/tests/*.test.js'
  ],
  
  // Configuración de cobertura
  collectCoverage: true,
  collectCoverageFrom: [
    'controllers/**/*.js',
    'middleware/**/*.js',
    'services/**/*.js',
    'utils/**/*.js',
    'server.js',
    '!**/node_modules/**',
    '!coverage/**',
    // '!testing/**',
    '!development/**'
  ],
  
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov'],
    transform: {
      '^.+\\.jsx?$': 'babel-jest'
    },
    moduleFileExtensions: ['js', 'json', 'node'],
    transformIgnorePatterns: ['node_modules/(?!(module-that-needs-transpiling)/)'],
      resolver: undefined,
    globals: {
      NODE_ENV: 'test'
    },
  };