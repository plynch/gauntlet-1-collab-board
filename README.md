# CollabBoard

Real-time collaborative whiteboard MVP built with Next.js + Firebase.

## Local

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Required env vars

Set these in `.env.local`:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `FIREBASE_ADMIN_PROJECT_ID`
- `FIREBASE_ADMIN_CLIENT_EMAIL`
- `FIREBASE_ADMIN_PRIVATE_KEY`

## Scripts

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm run typecheck`

## Realtime Data Policy

- Mutable user-facing data should use Firestore realtime listeners (`onSnapshot`) for reads.
- Privileged writes (ownership checks, access control updates) should stay in server API routes.
- Avoid manual refresh UX for first-party pages when data can change in another window/session.
