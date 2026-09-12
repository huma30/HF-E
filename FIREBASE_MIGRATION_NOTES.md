# HUMA Firebase Migration Notes

Target Hosting project: `huma-70272`

This upgraded source was originally generated against an AI Studio Firebase project (`gen-lang-client-0680336612`). The Firebase client configuration has therefore been changed to read from Vite environment variables instead of the old project JSON.

Before the first build/deploy to the existing HUMA project, create `.env.local` from `.env.example` and fill these values from Firebase Console > Project settings > Your apps > Web app:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

`VITE_FIREBASE_PROJECT_ID` is already set to `huma-70272`.

`VITE_FIREBASE_DATABASE_ID` should stay blank when the HUMA project uses the default Firestore database. Only fill it if the existing HUMA deployment deliberately uses a named Firestore database.

Build:

```bash
npm install
npm run build
```

Deploy after confirming the build output exists in `dist`:

```bash
firebase use huma-70272
firebase deploy --only hosting
```

Do not deploy `firestore.rules` from this source until the permissive rules have been replaced with the production-safe ruleset and tested.
