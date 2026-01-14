import React, { useEffect, useMemo, useState } from "react";
import {
  AppNotification,
  Attachment,
  ChecklistItem,
  Comment,
  Delivery,
  Priority,
  Project,
  Status,
  UserProfile,
  UserRole,
  ViewState,
} from "./types";

import { auth, db, googleProvider } from "./firebase";
import logoFMEA from "./public/logo-fmea.png";

import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  User,
} from "firebase/auth";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

// --------- Helpers ----------
const nowPtBr = () => new Date().toLocaleString("pt-BR");
const datePtBr = () => new Date().toLocaleDateString("pt-BR");

function firebaseAuthErrorToPtBr(e: any) {
  const code = e?.code || "";
  if (code === "auth/email-already-in-use") return "Esse e-mail já está em uso.";
  if (code === "auth/invalid-email") return "E-mail inválido.";
  if (code === "auth/weak-password") return "Senha fraca. Use pelo menos 6 caracteres.";
  if (code === "auth/wrong-password") return "Senha incorreta.";
  if (code === "auth/user-not-found") return "Usuário não encontrado.";
  if (code === "auth/popup-closed-by-user") return "Login com Google cancelado.";
  if (code === "auth/account-exists-with-different-credential")
    return "Já existe uma conta com este e-mail usando outro método de login.";
  return "Não foi possível concluir. Verifique os dados e tente novamente.";
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

// --------- UI Components ----------
const Card: React.FC<{
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}> = ({ children, className = "", onClick }) => (
  <div
    onClick={onClick}
    className={`bg-white rounded-[28px] shadow-xl shadow-blue-50 p-10 border border-gray-50 ${onClick ? "cursor-pointer hover:shadow-2xl transition-all" : ""} ${className}`}
  >
    {children}
  </div>
);

const Button: React.FC<{
  onClick?: () => void;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "outline" | "danger";
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
}> = ({
  onClick,
  children,
  variant = "primary",
  className = "",
  disabled,
  type = "button",
}) => {
  const variants = {
    primary: "bg-[#1895BD] hover:bg-[#147a9e] text-white shadow-lg shadow-blue-100",
    secondary:
      "bg-[#75AD4D] hover:bg-[#639441] text-white shadow-lg shadow-green-100",
    outline: "border-2 border-[#1895BD] text-[#1895BD] hover:bg-blue-50",
    danger: "bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-100",
  };

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

const Badge: React.FC<{ children: React.ReactNode; color?: string }> = ({
  children,
  color = "bg-gray-100 text-gray-600",
}) => (
  <span className={`px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-widest ${color}`}>
    {children}
  </span>
);

const Modal: React.FC<{
  open: boolean;
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ open, title, onClose, children }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-white rounded-[28px] shadow-2xl shadow-black/20 border border-gray-100">
        <div className="p-8 border-b border-gray-50 flex items-center justify-between">
          <h2 className="text-2xl font-black text-gray-800">{title}</h2>
          <button
            onClick={onClose}
            className="w-12 h-12 rounded-2xl bg-gray-50 hover:bg-gray-100 text-gray-500 font-black"
            title="Fechar"
          >
            X
          </button>
        </div>
        <div className="p-8">{children}</div>
      </div>
    </div>
  );
};

