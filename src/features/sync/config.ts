// Configuración de Firebase leída de variables de entorno de Vite.
// Este módulo NO importa firebase: así el bundle principal queda liviano.

export interface FirebaseEnvConfig {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket?: string
  messagingSenderId?: string
  appId: string
}

const env = import.meta.env

const read = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

const raw = {
  apiKey: read(env.VITE_FIREBASE_API_KEY),
  authDomain: read(env.VITE_FIREBASE_AUTH_DOMAIN),
  projectId: read(env.VITE_FIREBASE_PROJECT_ID),
  storageBucket: read(env.VITE_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: read(env.VITE_FIREBASE_MESSAGING_SENDER_ID),
  appId: read(env.VITE_FIREBASE_APP_ID),
}

/** null si faltan las variables mínimas: la app funciona sólo en local. */
export const firebaseConfig: FirebaseEnvConfig | null =
  raw.apiKey && raw.authDomain && raw.projectId && raw.appId
    ? {
        apiKey: raw.apiKey,
        authDomain: raw.authDomain,
        projectId: raw.projectId,
        storageBucket: raw.storageBucket,
        messagingSenderId: raw.messagingSenderId,
        appId: raw.appId,
      }
    : null

export const isCloudConfigured = firebaseConfig !== null
