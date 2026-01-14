import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AppNotification,
  Comment,
  Delivery,
  Priority,
  Project,
  SafetyDoc,
  SafetyDocType,
  Status,
  UserProfile,
  UserRole,
  ViewState,
} from "./types";

import { auth, db } from "./firebase";

import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
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
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

// ---------------- Helpers ----------------
const nowPtBr = () => new Date().toLocaleString("pt-BR");
const datePtBr = () => new Date().toLocaleDateString("pt-BR");

const PAGE_SIZE = 20;

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase());
}

function sanitizeText(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function isValidDateISO(d: string) {
  if (!d) return false;
  // yyyy-mm-dd básico
  return /^\d{4}-\d{2}-\d{2}$/.test(d);
}

function bytesToSize(bytes: number) {
  if (!bytes) return "0B";
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(1)}${sizes[i]}`;
}

// ---------------- UI ----------------
const FmeaLogo: React.FC<{ className?: string }> = ({ className = "" }) => (
  <div className={`flex items-center justify-center ${className}`}>
    <img
      src="/logo-fmea.png"
      alt="FMEA"
      className="w-full h-full object-contain"
      draggable={false}
    />
  </div>
);

const Badge: React.FC<{ type: "status" | "priority"; value: string }> = ({ type, value }) => {
  const getColors = () => {
    if (type === "status") {
      switch (value) {
        case "APROVADO":
          return "bg-green-100 text-green-700 border-green-200";
        case "ATRASADO":
          return "bg-red-100 text-red-700 border-red-200";
        case "AJUSTES":
          return "bg-orange-100 text-orange-700 border-orange-200";
        case "REVISAO":
          return "bg-blue-100 text-blue-700 border-blue-200";
        default:
          return "bg-gray-100 text-gray-700 border-gray-200";
      }
    }
    switch (value) {
      case "ALTA":
        return "bg-red-50 text-red-600 border-red-100";
      case "MEDIA":
        return "bg-yellow-50 text-yellow-600 border-yellow-100";
      default:
        return "bg-blue-50 text-blue-600 border-blue-100";
    }
  };

  return (
    <span
      className={`px-3 py-1 rounded-full text-xs font-black border uppercase tracking-wider ${getColors()}`}
    >
      {value}
    </span>
  );
};

const Card: React.FC<{
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}> = ({ children, className = "", onClick }) => (
  <div
    onClick={onClick}
    className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-8 transition-all duration-300 ${
      onClick ? "cursor-pointer hover:shadow-xl hover:-translate-y-1" : ""
    } ${className}`}
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
  loading?: boolean;
}> = ({ onClick, children, variant = "primary", className = "", disabled, type = "button", loading }) => {
  const variants = {
    primary: "bg-[#1895BD] hover:bg-[#147a9e] text-white shadow-lg shadow-blue-100",
    secondary: "bg-[#75AD4D] hover:bg-[#639441] text-white shadow-lg shadow-green-100",
    outline: "border-2 border-[#1895BD] text-[#1895BD] hover:bg-blue-50",
    danger: "bg-red-500 hover:bg-red-600 text-white",
  };

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={`px-6 py-3 rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm uppercase tracking-widest ${variants[variant]} ${className}`}
    >
      {loading ? "..." : children}
    </button>
  );
};

const Modal: React.FC<{
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ open, title, onClose, children }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[999] bg-black/40 flex items-center justify-center p-6">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10">
              <FmeaLogo />
            </div>
            <h3 className="text-[#1895BD] text-xl font-black">{title}</h3>
          </div>
          <button onClick={onClose} className="text-2xl text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
};

type ToastType = "success" | "error" | "info";
type Toast = { id: string; type: ToastType; title: string; message?: string };

