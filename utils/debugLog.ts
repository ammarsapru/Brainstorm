/**
 * Debug logging utility for development-only logging
 * In production, logs are completely removed to prevent sensitive data exposure
 * 
 * Usage:
 *   debugLog('MyComponent', 'action completed', { data: 'value' });
 *   debugLog.warn('MyComponent', 'warning message');
 *   debugLog.error('MyComponent', 'error message');
 */

const isDev = import.meta.env.DEV;

export const debugLog = (component: string, message: string, data?: any) => {
  if (isDev) {
    console.log(`[${component}]`, message, data);
  }
};

debugLog.warn = (component: string, message: string, data?: any) => {
  if (isDev) {
    console.warn(`[${component}]`, message, data);
  }
};

debugLog.error = (component: string, message: string, data?: any) => {
  // Always log errors (even in production) for debugging purposes
  console.error(`[${component}]`, message, data);
};

export default debugLog;
