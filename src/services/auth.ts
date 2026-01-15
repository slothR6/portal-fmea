import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  signInWithPopup,
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, db, googleProvider } from "../firebase";
import { UserProfile } from "../types";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export async function loginEmail(email: string, password: string) {
  if (!isValidEmail(email)) throw new Error("E-mail inválido.");
  if (!password || password.length < 6) throw new Error("Senha inválida.");
  return signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function signupEmail(params: {
  name: string;
  email: string;
  password: string;
  pixKey?: string;
}) {
  const { name, email, password, pixKey } = params;

  if (!name.trim()) throw new Error("Informe o nome.");
  if (!isValidEmail(email)) throw new Error("E-mail inválido.");
  if (!password || password.length < 6) throw new Error("Senha deve ter 6+ caracteres.");

  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);

  const profile: UserProfile = {
    uid: cred.user.uid,
    email: email.trim(),
    name: name.trim(),
    role: "PRESTADOR",
    status: "PENDING",
    active: false,
    pixKey: (pixKey || "").trim(),
    photoURL: "",
    createdAt: Date.now(),
  };

  await setDoc(doc(db, "users", cred.user.uid), profile, { merge: true });

  return cred;
}

export async function loginGoogle() {
  const cred = await signInWithPopup(auth, googleProvider);

  const ref = doc(db, "users", cred.user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    const profile: UserProfile = {
      uid: cred.user.uid,
      email: cred.user.email || "",
      name: cred.user.displayName || (cred.user.email || "").split("@")[0],
      role: "PRESTADOR",
      status: "PENDING",
      active: false,
      photoURL: cred.user.photoURL || "",
      createdAt: Date.now(),
    };
    await setDoc(ref, profile, { merge: true });
  } else {
    // merge photoURL/email/name se vierem do google
    await setDoc(
      ref,
      {
        email: cred.user.email || "",
        name: cred.user.displayName || "",
        photoURL: cred.user.photoURL || "",
      },
      { merge: true }
    );
  }

  return cred;
}

export async function logout() {
  return signOut(auth);
}