const Toasts: React.FC<{ items: Toast[]; onRemove: (id: string) => void }> = ({ items, onRemove }) => (
  <div className="fixed z-[9999] top-6 right-6 space-y-3 w-[320px]">
    {items.map((t) => (
      <div
        key={t.id}
        className={`rounded-2xl border p-4 shadow-lg bg-white ${
          t.type === "success"
            ? "border-green-200"
            : t.type === "error"
            ? "border-red-200"
            : "border-blue-200"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-black text-gray-800">{t.title}</p>
            {t.message ? <p className="text-sm text-gray-500 mt-1">{t.message}</p> : null}
          </div>
          <button onClick={() => onRemove(t.id)} className="text-gray-400 hover:text-gray-700">
            ✕
          </button>
        </div>
      </div>
    ))}
  </div>
);

// ---------------- App ----------------
export default function App() {
  // auth
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  // profile
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // view
  const [view, setView] = useState<ViewState>("LOGIN");

  // login/signup
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // toasts
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = (type: ToastType, title: string, message?: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [{ id, type, title, message }, ...prev].slice(0, 5));
    setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, 3500);
  };

  const run = async <T,>(
    fn: () => Promise<T>,
    opts?: { ok?: string; fail?: string; info?: string }
  ): Promise<T | null> => {
    try {
      if (opts?.info) pushToast("info", opts.info);
      const res = await fn();
      if (opts?.ok) pushToast("success", opts.ok);
      return res;
    } catch (e: any) {
      pushToast("error", opts?.fail || "Falha", e?.message ? String(e.message) : undefined);
      return null;
    }
  };

  // data (base)
  const [projects, setProjects] = useState<Project[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [safetyDocs, setSafetyDocs] = useState<SafetyDoc[]>([]);

  // selections
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);
  const [selectedProviderUid, setSelectedProviderUid] = useState<string | null>(null);

  // pagination cursors
  const projectsCursor = useRef<any>(null);
  const deliveriesCursor = useRef<any>(null);
  const usersCursor = useRef<any>(null);

  const [projectsHasMore, setProjectsHasMore] = useState(true);
  const [deliveriesHasMore, setDeliveriesHasMore] = useState(true);
  const [usersHasMore, setUsersHasMore] = useState(true);

  const [listLoading, setListLoading] = useState(false);

  // UI
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("TODOS");
  const [clientFilter, setClientFilter] = useState<string>("TODOS");
  const [viewMode, setViewMode] = useState<"CARD" | "TABLE">("CARD");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // modals
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const confirmActionRef = useRef<null | (() => Promise<void>)>(null);

  // comments
  const [commentText, setCommentText] = useState("");

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

  const [safetyForm, setSafetyForm] = useState({
    type: "NR35" as SafetyDocType,
    title: "",
    issueDate: "",
    expiryDate: "",
    url: "",
    notes: "",
  });

  const role: UserRole | null = profile?.role ?? null;

  const userDisplayName = useMemo(() => {
    if (!profile) return "";
    return profile.name || (profile.role === "ADMIN" ? "Administrador FMEA" : "Prestador");
  }, [profile]);

  // ---------------- Auth + profile bootstrap ----------------
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setAuthReady(true);

      if (!u) {
        setProfile(null);
        setView("LOGIN");
        return;
      }

      const userRef = doc(db, "users", u.uid);
      const snap = await getDoc(userRef);

      if (!snap.exists()) {
        const newProfile: UserProfile = {
          uid: u.uid,
          email: u.email || "",
          name: (u.email || "").split("@")[0] || "Usuário",
          role: "PRESTADOR",
          status: "PENDING",
          active: false,
          pixKey: "",
          createdAt: Date.now(),
        };
        await updateDoc(userRef, newProfile as any).catch(async () => {
          // se não existe, cria
          await addDoc(collection(db, "users"), newProfile as any);
        });
      }

      // profile live
      const unsubProfile = onSnapshot(userRef, (s) => {
        if (!s.exists()) return;
        const p = s.data() as UserProfile;
        setProfile(p);

        if (!p.active || p.status !== "ACTIVE") {
          setView("PENDING");
        } else {
          setView(p.role === "ADMIN" ? "DASHBOARD" : "ENTREGAS");
        }
      });

      return () => unsubProfile();
    });

    return () => unsub();
  }, []);

  // ---------------- Live minimal notifications (snapshot) ----------------
  useEffect(() => {
    if (!user || !profile || !profile.active) return;

    const notifQ = query(
      collection(db, "notifications"),
      where("toUid", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(50)
    );

    const unsubNotif = onSnapshot(notifQ, (snap) => {
      const arr: AppNotification[] = snap.docs.map((d) => ({ ...(d.data() as any), id: d.id }));
      setNotifications(arr);
    });

    return () => unsubNotif();
  }, [user?.uid, profile?.active]);

  // ---------------- Load lists (paginated, reduce reads) ----------------
  const resetLists = () => {
    setProjects([]);
    setDeliveries([]);
    setUsersList([]);
    projectsCursor.current = null;
    deliveriesCursor.current = null;
    usersCursor.current = null;
    setProjectsHasMore(true);
    setDeliveriesHasMore(true);
    setUsersHasMore(true);
  };

  const loadProjectsPage = async (append: boolean) => {
    if (!user || !profile) return;
    if (!projectsHasMore && append) return;

    setListLoading(true);

    const base =
      profile.role === "ADMIN"
        ? query(collection(db, "projects"), orderBy("createdAt", "desc"))
        : query(
            collection(db, "projects"),
            where("memberUids", "array-contains", user.uid),
            orderBy("createdAt", "desc")
          );

    const qFinal = projectsCursor.current
      ? query(base, startAfter(projectsCursor.current), limit(PAGE_SIZE))
      : query(base, limit(PAGE_SIZE));

    const snap = await run(async () => getDocs(qFinal), { fail: "Falha ao carregar projetos" });
    if (!snap) {
      setListLoading(false);
      return;
    }

    const docs = snap.docs;
    const next = docs.map((d) => ({ ...(d.data() as Project), id: d.id })) as Project[];

    if (append) setProjects((prev) => [...prev, ...next]);
    else setProjects(next);

    projectsCursor.current = docs.length > 0 ? docs[docs.length - 1] : projectsCursor.current;
    setProjectsHasMore(docs.length === PAGE_SIZE);

    setListLoading(false);
  };

  const loadDeliveriesPage = async (append: boolean) => {
    if (!user || !profile) return;
    if (!deliveriesHasMore && append) return;

    setListLoading(true);

    const base =
      profile.role === "ADMIN"
        ? query(collection(db, "deliveries"), orderBy("createdAt", "desc"))
        : query(
            collection(db, "deliveries"),
            where("providerUid", "==", user.uid),
            orderBy("createdAt", "desc")
          );

    const qFinal = deliveriesCursor.current
      ? query(base, startAfter(deliveriesCursor.current), limit(PAGE_SIZE))
      : query(base, limit(PAGE_SIZE));

    const snap = await run(async () => getDocs(qFinal), { fail: "Falha ao carregar entregas" });
    if (!snap) {
      setListLoading(false);
      return;
    }

    const docs = snap.docs;
    const next = docs.map((d) => {
      const data = d.data() as any;
      const mapped: Delivery = {
        id: d.id,
        projectId: data.projectId,
        client: data.client,
        project: data.project,
        title: data.title,
        deadline: data.deadline,
        status: data.status,
        priority: data.priority,
        provider: data.provider,
        providerUid: data.providerUid,
        description: data.description || "",
        checklist: data.checklist || [],
        attachments: [],
        comments: [],
        createdAt: data.createdAt || Date.now(),
        managerUid: data.managerUid,
      };
      return mapped;
    });

    if (append) setDeliveries((prev) => [...prev, ...next]);
    else setDeliveries(next);

    deliveriesCursor.current = docs.length > 0 ? docs[docs.length - 1] : deliveriesCursor.current;
    setDeliveriesHasMore(docs.length === PAGE_SIZE);

    setListLoading(false);
  };

  const loadUsersPage = async (append: boolean) => {
    if (!user || !profile) return;
    if (profile.role !== "ADMIN") return;
    if (!usersHasMore && append) return;

    setListLoading(true);

    const base = query(collection(db, "users"), orderBy("createdAt", "desc"));
    const qFinal = usersCursor.current
      ? query(base, startAfter(usersCursor.current), limit(PAGE_SIZE))
      : query(base, limit(PAGE_SIZE));

    const snap = await run(async () => getDocs(qFinal), { fail: "Falha ao carregar usuários" });
    if (!snap) {
      setListLoading(false);
      return;
    }

    const docs = snap.docs;
    const next = docs.map((d) => d.data() as UserProfile);

    if (append) setUsersList((prev) => [...prev, ...next]);
    else setUsersList(next);

    usersCursor.current = docs.length > 0 ? docs[docs.length - 1] : usersCursor.current;
    setUsersHasMore(docs.length === PAGE_SIZE);

    setListLoading(false);
  };

  // realtime para refletir aprovação sem F5 (somente admin e somente pendentes/ativos)
  useEffect(() => {
    if (!user || !profile || !profile.active) return;

    resetLists();
    loadProjectsPage(false);
    loadDeliveriesPage(false);
    if (profile.role === "ADMIN") loadUsersPage(false);

    // Snapshot enxuto para refletir mudança imediata de usuários (pendente/ativo)
    let unsubUsers: (() => void) | null = null;
    if (profile.role === "ADMIN") {
      const qUsersLive = query(collection(db, "users"), orderBy("createdAt", "desc"), limit(60));
      unsubUsers = onSnapshot(qUsersLive, (snap) => {
        const arr = snap.docs.map((d) => d.data() as UserProfile);
        setUsersList((prev) => {
          // mistura: substitui os primeiros 60 do topo e mantém o resto paginado
          const prevTail = prev.slice(60);
          return [...arr, ...prevTail];
        });
      });
    }

    return () => {
      if (unsubUsers) unsubUsers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, profile?.active, profile?.role]);

  // ---------------- Selected project/delivery ----------------
  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  );

  const selectedDelivery = useMemo(
    () => deliveries.find((d) => d.id === selectedDeliveryId) || null,
    [deliveries, selectedDeliveryId]
  );

  const clients = useMemo(() => {
    const set = new Set<string>();
    projects.forEach((p) => set.add(p.client));
    deliveries.forEach((d) => set.add(d.client));
    return Array.from(set).filter(Boolean);
  }, [projects, deliveries]);

  const filteredDeliveries = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return deliveries
      .filter((d) => {
        const matchesSearch =
          !term ||
          d.title.toLowerCase().includes(term) ||
          d.project.toLowerCase().includes(term);

        const matchesStatus = statusFilter === "TODOS" || d.status === statusFilter;
        const matchesClient = clientFilter === "TODOS" || d.client === clientFilter;

        return matchesSearch && matchesStatus && matchesClient;
      })
      .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
  }, [deliveries, searchTerm, statusFilter, clientFilter]);

  const stats = useMemo(() => {
    return {
      total: deliveries.length,
      atrasado: deliveries.filter((d) => d.status === "ATRASADO").length,
      revisao: deliveries.filter((d) => d.status === "REVISAO").length,
      ajustes: deliveries.filter((d) => d.status === "AJUSTES").length,
      aprovado: deliveries.filter((d) => d.status === "APROVADO").length,
    };
  }, [deliveries]);

  const unreadNotifCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  // ---------------- Load comments/attachments live for selected delivery ----------------
  useEffect(() => {
    if (!selectedDeliveryId) return;

    const commentsQ = query(
      collection(db, "deliveries", selectedDeliveryId, "comments"),
      orderBy("createdAt", "asc"),
      limit(200)
    );

    const unsubComments = onSnapshot(commentsQ, (snap) => {
      const arr: Comment[] = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          authorUid: data.authorUid,
          authorName: data.authorName,
          date: data.date,
          text: data.text,
          createdAt: data.createdAt || Date.now(),
        };
      });

      setDeliveries((prev) =>
        prev.map((dlv) => (dlv.id === selectedDeliveryId ? { ...dlv, comments: arr } : dlv))
      );
    });

    const attachQ = query(
      collection(db, "deliveries", selectedDeliveryId, "attachments"),
      orderBy("createdAt", "asc"),
      limit(200)
    );

    const unsubAttach = onSnapshot(attachQ, (snap) => {
      const arr = snap.docs.map((d) => ({ ...(d.data() as any), id: d.id })) as any[];

      setDeliveries((prev) =>
        prev.map((dlv) =>
          dlv.id === selectedDeliveryId ? { ...dlv, attachments: arr as any } : dlv
        )
      );
    });

    return () => {
      unsubComments();
      unsubAttach();
    };
  }, [selectedDeliveryId]);

  // ---------------- Safety docs live for selected provider (admin) or self ----------------
  useEffect(() => {
    if (!profile || !profile.active) return;

    const uidToWatch =
      role === "ADMIN" ? selectedProviderUid : user?.uid;

    if (!uidToWatch) {
      setSafetyDocs([]);
      return;
    }

    const qDocs = query(
      collection(db, "safetyDocs"),
      where("ownerUid", "==", uidToWatch),
      orderBy("createdAt", "desc"),
      limit(100)
    );

    const unsub = onSnapshot(qDocs, (snap) => {
      const arr = snap.docs.map((d) => ({ ...(d.data() as any), id: d.id })) as SafetyDoc[];
      setSafetyDocs(arr);
    });

    return () => unsub();
  }, [role, selectedProviderUid, user?.uid, profile?.active]);

  // ---------------- Auth handlers ----------------
  const doLogin = async () => {
    setAuthError(null);

    const e = sanitizeText(email).toLowerCase();
    if (!isValidEmail(e)) {
      setAuthError("Informe um e-mail válido.");
      return;
    }
    if (!senha || senha.length < 6) {
      setAuthError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setAuthLoading(true);
    try {
      await signInWithEmailAndPassword(auth, e, senha);
      pushToast("success", "Login realizado");
    } catch {
      setAuthError("Não foi possível entrar. Verifique e-mail e senha.");
    } finally {
      setAuthLoading(false);
    }
  };

  const doSignup = async () => {
    setAuthError(null);

    const e = sanitizeText(email).toLowerCase();
    const n = sanitizeText(nome);

    if (!n) {
      setAuthError("Informe o nome.");
      return;
    }
    if (!isValidEmail(e)) {
      setAuthError("Informe um e-mail válido.");
      return;
    }
    if (!senha || senha.length < 6) {
      setAuthError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setAuthLoading(true);

    try {
      const cred = await createUserWithEmailAndPassword(auth, e, senha);

      const newProfile: UserProfile = {
        uid: cred.user.uid,
        email: e,
        name: n,
        role: "PRESTADOR",
        status: "PENDING",
        active: false,
        pixKey: sanitizeText(pixKey),
        createdAt: Date.now(),
      };

      await updateDoc(doc(db, "users", cred.user.uid), newProfile as any).catch(async () => {
        // fallback se doc não existe
        await addDoc(collection(db, "users"), newProfile as any);
      });

      pushToast("success", "Conta criada", "Aguardando aprovação do administrador.");
    } catch (e: any) {
      setAuthError("Não foi possível criar conta. Verifique os dados e tente novamente.");
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
    setSelectedProviderUid(null);
    setView("LOGIN");
    pushToast("info", "Sessão encerrada");
  };

  // ---------------- Admin: approve/reject ----------------
  const approveUser = async (u: UserProfile, newRole: UserRole) => {
    if (!profile || profile.role !== "ADMIN") return;

    // atualização otimista (melhora sensação sem F5)
    setUsersList((prev) =>
      prev.map((x) =>
        x.uid === u.uid ? { ...x, role: newRole, status: "ACTIVE", active: true, approvedAt: Date.now() } : x
      )
    );

    await run(
      async () => {
        await updateDoc(doc(db, "users", u.uid), {
          role: newRole,
          status: "ACTIVE",
          active: true,
          approvedAt: Date.now(),
        });
      },
      { ok: "Usuário aprovado", fail: "Não foi possível aprovar" }
    );
  };

  const rejectUser = async (u: UserProfile) => {
    if (!profile || profile.role !== "ADMIN") return;

    setUsersList((prev) => prev.map((x) => (x.uid === u.uid ? { ...x, status: "REJECTED", active: false } : x)));

    await run(
      async () => {
        await updateDoc(doc(db, "users", u.uid), {
          status: "REJECTED",
          active: false,
        });
      },
      { ok: "Usuário rejeitado", fail: "Não foi possível rejeitar" }
    );
  };

  // ---------------- Create project ----------------
  const openCreateProject = () => {
    setProjectForm({ client: "", name: "", memberUids: [] });
    setProjectModalOpen(true);
  };

  const saveProject = async () => {
    if (!profile || profile.role !== "ADMIN") return;

    const client = sanitizeText(projectForm.client);
    const name = sanitizeText(projectForm.name);

    if (!client || !name) {
      pushToast("error", "Preencha cliente e nome do projeto");
      return;
    }

    const payload: Omit<Project, "id"> = {
      client,
      name,
      manager: profile.name,
      managerUid: profile.uid,
      memberUids: projectForm.memberUids,
      status: "EM_ANDAMENTO",
      completionRate: 0,
      createdAt: Date.now(),
    };

    const res = await run(
      async () => {
        await addDoc(collection(db, "projects"), payload as any);
      },
      { ok: "Projeto criado", fail: "Falha ao criar projeto" }
    );

    if (res !== null) {
      setProjectModalOpen(false);
      await loadProjectsPage(false);
      setView("PROJETOS");
    }
  };

  // ---------------- Create delivery ----------------
  const openCreateDelivery = (projectId?: string) => {
    setDeliveryForm({
      projectId: projectId || "",
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
    if (!profile || profile.role !== "ADMIN") return;

    const p = projects.find((x) => x.id === deliveryForm.projectId);
    if (!p) {
      pushToast("error", "Selecione um projeto válido");
      return;
    }

    const title = sanitizeText(deliveryForm.title);
    const deadline = deliveryForm.deadline;

    if (!title) {
      pushToast("error", "Informe o título da entrega");
      return;
    }
    if (!isValidDateISO(deadline)) {
      pushToast("error", "Informe um prazo válido");
      return;
    }
    if (!deliveryForm.providerUid) {
      pushToast("error", "Selecione um prestador");
      return;
    }

    const payload: any = {
      projectId: p.id,
      client: p.client,
      project: p.name,
      title,
      deadline,
      status: "PENDENTE" as Status,
      priority: deliveryForm.priority,
      providerUid: deliveryForm.providerUid,
      provider: deliveryForm.providerName || "Prestador",
      description: sanitizeText(deliveryForm.description),
      checklist: [],
      createdAt: Date.now(),
      managerUid: p.managerUid || profile.uid,
    };

    const res = await run(
      async () => {
        await addDoc(collection(db, "deliveries"), payload);
      },
      { ok: "Entrega criada", fail: "Falha ao criar entrega" }
    );

    if (res !== null) {
      setDeliveryModalOpen(false);
      await loadDeliveriesPage(false);
      setView("ENTREGAS");
    }
  };

  // ---------------- Comments ----------------
  const addComment = async (deliveryId: string) => {
    if (!profile || !user) return;

    const text = sanitizeText(commentText);
    if (!text) {
      pushToast("error", "Escreva um comentário antes de publicar");
      return;
    }

    setCommentText("");

    await run(
      async () => {
        await addDoc(collection(db, "deliveries", deliveryId, "comments"), {
          authorUid: user.uid,
          authorName: profile.name,
          date: nowPtBr(),
          text,
          createdAt: Date.now(),
        });

        const dlv = deliveries.find((d) => d.id === deliveryId);
        if (!dlv) return;

        // Notifica admins quando prestador comenta
        if (profile.role === "PRESTADOR") {
          const admins = usersList.filter((u) => u.role === "ADMIN" && u.active);
          const batch = writeBatch(db);
          admins.forEach((a) => {
            const refN = doc(collection(db, "notifications"));
            batch.set(refN, {
              toUid: a.uid,
              type: "COMMENT",
              title: `Novo comentário em: ${dlv.title}`,
              projectId: dlv.projectId,
              deliveryId: dlv.id,
              createdAt: Date.now(),
              read: false,
            });
          });
          await batch.commit();
        }
      },
      { ok: "Comentário publicado", fail: "Falha ao publicar comentário" }
    );
  };

  // ---------------- Status transitions ----------------
  const setDeliveryStatus = async (deliveryId: string, newStatus: Status) => {
    if (!profile || !user) return;

    const dlv = deliveries.find((d) => d.id === deliveryId);
    if (!dlv) return;

    // regra: prestador só manda revisão se tiver ao menos 1 "anexo" (metadado)
    if (profile.role === "PRESTADOR" && newStatus === "REVISAO") {
      if (!dlv.attachments || dlv.attachments.length === 0) {
        pushToast("error", "Para enviar para revisão, inclua ao menos 1 registro de arquivo (metadado) ou link.");
        return;
      }
    }

    // otimista
    setDeliveries((prev) => prev.map((d) => (d.id === deliveryId ? { ...d, status: newStatus } : d)));

    await run(
      async () => {
        await updateDoc(doc(db, "deliveries", deliveryId), { status: newStatus });

        // notificações
        if (profile.role === "PRESTADOR" && newStatus === "REVISAO") {
          const admins = usersList.filter((u) => u.role === "ADMIN" && u.active);
          const batch = writeBatch(db);
          admins.forEach((a) => {
            const refN = doc(collection(db, "notifications"));
            batch.set(refN, {
              toUid: a.uid,
              type: "SUBMITTED",
              title: `Entrega enviada para revisão: ${dlv.title}`,
              projectId: dlv.projectId,
              deliveryId: dlv.id,
              createdAt: Date.now(),
              read: false,
            });
          });
          await batch.commit();
        }

        if (profile.role === "ADMIN" && newStatus === "AJUSTES" && dlv.providerUid) {
          await addDoc(collection(db, "notifications"), {
            toUid: dlv.providerUid,
            type: "ADJUST_REQUESTED",
            title: `Ajustes solicitados: ${dlv.title}`,
            projectId: dlv.projectId,
            deliveryId: dlv.id,
            createdAt: Date.now(),
            read: false,
          });
        }

        if (profile.role === "ADMIN" && newStatus === "APROVADO" && dlv.providerUid) {
          await addDoc(collection(db, "notifications"), {
            toUid: dlv.providerUid,
            type: "APPROVED",
            title: `Entrega aprovada: ${dlv.title}`,
            projectId: dlv.projectId,
            deliveryId: dlv.id,
            createdAt: Date.now(),
            read: false,
          });
        }
      },
      { ok: "Status atualizado", fail: "Falha ao atualizar status" }
    );
  };

  const markAllNotificationsRead = async () => {
    if (!user) return;
    const unread = notifications.filter((n) => !n.read);

    await run(
      async () => {
        const batch = writeBatch(db);
        unread.forEach((n) => batch.update(doc(db, "notifications", n.id), { read: true }));
        await batch.commit();
      },
      { ok: "Notificações marcadas como lidas", fail: "Falha ao marcar notificações" }
    );
  };

  // ---------------- "Attachments" sem Storage (metadados) ----------------
  const addAttachmentMeta = async (deliveryId: string, name: string, notes?: string, url?: string) => {
    if (!profile || !user) return;

    const nm = sanitizeText(name);
    if (!nm) {
      pushToast("error", "Informe um nome para o arquivo");
      return;
    }

    await run(
      async () => {
        await addDoc(collection(db, "deliveries", deliveryId, "attachments"), {
          name: nm,
          size: "N/A",
          date: datePtBr(),
          uploaderUid: user.uid,
          uploaderName: profile.name,
          notes: sanitizeText(notes || ""),
          url: sanitizeText(url || ""),
          createdAt: Date.now(),
        });
      },
      { ok: "Registro de arquivo adicionado", fail: "Falha ao adicionar arquivo" }
    );
  };

  // ---------------- Delete delivery/project ----------------
  const confirm = (text: string, action: () => Promise<void>) => {
    setConfirmText(text);
    confirmActionRef.current = action;
    setConfirmModalOpen(true);
  };

  const deleteDelivery = async (deliveryId: string) => {
    if (!profile || profile.role !== "ADMIN") return;

    await run(
      async () => {
        // apaga subcoleções comments e attachments (best effort)
        const batch = writeBatch(db);

        const commentsSnap = await getDocs(collection(db, "deliveries", deliveryId, "comments"));
        commentsSnap.docs.forEach((d) => batch.delete(d.ref));

        const attachSnap = await getDocs(collection(db, "deliveries", deliveryId, "attachments"));
        attachSnap.docs.forEach((d) => batch.delete(d.ref));

        batch.delete(doc(db, "deliveries", deliveryId));
        await batch.commit();

        setDeliveries((prev) => prev.filter((d) => d.id !== deliveryId));
        if (selectedDeliveryId === deliveryId) {
          setSelectedDeliveryId(null);
          setView("ENTREGAS");
        }
      },
      { ok: "Entrega excluída", fail: "Falha ao excluir entrega" }
    );
  };

  const deleteProject = async (projectId: string) => {
    if (!profile || profile.role !== "ADMIN") return;

    await run(
      async () => {
        // apaga entregas do projeto + subcoleções (best effort)
        const deliveriesQ = query(collection(db, "deliveries"), where("projectId", "==", projectId));
        const dSnap = await getDocs(deliveriesQ);

        const batch = writeBatch(db);

        for (const d of dSnap.docs) {
          const deliveryId = d.id;

          const commentsSnap = await getDocs(collection(db, "deliveries", deliveryId, "comments"));
          commentsSnap.docs.forEach((c) => batch.delete(c.ref));

          const attachSnap = await getDocs(collection(db, "deliveries", deliveryId, "attachments"));
          attachSnap.docs.forEach((a) => batch.delete(a.ref));

          batch.delete(doc(db, "deliveries", deliveryId));
        }

        batch.delete(doc(db, "projects", projectId));
        await batch.commit();

        setProjects((prev) => prev.filter((p) => p.id !== projectId));
        setDeliveries((prev) => prev.filter((d) => d.projectId !== projectId));

        if (selectedProjectId === projectId) {
          setSelectedProjectId(null);
          setView("PROJETOS");
        }
      },
      { ok: "Projeto excluído", fail: "Falha ao excluir projeto" }
    );
  };

  // ---------------- Safety docs (no files) ----------------
  const saveSafetyDoc = async (ownerUid: string, ownerName: string) => {
    if (!profile || !user) return;

    const title = sanitizeText(safetyForm.title);
    const url = sanitizeText(safetyForm.url);
    const notes = sanitizeText(safetyForm.notes);
    const issueDate = safetyForm.issueDate ? safetyForm.issueDate : "";
    const expiryDate = safetyForm.expiryDate ? safetyForm.expiryDate : "";

    if (!title) {
      pushToast("error", "Informe um título");
      return;
    }
    if (issueDate && !isValidDateISO(issueDate)) {
      pushToast("error", "Data de emissão inválida");
      return;
    }
    if (expiryDate && !isValidDateISO(expiryDate)) {
      pushToast("error", "Data de validade inválida");
      return;
    }

    await run(
      async () => {
        await addDoc(collection(db, "safetyDocs"), {
          ownerUid,
          ownerName,
          type: safetyForm.type,
          title,
          issueDate: issueDate || "",
          expiryDate: expiryDate || "",
          url: url || "",
          notes: notes || "",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        setSafetyForm({ type: "NR35", title: "", issueDate: "", expiryDate: "", url: "", notes: "" });
      },
      { ok: "Documentação registrada", fail: "Falha ao registrar documentação" }
    );
  };

  const deleteSafetyDoc = async (docId: string) => {
    if (!profile || !user) return;

    await run(
      async () => {
        await deleteDoc(doc(db, "safetyDocs", docId));
      },
      { ok: "Registro removido", fail: "Falha ao remover registro" }
    );
  };

  // ---------------- Guards ----------------
  if (!authReady) return null;

  // ---------------- Screens: LOGIN ----------------
  if (!user && view === "LOGIN") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#D6DCE5] p-6 relative overflow-hidden">
        <Toasts items={toasts} onRemove={(id) => setToasts((p) => p.filter((x) => x.id !== id))} />

        <div className="absolute -top-20 -left-20 w-80 h-80 bg-[#75AD4D] opacity-10 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-[#1895BD] opacity-10 rounded-full blur-3xl" />

        <Card className="max-w-xl w-full py-16 px-12 z-10">
          <div className="mb-10 flex flex-col items-center text-center">
            <div className="w-24 h-24 bg-white rounded-3xl flex items-center justify-center mb-6 rotate-3 shadow-xl border border-gray-100 p-3">
              <FmeaLogo />
            </div>
            <h1 className="text-[#1895BD] uppercase tracking-tighter mb-4">Portal FMEA</h1>
            <p className="text-gray-500 max-w-md mx-auto text-lg leading-relaxed">
              Faça login para acessar. O nível de acesso é definido pela aprovação do administrador.
            </p>
          </div>

          <div className="space-y-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">E-mail</p>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-[#1895BD] outline-none transition-all shadow-inner"
                placeholder="email"
              />
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Senha</p>
              <input
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-[#1895BD] outline-none transition-all shadow-inner"
                placeholder="senha"
              />
            </div>

            {authError ? (
              <div className="bg-red-50 border border-red-100 text-red-600 rounded-2xl p-4 text-sm font-bold">
                {authError}
              </div>
            ) : null}

            <Button className="w-full" onClick={doLogin} disabled={!email || !senha} loading={authLoading}>
              Entrar
            </Button>

            <button
              className="w-full text-center text-sm font-black text-[#1895BD] uppercase tracking-widest mt-4"
              onClick={() => {
                setAuthError(null);
                setView("SIGNUP");
              }}
            >
              Criar conta
            </button>
          </div>
        </Card>
      </div>
    );
  }

  // ---------------- Screens: SIGNUP ----------------
  if (!user && view === "SIGNUP") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#D6DCE5] p-6 relative overflow-hidden">
        <Toasts items={toasts} onRemove={(id) => setToasts((p) => p.filter((x) => x.id !== id))} />

        <div className="absolute -top-20 -left-20 w-80 h-80 bg-[#75AD4D] opacity-10 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-[#1895BD] opacity-10 rounded-full blur-3xl" />

        <Card className="max-w-xl w-full py-16 px-12 z-10">
          <div className="mb-10 flex flex-col items-center text-center">
            <div className="w-24 h-24 bg-white rounded-3xl flex items-center justify-center mb-6 rotate-3 shadow-xl border border-gray-100 p-3">
              <FmeaLogo />
            </div>
            <h1 className="text-[#1895BD] uppercase tracking-tighter mb-4">Criar Conta</h1>
            <p className="text-gray-500 max-w-md mx-auto text-lg leading-relaxed">
              Após o cadastro, o acesso fica pendente de aprovação do administrador.
            </p>
          </div>

          <div className="space-y-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Nome</p>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-[#1895BD] outline-none transition-all shadow-inner"
                placeholder="Seu nome"
              />
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">E-mail</p>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-[#1895BD] outline-none transition-all shadow-inner"
                placeholder="email"
              />
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Senha</p>
              <input
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-[#1895BD] outline-none transition-all shadow-inner"
                placeholder="mínimo 6 caracteres"
              />
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Chave Pix (opcional)</p>
              <input
                value={pixKey}
                onChange={(e) => setPixKey(e.target.value)}
                className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-[#1895BD] outline-none transition-all shadow-inner"
                placeholder="CPF, e-mail, telefone, aleatória..."
              />
            </div>

            {authError ? (
              <div className="bg-red-50 border border-red-100 text-red-600 rounded-2xl p-4 text-sm font-bold">
                {authError}
              </div>
            ) : null}

            <Button className="w-full" onClick={doSignup} disabled={!email || !senha || !nome} loading={authLoading}>
              Criar conta
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

  // ---------------- Screens: PENDING ----------------
  if (user && profile && (!profile.active || profile.status !== "ACTIVE")) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#D6DCE5] p-6">
        <Toasts items={toasts} onRemove={(id) => setToasts((p) => p.filter((x) => x.id !== id))} />

        <Card className="max-w-xl w-full text-center py-16 px-12">
          <div className="mb-8">
            <div className="w-20 h-20 bg-white rounded-3xl mx-auto flex items-center justify-center mb-6 shadow-xl border border-gray-100 p-3">
              <FmeaLogo />
            </div>
            <h1 className="text-[#1895BD] uppercase tracking-tighter mb-4">Acesso pendente</h1>
            <p className="text-gray-500 text-lg leading-relaxed">
              A conta foi criada, mas ainda não foi aprovada por um administrador.
            </p>
          </div>

          <div className="bg-white border border-gray-100 rounded-2xl p-6 text-left">
            <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Conta</p>
            <p className="font-black text-gray-800">{profile.name}</p>
            <p className="text-sm text-gray-500">{profile.email}</p>
            <p className="text-xs text-gray-400 mt-3">
              Status: <span className="font-black">{profile.status}</span>
            </p>
          </div>

          <div className="mt-10">
            <Button variant="outline" onClick={doLogout} className="w-full">
              Sair
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (!user || !profile) return null;

  // ---------------- Navigation ----------------
  const NavItem = ({ id, label, icon }: { id: ViewState; label: string; icon: string }) => (
    <button
      onClick={() => {
        setView(id);
        setIsMobileMenuOpen(false);
        if (id !== "DETALHE_ENTREGA") setSelectedDeliveryId(null);
        if (id !== "DETALHE_PROJETO") setSelectedProjectId(null);
      }}
      className={`w-full flex items-center gap-4 px-6 py-4 rounded-xl transition-all text-sm font-black uppercase tracking-widest ${
        view === id ? "bg-[#1895BD] text-white shadow-lg" : "text-gray-500 hover:bg-gray-50"
      }`}
    >
      <span className="text-xl">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {id === "DASHBOARD" && unreadNotifCount > 0 ? (
        <span className="px-2 py-1 text-[10px] rounded-full bg-red-100 text-red-600 font-black">
          {unreadNotifCount}
        </span>
      ) : null}
    </button>
  );

  // ---------------- Modals content ----------------
  const membersOptions = usersList.filter((u) => u.role === "PRESTADOR" && u.active);

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-[#F8FAFC]">
      <Toasts items={toasts} onRemove={(id) => setToasts((p) => p.filter((x) => x.id !== id))} />

      {/* Confirm Modal */}
      <Modal
        open={confirmModalOpen}
        title="Confirmar ação"
        onClose={() => setConfirmModalOpen(false)}
      >
        <p className="text-gray-700 font-bold mb-6">{confirmText}</p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setConfirmModalOpen(false)}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              setConfirmModalOpen(false);
              if (confirmActionRef.current) await confirmActionRef.current();
              confirmActionRef.current = null;
            }}
          >
            Confirmar
          </Button>
        </div>
      </Modal>

      {/* Create Project Modal */}
      <Modal open={projectModalOpen} title="Criar Projeto" onClose={() => setProjectModalOpen(false)}>
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
              placeholder="Ex: Inspeção Guindaste X"
            />
          </div>

          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
              Membros do projeto (prestadores)
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-48 overflow-auto border border-gray-100 rounded-2xl p-4">
              {membersOptions.map((u) => {
                const checked = projectForm.memberUids.includes(u.uid);
                return (
                  <label key={u.uid} className="flex items-center gap-3 text-sm font-bold text-gray-700">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setProjectForm((p) => {
                          const exists = p.memberUids.includes(u.uid);
                          const next = exists
                            ? p.memberUids.filter((id) => id !== u.uid)
                            : [...p.memberUids, u.uid];
                          return { ...p, memberUids: next };
                        });
                      }}
                    />
                    <span className="truncate">{u.name} ({u.email})</span>
                  </label>
                );
              })}
              {membersOptions.length === 0 ? (
                <div className="text-sm text-gray-400">
                  Nenhum prestador ativo ainda. Aprove um usuário na tela Usuários.
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setProjectModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveProject} disabled={!projectForm.client.trim() || !projectForm.name.trim()}>
              Salvar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Create Delivery Modal */}
      <Modal open={deliveryModalOpen} title="Solicitar Entrega" onClose={() => setDeliveryModalOpen(false)}>
        <div className="space-y-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Projeto</p>
            <select
              value={deliveryForm.projectId}
              onChange={(e) => setDeliveryForm((d) => ({ ...d, projectId: e.target.value }))}
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

          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Prestador</p>
            <select
              value={deliveryForm.providerUid}
              onChange={(e) => {
                const uid = e.target.value;
                const u = usersList.find((x) => x.uid === uid) || null;
                setDeliveryForm((d) => ({
                  ...d,
                  providerUid: uid,
                  providerName: u?.name || "",
                }));
              }}
              className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm outline-none shadow-inner"
            >
              <option value="">Selecione</option>
              {membersOptions.map((u) => (
                <option key={u.uid} value={u.uid}>
                  {u.name} ({u.email})
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Descrição (opcional)</p>
            <textarea
              value={deliveryForm.description}
              onChange={(e) => setDeliveryForm((d) => ({ ...d, description: e.target.value }))}
              className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm outline-none shadow-inner min-h-[120px]"
              placeholder="Escopo e observações..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setDeliveryModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={saveDelivery}
              disabled={
                !deliveryForm.projectId ||
                !deliveryForm.title.trim() ||
                !deliveryForm.deadline ||
                !deliveryForm.providerUid
              }
            >
              Salvar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-80 bg-white border-r border-gray-100 fixed inset-y-0 z-50">
        <div className="p-10 mb-6 flex items-center gap-4">
          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm border border-gray-100 p-2">
            <FmeaLogo />
          </div>
          <h2 className="text-[#1895BD] text-2xl font-black uppercase tracking-tighter">FMEA</h2>
        </div>

        <nav className="flex-1 px-6 space-y-2">
          <NavItem id="DASHBOARD" label="Dashboard" icon="⚡" />
          <NavItem id="PROJETOS" label="Projetos" icon="📂" />
          <NavItem id="ENTREGAS" label={role === "ADMIN" ? "Entregas" : "Minhas Entregas"} icon="📦" />
          {role === "ADMIN" ? <NavItem id="USUARIOS" label="Usuários" icon="🧩" /> : null}
          {role === "ADMIN" ? <NavItem id="PRESTADORES" label="Prestadores" icon="👷" /> : null}
          <NavItem id="PERFIL" label="Meu Perfil" icon="👤" />
        </nav>

        <div className="p-8 mt-auto border-t border-gray-50 bg-gray-50/50">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-full bg-[#D6DCE5] border-2 border-white shadow-sm flex items-center justify-center text-[#1895BD] font-black">
              {userDisplayName.charAt(0)}
            </div>
            <div className="flex-1 truncate">
              <p className="text-sm font-black text-gray-800 truncate">{userDisplayName}</p>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{role}</p>
            </div>
          </div>
          <button
            onClick={doLogout}
            className="w-full text-center py-3 text-red-500 text-xs font-black uppercase tracking-widest hover:bg-red-50 rounded-xl transition-colors"
          >
            Encerrar Sessão
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-6 bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center shadow-sm border border-gray-100 p-1">
            <FmeaLogo />
          </div>
          <h2 className="text-[#1895BD] font-black text-xl">FMEA</h2>
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-[#1895BD] text-2xl">
          {isMobileMenuOpen ? "✕" : "☰"}
        </button>
      </div>

      {/* Mobile Nav */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 bg-white z-50 p-10 flex flex-col pt-20">
          <nav className="space-y-4">
            <NavItem id="DASHBOARD" label="Dashboard" icon="⚡" />
            <NavItem id="PROJETOS" label="Projetos" icon="📂" />
            <NavItem id="ENTREGAS" label="Entregas" icon="📦" />
            {role === "ADMIN" ? <NavItem id="USUARIOS" label="Usuários" icon="🧩" /> : null}
            {role === "ADMIN" ? <NavItem id="PRESTADORES" label="Prestadores" icon="👷" /> : null}
            <NavItem id="PERFIL" label="Perfil" icon="👤" />
            <hr className="my-10" />
            <button onClick={doLogout} className="w-full py-4 text-red-500 font-black uppercase tracking-widest text-sm">
              Sair
            </button>
          </nav>
        </div>
      )}

      {/* Main */}
      <main className="flex-1 md:ml-80 p-8 md:p-16 transition-all animate-in fade-in duration-500">
        <div className="max-w-6xl mx-auto space-y-12">
          {/* DASHBOARD */}
          {view === "DASHBOARD" && (
            <>
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                  <h1 className="text-[#1895BD] mb-2">Resumo Operacional</h1>
                  <p className="text-gray-400 text-xl font-light italic">Visão geral do sistema.</p>
                </div>
                <div className="bg-[#D6DCE5] px-6 py-3 rounded-2xl flex items-center gap-3 text-sm font-bold text-[#1895BD]">
                  📅{" "}
                  {new Date().toLocaleDateString("pt-BR", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                <div className="bg-white p-8 rounded-3xl border border-red-50 shadow-sm">
                  <p className="text-xs font-black text-red-400 uppercase tracking-widest mb-2">Atrasadas</p>
                  <p className="text-5xl font-black text-red-600">{stats.atrasado}</p>
                </div>
                <div className="bg-white p-8 rounded-3xl border border-blue-50 shadow-sm">
                  <p className="text-xs font-black text-blue-400 uppercase tracking-widest mb-2">Em Revisão</p>
                  <p className="text-5xl font-black text-blue-600">{stats.revisao}</p>
                </div>
                <div className="bg-white p-8 rounded-3xl border border-orange-50 shadow-sm">
                  <p className="text-xs font-black text-orange-400 uppercase tracking-widest mb-2">Em Ajustes</p>
                  <p className="text-5xl font-black text-orange-600">{stats.ajustes}</p>
                </div>
                <div className="bg-white p-8 rounded-3xl border border-green-50 shadow-sm">
                  <p className="text-xs font-black text-green-400 uppercase tracking-widest mb-2">Aprovadas</p>
                  <p className="text-5xl font-black text-green-600">{stats.aprovado}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 items-start">
                <Card className="lg:col-span-3">
                  <div className="flex justify-between items-center mb-10">
                    <h3 className="text-2xl text-gray-800">Notificações</h3>
                    <Button
                      variant="outline"
                      className="scale-75 origin-right"
                      onClick={markAllNotificationsRead}
                      disabled={unreadNotifCount === 0}
                    >
                      Marcar como lidas
                    </Button>
                  </div>

                  <div className="space-y-4">
                    {notifications.slice(0, 12).map((n) => (
                      <div key={n.id} className="p-4 rounded-2xl border border-gray-100 flex items-center gap-4">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center font-black ${
                            n.read ? "bg-gray-100 text-gray-500" : "bg-blue-50 text-[#1895BD]"
                          }`}
                        >
                          {n.type === "COMMENT"
                            ? "💬"
                            : n.type === "SUBMITTED"
                            ? "📤"
                            : n.type === "APPROVED"
                            ? "✅"
                            : n.type === "ADJUST_REQUESTED"
                            ? "🛠️"
                            : "ℹ️"}
                        </div>
                        <div className="flex-1">
                          <p className={`font-black ${n.read ? "text-gray-600" : "text-gray-800"}`}>{n.title}</p>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                            {new Date(n.createdAt).toLocaleString("pt-BR")}
                          </p>
                        </div>
                      </div>
                    ))}
                    {notifications.length === 0 ? (
                      <div className="py-10 text-center text-gray-300 text-sm italic">Sem notificações.</div>
                    ) : null}
                  </div>
                </Card>

                <div className="lg:col-span-2 space-y-8">
                  <Card className="bg-[#1895BD] text-white border-0">
                    <h3 className="text-xl mb-6">Atalhos</h3>
                    <div className="space-y-4">
                      {role === "ADMIN" ? (
                        <>
                          <Button variant="secondary" className="w-full" onClick={openCreateProject}>
                            + Criar Projeto
                          </Button>
                          <Button variant="outline" className="w-full" onClick={() => openCreateDelivery()}>
                            + Solicitar Entrega
                          </Button>
                        </>
                      ) : (
                        <Button variant="outline" className="w-full" onClick={() => setView("ENTREGAS")}>
                          Ver minhas entregas
                        </Button>
                      )}
                    </div>
                  </Card>

                  <div className="bg-[#D6DCE5]/30 p-8 rounded-3xl border-2 border-dashed border-[#D6DCE5] text-center">
                    <p className="text-[#1895BD] font-black uppercase tracking-widest text-xs mb-4">Suporte FMEA</p>
                    <p className="text-gray-500 text-sm leading-relaxed mb-6">
                      Dúvidas sobre escopo ou prazos: envie comentário na entrega.
                    </p>
                    <Button variant="outline" className="w-full" onClick={() => setView("ENTREGAS")}>
                      Abrir Entregas
                    </Button>
                  </div>
                </div>
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
                <Button
                  variant="outline"
                  onClick={async () => {
                    resetLists();
                    await loadUsersPage(false);
                    pushToast("success", "Atualizado");
                  }}
                  disabled={listLoading}
                >
                  Atualizar
                </Button>
              </div>

              <Card>
                <h3 className="text-2xl mb-6 text-gray-800">Pendentes</h3>
                <div className="space-y-4">
                  {usersList.filter((u) => u.status === "PENDING").map((u) => (
                    <div
                      key={u.uid}
                      className="p-5 border border-gray-100 rounded-2xl flex flex-col md:flex-row md:items-center gap-4"
                    >
                      <div className="flex-1">
                        <p className="font-black text-gray-800">{u.name}</p>
                        <p className="text-sm text-gray-500">{u.email}</p>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-2">UID: {u.uid}</p>
                      </div>
                      <div className="flex gap-3 flex-wrap">
                        <Button variant="secondary" onClick={() => approveUser(u, "PRESTADOR")}>
                          Aprovar Prestador
                        </Button>
                        <Button variant="primary" onClick={() => approveUser(u, "ADMIN")}>
                          Aprovar Admin
                        </Button>
                        <Button variant="danger" onClick={() => rejectUser(u)}>
                          Rejeitar
                        </Button>
                      </div>
                    </div>
                  ))}
                  {usersList.filter((u) => u.status === "PENDING").length === 0 ? (
                    <div className="py-10 text-center text-gray-300 text-sm italic">Sem usuários pendentes.</div>
                  ) : null}
                </div>

                {usersHasMore ? (
                  <div className="pt-6 flex justify-center">
                    <Button variant="outline" onClick={() => loadUsersPage(true)} disabled={listLoading}>
                      Carregar mais
                    </Button>
                  </div>
                ) : null}
              </Card>

              <Card className="mt-8">
                <h3 className="text-2xl mb-6 text-gray-800">Ativos</h3>
                <div className="space-y-3">
                  {usersList
                    .filter((u) => u.status === "ACTIVE")
                    .slice(0, 40)
                    .map((u) => (
                      <div key={u.uid} className="p-4 border border-gray-100 rounded-2xl flex items-center justify-between">
                        <div>
                          <p className="font-black text-gray-800">{u.name}</p>
                          <p className="text-sm text-gray-500">{u.email}</p>
                        </div>
                        <span className="text-xs font-black uppercase tracking-widest text-gray-400">{u.role}</span>
                      </div>
                    ))}
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

              <Card>
                <h3 className="text-2xl mb-6 text-gray-800">Lista</h3>
                <div className="space-y-3">
                  {usersList
                    .filter((u) => u.role === "PRESTADOR" && u.active)
                    .map((u) => (
                      <button
                        key={u.uid}
                        onClick={() => setSelectedProviderUid(u.uid)}
                        className={`w-full p-4 border rounded-2xl flex items-center justify-between text-left transition-all ${
                          selectedProviderUid === u.uid ? "border-[#1895BD] bg-blue-50/40" : "border-gray-100 hover:bg-gray-50"
                        }`}
                      >
                        <div>
                          <p className="font-black text-gray-800">{u.name}</p>
                          <p className="text-sm text-gray-500">{u.email}</p>
                        </div>
                        <span className="text-xs font-black uppercase tracking-widest text-gray-400">
                          {u.pixKey ? "Pix OK" : "Pix não informado"}
                        </span>
                      </button>
                    ))}

                  {usersList.filter((u) => u.role === "PRESTADOR" && u.active).length === 0 ? (
                    <div className="py-10 text-center text-gray-300 text-sm italic">
                      Nenhum prestador ativo ainda.
                    </div>
                  ) : null}
                </div>
              </Card>

              {selectedProviderUid ? (
                <Card className="mt-10">
                  <div className="flex items-start justify-between gap-6 flex-col md:flex-row">
                    <div>
                      <h3 className="text-2xl text-gray-800 mb-2">Documentação de segurança</h3>
                      <p className="text-gray-500 text-sm">
                        Storage está desativado no plano atual. Aqui ficam metadados e link externo opcional.
                      </p>
                    </div>
                  </div>

                  <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <p className="text-xs font-black uppercase tracking-widest text-gray-400">Registros</p>
                      <div className="space-y-3">
                        {safetyDocs.map((d) => (
                          <div key={d.id} className="p-4 border border-gray-100 rounded-2xl">
                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <p className="font-black text-gray-800">{d.type}: {d.title}</p>
                                <p className="text-xs text-gray-500 mt-1">
                                  Emissão: {d.issueDate || "-"} | Validade: {d.expiryDate || "-"}
                                </p>
                                {d.url ? (
                                  <a className="text-sm text-[#1895BD] font-bold hover:underline break-all" href={d.url} target="_blank" rel="noreferrer">
                                    Link
                                  </a>
                                ) : null}
                                {d.notes ? <p className="text-sm text-gray-600 mt-2">{d.notes}</p> : null}
                              </div>
                              <Button
                                variant="danger"
                                onClick={() =>
                                  confirm("Remover este registro de documentação?", async () => deleteSafetyDoc(d.id))
                                }
                              >
                                Excluir
                              </Button>
                            </div>
                          </div>
                        ))}
                        {safetyDocs.length === 0 ? (
                          <div className="py-10 text-center text-gray-300 text-sm italic">
                            Sem documentação cadastrada ainda.
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <p className="text-xs font-black uppercase tracking-widest text-gray-400">Adicionar registro</p>

                      <div className="grid grid-cols-1 gap-4">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Tipo</p>
                          <select
                            value={safetyForm.type}
                            onChange={(e) => setSafetyForm((p) => ({ ...p, type: e.target.value as SafetyDocType }))}
                            className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm outline-none shadow-inner"
                          >
                            <option value="NR10">NR10</option>
                            <option value="NR33">NR33</option>
                            <option value="NR35">NR35</option>
                            <option value="ASO">ASO</option>
                            <option value="OUTRO">OUTRO</option>
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
                          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Link (opcional)</p>
                          <input
                            value={safetyForm.url}
                            onChange={(e) => setSafetyForm((p) => ({ ...p, url: e.target.value }))}
                            className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm outline-none shadow-inner"
                            placeholder="Link externo (Drive, OneDrive...)"
                          />
                        </div>

                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Observações (opcional)</p>
                          <textarea
                            value={safetyForm.notes}
                            onChange={(e) => setSafetyForm((p) => ({ ...p, notes: e.target.value }))}
                            className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm outline-none shadow-inner min-h-[120px]"
                            placeholder="Notas..."
                          />
                        </div>

                        <Button
                          variant="secondary"
                          onClick={async () => {
                            const provider = usersList.find((x) => x.uid === selectedProviderUid);
                            if (!provider) {
                              pushToast("error", "Prestador inválido");
                              return;
                            }
                            await saveSafetyDoc(provider.uid, provider.name);
                          }}
                        >
                          Salvar
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              ) : null}
            </>
          )}

          {/* PROJETOS */}
          {view === "PROJETOS" && (
            <>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
                <div>
                  <h1 className="text-[#1895BD]">Projetos</h1>
                  <p className="text-gray-400 text-xl font-light">Cadastro e acompanhamento.</p>
                </div>
                <div className="flex gap-3 flex-wrap">
                  <Button variant="outline" onClick={() => loadProjectsPage(false)} disabled={listLoading}>
                    Atualizar
                  </Button>
                  {role === "ADMIN" ? (
                    <Button variant="secondary" onClick={openCreateProject}>
                      + Novo Projeto
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                {projects.map((p) => (
                  <Card
                    key={p.id}
                    onClick={() => {
                      setSelectedProjectId(p.id);
                      setView("DETALHE_PROJETO");
                    }}
                  >
                    <div className="flex justify-between items-start mb-8">
                      <p className="text-[10px] font-black uppercase tracking-[3px] text-gray-300">{p.client}</p>
                      <span
                        className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest ${
                          p.status === "EM_ANDAMENTO" ? "bg-blue-50 text-[#1895BD]" : "bg-gray-100"
                        }`}
                      >
                        {p.status.replace("_", " ")}
                      </span>
                    </div>
                    <h3 className="text-2xl text-[#1895BD] mb-10 min-h-[4rem]">{p.name}</h3>

                    <div className="space-y-4 pt-6 border-t border-gray-50">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-sm">
                          👤
                        </div>
                        <p className="text-xs font-bold text-gray-500">
                          Gestor: <span className="text-gray-800">{p.manager}</span>
                        </p>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between text-[10px] font-black uppercase text-gray-400">
                          <span>Progresso</span>
                          <span>{p.completionRate || 0}%</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-[#75AD4D]" style={{ width: `${p.completionRate || 0}%` }} />
                        </div>
                      </div>

                      {role === "ADMIN" ? (
                        <div className="pt-4 flex justify-end">
                          <Button
                            variant="danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              confirm("Excluir este projeto e as entregas relacionadas?", async () => deleteProject(p.id));
                            }}
                          >
                            Excluir
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </Card>
                ))}
              </div>

              {projects.length === 0 ? (
                <Card className="text-center py-16">
                  <p className="text-gray-400 font-bold">Nenhum projeto cadastrado ainda.</p>
                  {role === "ADMIN" ? (
                    <div className="mt-6">
                      <Button variant="secondary" onClick={openCreateProject}>
                        Criar primeiro projeto
                      </Button>
                    </div>
                  ) : null}
                </Card>
              ) : null}

              {projectsHasMore ? (
                <div className="flex justify-center pt-6">
                  <Button variant="outline" onClick={() => loadProjectsPage(true)} disabled={listLoading}>
                    Carregar mais
                  </Button>
                </div>
              ) : null}
            </>
          )}

          {/* DETALHE PROJETO */}
          {view === "DETALHE_PROJETO" && selectedProject && (
            <>
              <div className="flex items-center gap-6">
                <button
                  onClick={() => setView("PROJETOS")}
                  className="text-[#1895BD] hover:underline font-black uppercase text-xs tracking-widest"
                >
                  ← Projetos
                </button>
                <h1 className="text-[#1895BD]">{selectedProject.name}</h1>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
                <div className="lg:col-span-1 space-y-8">
                  <Card className="bg-white border-l-8 border-l-[#75AD4D]">
                    <div className="space-y-8">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Cliente</p>
                        <p className="text-lg font-bold text-gray-800">{selectedProject.client}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
                          Responsável FMEA
                        </p>
                        <p className="text-lg font-bold text-gray-800">{selectedProject.manager}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Status</p>
                        <Badge type="status" value={selectedProject.status} />
                      </div>
                    </div>
                  </Card>

                  {role === "ADMIN" ? (
                    <>
                      <Button
                        variant="secondary"
                        className="w-full py-4"
                        onClick={() => openCreateDelivery(selectedProject.id)}
                      >
                        + Solicitar entrega
                      </Button>

                      <Button
                        variant="danger"
                        className="w-full py-4"
                        onClick={() => confirm("Excluir este projeto e as entregas relacionadas?", async () => deleteProject(selectedProject.id))}
                      >
                        Excluir projeto
                      </Button>
                    </>
                  ) : null}
                </div>

                <div className="lg:col-span-3">
                  <Card>
                    <h3 className="text-2xl mb-8">Entregas do projeto</h3>

                    <div className="space-y-4">
                      {deliveries
                        .filter((d) => d.projectId === selectedProject.id)
                        .map((d) => (
                          <div
                            key={d.id}
                            onClick={() => {
                              setSelectedDeliveryId(d.id);
                              setView("DETALHE_ENTREGA");
                            }}
                            className="flex flex-col md:flex-row md:items-center justify-between p-6 border border-gray-100 rounded-2xl hover:bg-gray-50 transition-all cursor-pointer group"
                          >
                            <div className="flex-1">
                              <h4 className="text-lg text-gray-800 group-hover:text-[#1895BD] transition-colors">
                                {d.title}
                              </h4>
                              <div className="flex flex-wrap gap-4 text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2">
                                <span>👷 {d.provider}</span>
                                <span>📅 Prazo: {d.deadline}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-4 mt-4 md:mt-0">
                              <Badge type="priority" value={d.priority} />
                              <Badge type="status" value={d.status} />
                            </div>
                          </div>
                        ))}
                    </div>

                    {deliveries.filter((d) => d.projectId === selectedProject.id).length === 0 ? (
                      <div className="py-10 text-center text-gray-300 text-sm italic">
                        Nenhuma entrega criada para este projeto ainda.
                      </div>
                    ) : null}
                  </Card>
                </div>
              </div>
            </>
          )}

          {/* ENTREGAS */}
          {view === "ENTREGAS" && (
            <>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
                <div>
                  <h1 className="text-[#1895BD]">{role === "ADMIN" ? "Gestão de Entregas" : "Minhas Entregas"}</h1>
                  <p className="text-gray-400 text-xl font-light">Controle de qualidade e marcos técnicos.</p>
                </div>

                <div className="flex gap-3 flex-wrap">
                  <Button variant="outline" onClick={() => loadDeliveriesPage(false)} disabled={listLoading}>
                    Atualizar
                  </Button>
                  {role === "ADMIN" ? (
                    <Button variant="secondary" onClick={() => openCreateDelivery()}>
                      + Solicitar Entrega
                    </Button>
                  ) : null}
                </div>
              </div>

              <Card className="py-6 px-8 bg-white/50 backdrop-blur-sm">
                <div className="flex flex-col lg:flex-row gap-8 items-center">
                  <div className="flex-1 w-full relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300">🔍</span>
                    <input
                      type="text"
                      placeholder="Pesquisar por título ou projeto..."
                      className="w-full pl-12 pr-6 py-3 bg-white border border-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-[#1895BD] outline-none transition-all shadow-inner"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>

                  <div className="flex flex-wrap gap-6 items-center w-full lg:w-auto">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Status</p>
                      <select
                        className="bg-white border-0 text-xs font-bold p-1 outline-none"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                      >
                        <option value="TODOS">Todos</option>
                        <option value="PENDENTE">Pendente</option>
                        <option value="REVISAO">Revisão</option>
                        <option value="AJUSTES">Ajustes</option>
                        <option value="APROVADO">Aprovado</option>
                        <option value="ATRASADO">Atrasado</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Cliente</p>
                      <select
                        className="bg-white border-0 text-xs font-bold p-1 outline-none"
                        value={clientFilter}
                        onChange={(e) => setClientFilter(e.target.value)}
                      >
                        <option value="TODOS">Todos</option>
                        {clients.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex gap-2 ml-auto">
                      <button
                        onClick={() => setViewMode("CARD")}
                        className={`p-3 rounded-xl transition-all ${
                          viewMode === "CARD" ? "bg-[#1895BD] text-white" : "bg-gray-100 text-gray-400"
                        }`}
                      >
                        ⊞
                      </button>
                      <button
                        onClick={() => setViewMode("TABLE")}
                        className={`p-3 rounded-xl transition-all ${
                          viewMode === "TABLE" ? "bg-[#1895BD] text-white" : "bg-gray-100 text-gray-400"
                        }`}
                      >
                        ☰
                      </button>
                    </div>
                  </div>
                </div>
              </Card>

              {viewMode === "CARD" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                  {filteredDeliveries.map((d) => (
                    <Card
                      key={d.id}
                      onClick={() => {
                        setSelectedDeliveryId(d.id);
                        setView("DETALHE_ENTREGA");
                      }}
                    >
                      <div className="flex justify-between items-start mb-6">
                        <p className="text-[10px] font-black uppercase tracking-[2px] text-gray-300 truncate max-w-[160px]">
                          {d.client}
                        </p>
                        <Badge type="priority" value={d.priority} />
                      </div>

                      <h3 className="text-xl text-gray-800 mb-2 leading-tight min-h-[3rem]">{d.title}</h3>
                      <p className="text-xs font-black text-[#1895BD] uppercase tracking-widest mb-10">{d.project}</p>

                      <div className="flex items-center justify-between pt-6 border-t border-gray-50">
                        <div>
                          <p className="text-[9px] uppercase font-black text-gray-300 tracking-widest mb-1">Data Limite</p>
                          <p className="text-sm font-black text-gray-600">
                            {d.deadline ? new Date(d.deadline).toLocaleDateString("pt-BR") : "-"}
                          </p>
                        </div>
                        <Badge type="status" value={d.status} />
                      </div>

                      {role === "ADMIN" ? (
                        <div className="pt-5 flex justify-end">
                          <Button
                            variant="danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              confirm("Excluir esta entrega?", async () => deleteDelivery(d.id));
                            }}
                          >
                            Excluir
                          </Button>
                        </div>
                      ) : null}
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="overflow-x-auto p-0 border-0 bg-transparent shadow-none">
                  <table className="w-full text-left bg-white rounded-3xl overflow-hidden shadow-sm">
                    <thead className="bg-[#1895BD] text-white">
                      <tr>
                        <th className="px-8 py-6 text-xs font-black uppercase tracking-widest">Entrega</th>
                        <th className="px-8 py-6 text-xs font-black uppercase tracking-widest">Status</th>
                        <th className="px-8 py-6 text-xs font-black uppercase tracking-widest">Prioridade</th>
                        <th className="px-8 py-6 text-xs font-black uppercase tracking-widest text-center">Prazo</th>
                        {role === "ADMIN" ? (
                          <th className="px-8 py-6 text-xs font-black uppercase tracking-widest text-right">Ações</th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredDeliveries.map((d) => (
                        <tr key={d.id} className="hover:bg-blue-50/30 transition-colors">
                          <td
                            className="px-8 py-6 cursor-pointer"
                            onClick={() => {
                              setSelectedDeliveryId(d.id);
                              setView("DETALHE_ENTREGA");
                            }}
                          >
                            <p className="font-black text-gray-800">{d.title}</p>
                            <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">{d.project}</p>
                          </td>
                          <td className="px-8 py-6"><Badge type="status" value={d.status} /></td>
                          <td className="px-8 py-6"><Badge type="priority" value={d.priority} /></td>
                          <td className="px-8 py-6 text-center text-sm font-black text-gray-600 tracking-tighter">
                            {d.deadline}
                          </td>
                          {role === "ADMIN" ? (
                            <td className="px-8 py-6 text-right">
                              <Button
                                variant="danger"
                                onClick={() => confirm("Excluir esta entrega?", async () => deleteDelivery(d.id))}
                              >
                                Excluir
                              </Button>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              )}

              {deliveriesHasMore ? (
                <div className="flex justify-center pt-6">
                  <Button variant="outline" onClick={() => loadDeliveriesPage(true)} disabled={listLoading}>
                    Carregar mais
                  </Button>
                </div>
              ) : null}

              {deliveries.length === 0 ? (
                <Card className="text-center py-16">
                  <p className="text-gray-400 font-bold">Nenhuma entrega cadastrada ainda.</p>
                  {role === "ADMIN" ? (
                    <div className="mt-6">
                      <Button variant="secondary" onClick={() => openCreateDelivery()}>
                        Solicitar primeira entrega
                      </Button>
                    </div>
                  ) : null}
                </Card>
              ) : null}
            </>
          )}

          {/* DETALHE ENTREGA */}
          {view === "DETALHE_ENTREGA" && selectedDelivery && (
            <>
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-10">
                <div className="flex items-center gap-6">
                  <button
                    onClick={() => setView("ENTREGAS")}
                    className="text-[#1895BD] hover:underline font-black uppercase text-xs tracking-widest"
                  >
                    ← Listagem
                  </button>
                  <div>
                    <h1 className="text-[#1895BD] mb-1">{selectedDelivery.title}</h1>
                    <p className="text-gray-400 font-bold uppercase text-xs tracking-[4px]">{selectedDelivery.project}</p>
                  </div>
                </div>

                <div className="flex gap-4 flex-wrap">
                  {role === "PRESTADOR" && selectedDelivery.status !== "APROVADO" && (
                    <Button variant="secondary" onClick={() => setDeliveryStatus(selectedDelivery.id, "REVISAO")}>
                      Enviar para revisão
                    </Button>
                  )}

                  {role === "ADMIN" && selectedDelivery.status === "REVISAO" && (
                    <>
                      <Button variant="primary" onClick={() => setDeliveryStatus(selectedDelivery.id, "APROVADO")}>
                        Aprovar
                      </Button>
                      <Button variant="outline" onClick={() => setDeliveryStatus(selectedDelivery.id, "AJUSTES")}>
                        Pedir ajustes
                      </Button>
                    </>
                  )}

                  {role === "ADMIN" ? (
                    <Button
                      variant="danger"
                      onClick={() => confirm("Excluir esta entrega?", async () => deleteDelivery(selectedDelivery.id))}
                    >
                      Excluir
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                <div className="lg:col-span-2 space-y-10">
                  <Card className="bg-white/70">
                    <h3 className="text-2xl mb-6 text-gray-800">Escopo</h3>
                    <p className="text-gray-600 text-lg leading-relaxed">{selectedDelivery.description || "Sem descrição."}</p>
                  </Card>

                  <Card>
                    <h3 className="text-2xl mb-6 text-gray-800">Comentários</h3>
                    <div className="space-y-6">
                      {selectedDelivery.comments.map((c) => (
                        <div key={c.id} className="p-5 rounded-2xl bg-gray-50 border border-gray-100">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-black text-[#1895BD] uppercase tracking-widest">{c.authorName}</p>
                            <p className="text-[10px] font-black text-gray-300">{c.date}</p>
                          </div>
                          <p className="text-gray-700 text-lg leading-relaxed">{c.text}</p>
                        </div>
                      ))}

                      {selectedDelivery.comments.length === 0 ? (
                        <div className="py-6 text-center text-gray-300 text-sm italic">Nenhum comentário ainda.</div>
                      ) : null}

                      <div className="pt-2">
                        <textarea
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                          placeholder="Adicionar comentário..."
                          className="w-full bg-white border-2 border-gray-100 rounded-3xl p-6 text-lg min-h-[120px] focus:border-[#1895BD] outline-none transition-all shadow-inner"
                        />
                        <div className="flex justify-end mt-4">
                          <Button onClick={() => addComment(selectedDelivery.id)}>Publicar</Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>

                <div className="space-y-10">
                  <Card className="bg-[#1895BD] text-white border-0 shadow-2xl shadow-blue-200">
                    <h3 className="text-xl mb-8">Gestão</h3>
                    <div className="space-y-6">
                      <div className="flex justify-between items-center py-2 border-b border-white/10">
                        <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Status</span>
                        <Badge type="status" value={selectedDelivery.status} />
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-white/10">
                        <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Prioridade</span>
                        <Badge type="priority" value={selectedDelivery.priority} />
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-white/10">
                        <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Prestador</span>
                        <span className="text-lg font-bold">{selectedDelivery.provider}</span>
                      </div>
                      <div className="flex justify-between items-center py-2">
                        <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Prazo</span>
                        <span className="text-lg font-black tracking-tighter">{selectedDelivery.deadline}</span>
                      </div>
                    </div>
                  </Card>

                  <Card>
                    <h3 className="text-xl text-gray-800 mb-4">Arquivos (MVP sem Storage)</h3>
                    <p className="text-sm text-gray-500 mb-6">
                      No plano atual, não faremos upload. Registre o nome do arquivo e um link externo (opcional).
                    </p>

                    <div className="space-y-4">
                      {selectedDelivery.attachments.map((file: any) => (
                        <div key={file.id} className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                          <p className="text-sm font-black text-gray-800">{file.name}</p>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                            {file.date} • {file.uploaderName}
                          </p>
                          {file.url ? (
                            <a
                              href={file.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm text-[#1895BD] font-bold hover:underline break-all mt-2 inline-block"
                            >
                              Link
                            </a>
                          ) : null}
                          {file.notes ? <p className="text-sm text-gray-600 mt-2">{file.notes}</p> : null}
                        </div>
                      ))}

                      {selectedDelivery.attachments.length === 0 ? (
                        <div className="py-6 text-center text-gray-300 text-sm italic">Nenhum registro ainda.</div>
                      ) : null}
                    </div>

                    <div className="mt-8 border-t border-gray-100 pt-6">
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
                        Adicionar registro de arquivo
                      </p>

                      <AddAttachmentForm
                        onSave={async (name, url, notes) => {
                          await addAttachmentMeta(selectedDelivery.id, name, notes, url);
                        }}
                      />
                    </div>
                  </Card>
                </div>
              </div>
            </>
          )}

          {/* PERFIL */}
          {view === "PERFIL" && (
            <div className="max-w-2xl mx-auto py-10">
              <h1 className="text-[#1895BD] text-center mb-10">Minha Conta</h1>
              <Card className="text-center py-16">
                <div className="w-40 h-40 rounded-[3rem] bg-white mx-auto flex items-center justify-center border border-gray-100 shadow-2xl mb-10 overflow-hidden p-6">
                  <FmeaLogo />
                </div>

                <h2 className="text-3xl text-gray-800 mb-2">{profile.name}</h2>
                <p className="text-gray-500">{profile.email}</p>

                <p className="text-[#75AD4D] font-black uppercase tracking-[5px] text-xs mt-6 mb-10">{profile.role}</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10 text-left px-10">
                  <div>
                    <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1">Chave Pix</p>
                    <p className="font-bold text-gray-700 text-lg">{profile.pixKey || "Não informado"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1">UID</p>
                    <p className="font-bold text-gray-700 text-lg break-all">{profile.uid}</p>
                  </div>
                </div>

                {/* Prestador pode registrar documentação própria */}
                {role === "PRESTADOR" ? (
                  <div className="mt-14 px-10 text-left">
                    <h3 className="text-xl text-gray-800 mb-2">Documentação de segurança</h3>
                    <p className="text-sm text-gray-500 mb-6">
                      Storage está desativado. Registre metadados e link externo (opcional).
                    </p>

                    <div className="space-y-3 mb-8">
                      {safetyDocs.map((d) => (
                        <div key={d.id} className="p-4 border border-gray-100 rounded-2xl">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="font-black text-gray-800">{d.type}: {d.title}</p>
                              <p className="text-xs text-gray-500 mt-1">
                                Emissão: {d.issueDate || "-"} | Validade: {d.expiryDate || "-"}
                              </p>
                              {d.url ? (
                                <a className="text-sm text-[#1895BD] font-bold hover:underline break-all" href={d.url} target="_blank" rel="noreferrer">
                                  Link
                                </a>
                              ) : null}
                              {d.notes ? <p className="text-sm text-gray-600 mt-2">{d.notes}</p> : null}
                            </div>
                            <Button
                              variant="danger"
                              onClick={() => confirm("Remover este registro?", async () => deleteSafetyDoc(d.id))}
                            >
                              Excluir
                            </Button>
                          </div>
                        </div>
                      ))}
                      {safetyDocs.length === 0 ? (
                        <div className="py-6 text-center text-gray-300 text-sm italic">Sem registros ainda.</div>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Tipo</p>
                        <select
                          value={safetyForm.type}
                          onChange={(e) => setSafetyForm((p) => ({ ...p, type: e.target.value as SafetyDocType }))}
                          className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm outline-none shadow-inner"
                        >
                          <option value="NR10">NR10</option>
                          <option value="NR33">NR33</option>
                          <option value="NR35">NR35</option>
                          <option value="ASO">ASO</option>
                          <option value="OUTRO">OUTRO</option>
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
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Link (opcional)</p>
                        <input
                          value={safetyForm.url}
                          onChange={(e) => setSafetyForm((p) => ({ ...p, url: e.target.value }))}
                          className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm outline-none shadow-inner"
                          placeholder="Drive, OneDrive..."
                        />
                      </div>

                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Observações</p>
                        <textarea
                          value={safetyForm.notes}
                          onChange={(e) => setSafetyForm((p) => ({ ...p, notes: e.target.value }))}
                          className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm outline-none shadow-inner min-h-[120px]"
                          placeholder="Notas..."
                        />
                      </div>

                      <Button variant="secondary" onClick={() => saveSafetyDoc(profile.uid, profile.name)}>
                        Salvar documentação
                      </Button>
                    </div>
                  </div>
                ) : null}

                <div className="mt-14 flex flex-col sm:flex-row gap-6 px-10">
                  <Button variant="outline" className="flex-1 py-4" onClick={doLogout}>
                    Desconectar
                  </Button>
                </div>
              </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// Form auxiliar para registrar "arquivo" sem Storage
function AddAttachmentForm(props: { onSave: (name: string, url: string, notes: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Nome do arquivo</p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm outline-none shadow-inner"
          placeholder="Ex: Relatorio_Final.pdf"
        />
      </div>

      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Link externo (opcional)</p>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm outline-none shadow-inner"
          placeholder="https://..."
        />
      </div>

      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Observações (opcional)</p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm outline-none shadow-inner min-h-[100px]"
          placeholder="Notas..."
        />
      </div>

      <div className="flex justify-end">
        <button
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            await props.onSave(name, url, notes);
            setLoading(false);
            setName("");
            setUrl("");
            setNotes("");
          }}
          className="px-6 py-3 rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm uppercase tracking-widest bg-[#75AD4D] hover:bg-[#639441] text-white shadow-lg shadow-green-100"
        >
          {loading ? "..." : "Adicionar"}
        </button>
      </div>
    </div>
  );
}
