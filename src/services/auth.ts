import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  signInWithPopup,
  sendPasswordResetEmail,
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, db, googleProvider } from "../firebase";
import { UserProfile } from "../types";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// Traduz erros do Firebase para português
function getErrorMessage(error: any): string {
  const code = error?.code || "";
  
  switch (code) {
    case "auth/invalid-credential":
      return "Email ou senha incorretos. Verifique e tente novamente.";
    case "auth/user-not-found":
      return "Usuário não encontrado. Você precisa criar uma conta primeiro.";
    case "auth/wrong-password":
      return "Senha incorreta. Tente novamente.";
    case "auth/invalid-email":
      return "Email inválido. Verifique o formato.";
    case "auth/user-disabled":
      return "Esta conta foi desativada. Entre em contato com o administrador.";
    case "auth/too-many-requests":
      return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
    case "auth/network-request-failed":
      return "Erro de conexão. Verifique sua internet.";
    case "auth/email-already-in-use":
      return "Este email já está cadastrado. Faça login ou use outro email.";
    case "auth/weak-password":
      return "Senha fraca. Use pelo menos 6 caracteres.";
    case "auth/operation-not-allowed":
      return "Login com email/senha não está habilitado. Entre em contato com o suporte.";
    case "auth/popup-closed-by-user":
      return "Login com Google cancelado.";
    case "auth/popup-blocked":
      return "Popup bloqueado pelo navegador. Permita popups e tente novamente.";
    default:
      return error?.message || "Erro desconhecido. Tente novamente.";
  }
}

export async function loginEmail(email: string, password: string) {
  try {
    const cleanEmail = email.trim().toLowerCase();
    
    if (!cleanEmail) {
      throw new Error("Digite seu email.");
    }
    
    if (!isValidEmail(cleanEmail)) {
      throw new Error("Email inválido. Verifique o formato (ex: usuario@email.com)");
    }
    
    if (!password || password.length < 6) {
      throw new Error("A senha deve ter pelo menos 6 caracteres.");
    }

    const result = await signInWithEmailAndPassword(auth, cleanEmail, password);
    return result;
  } catch (error: any) {
    console.error("Login error:", error);
    throw new Error(getErrorMessage(error));
  }
}

export async function signupEmail(params: {
  name: string;
  email: string;
  password: string;
  pixKey?: string;
}) {
  try {
    const { name, email, password, pixKey } = params;

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    
    if (!cleanName) {
      throw new Error("Informe seu nome completo.");
    }
    
    if (cleanName.length < 3) {
      throw new Error("Nome deve ter pelo menos 3 caracteres.");
    }

    if (!isValidEmail(cleanEmail)) {
      throw new Error("Email inválido. Verifique o formato.");
    }

    if (!password || password.length < 6) {
      throw new Error("A senha deve ter pelo menos 6 caracteres.");
    }

    const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);

    const profile: UserProfile = {
      uid: cred.user.uid,
      email: cleanEmail,
      name: cleanName,
      role: "PRESTADOR",
      status: "PENDING",
      active: false,
      pixKey: (pixKey || "").trim(),
      photoURL: "",
      createdAt: Date.now(),
    };

    await setDoc(doc(db, "users", cred.user.uid), profile, { merge: true });

    return cred;
  } catch (error: any) {
    console.error("Signup error:", error);
    throw new Error(getErrorMessage(error));
  }
}

export async function loginGoogle() {
  try {
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
      const existingData = snap.data();
      await setDoc(
        ref,
        {
          email: cred.user.email || existingData.email,
          name: cred.user.displayName || existingData.name,
          photoURL: cred.user.photoURL || existingData.photoURL || "",
        },
        { merge: true }
      );
    }

    return cred;
  } catch (error: any) {
    console.error("Google login error:", error);
    throw new Error(getErrorMessage(error));
  }
}

export async function sendPasswordReset(email: string) {
  try {
    const cleanEmail = email.trim().toLowerCase();
    
    if (!cleanEmail) {
      throw new Error("Digite seu email.");
    }
    
    if (!isValidEmail(cleanEmail)) {
      throw new Error("Email inválido. Verifique o formato.");
    }

    await sendPasswordResetEmail(auth, cleanEmail, {
      url: window.location.origin,
      handleCodeInApp: false,
    });

    return true;
  } catch (error: any) {
    console.error("Password reset error:", error);
    throw new Error(getErrorMessage(error));
  }
}

export async function logout() {
  try {
    return await signOut(auth);
  } catch (error: any) {
    console.error("Logout error:", error);
    throw new Error("Erro ao sair. Tente novamente.");
  }
}