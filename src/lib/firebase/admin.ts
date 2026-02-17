import "server-only";

import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

function getPrivateKey(): string | undefined {
  const value = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (!value) {
    return undefined;
  }

  return value.replace(/\\n/g, "\n");
}

function canUseApplicationDefaultCredentials(): boolean {
  return Boolean(
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.FIREBASE_CONFIG
  );
}

let firebaseAdminApp: App | null = null;
let firebaseAdminAuth: Auth | null = null;
let firebaseAdminDb: Firestore | null = null;

export function getFirebaseAdminApp(): App {
  if (firebaseAdminApp) {
    return firebaseAdminApp;
  }

  if (getApps().length > 0) {
    firebaseAdminApp = getApp();
    return firebaseAdminApp;
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = getPrivateKey();

  if (projectId && clientEmail && privateKey) {
    firebaseAdminApp = initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey
      })
    });
    return firebaseAdminApp;
  }

  if (canUseApplicationDefaultCredentials()) {
    firebaseAdminApp = initializeApp();
    return firebaseAdminApp;
  }

  throw new Error(
    "Missing Firebase Admin credentials. Set FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY."
  );
}

export function getFirebaseAdminAuth(): Auth {
  if (!firebaseAdminAuth) {
    firebaseAdminAuth = getAuth(getFirebaseAdminApp());
  }

  return firebaseAdminAuth;
}

export function getFirebaseAdminDb(): Firestore {
  if (!firebaseAdminDb) {
    firebaseAdminDb = getFirestore(getFirebaseAdminApp());
  }

  return firebaseAdminDb;
}
