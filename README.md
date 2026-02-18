# CollabBoard

A realtime multi-user whiteboard.

Built with Next.js and Firebase Firestore.

## Deployed Live

- Firebase App Hosting: [https://collab-board-backend--gauntlet-1-collab-board.us-east5.hosted.app/](https://collab-board-backend--gauntlet-1-collab-board.us-east5.hosted.app/)
- Vercel: [https://gauntlet-1-collab-board.vercel.app/](https://gauntlet-1-collab-board.vercel.app/)

## Build And Run Locally

1. Install dependencies:
```bash
npm install
```

2. Add Firebase environment variables in `.env.local` (see `.env.example`).

3. Start dev server:
```bash
npm run dev
```

4. Open:
`http://localhost:3000`

Useful scripts:

```bash
npm run lint
npm run typecheck
npm run build
```

## Current Features

- ✅ Infinite board with pan/zoom
- ✅ Sticky notes with editable text
- ✅ Shapes!
- ✅ Move and edit objects!
- ✅ Real-time sync between multiple users!
- ✅ Multiplayer cursors!
- ✅ Who's Online!
- ✅ User authentication! (Google only, more coming later)
- ✅ Deployed and publicly accessible

## Features Not Added For MVP

- 🚧 Email and password sign-on
- 🚧 GitHub Auth
- 🚧 AI agent assistance
- 🚧 Automated testing
