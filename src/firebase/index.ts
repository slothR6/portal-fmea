import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import {
  getFirestore,
  enableIndexedDbPersistence,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCXetuiLkPa02LZYTYfOqmpFo4rsiUZIAQ",
  authDomain: "portal-fmea.firebaseapp.com",
  projectId: "portal-fmea",
  storageBucket: "portal-fmea.firebasestorage.app",
  messagingSenderId: "396843965794",
  appId: "1:396843965794:web:d8dd42bd1405dd735a203b",
  measurementId: "G-JN8QR4W15B",
};

export const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const db = getFirestore(app);

// Cache offline (IndexedDB)
enableIndexedDbPersistence(db).catch(() => {
  // Se der erro (multi-aba, etc.), só ignora.
});
