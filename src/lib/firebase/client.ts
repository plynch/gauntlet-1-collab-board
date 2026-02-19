import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
  type Firestore,
} from "firebase/firestore";

type PublicFirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

/**
 * Gets public firebase config.
 */
function getPublicFirebaseConfig(): PublicFirebaseConfig | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const messagingSenderId =
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
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
    appId,
  };
}

const firebaseConfig: PublicFirebaseConfig | null = getPublicFirebaseConfig();

declare global {
  var __firebaseClientAuthEmulatorConnected: boolean | undefined;
  var __firebaseClientFirestoreEmulatorConnected: boolean | undefined;
}

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;
let firebaseDb: Firestore | null = null;

/**
 * Returns whether true is true.
 */
function isTrue(value: string | undefined): boolean {
  return value === "true";
}

/**
 * Handles should use auth emulator.
 */
function shouldUseAuthEmulator(): boolean {
  return (
    isTrue(process.env.NEXT_PUBLIC_USE_AUTH_EMULATOR) ||
    isTrue(process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS)
  );
}

/**
 * Handles should use firestore emulator.
 */
function shouldUseFirestoreEmulator(): boolean {
  return (
    isTrue(process.env.NEXT_PUBLIC_USE_FIRESTORE_EMULATOR) ||
    isTrue(process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS)
  );
}

/**
 * Handles should require firestore emulator in dev.
 */
function shouldRequireFirestoreEmulatorInDev(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    isTrue(process.env.NEXT_PUBLIC_DEV_REQUIRE_FIRESTORE_EMULATOR)
  );
}

/**
 * Returns whether firebase client configured is true.
 */
export function isFirebaseClientConfigured(): boolean {
  return firebaseConfig !== null;
}

/**
 * Handles connect client emulators.
 */
function connectClientEmulators(auth: Auth, db: Firestore): void {
  if (typeof window === "undefined") {
    return;
  }

  if (
    shouldUseAuthEmulator() &&
    !globalThis.__firebaseClientAuthEmulatorConnected
  ) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", {
      disableWarnings: true,
    });
    globalThis.__firebaseClientAuthEmulatorConnected = true;
  }

  if (
    shouldUseFirestoreEmulator() &&
    !globalThis.__firebaseClientFirestoreEmulatorConnected
  ) {
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    globalThis.__firebaseClientFirestoreEmulatorConnected = true;
  }
}

/**
 * Handles assert firestore client usage is safe.
 */
function assertFirestoreClientUsageIsSafe(): void {
  if (!shouldRequireFirestoreEmulatorInDev()) {
    return;
  }

  if (!shouldUseFirestoreEmulator()) {
    throw new Error(
      "Development Firestore usage is blocked. Set NEXT_PUBLIC_USE_FIRESTORE_EMULATOR=true and run Firebase emulators.",
    );
  }
}

/**
 * Gets firebase client app.
 */
export function getFirebaseClientApp(): FirebaseApp {
  if (!firebaseConfig) {
    throw new Error(
      "Firebase client is not configured. Set NEXT_PUBLIC_FIREBASE_* values in .env.local.",
    );
  }

  if (!firebaseApp) {
    firebaseApp =
      getApps().length > 0
        ? getApp()
        : initializeApp({
            apiKey: firebaseConfig.apiKey,
            authDomain: firebaseConfig.authDomain,
            projectId: firebaseConfig.projectId,
            storageBucket: firebaseConfig.storageBucket,
            messagingSenderId: firebaseConfig.messagingSenderId,
            appId: firebaseConfig.appId,
          });
  }

  return firebaseApp;
}

/**
 * Gets firebase client auth.
 */
export function getFirebaseClientAuth(): Auth {
  if (!firebaseAuth) {
    firebaseAuth = getAuth(getFirebaseClientApp());
  }

  if (!firebaseDb) {
    if (shouldUseFirestoreEmulator() || shouldRequireFirestoreEmulatorInDev()) {
      firebaseDb = getFirestore(getFirebaseClientApp());
    }
  }

  if (firebaseDb) {
    connectClientEmulators(firebaseAuth, firebaseDb);
  } else if (
    typeof window !== "undefined" &&
    shouldUseAuthEmulator() &&
    !globalThis.__firebaseClientAuthEmulatorConnected
  ) {
    connectAuthEmulator(firebaseAuth, "http://127.0.0.1:9099", {
      disableWarnings: true,
    });
    globalThis.__firebaseClientAuthEmulatorConnected = true;
  }

  return firebaseAuth;
}

/**
 * Gets firebase client db.
 */
export function getFirebaseClientDb(): Firestore {
  assertFirestoreClientUsageIsSafe();

  if (!firebaseDb) {
    firebaseDb = getFirestore(getFirebaseClientApp());
  }

  if (!firebaseAuth) {
    firebaseAuth = getAuth(getFirebaseClientApp());
  }

  connectClientEmulators(firebaseAuth, firebaseDb);
  return firebaseDb;
}
