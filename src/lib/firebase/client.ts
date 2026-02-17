import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
  type Firestore
} from "firebase/firestore";

type PublicFirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

function getPublicFirebaseConfig(): PublicFirebaseConfig | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

  if (
    !apiKey ||
    !authDomain ||
    !projectId ||
    !storageBucket ||
    !messagingSenderId ||
    !appId
  ) {
    return null;
  }

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId
  };
}

const firebaseConfig: PublicFirebaseConfig | null = getPublicFirebaseConfig();

declare global {
  var __firebaseClientEmulatorsConnected: boolean | undefined;
}

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;
let firebaseDb: Firestore | null = null;

export function isFirebaseClientConfigured(): boolean {
  return firebaseConfig !== null;
}

function connectClientEmulators(auth: Auth, db: Firestore): void {
  if (
    typeof window === "undefined" ||
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS !== "true" ||
    globalThis.__firebaseClientEmulatorsConnected
  ) {
    return;
  }

  connectAuthEmulator(auth, "http://127.0.0.1:9099", {
    disableWarnings: true
  });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  globalThis.__firebaseClientEmulatorsConnected = true;
}

export function getFirebaseClientApp(): FirebaseApp {
  if (!firebaseConfig) {
    throw new Error(
      "Firebase client is not configured. Set NEXT_PUBLIC_FIREBASE_* values in .env.local."
    );
  }

  if (!firebaseApp) {
    firebaseApp = getApps().length > 0 ? getApp() : initializeApp({
      apiKey: firebaseConfig.apiKey,
      authDomain: firebaseConfig.authDomain,
      projectId: firebaseConfig.projectId,
      storageBucket: firebaseConfig.storageBucket,
      messagingSenderId: firebaseConfig.messagingSenderId,
      appId: firebaseConfig.appId
    });
  }

  return firebaseApp;
}

export function getFirebaseClientAuth(): Auth {
  if (!firebaseAuth) {
    firebaseAuth = getAuth(getFirebaseClientApp());
  }

  if (!firebaseDb) {
    firebaseDb = getFirestore(getFirebaseClientApp());
  }

  connectClientEmulators(firebaseAuth, firebaseDb);
  return firebaseAuth;
}

export function getFirebaseClientDb(): Firestore {
  if (!firebaseDb) {
    firebaseDb = getFirestore(getFirebaseClientApp());
  }

  if (!firebaseAuth) {
    firebaseAuth = getAuth(getFirebaseClientApp());
  }

  connectClientEmulators(firebaseAuth, firebaseDb);
  return firebaseDb;
}