// --------- Main App ----------
export default function App() {
  // auth state
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  // profile
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // view
  const [view, setView] = useState<ViewState | "PRESTADORES">("LOGIN");

  // login/signup fields
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // app data
  const [projects, setProjects] = useState<Project[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  // selections
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);

  // prestadores (admin)
  const [selectedProviderUid, setSelectedProviderUid] = useState<string | null>(null);
  const [safetyDocs, setSafetyDocs] = useState<any[]>([]);
  const [safetyAdding, setSafetyAdding] = useState(false);
  const [safetyForm, setSafetyForm] = useState({
    type: "NR10",
    title: "",
    issueDate: "",
    expiryDate: "",
    url: "",
    notes: "",
  });

  // detail (subcollections) - separate state to avoid "sumindo"
  const [deliveryComments, setDeliveryComments] = useState<Comment[]>([]);
  const [deliveryChecklist, setDeliveryChecklist] = useState<ChecklistItem[]>([]);
  const [deliveryAttachments, setDeliveryAttachments] = useState<Attachment[]>([]);

  // filters / UI
  const [projectSearch, setProjectSearch] = useState("");
  const [deliverySearch, setDeliverySearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "TODOS">("TODOS");
  const [clientFilter, setClientFilter] = useState<string>("TODOS");
  const [viewMode, setViewMode] = useState<"CARD" | "TABLE">("CARD");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // modals
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [projectEditingId, setProjectEditingId] = useState<string | null>(null);
  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false);

  // forms
  const [projectForm, setProjectForm] = useState({
    client: "",
    name: "",
    memberUids: [] as string[],
  });

  const [deliveryForm, setDeliveryForm] = useState({
    projectId: "",
    title: "",
    deadline: "",
    priority: "MEDIA" as Priority,
    providerUid: "",
    providerName: "",
    description: "",
  });

  // computed role
  const role = profile?.role || ("PRESTADOR" as UserRole);

  const selectedProject = useMemo(() => projects.find((p) => p.id === selectedProjectId) || null, [projects, selectedProjectId]);
  const selectedDelivery = useMemo(() => deliveries.find((d) => d.id === selectedDeliveryId) || null, [deliveries, selectedDeliveryId]);

  const clientOptions = useMemo(() => {
    const set = new Set(projects.map((p) => p.client).filter(Boolean));
    return ["TODOS", ...Array.from(set)];
  }, [projects]);

  const dashboardStats = useMemo(() => {
    const total = deliveries.length;
    const pend = deliveries.filter((d) => d.status === "PENDENTE").length;
    const and = deliveries.filter((d) => d.status === "EM_ANDAMENTO").length;
    const conc = deliveries.filter((d) => d.status === "CONCLUIDO").length;
    return { total, pend, and, conc };
  }, [deliveries]);

  const unreadNotifCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const userDisplayName = useMemo(() => {
    if (!profile) return "";
    if (profile.role === "ADMIN") return profile.name || "Administrador FMEA";
    return profile.name || "Prestador";
  }, [profile]);

  // --------- Firebase bootstrap (auth + profile) ----------
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setAuthReady(true);
      setAuthError(null);

      if (!u) {
        setProfile(null);
        return;
      }

      try {
        const ref = doc(db, "users", u.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setProfile(snap.data() as any);
        } else {
          // Caso raro: user existe no Auth mas não tem perfil no Firestore
          const fallbackProfile: UserProfile = {
            uid: u.uid,
            email: u.email || "",
            name: u.displayName || (u.email ? u.email.split("@")[0] : "Usuário"),
            role: "PRESTADOR",
            status: "PENDING",
            active: false,
            photoUrl: u.photoURL || "",
            createdAt: Date.now(),
          };
          await setDoc(ref, fallbackProfile);
          setProfile(fallbackProfile);
        }
      } catch (e: any) {
        setAuthError("Falha ao carregar o perfil. Atualize a página e tente novamente.");
      }
    });

    return () => unsub();
  }, []);

  // profile live updates
  useEffect(() => {
    if (!user?.uid) return;
    const ref = doc(db, "users", user.uid);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;
      const p = snap.data() as any;
      setProfile(p);

      if (!p.active || p.status !== "ACTIVE") {
        setView("PENDING" as any);
      }
    });
    return () => unsub();
  }, [user?.uid]);

  // --------- Live data subscriptions ----------
  useEffect(() => {
    if (!user || !profile || !profile.active) return;

    const usersQ =
      profile.role === "ADMIN"
        ? query(collection(db, "users"), orderBy("createdAt", "desc"))
        : query(collection(db, "users"), where("status", "==", "ACTIVE"), orderBy("createdAt", "desc"));

    const projectsQ =
      profile.role === "ADMIN"
        ? query(collection(db, "projects"), orderBy("createdAt", "desc"))
        : query(collection(db, "projects"), where("memberUids", "array-contains", user.uid), orderBy("createdAt", "desc"));

    const deliveriesQ =
      profile.role === "ADMIN"
        ? query(collection(db, "deliveries"), orderBy("createdAt", "desc"))
        : query(collection(db, "deliveries"), where("providerUid", "==", user.uid), orderBy("createdAt", "desc"));

    const notifQ = query(collection(db, "notifications"), where("uid", "==", user.uid), orderBy("createdAt", "desc"));

    const unsubUsers = onSnapshot(usersQ, (snap) => {
      const arr = snap.docs.map((d) => d.data() as any);
      setUsersList(arr);
    });

    const unsubProjects = onSnapshot(projectsQ, (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as any[];
      setProjects(arr);
    });

    const unsubDeliveries = onSnapshot(deliveriesQ, (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as any[];
      setDeliveries(arr);
    });

    const unsubNotifs = onSnapshot(notifQ, (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as any[];
      setNotifications(arr);
    });

    return () => {
      unsubUsers();
      unsubProjects();
      unsubDeliveries();
      unsubNotifs();
    };
  }, [user, profile]);

  // --------- Admin: safety docs por prestador ----------
  useEffect(() => {
    if (!user || !profile || profile.role !== "ADMIN") return;
    if (!selectedProviderUid) {
      setSafetyDocs([]);
      return;
    }

    setSafetyAdding(false);

    const q = query(
      collection(db, "safetyDocs"),
      where("uid", "==", selectedProviderUid),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setSafetyDocs(arr);
    });

    return () => unsub();
  }, [user, profile, selectedProviderUid]);

  // --------- Delivery detail subscriptions ----------
  useEffect(() => {
    if (!selectedDeliveryId) {
      setDeliveryComments([]);
      setDeliveryChecklist([]);
      setDeliveryAttachments([]);
      return;
    }

    const cQ = query(collection(db, "deliveries", selectedDeliveryId, "comments"), orderBy("createdAt", "asc"));
    const kQ = query(collection(db, "deliveries", selectedDeliveryId, "checklist"), orderBy("createdAt", "asc"));
    const aQ = query(collection(db, "deliveries", selectedDeliveryId, "attachments"), orderBy("createdAt", "desc"));

    const u1 = onSnapshot(cQ, (snap) => setDeliveryComments(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))));
    const u2 = onSnapshot(kQ, (snap) => setDeliveryChecklist(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))));
    const u3 = onSnapshot(aQ, (snap) => setDeliveryAttachments(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))));

    return () => {
      u1();
      u2();
      u3();
    };
  }, [selectedDeliveryId]);

  // --------- Filters / computed lists ----------
  const filteredProjects = useMemo(() => {
    const s = projectSearch.trim().toLowerCase();
    const byClient = clientFilter === "TODOS" ? projects : projects.filter((p) => p.client === clientFilter);
    if (!s) return byClient;
    return byClient.filter((p) => (p.name || "").toLowerCase().includes(s) || (p.client || "").toLowerCase().includes(s));
  }, [projects, projectSearch, clientFilter]);

  const filteredDeliveries = useMemo(() => {
    const s = deliverySearch.trim().toLowerCase();
    let list = deliveries;
    if (statusFilter !== "TODOS") list = list.filter((d) => d.status === statusFilter);
    if (clientFilter !== "TODOS") list = list.filter((d) => d.client === clientFilter);
    if (!s) return list;
    return list.filter((d) => (d.title || "").toLowerCase().includes(s) || (d.project || "").toLowerCase().includes(s) || (d.client || "").toLowerCase().includes(s));
  }, [deliveries, deliverySearch, statusFilter, clientFilter]);

  // --------- Auth handlers ----------
  const doLogin = async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, senha);
    } catch (e: any) {
      setAuthError(firebaseAuthErrorToPtBr(e));
    } finally {
      setAuthLoading(false);
    }
  };

  const doSignup = async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, senha);

      const newProfile: UserProfile = {
        uid: cred.user.uid,
        email,
        name: nome,
        pixKey: pixKey || "",
        role: "PRESTADOR",
        status: "PENDING",
        active: false,
        createdAt: Date.now(),
      };

      await setDoc(doc(db, "users", cred.user.uid), newProfile);
    } catch (e: any) {
      setAuthError(firebaseAuthErrorToPtBr(e));
    } finally {
      setAuthLoading(false);
    }
  };

  const doGoogleLogin = async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const u = cred.user;

      const ref = doc(db, "users", u.uid);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        const newProfile: UserProfile = {
          uid: u.uid,
          email: u.email || "",
          name: u.displayName || (u.email ? u.email.split("@")[0] : "Usuário"),
          role: "PRESTADOR",
          status: "PENDING",
          active: false,
          photoUrl: u.photoURL || "",
          createdAt: Date.now(),
        };

        await setDoc(ref, newProfile);
      } else {
        await setDoc(
          ref,
          {
            photoUrl: u.photoURL || "",
            name: u.displayName || undefined,
            updatedAt: Date.now(),
          } as any,
          { merge: true }
        );
      }
    } catch (e: any) {
      setAuthError(firebaseAuthErrorToPtBr(e));
    } finally {
      setAuthLoading(false);
    }
  };

  const doLogout = async () => {
    await signOut(auth);
    setEmail("");
    setSenha("");
    setNome("");
    setPixKey("");
    setSelectedDeliveryId(null);
    setSelectedProjectId(null);
    setView("LOGIN");
  };

  // --------- Admin: approve users ----------
  const approveUser = async (u: UserProfile, newRole: UserRole) => {
    await updateDoc(doc(db, "users", u.uid), {
      role: newRole,
      status: "ACTIVE",
      active: true,
      approvedAt: Date.now(),
      updatedAt: Date.now(),
    } as any);
  };

  const rejectUser = async (u: UserProfile) => {
    await updateDoc(doc(db, "users", u.uid), {
      status: "REJECTED",
      active: false,
      updatedAt: Date.now(),
    } as any);
  };

  const deleteUserSoft = async (u: UserProfile) => {
    const ok = window.confirm(`Excluir usuário "${u.name}"? Isso remove o acesso e oculta na lista.`);
    if (!ok) return;

    await updateDoc(doc(db, "users", u.uid), {
      status: "DELETED",
      active: false,
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    } as any);

    if (selectedProviderUid === u.uid) {
      setSelectedProviderUid(null);
      setSafetyDocs([]);
      setSafetyAdding(false);
    }
  };

  const addSafetyDoc = async () => {
    if (!profile || profile.role !== "ADMIN") return;
    if (!selectedProviderUid) return;

    const title = (safetyForm.title || "").trim();
    if (!title) {
      alert("Informe o título do registro.");
      return;
    }

    await addDoc(collection(db, "safetyDocs"), {
      uid: selectedProviderUid,
      type: safetyForm.type,
      title,
      issueDate: safetyForm.issueDate || "",
      expiryDate: safetyForm.expiryDate || "",
      url: (safetyForm.url || "").trim(),
      notes: (safetyForm.notes || "").trim(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    setSafetyForm({ type: "NR10", title: "", issueDate: "", expiryDate: "", url: "", notes: "" });
    setSafetyAdding(false);
  };

  const deleteSafetyDoc = async (docId: string) => {
    const ok = window.confirm("Excluir este registro?");
    if (!ok) return;
    await deleteDoc(doc(db, "safetyDocs", docId));
  };

  // --------- Create project ----------
  const openCreateProject = () => {
    setProjectEditingId(null);
    setProjectForm({ client: "", name: "", memberUids: [] });
    setProjectModalOpen(true);
  };

  const openEditProject = (p: Project) => {
    setProjectEditingId(p.id);
    setProjectForm({
      client: p.client || "",
      name: p.name || "",
      memberUids: Array.isArray(p.memberUids) ? p.memberUids : [],
    });
    setProjectModalOpen(true);
  };

  const saveProject = async () => {
    if (!profile || profile.role !== "ADMIN") return;
    if (!projectForm.client.trim() || !projectForm.name.trim()) return;

    const basePatch: any = {
      client: projectForm.client.trim(),
      name: projectForm.name.trim(),
      memberUids: projectForm.memberUids,
      updatedAt: Date.now(),
    };

    if (projectEditingId) {
      await updateDoc(doc(db, "projects", projectEditingId), basePatch);
    } else {
      const payload: any = {
        ...basePatch,
        manager: profile.name,
        managerUid: profile.uid,
        status: "PENDENTE",
        completionRate: 0,
        createdAt: Date.now(),
      };
      await addDoc(collection(db, "projects"), payload);
    }

    setProjectModalOpen(false);
    setProjectEditingId(null);
    setView("PROJETOS");
  };

  const deleteProject = async (projectId: string) => {
    if (!profile || profile.role !== "ADMIN") return;
    const ok = window.confirm("Excluir projeto? Isso não apaga entregas já criadas.");
    if (!ok) return;
    await deleteDoc(doc(db, "projects", projectId));
    if (selectedProjectId === projectId) {
      setSelectedProjectId(null);
      setView("PROJETOS");
    }
  };

  // --------- Create delivery ----------
  const openCreateDelivery = () => {
    setDeliveryForm({
      projectId: "",
      title: "",
      deadline: "",
      priority: "MEDIA",
      providerUid: "",
      providerName: "",
      description: "",
    });
    setDeliveryModalOpen(true);
  };

  const saveDelivery = async () => {
    if (!profile) return;

    if (!deliveryForm.projectId || !deliveryForm.title.trim() || !deliveryForm.deadline) return;

    const p = projects.find((x) => x.id === deliveryForm.projectId);
    if (!p) return;

    // Se admin, exige selecionar prestador (filtrado pelo projeto)
    if (profile.role === "ADMIN" && !deliveryForm.providerUid) return;

    const payload: Delivery = {
      id: "",
      projectId: deliveryForm.projectId,
      client: p.client,
      project: p.name,
      title: deliveryForm.title.trim(),
      deadline: deliveryForm.deadline.trim(),
      status: "PENDENTE" as Status,
      priority: deliveryForm.priority,
      providerUid: deliveryForm.providerUid,
      provider: deliveryForm.providerName || "Prestador",
      description: deliveryForm.description || "",
      checklist: [] as ChecklistItem[],
      attachments: [] as Attachment[],
      comments: [] as Comment[],
      createdAt: Date.now(),
      managerUid: p.managerUid || profile.uid,
    };

    await addDoc(collection(db, "deliveries"), payload as any);
    setDeliveryModalOpen(false);
    setView("ENTREGAS");
  };

  const goDeliveryDetail = (id: string) => {
    setSelectedDeliveryId(id);
    setView("DETALHE_ENTREGA");
  };

  const goProjectDetail = (id: string) => {
    setSelectedProjectId(id);
    setView("DETALHE_PROJETO");
  };

  // --------- Guards ----------
  if (!authReady) return null;

  // LOGIN
  if (!user && view === "LOGIN") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#D6DCE5] p-6 relative overflow-hidden">
        <div className="absolute -top-20 -left-20 w-80 h-80 bg-[#1895BD]/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-[#75AD4D]/10 rounded-full blur-3xl" />

        <Card className="max-w-xl w-full">
          <div className="flex items-center gap-6 mb-10">
            <img src={logoFMEA} alt="FMEA" className="w-14 h-14 rounded-2xl object-contain bg-white p-2 border border-gray-100" />
            <div>
              <h1 className="text-3xl font-black text-gray-800">Portal FMEA</h1>
              <p className="text-gray-400 font-bold">Acesso ao sistema</p>
            </div>
          </div>

          <div className="space-y-5">
            {authError ? (
              <div className="bg-red-50 border border-red-100 text-red-600 rounded-2xl px-5 py-4 text-sm font-bold">
                {authError}
              </div>
            ) : null}

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">E-mail</p>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm outline-none shadow-inner"
                placeholder="email@empresa.com"
              />
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Senha</p>
              <input
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm outline-none shadow-inner"
                placeholder="Sua senha"
              />
            </div>

            <Button variant="outline" className="w-full" onClick={doGoogleLogin} disabled={authLoading}>
              Entrar com Google
            </Button>

            <Button className="w-full" onClick={doLogin} disabled={authLoading || !email || !senha}>
              {authLoading ? "Entrando..." : "Entrar"}
            </Button>

            <button
              className="w-full text-center text-sm font-black text-[#1895BD] uppercase tracking-widest mt-4"
              onClick={() => {
                setAuthError(null);
                setView("SIGNUP" as any);
              }}
            >
              Criar conta
            </button>
          </div>
        </Card>
      </div>
    );
  }

  // SIGNUP
  if (!user && view === "SIGNUP") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#D6DCE5] p-6">
        <Card className="max-w-xl w-full">
          <div className="flex items-center gap-6 mb-10">
            <img src={logoFMEA} alt="FMEA" className="w-14 h-14 rounded-2xl object-contain bg-white p-2 border border-gray-100" />
            <div>
              <h1 className="text-3xl font-black text-gray-800">Criar conta</h1>
              <p className="text-gray-400 font-bold">Aguardará aprovação do administrador.</p>
            </div>
          </div>

          <div className="space-y-5">
            {authError ? (
              <div className="bg-red-50 border border-red-100 text-red-600 rounded-2xl px-5 py-4 text-sm font-bold">
                {authError}
              </div>
            ) : null}

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Nome</p>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm outline-none shadow-inner"
                placeholder="Nome completo"
              />
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">E-mail</p>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm outline-none shadow-inner"
                placeholder="email@empresa.com"
              />
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Senha</p>
              <input
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm outline-none shadow-inner"
                placeholder="Mínimo 6 caracteres"
              />
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Chave Pix (opcional)</p>
              <input
                value={pixKey}
                onChange={(e) => setPixKey(e.target.value)}
                className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm outline-none shadow-inner"
                placeholder="Pix para pagamentos"
              />
            </div>

            <Button variant="outline" className="w-full" onClick={doGoogleLogin} disabled={authLoading}>
              Continuar com Google
            </Button>

            <Button className="w-full" onClick={doSignup} disabled={authLoading || !email || !senha || !nome}>
              {authLoading ? "Criando..." : "Criar conta"}
            </Button>

            <button
              className="w-full text-center text-sm font-black text-[#1895BD] uppercase tracking-widest mt-4"
              onClick={() => {
                setAuthError(null);
                setView("LOGIN");
              }}
            >
              Voltar para login
            </button>
          </div>
        </Card>
      </div>
    );
  }

  // PENDING
  if (user && profile && (!profile.active || profile.status !== "ACTIVE")) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#D6DCE5] p-6">
        <Card className="max-w-xl w-full text-center py-16 px-12">
          <div className="mb-8">
            <div className="w-20 h-20 bg-[#1895BD] rounded-3xl mx-auto flex items-center justify-center text-white text-3xl font-black">
              F
            </div>
          </div>
          <h2 className="text-3xl font-black text-gray-800 mb-3">Conta pendente</h2>
          <p className="text-gray-500 font-bold mb-8">
            A conta foi criada com sucesso e aguarda aprovação do administrador.
          </p>

          <div className="flex justify-center">
            <Button variant="outline" onClick={doLogout}>
              Sair
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // From here, user is logged and active
  if (!user) return null;
  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#D6DCE5] p-6">
        <Card className="max-w-lg w-full text-center py-16 px-12">
          <div className="w-20 h-20 bg-[#1895BD] rounded-3xl mx-auto flex items-center justify-center text-white text-3xl font-black mb-8">F</div>
          <h2 className="text-2xl font-black text-gray-800 mb-3">Carregando</h2>
          <p className="text-gray-500 font-bold">Preparando acesso...</p>
        </Card>
      </div>
    );
  }

  // --------- Navigation ----------
  const NavItem = ({ id, label, icon }: { id: any; label: string; icon: string }) => (
    <button
      onClick={() => {
        setView(id);
        setIsMobileMenuOpen(false);
        if (id !== "DETALHE_ENTREGA") setSelectedDeliveryId(null);
        if (id !== "DETALHE_PROJETO") setSelectedProjectId(null);
      }}
      className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all text-sm font-black uppercase tracking-widest ${
        view === id ? "bg-[#1895BD] text-white shadow-lg shadow-blue-100" : "text-gray-500 hover:bg-gray-50"
      }`}
    >
      <span className="text-xl">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {id === "NOTIFICACOES" && unreadNotifCount ? (
        <span className="bg-white/20 px-3 py-1 rounded-xl text-xs font-black">
          {unreadNotifCount}
        </span>
      ) : null}
    </button>
  );

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-[#F8FAFC]">
      {/* Modals */}
      <Modal
        open={projectModalOpen}
        title={projectEditingId ? "Editar Projeto" : "Criar Projeto"}
        onClose={() => { setProjectModalOpen(false); setProjectEditingId(null); }}
      >
        <div className="space-y-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Cliente</p>
            <input
              value={projectForm.client}
              onChange={(e) => setProjectForm((p) => ({ ...p, client: e.target.value }))}
              className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-[#1895BD] outline-none shadow-inner"
              placeholder="Nome do cliente"
            />
          </div>

          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Nome do projeto</p>
            <input
              value={projectForm.name}
              onChange={(e) => setProjectForm((p) => ({ ...p, name: e.target.value }))}
              className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-[#1895BD] outline-none shadow-inner"
              placeholder="Ex: Inspeção guindaste, relatório..."
            />
          </div>

          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Prestadores do projeto</p>
            <div className="max-h-56 overflow-auto border border-gray-100 rounded-2xl p-4 space-y-3 bg-gray-50/40">
              {usersList
                .filter((u) => u.role === "PRESTADOR" && u.active)
                .map((u) => {
                  const checked = projectForm.memberUids.includes(u.uid);
                  return (
                    <label key={u.uid} className="flex items-center gap-3 text-sm font-bold text-gray-700">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setProjectForm((p) => {
                            const exists = p.memberUids.includes(u.uid);
                            const next = exists ? p.memberUids.filter((id) => id !== u.uid) : [...p.memberUids, u.uid];
                            return { ...p, memberUids: next };
                          });
                        }}
                      />
                      <span className="truncate">{u.name}</span>
                    </label>
                  );
                })}
            </div>
          </div>

          <div className="flex justify-end gap-4 pt-4">
            <Button variant="outline" onClick={() => { setProjectModalOpen(false); setProjectEditingId(null); }}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={saveProject}>
              Salvar
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={deliveryModalOpen} title="Criar Entrega" onClose={() => setDeliveryModalOpen(false)}>
        <div className="space-y-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Projeto</p>
            <select
              value={deliveryForm.projectId}
              onChange={(e) =>
                setDeliveryForm((d) => ({
                  ...d,
                  projectId: e.target.value,
                  providerUid: "",
                  providerName: "",
                }))
              }
              className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm outline-none shadow-inner"
            >
              <option value="">Selecione</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.client} - {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Título da entrega</p>
            <input
              value={deliveryForm.title}
              onChange={(e) => setDeliveryForm((d) => ({ ...d, title: e.target.value }))}
              className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm outline-none shadow-inner"
              placeholder="Ex: Relatório final, memória de cálculo..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Prazo</p>
              <input
                type="date"
                value={deliveryForm.deadline}
                onChange={(e) => setDeliveryForm((d) => ({ ...d, deadline: e.target.value }))}
                className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm outline-none shadow-inner"
              />
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Prioridade</p>
              <select
                value={deliveryForm.priority}
                onChange={(e) => setDeliveryForm((d) => ({ ...d, priority: e.target.value as Priority }))}
                className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm outline-none shadow-inner"
              >
                <option value="BAIXA">Baixa</option>
                <option value="MEDIA">Média</option>
                <option value="ALTA">Alta</option>
              </select>
            </div>
          </div>

          {role === "ADMIN" ? (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Prestador</p>
              <select
                value={deliveryForm.providerUid}
                onChange={(e) => {
                  const uid = e.target.value;
                  const u = usersList.find((x) => x.uid === uid);
                  setDeliveryForm((d) => ({
                    ...d,
                    providerUid: uid,
                    providerName: u?.name || "",
                  }));
                }}
                className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm outline-none shadow-inner"
              >
                <option value="">Selecione</option>
                {(deliveryForm.projectId
                  ? usersList.filter((u) => {
                      if (u.role !== "PRESTADOR" || !u.active) return false;
                      const p = projects.find((x) => x.id === deliveryForm.projectId);
                      if (!p) return false;
                      return Array.isArray(p.memberUids) && p.memberUids.includes(u.uid);
                    })
                  : usersList.filter((u) => u.role === "PRESTADOR" && u.active)
                ).map((u) => (
                  <option key={u.uid} value={u.uid}>
                    {u.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400 font-bold mt-2">
                Lista filtrada pelos prestadores vinculados ao projeto selecionado.
              </p>
            </div>
          ) : null}

          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Descrição (opcional)</p>
            <textarea
              value={deliveryForm.description}
              onChange={(e) => setDeliveryForm((d) => ({ ...d, description: e.target.value }))}
              className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm outline-none shadow-inner min-h-[120px]"
              placeholder="Detalhes da entrega"
            />
          </div>

          <div className="flex justify-end gap-4 pt-4">
            <Button variant="outline" onClick={() => setDeliveryModalOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={saveDelivery}>
              Salvar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Sidebar desktop */}
      <aside className="hidden md:flex w-80 flex-col bg-white border-r border-gray-50 p-8">
        <div className="flex items-center gap-4 mb-10">
          <img src={logoFMEA} alt="FMEA" className="w-12 h-12 rounded-2xl object-contain bg-white p-2 border border-gray-100" />
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-gray-400">Portal</p>
            <p className="text-xl font-black text-gray-800">FMEA</p>
          </div>
        </div>

        <div className="mb-10">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-300 mb-2">Logado como</p>
          <p className="text-gray-800 font-black text-lg">{userDisplayName}</p>
          <p className="text-gray-400 font-bold text-sm">{profile.email}</p>
        </div>

        <nav className="space-y-3">
          <NavItem id="DASHBOARD" label="Dashboard" icon="⚡" />
          <NavItem id="PROJETOS" label="Projetos" icon="📂" />
          <NavItem id="ENTREGAS" label={role === "ADMIN" ? "Entregas" : "Minhas Entregas"} icon="📦" />
          {role === "ADMIN" ? (
            <>
              <NavItem id="USUARIOS" label="Usuários" icon="🧩" />
              <NavItem id="PRESTADORES" label="Prestadores" icon="🦺" />
            </>
          ) : null}
          <NavItem id="PERFIL" label="Meu Perfil" icon="👤" />
        </nav>

        <div className="p-8 mt-auto border-t border-gray-50 bg-gray-50/50 rounded-3xl">
          <button
            onClick={doLogout}
            className="w-full py-4 rounded-2xl font-black uppercase tracking-widest text-sm text-gray-600 bg-white border border-gray-100 hover:bg-gray-50"
          >
            Sair
          </button>
        </div>
      </aside>

      {/* Top bar mobile */}
      <header className="md:hidden bg-white border-b border-gray-50 p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={logoFMEA} alt="FMEA" className="w-10 h-10 rounded-2xl object-contain bg-white p-2 border border-gray-100" />
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-gray-400">Portal</p>
            <p className="text-lg font-black text-gray-800">FMEA</p>
          </div>
        </div>

        <button
          onClick={() => setIsMobileMenuOpen((v) => !v)}
          className="w-12 h-12 rounded-2xl bg-gray-50 border border-gray-100 font-black text-gray-600"
          title="Menu"
        >
          ☰
        </button>
      </header>

      {/* Mobile menu */}
      {isMobileMenuOpen ? (
        <div className="md:hidden p-6 bg-white border-b border-gray-50">
          <nav className="space-y-3">
            <NavItem id="DASHBOARD" label="Dashboard" icon="⚡" />
            <NavItem id="PROJETOS" label="Projetos" icon="📂" />
            <NavItem id="ENTREGAS" label="Entregas" icon="📦" />
            {role === "ADMIN" ? (
              <>
                <NavItem id="USUARIOS" label="Usuários" icon="🧩" />
                <NavItem id="PRESTADORES" label="Prestadores" icon="🦺" />
              </>
            ) : null}
            <NavItem id="PERFIL" label="Perfil" icon="👤" />
            <hr className="my-10" />
            <button onClick={doLogout} className="w-full py-4 rounded-2xl font-black uppercase tracking-widest text-sm text-gray-600 bg-gray-50 border border-gray-100">
              Sair
            </button>
          </nav>
        </div>
      ) : null}

      {/* Main */}
      <main className="flex-1 md:ml-80 p-8 md:p-16 transition-all animate-in fade-in duration-500">
        <div className="max-w-6xl mx-auto space-y-12">
          {/* DASHBOARD */}
          {view === "DASHBOARD" && (
            <>
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                  <h1 className="text-[#1895BD] mb-2">Dashboard</h1>
                  <p className="text-gray-400 text-xl font-light">Visão geral do portal.</p>
                </div>
                {role === "ADMIN" ? (
                  <div className="flex gap-4">
                    <Button variant="secondary" onClick={openCreateProject}>Criar Projeto</Button>
                    <Button variant="primary" onClick={openCreateDelivery}>Criar Entrega</Button>
                  </div>
                ) : null}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                <Card>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-300 mb-2">Total entregas</p>
                  <p className="text-4xl font-black text-gray-800">{dashboardStats.total}</p>
                </Card>
                <Card>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-300 mb-2">Pendentes</p>
                  <p className="text-4xl font-black text-gray-800">{dashboardStats.pend}</p>
                </Card>
                <Card>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-300 mb-2">Em andamento</p>
                  <p className="text-4xl font-black text-gray-800">{dashboardStats.and}</p>
                </Card>
                <Card>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-300 mb-2">Concluídas</p>
                  <p className="text-4xl font-black text-gray-800">{dashboardStats.conc}</p>
                </Card>
              </div>
            </>
          )}

          {/* USUARIOS (ADMIN) */}
          {view === "USUARIOS" && role === "ADMIN" && (
            <>
              <div className="flex items-center justify-between gap-6">
                <div>
                  <h1 className="text-[#1895BD]">Usuários</h1>
                  <p className="text-gray-400 text-xl font-light">Aprovação e permissões.</p>
                </div>
              </div>

              <Card>
                <h3 className="text-2xl mb-6 text-gray-800">Pendentes</h3>
                <div className="space-y-4">
                  {usersList.filter((u) => u.status === "PENDING").map((u) => (
                    <div key={u.uid} className="p-5 border border-gray-100 rounded-2xl flex flex-col md:flex-row md:items-center gap-4">
                      <div className="flex-1">
                        <p className="font-black text-gray-800">{u.name}</p>
                        <p className="text-sm text-gray-500">{u.email}</p>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-2">UID: {u.uid}</p>
                      </div>
                      <div className="flex gap-3 flex-wrap">
                        <Button variant="secondary" onClick={() => approveUser(u, "PRESTADOR")}>Aprovar Prestador</Button>
                        <Button variant="primary" onClick={() => approveUser(u, "ADMIN")}>Aprovar Admin</Button>
                        <Button variant="danger" onClick={() => rejectUser(u)}>Rejeitar</Button>
                        <Button variant="outline" onClick={() => deleteUserSoft(u)}>Excluir</Button>
                      </div>
                    </div>
                  ))}
                  {usersList.filter((u) => u.status === "PENDING").length === 0 ? (
                    <p className="text-gray-400 font-bold">Nenhum usuário pendente.</p>
                  ) : null}
                </div>
              </Card>

              <Card className="mt-8">
                <h3 className="text-2xl mb-6 text-gray-800">Ativos</h3>
                <div className="space-y-3">
                  {usersList.filter((u) => u.status === "ACTIVE").slice(0, 30).map((u) => (
                    <div key={u.uid} className="p-4 border border-gray-100 rounded-2xl flex items-center justify-between">
                      <div>
                        <p className="font-black text-gray-800">{u.name}</p>
                        <p className="text-sm text-gray-500">{u.email}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-xs font-black uppercase tracking-widest text-gray-400">{u.role}</span>
                        <button
                          onClick={() => deleteUserSoft(u)}
                          className="text-xs font-black uppercase tracking-widest text-red-500 hover:underline"
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}

          {/* PROJETOS */}
          {view === "PROJETOS" && (
            <>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
                <div>
                  <h1 className="text-[#1895BD]">Projetos</h1>
                  <p className="text-gray-400 text-xl font-light">Gerenciamento de projetos.</p>
                </div>

                {role === "ADMIN" ? (
                  <div className="flex gap-4">
                    <Button variant="secondary" onClick={openCreateProject}>Criar Projeto</Button>
                  </div>
                ) : null}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Buscar</p>
                  <input
                    value={projectSearch}
                    onChange={(e) => setProjectSearch(e.target.value)}
                    className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm outline-none shadow-inner"
                    placeholder="Cliente ou projeto"
                  />
                </div>

                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Cliente</p>
                  <select
                    value={clientFilter}
                    onChange={(e) => setClientFilter(e.target.value)}
                    className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm outline-none shadow-inner"
                  >
                    {clientOptions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-end justify-end gap-4">
                  <Button variant="outline" onClick={() => { setProjectSearch(""); setClientFilter("TODOS"); }}>
                    Limpar filtros
                  </Button>
                </div>
              </div>

              {filteredProjects.length ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                  {filteredProjects.map((p) => (
                    <Card key={p.id} onClick={() => { setSelectedProjectId(p.id); setView("DETALHE_PROJETO"); }}>
                      <div className="flex justify-between items-start mb-6">
                        <p className="text-[10px] font-black uppercase tracking-[3px] text-gray-300">{p.client}</p>
                        {role === "ADMIN" ? (
                          <div className="flex items-center gap-4">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditProject(p);
                              }}
                              className="text-[10px] font-black uppercase tracking-widest text-[#1895BD] hover:underline"
                              title="Editar projeto"
                            >
                              Editar
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteProject(p.id);
                              }}
                              className="text-[10px] font-black uppercase tracking-widest text-red-500 hover:underline"
                              title="Excluir projeto"
                            >
                              Excluir
                            </button>
                          </div>
                        ) : null}
                      </div>

                      <h3 className="text-2xl font-black text-gray-800 mb-3">{p.name}</h3>

                      <div className="flex items-center justify-between mt-8">
                        <Badge color="bg-blue-50 text-[#1895BD]">{p.status || "PENDENTE"}</Badge>
                        <p className="text-sm text-gray-400 font-bold">Prestadores: {(p.memberUids || []).length}</p>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <p className="text-gray-400 font-bold">Nenhum projeto cadastrado ainda.</p>
                  {role === "ADMIN" ? (
                    <div className="mt-6">
                      <Button variant="secondary" onClick={openCreateProject}>Criar primeiro projeto</Button>
                    </div>
                  ) : null}
                </Card>
              )}
            </>
          )}

          {/* DETALHE PROJETO */}
          {view === "DETALHE_PROJETO" && selectedProject && (
            <>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
                <div>
                  <h1 className="text-[#1895BD]">Projeto</h1>
                  <p className="text-gray-400 text-xl font-light">{selectedProject.client}</p>
                </div>
                <div className="flex gap-4 flex-wrap">
                  {role === "ADMIN" ? (
                    <>
                      <Button variant="secondary" onClick={() => openEditProject(selectedProject)}>Editar</Button>
                      <Button variant="primary" onClick={openCreateDelivery}>Criar Entrega</Button>
                    </>
                  ) : null}
                  <Button variant="outline" onClick={() => setView("PROJETOS")}>Voltar</Button>
                </div>
              </div>

              <Card>
                <div className="flex items-start justify-between gap-6">
                  <div className="flex-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-300 mb-2">
                      {selectedProject.client}
                    </p>
                    <h3 className="text-3xl font-black text-gray-800">{selectedProject.name}</h3>
                    <p className="text-gray-400 font-bold mt-3">
                      Prestadores vinculados: {(selectedProject.memberUids || []).length}
                    </p>
                  </div>
                  <Badge color="bg-blue-50 text-[#1895BD]">{selectedProject.status || "PENDENTE"}</Badge>
                </div>
              </Card>

              <Card className="mt-10">
                <h3 className="text-2xl mb-6 text-gray-800">Entregas do projeto</h3>
                <div className="space-y-4">
                  {deliveries.filter((d) => d.projectId === selectedProject.id).map((d) => (
                    <div
                      key={d.id}
                      className="p-5 border border-gray-100 rounded-3xl flex flex-col md:flex-row md:items-center gap-5"
                    >
                      <div className="flex-1">
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-300 mb-2">{d.client}</p>
                        <p className="font-black text-gray-800 text-lg">{d.title}</p>
                        <p className="text-gray-400 font-bold text-sm mt-2">
                          Prestador: {d.provider || "Não definido"} | Prazo: {d.deadline}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge
                          color={
                            d.status === "CONCLUIDO"
                              ? "bg-green-50 text-green-700"
                              : d.status === "EM_ANDAMENTO"
                              ? "bg-yellow-50 text-yellow-700"
                              : "bg-gray-100 text-gray-600"
                          }
                        >
                          {d.status}
                        </Badge>
                        <Button variant="outline" onClick={() => goDeliveryDetail(d.id)}>Abrir</Button>
                      </div>
                    </div>
                  ))}
                  {deliveries.filter((d) => d.projectId === selectedProject.id).length === 0 ? (
                    <p className="text-gray-400 font-bold">Nenhuma entrega cadastrada para este projeto.</p>
                  ) : null}
                </div>
              </Card>
            </>
          )}

          {/* ENTREGAS */}
          {view === "ENTREGAS" && (
            <>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
                <div>
                  <h1 className="text-[#1895BD]">{role === "ADMIN" ? "Entregas" : "Minhas Entregas"}</h1>
                  <p className="text-gray-400 text-xl font-light">Acompanhamento de entregas.</p>
                </div>
                {role === "ADMIN" ? (
                  <div className="flex gap-4">
                    <Button variant="primary" onClick={openCreateDelivery}>Criar Entrega</Button>
                  </div>
                ) : null}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Buscar</p>
                  <input
                    value={deliverySearch}
                    onChange={(e) => setDeliverySearch(e.target.value)}
                    className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm outline-none shadow-inner"
                    placeholder="Título, projeto ou cliente"
                  />
                </div>

                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Status</p>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm outline-none shadow-inner"
                  >
                    <option value="TODOS">Todos</option>
                    <option value="PENDENTE">Pendente</option>
                    <option value="EM_ANDAMENTO">Em andamento</option>
                    <option value="CONCLUIDO">Concluído</option>
                  </select>
                </div>

                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Cliente</p>
                  <select
                    value={clientFilter}
                    onChange={(e) => setClientFilter(e.target.value)}
                    className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm outline-none shadow-inner"
                  >
                    {clientOptions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-end justify-end gap-4">
                  <Button variant="outline" onClick={() => { setDeliverySearch(""); setStatusFilter("TODOS"); setClientFilter("TODOS"); }}>
                    Limpar filtros
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-gray-400 font-bold">
                  Mostrando {filteredDeliveries.length} entregas
                </p>
                <div className="flex gap-3">
                  <Button variant={viewMode === "CARD" ? "primary" : "outline"} onClick={() => setViewMode("CARD")}>Cards</Button>
                  <Button variant={viewMode === "TABLE" ? "primary" : "outline"} onClick={() => setViewMode("TABLE")}>Tabela</Button>
                </div>
              </div>

              {viewMode === "CARD" ? (
                <div className="space-y-5">
                  {filteredDeliveries.map((d) => (
                    <Card key={d.id} onClick={() => goDeliveryDetail(d.id)}>
                      <div className="flex items-start justify-between gap-6">
                        <div className="flex-1">
                          <p className="text-[10px] font-black uppercase tracking-widest text-gray-300 mb-2">{d.client}</p>
                          <h3 className="text-2xl font-black text-gray-800">{d.title}</h3>
                          <p className="text-gray-400 font-bold mt-3">
                            Projeto: {d.project} | Prestador: {d.provider || "Não definido"} | Prazo: {d.deadline}
                          </p>
                        </div>
                        <Badge
                          color={
                            d.status === "CONCLUIDO"
                              ? "bg-green-50 text-green-700"
                              : d.status === "EM_ANDAMENTO"
                              ? "bg-yellow-50 text-yellow-700"
                              : "bg-gray-100 text-gray-600"
                          }
                        >
                          {d.status}
                        </Badge>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <div className="overflow-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-xs font-black uppercase tracking-widest text-gray-400">
                          <th className="py-4">Cliente</th>
                          <th className="py-4">Projeto</th>
                          <th className="py-4">Título</th>
                          <th className="py-4">Prazo</th>
                          <th className="py-4">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDeliveries.map((d) => (
                          <tr
                            key={d.id}
                            onClick={() => goDeliveryDetail(d.id)}
                            className="border-t border-gray-50 hover:bg-gray-50 cursor-pointer"
                          >
                            <td className="py-4 font-bold text-gray-600">{d.client}</td>
                            <td className="py-4 font-bold text-gray-600">{d.project}</td>
                            <td className="py-4 font-black text-gray-800">{d.title}</td>
                            <td className="py-4 font-bold text-gray-600">{d.deadline}</td>
                            <td className="py-4">
                              <Badge
                                color={
                                  d.status === "CONCLUIDO"
                                    ? "bg-green-50 text-green-700"
                                    : d.status === "EM_ANDAMENTO"
                                    ? "bg-yellow-50 text-yellow-700"
                                    : "bg-gray-100 text-gray-600"
                                }
                              >
                                {d.status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </>
          )}

          {/* DETALHE ENTREGA */}
          {view === "DETALHE_ENTREGA" && selectedDelivery && (
            <>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
                <div>
                  <h1 className="text-[#1895BD]">Entrega</h1>
                  <p className="text-gray-400 text-xl font-light">{selectedDelivery.client} | {selectedDelivery.project}</p>
                </div>

                <div className="flex gap-4 flex-wrap">
                  <Button variant="outline" onClick={() => setView("ENTREGAS")}>Voltar</Button>
                </div>
              </div>

              <Card>
                <div className="flex items-start justify-between gap-6">
                  <div className="flex-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-300 mb-2">{selectedDelivery.client}</p>
                    <h3 className="text-3xl font-black text-gray-800">{selectedDelivery.title}</h3>
                    <p className="text-gray-400 font-bold mt-3">
                      Projeto: {selectedDelivery.project} | Prestador: {selectedDelivery.provider || "Não definido"} | Prazo: {selectedDelivery.deadline}
                    </p>
                    {selectedDelivery.description ? (
                      <p className="text-gray-600 font-bold mt-6 whitespace-pre-wrap">{selectedDelivery.description}</p>
                    ) : null}
                  </div>
                  <Badge
                    color={
                      selectedDelivery.status === "CONCLUIDO"
                        ? "bg-green-50 text-green-700"
                        : selectedDelivery.status === "EM_ANDAMENTO"
                        ? "bg-yellow-50 text-yellow-700"
                        : "bg-gray-100 text-gray-600"
                    }
                  >
                    {selectedDelivery.status}
                  </Badge>
                </div>
              </Card>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                <Card>
                  <h3 className="text-2xl mb-6 text-gray-800">Checklist</h3>
                  <div className="space-y-3">
                    {deliveryChecklist.map((c: any) => (
                      <div key={c.id} className="p-4 border border-gray-100 rounded-2xl flex items-center gap-4">
                        <input type="checkbox" checked={!!c.done} readOnly />
                        <div className="flex-1">
                          <p className="font-black text-gray-800">{c.title}</p>
                          <p className="text-xs text-gray-400 font-bold">Criado em {new Date(c.createdAt || Date.now()).toLocaleDateString("pt-BR")}</p>
                        </div>
                      </div>
                    ))}
                    {deliveryChecklist.length === 0 ? (
                      <p className="text-gray-400 font-bold">Nenhum item de checklist.</p>
                    ) : null}
                  </div>
                </Card>

                <Card>
                  <h3 className="text-2xl mb-6 text-gray-800">Anexos</h3>
                  <div className="space-y-3">
                    {deliveryAttachments.map((a: any) => (
                      <div key={a.id} className="p-4 border border-gray-100 rounded-2xl flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-black text-gray-800 truncate">{a.title || "Arquivo"}</p>
                          <p className="text-xs text-gray-400 font-bold truncate">{a.url || ""}</p>
                        </div>
                        {a.url ? (
                          <a className="text-[#1895BD] font-black text-sm uppercase tracking-widest" href={a.url} target="_blank" rel="noreferrer">
                            Abrir
                          </a>
                        ) : null}
                      </div>
                    ))}
                    {deliveryAttachments.length === 0 ? (
                      <p className="text-gray-400 font-bold">Nenhum anexo.</p>
                    ) : null}
                  </div>
                </Card>
              </div>

              <Card>
                <h3 className="text-2xl mb-6 text-gray-800">Comentários</h3>
                <div className="space-y-4">
                  {deliveryComments.map((c: any) => (
                    <div key={c.id} className="p-5 border border-gray-100 rounded-3xl">
                      <div className="flex items-center justify-between">
                        <p className="font-black text-gray-800">{c.author || "Usuário"}</p>
                        <p className="text-xs text-gray-400 font-bold">{new Date(c.createdAt || Date.now()).toLocaleString("pt-BR")}</p>
                      </div>
                      <p className="text-gray-600 font-bold mt-3 whitespace-pre-wrap">{c.text}</p>
                    </div>
                  ))}
                  {deliveryComments.length === 0 ? (
                    <p className="text-gray-400 font-bold">Nenhum comentário.</p>
                  ) : null}
                </div>
              </Card>
            </>
          )}

          {/* PRESTADORES (ADMIN) */}
          {view === "PRESTADORES" && role === "ADMIN" && (
            <>
              <div className="flex items-center justify-between gap-6">
                <div>
                  <h1 className="text-[#1895BD]">Prestadores</h1>
                  <p className="text-gray-400 text-xl font-light">Cadastro e documentação de segurança.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                <Card className="lg:col-span-1">
                  <h3 className="text-2xl mb-6 text-gray-800">Lista</h3>
                  <div className="space-y-3">
                    {usersList
                      .filter((u) => u.role === "PRESTADOR" && u.status !== "DELETED")
                      .map((u) => (
                        <button
                          key={u.uid}
                          onClick={() => setSelectedProviderUid(u.uid)}
                          className={`w-full text-left p-4 rounded-2xl border transition-all ${
                            selectedProviderUid === u.uid ? "border-[#1895BD] bg-[#1895BD]/5" : "border-gray-100 hover:bg-gray-50"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-gray-100 flex items-center justify-center font-black text-gray-500">
                              {(u.name || "P").slice(0, 1).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-black text-gray-800 truncate">{u.name}</p>
                              <p className="text-xs text-gray-400 truncate">{u.email}</p>
                            </div>
                          </div>
                        </button>
                      ))}
                  </div>
                </Card>

                <Card className="lg:col-span-2">
                  {!selectedProviderUid ? (
                    <div className="text-gray-500 font-bold">Selecione um prestador para visualizar registros.</div>
                  ) : (
                    <>
                      {(() => {
                        const u = usersList.find((x) => x.uid === selectedProviderUid);
                        const name = u?.name || "Prestador";
                        const count = safetyDocs.length;
                        return (
                          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 mb-8">
                            <div>
                              <h3 className="text-2xl text-gray-800 mb-1">{name}</h3>
                              <p className="text-gray-400 font-bold">Registros: {count}</p>
                            </div>
                            <div className="flex flex-wrap gap-3">
                              <Button variant="danger" onClick={() => u && deleteUserSoft(u)}>Excluir Prestador</Button>
                              <Button
                                variant="secondary"
                                onClick={() => {
                                  setSafetyAdding((v) => !v);
                                  setSafetyForm({ type: "NR10", title: "", issueDate: "", expiryDate: "", url: "", notes: "" });
                                }}
                              >
                                {safetyAdding ? "Cancelar" : "Adicionar registro"}
                              </Button>
                            </div>
                          </div>
                        );
                      })()}

                      {safetyAdding ? (
                        <div className="p-6 border border-gray-100 rounded-3xl bg-white shadow-inner space-y-5">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Tipo</p>
                              <select
                                value={safetyForm.type}
                                onChange={(e) => setSafetyForm((p) => ({ ...p, type: e.target.value }))}
                                className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm outline-none shadow-inner"
                              >
                                <option value="NR10">NR10</option>
                                <option value="NR33">NR33</option>
                                <option value="NR35">NR35</option>
                                <option value="ASO">ASO</option>
                                <option value="OUTRO">Outro</option>
                              </select>
                            </div>

                            <div>
                              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Título</p>
                              <input
                                value={safetyForm.title}
                                onChange={(e) => setSafetyForm((p) => ({ ...p, title: e.target.value }))}
                                className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm outline-none shadow-inner"
                                placeholder="Ex: Certificado NR35"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Emissão</p>
                              <input
                                type="date"
                                value={safetyForm.issueDate}
                                onChange={(e) => setSafetyForm((p) => ({ ...p, issueDate: e.target.value }))}
                                className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm outline-none shadow-inner"
                              />
                            </div>

                            <div>
                              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Validade</p>
                              <input
                                type="date"
                                value={safetyForm.expiryDate}
                                onChange={(e) => setSafetyForm((p) => ({ ...p, expiryDate: e.target.value }))}
                                className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm outline-none shadow-inner"
                              />
                            </div>
                          </div>

                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Link externo (opcional)</p>
                            <input
                              value={safetyForm.url}
                              onChange={(e) => setSafetyForm((p) => ({ ...p, url: e.target.value }))}
                              className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm outline-none shadow-inner"
                              placeholder="Link do Drive, OneDrive, etc"
                            />
                          </div>

                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Observações (opcional)</p>
                            <textarea
                              value={safetyForm.notes}
                              onChange={(e) => setSafetyForm((p) => ({ ...p, notes: e.target.value }))}
                              className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm outline-none shadow-inner min-h-[110px]"
                              placeholder="Notas internas"
                            />
                          </div>

                          <div className="flex justify-end">
                            <Button variant="primary" onClick={addSafetyDoc}>Salvar registro</Button>
                          </div>
                        </div>
                      ) : null}

                      <div className="mt-8 space-y-4">
                        {safetyDocs.length === 0 ? (
                          <div className="text-gray-500 font-bold">Nenhum registro cadastrado.</div>
                        ) : (
                          safetyDocs.map((d: any) => (
                            <div key={d.id} className="p-5 border border-gray-100 rounded-3xl flex flex-col md:flex-row md:items-start gap-5">
                              <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-300">{d.type || "DOC"}</p>
                                <p className="font-black text-gray-800">{d.title}</p>
                                <div className="text-sm text-gray-500 mt-2 space-y-1">
                                  <div>Emissão: {d.issueDate || "Não informado"}</div>
                                  <div>Validade: {d.expiryDate || "Não informado"}</div>
                                  {d.url ? (
                                    <div className="truncate">
                                      Link:{" "}
                                      <a className="text-[#1895BD] font-black" href={d.url} target="_blank" rel="noreferrer">
                                        Abrir
                                      </a>
                                    </div>
                                  ) : null}
                                </div>
                                {d.notes ? <p className="text-sm text-gray-400 mt-3 whitespace-pre-wrap">{d.notes}</p> : null}
                              </div>

                              <div className="flex gap-3">
                                <Button variant="danger" onClick={() => deleteSafetyDoc(d.id)}>Excluir</Button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </Card>
              </div>
            </>
          )}

          {/* PERFIL */}
          {view === "PERFIL" && (
            <>
              <div className="flex items-center justify-between gap-6">
                <div>
                  <h1 className="text-[#1895BD]">Meu Perfil</h1>
                  <p className="text-gray-400 text-xl font-light">Dados do usuário.</p>
                </div>
              </div>

              <Card>
                <div className="flex flex-col md:flex-row md:items-start gap-10">
                  <div className="w-24 h-24 rounded-3xl bg-gray-100 flex items-center justify-center text-3xl font-black text-gray-500">
                    {(profile.name || "U").slice(0, 1).toUpperCase()}
                  </div>

                  <div className="flex-1 space-y-4">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Nome</p>
                      <p className="font-black text-gray-800 text-2xl">{profile.name}</p>
                    </div>

                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">E-mail</p>
                      <p className="font-bold text-gray-700">{profile.email}</p>
                    </div>

                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Função</p>
                      <p className="font-bold text-gray-700">{profile.role}</p>
                    </div>
                  </div>
                </div>
              </Card>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
