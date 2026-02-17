# CollabBoard

Next.js + TypeScript scaffold for the collaborative whiteboard MVP.

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Copy environment template:

```bash
cp .env.example .env.local
```

3. Fill `.env.local` with Firebase values.

4. Run development server:

```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000).

## Firebase setup (Step 2)

### 1) Create Firebase project

- Go to Firebase Console and create a project.
- Enable Authentication and turn on Google provider.
- Create a Firestore database.
- Create a Web App in project settings and copy config values.

### 2) Set client env vars

Populate these in `.env.local`:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

### 3) Set admin env vars (server-side only)

From Firebase project settings > Service accounts, create a key and set:

- `FIREBASE_ADMIN_PROJECT_ID`
- `FIREBASE_ADMIN_CLIENT_EMAIL`
- `FIREBASE_ADMIN_PRIVATE_KEY`

For `FIREBASE_ADMIN_PRIVATE_KEY`, keep newline escapes (`\\n`) in `.env.local`.

### 4) Set Firebase project alias

Update `.firebaserc` and replace:

- `replace-with-your-firebase-project-id`

### 5) Local emulators (optional but recommended)

```bash
npm run firebase:emulators
```

To use emulators from the app, set:

- `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true`

## Available scripts

- `npm run dev` - start local development server
- `npm run build` - build for production
- `npm run start` - run production build
- `npm run lint` - run ESLint
- `npm run typecheck` - run TypeScript type checks
- `npm run firebase:emulators` - run Firebase Auth + Firestore emulators
