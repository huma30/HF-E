import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, getFirestore, doc, getDocFromServer, Firestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firebase Auth
export const auth = getAuth(app);

// Initialize Firestore with specific database ID and forced long polling for proxy/iframe stability
export const db: Firestore = (() => {
  if (typeof window !== 'undefined') {
    try {
      return initializeFirestore(
        app,
        {
          // Let the SDK use the fastest compatible transport and only
          // fall back to long-polling when the network requires it.
          experimentalAutoDetectLongPolling: true,
        },
        firebaseConfig.firestoreDatabaseId
      );
    } catch {
      return getFirestore(app, firebaseConfig.firestoreDatabaseId);
    }
  }
  return getFirestore(app, firebaseConfig.firestoreDatabaseId);
})();


// No production connectivity probe.
// Firestore operations already report connection failures through their own
// promises/listeners, so an extra test/connection read would only add startup
// latency and consume a Firestore read on every page load.

export default app;
