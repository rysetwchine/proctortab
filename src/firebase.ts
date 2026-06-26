import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBO5bOxwb4uxkrd2Xeul6OL6k1K-PxucMI",
  authDomain: "shifting-tab-detector.firebaseapp.com",
  projectId: "shifting-tab-detector",
  // IMPORTANT:
  // Use the exact default bucket name shown in Firebase Console → Storage.
  // Depending on when the bucket was created, it can be either:
  //   - <project-id>.firebasestorage.app  (newer default buckets)
  //   - <project-id>.appspot.com         (older default buckets)
  storageBucket: "shifting-tab-detector.firebasestorage.app",
  messagingSenderId: "730964016387",
  appId: "1:730964016387:web:a6baa8fec2c4b5907b3d36",
  measurementId: "G-1NYHHC1Y9H",
  databaseURL: "https://shifting-tab-detector-default-rtdb.firebaseio.com/"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const rtdb = getDatabase(app);
export const firebaseApp = app;
