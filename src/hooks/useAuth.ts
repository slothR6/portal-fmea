import { useEffect, useMemo, useState } from "react";
import { User, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { UserProfile, ViewState } from "../types";

function safeNameFromEmail(email: string) {
  return (email || "usuario").split("@")[0];
}

export function useAuth() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [view, setView] = useState<ViewState>("LOGIN");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setAuthReady(true);

      if (!u) {
        setProfile(null);
        setView("LOGIN");
        return;
      }

      const ref = doc(db, "users", u.uid);
      const snap = await getDoc(ref);

      // Se ainda não existe, cria profile padrão (PENDING)
      if (!snap.exists()) {
        const p: UserProfile = {
          uid: u.uid,
          email: u.email || "",
          name: u.displayName || safeNameFromEmail(u.email || ""),
          role: "PRESTADOR",
          status: "PENDING",
          active: false,
          photoURL: u.photoURL || "",
          createdAt: Date.now(),
        };
        await setDoc(ref, p, { merge: true });
        setProfile(p);
        setView("PENDING");
        return;
      }

      const p = snap.data() as UserProfile;
      setProfile(p);

      if (!p.active || p.status !== "ACTIVE") {
        setView("PENDING");
      } else {
        setView(p.role === "ADMIN" ? "DASHBOARD" : "ENTREGAS");
      }
    });

    return () => unsub();
  }, []);

  // Atualiza profile ao vivo (sem precisar F5)
  useEffect(() => {
    if (!user) return;
    const ref = doc(db, "users", user.uid);
    const unsub = onSnapshot(ref, (s) => {
      if (!s.exists()) return;
      const p = s.data() as UserProfile;
      setProfile(p);

      if (!p.active || p.status !== "ACTIVE") {
        setView("PENDING");
      }
    });
    return () => unsub();
  }, [user?.uid]);

  const role = useMemo(() => profile?.role ?? null, [profile]);

  return { authReady, user, profile, role, view, setView, setProfile };
}
