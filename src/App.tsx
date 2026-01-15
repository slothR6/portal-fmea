import React, { useEffect, useMemo, useState } from "react";
import {
  AppNotification,
  Delivery,
  Priority,
  Project,
  Status,
  UserProfile,
  UserRole,
  ViewState,
  ProviderSafetyDoc,
} from "./types";

import { auth, db } from "./firebase";
import { onSnapshot, collection, orderBy, query, where, doc, updateDoc, addDoc } from "firebase/firestore";

import { useAuth } from "./hooks/useAuth";
import { useToasts } from "./hooks/useToasts";
import Toasts from "./components/ui/Toasts";
import Sidebar from "./layout/Sidebar";

import { loginEmail, signupEmail, logout, loginGoogle, sendPasswordReset } from "./services/auth";
import {
  approveUser as approveUserSvc,
  rejectUser as rejectUserSvc,
  softDeleteUser,
  createProject,
  updateProject as updateProjectSvc,
  deleteProject as deleteProjectSvc,
  createDelivery,
  updateDelivery,
  deleteDelivery,
  addProviderSafetyDoc,
  deleteProviderSafetyDoc,
  getBaseUsersQuery,
  getBaseProjectsQuery,
  getBaseDeliveriesQuery,
  getSafetyDocsQuery,
} from "./services/portal";

import Logo from "./components/Logo";
import { usePagination } from "./hooks/usePagination";

// --------- Helpers ----------
const nowPtBr = () => new Date().toLocaleString("pt-BR");

function sanitize(s: string) {
  return (s || "").trim().replace(/\s+/g, " ");
}

function isValidDateISO(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

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
    <span className={`px-3 py-1 rounded-full text-xs font-black border uppercase tracking-wider ${getColors()}`}>
      {value}
    </span>
  );
};

const Card: React.FC<{ children: React.ReactNode; className?: string; onClick?: () => void }> = ({
  children,
  className = "",
  onClick,
}) => (
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
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "outline" | "danger";
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
}> = ({ onClick, children, variant = "primary", className = "", disabled, type = "button" }) => {
  const variants = {
    primary: "bg-[#1895BD] hover:bg-[#147a9e] text-white shadow-lg shadow-blue-100",
    secondary: "bg-[#75AD4D] hover:bg-[#639441] text-white shadow-lg shadow-green-100",
    outline: "border-2 border-[#1895BD] text-[#1895BD] hover:bg-blue-50",
    danger: "bg-red-500 hover:bg-red-600 text-white",
  };

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`px-6 py-3 rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm uppercase tracking-widest ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

const Modal: React.FC<{ open: boolean; title: string; onClose: () => void; children: React.ReactNode }> = ({
  open,
  title,
  onClose,
  children,
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[999] bg-black/40 flex items-center justify-center p-6">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-[#1895BD] text-xl font-black">{title}</h3>
          <button onClick={onClose} className="text-2xl text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
};

export default function App() {
  const { authReady, user, profile, role, view, setView } = useAuth();
  const { toasts, push, remove } = useToasts();

  // UI state
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Loading states
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);

  // login/signup fields
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [pixKey, setPixKey] = useState("");

  // Data
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  // Selected
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);

  // Providers
  const [selectedProviderUid, setSelectedProviderUid] = useState<string | null>(null);
  const [providerDocs, setProviderDocs] = useState<ProviderSafetyDoc[]>([]);

  // Modals
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [projectEditModalOpen, setProjectEditModalOpen] = useState(false);
  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false);
  const [resetPasswordModalOpen, setResetPasswordModalOpen] = useState(false);

  // forms
  const [projectForm, setProjectForm] = useState({ client: "", name: "", description: "", memberUids: [] as string[] });
  const [projectEditForm, setProjectEditForm] = useState({ id: "", client: "", name: "", description: "", memberUids: [] as string[] });

  const [deliveryForm, setDeliveryForm] = useState({
    projectId: "",
    title: "",
    deadline: "",
    priority: "MEDIA" as Priority,
    providerUid: "",
    providerName: "",
    description: "",
  });

  const [safetyDocForm, setSafetyDocForm] = useState({
    title: "",
    issuedAt: "",
    expiresAt: "",
    externalUrl: "",
    notes: "",
  });

  const userDisplayName = useMemo(() => profile?.name || "Usuário", [profile]);
  const unreadNotifCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  );

  const selectedDelivery = useMemo(
    () => deliveries.find((d) => d.id === selectedDeliveryId) || null,
    [deliveries, selectedDeliveryId]
  );

  // ---------- Live subscriptions ----------
  useEffect(() => {
    if (!user || !profile || !profile.active) return;

    setLoadingUsers(true);
    setLoadingProjects(true);
    setLoadingDeliveries(true);

    // Users
    const usersQ = getBaseUsersQuery(profile.role === "ADMIN");
    const unsubUsers = onSnapshot(
      usersQ,
      (snap) => {
        // Filtra DELETED no client-side para admin
        const arr = snap.docs
          .map((d) => d.data() as UserProfile)
          .filter((u) => u.status !== "DELETED");
        setUsersList(arr);
        setLoadingUsers(false);
      },
      (error) => {
        console.error("Error loading users:", error);
        push({ type: "error", title: "Erro ao carregar usuários", message: error.message });
        setLoadingUsers(false);
      }
    );

    // Projects
    const projectsQ = getBaseProjectsQuery(profile.role === "ADMIN", user.uid);
    const unsubProjects = onSnapshot(
      projectsQ,
      (snap) => {
        console.log("Projects loaded:", snap.size, "docs for user:", user.uid, "role:", profile.role);
        const arr = snap.docs
          .map((d) => ({ ...(d.data() as any), id: d.id } as Project))
          .filter((p) => !p.deletedAt);
        console.log("Projects after filter:", arr);
        setProjects(arr);
        setLoadingProjects(false);
      },
      (error) => {
        console.error("Error loading projects:", error);
        console.error("User uid:", user.uid, "Role:", profile.role);
        push({ type: "error", title: "Erro ao carregar projetos", message: error.message });
        setLoadingProjects(false);
      }
    );

    // Deliveries
    const deliveriesQ = getBaseDeliveriesQuery(profile.role === "ADMIN", user.uid);
    const unsubDeliveries = onSnapshot(
      deliveriesQ,
      (snap) => {
        const arr = snap.docs
          .map((d) => ({ ...(d.data() as any), id: d.id } as Delivery))
          .filter((d) => !d.deletedAt);
        setDeliveries(arr);
        setLoadingDeliveries(false);
      },
      (error) => {
        console.error("Error loading deliveries:", error);
        push({ type: "error", title: "Erro ao carregar entregas", message: error.message });
        setLoadingDeliveries(false);
      }
    );

    // Notifications
    const notifQ = query(collection(db, "notifications"), where("toUid", "==", user.uid), orderBy("createdAt", "desc"));
    const unsubNotif = onSnapshot(
      notifQ,
      (snap) => {
        const arr = snap.docs.map((d) => ({ ...(d.data() as any), id: d.id } as AppNotification));
        setNotifications(arr);
      },
      (error) => {
        console.error("Error loading notifications:", error);
        push({ type: "error", title: "Erro ao carregar notificações", message: error.message });
      }
    );

    return () => {
      unsubUsers();
      unsubProjects();
      unsubDeliveries();
      unsubNotif();
    };
  }, [user?.uid, profile?.role, profile?.active]);

  // Provider docs live
  useEffect(() => {
    if (!selectedProviderUid) {
      setProviderDocs([]);
      setSafetyDocForm({ title: "", issuedAt: "", expiresAt: "", externalUrl: "", notes: "" });
      return;
    }
    const qDocs = getSafetyDocsQuery(selectedProviderUid);
    const unsub = onSnapshot(
      qDocs,
      (snap) => {
        const arr = snap.docs.map((d) => ({ ...(d.data() as any), id: d.id } as ProviderSafetyDoc));
        setProviderDocs(arr);
      },
      (error) => {
        console.error("Error loading safety docs:", error);
        push({ type: "error", title: "Erro ao carregar registros do prestador", message: error.message });
      }
    );
    return () => unsub();
  }, [selectedProviderUid]);

  // ---------- Pagination (client-side slice) ----------
  const usersPaged = usePagination(usersList);
  const projectsPaged = usePagination(projects);
  const deliveriesPaged = usePagination(deliveries);

  // ---------- Auth actions ----------
  const doLogin = async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      await loginEmail(email, senha);
      push({ type: "success", title: "Login realizado" });
    } catch (e: any) {
      setAuthError(e?.message || "Não foi possível entrar.");
      push({ type: "error", title: "Falha no login", message: e?.message || "" });
    } finally {
      setAuthLoading(false);
    }
  };

  const doSignup = async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      await signupEmail({ name: nome, email, password: senha, pixKey });
      push({ type: "success", title: "Conta criada", message: "Aguardando aprovação do admin." });
    } catch (e: any) {
      setAuthError(e?.message || "Não foi possível criar conta.");
      push({ type: "error", title: "Falha ao criar conta", message: e?.message || "" });
    } finally {
      setAuthLoading(false);
    }
  };

  const doGoogle = async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      await loginGoogle();
      push({ type: "success", title: "Conectado com Google", message: "Se for primeiro acesso, ficará pendente." });
    } catch (e: any) {
      setAuthError(e?.message || "Não foi possível entrar com Google.");
      push({ type: "error", title: "Falha no Google", message: e?.message || "" });
    } finally {
      setAuthLoading(false);
    }
  };

  const doLogout = async () => {
    await logout();
    setEmail("");
    setSenha("");
    setNome("");
    setPixKey("");
    setSelectedDeliveryId(null);
    setSelectedProjectId(null);
    setSelectedProviderUid(null);
    setView("LOGIN");
    push({ type: "info", title: "Sessão encerrada" });
  };

  const doResetPassword = async () => {
    if (!email || !email.trim()) {
      push({ type: "error", title: "Digite seu email no campo acima" });
      return;
    }

    setAuthLoading(true);
    setAuthError(null);

    try {
      await sendPasswordReset(email);
      push({ 
        type: "success", 
        title: "Email enviado!", 
        message: "Verifique sua caixa de entrada e spam." 
      });
      setResetPasswordModalOpen(false);
    } catch (e: any) {
      setAuthError(e?.message || "Erro ao enviar email de recuperação.");
      push({ type: "error", title: "Erro", message: e?.message || "" });
    } finally {
      setAuthLoading(false);
    }
  };

  // ---------- Admin: approve/reject/delete ----------
  const approveUser = async (u: UserProfile, newRole: UserRole) => {
    try {
      await approveUserSvc(u.uid, newRole);
      push({ type: "success", title: "Usuário aprovado", message: `${u.name} -> ${newRole}` });
    } catch (e: any) {
      push({ type: "error", title: "Erro ao aprovar usuário", message: e?.message || "" });
    }
  };

  const rejectUser = async (u: UserProfile) => {
    try {
      await rejectUserSvc(u.uid);
      push({ type: "info", title: "Usuário rejeitado", message: u.name });
    } catch (e: any) {
      push({ type: "error", title: "Erro ao rejeitar usuário", message: e?.message || "" });
    }
  };

  const removeUser = async (u: UserProfile) => {
    if (!confirm(`Remover usuário "${u.name}"? (soft delete)`)) return;
    try {
      await softDeleteUser(u.uid);
      push({ type: "success", title: "Usuário removido", message: u.name });
    } catch (e: any) {
      push({ type: "error", title: "Erro ao remover usuário", message: e?.message || "" });
    }
  };

  // ---------- Project CRUD ----------
  const openCreateProject = () => {
    setProjectForm({ client: "", name: "", description: "", memberUids: [] });
    setProjectModalOpen(true);
  };

  const saveProject = async () => {
    if (!profile || profile.role !== "ADMIN") return;

    const client = sanitize(projectForm.client);
    const name = sanitize(projectForm.name);
    const description = sanitize(projectForm.description);

    if (!client || !name) {
      push({ type: "error", title: "Preencha cliente e nome do projeto" });
      return;
    }

    try {
      await createProject({
        client,
        name,
        description,
        manager: profile.name,
        managerUid: profile.uid,
        memberUids: projectForm.memberUids,
        status: "EM_ANDAMENTO",
        completionRate: 0,
        createdAt: Date.now(),
      });
      setProjectModalOpen(false);
      push({ type: "success", title: "Projeto criado" });
      setView("PROJETOS");
    } catch (e: any) {
      push({ type: "error", title: "Erro ao criar projeto", message: e?.message || "" });
    }
  };

  const openEditProject = (p: Project) => {
    setProjectEditForm({
      id: p.id,
      client: p.client,
      name: p.name,
      description: p.description || "",
      memberUids: p.memberUids || [],
    });
    setProjectEditModalOpen(true);
  };

  const saveProjectEdits = async () => {
    if (!profile || profile.role !== "ADMIN") return;

    const client = sanitize(projectEditForm.client);
    const name = sanitize(projectEditForm.name);
    const description = sanitize(projectEditForm.description);

    if (!client || !name) {
      push({ type: "error", title: "Preencha cliente e nome do projeto" });
      return;
    }

    try {
      await updateProjectSvc(projectEditForm.id, {
        client,
        name,
        description,
        memberUids: projectEditForm.memberUids,
      });
      setProjectEditModalOpen(false);
      push({ type: "success", title: "Projeto atualizado" });
    } catch (e: any) {
      push({ type: "error", title: "Erro ao atualizar projeto", message: e?.message || "" });
    }
  };

  const deleteProject = async (p: Project) => {
    if (!confirm(`Excluir o projeto "${p.name}"? Isso também removerá as entregas dele.`)) return;
    try {
      await deleteProjectSvc(p.id);
      push({ type: "success", title: "Projeto excluído" });
      setView("PROJETOS");
      if (selectedProjectId === p.id) setSelectedProjectId(null);
    } catch (e: any) {
      push({ type: "error", title: "Erro ao excluir projeto", message: e?.message || "" });
    }
  };

  // ---------- Delivery CRUD ----------
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

  const projectMembers = useMemo(() => {
    if (!deliveryForm.projectId) return [];
    const p = projects.find((x) => x.id === deliveryForm.projectId);
    const memberUids = p?.memberUids || [];
    return usersList
      .filter((u) => u.role === "PRESTADOR" && u.active && u.status === "ACTIVE")
      .filter((u) => memberUids.includes(u.uid));
  }, [deliveryForm.projectId, projects, usersList]);

  const saveDelivery = async () => {
    if (!profile || profile.role !== "ADMIN") return;

    const p = projects.find((x) => x.id === deliveryForm.projectId);
    if (!p) {
      push({ type: "error", title: "Selecione um projeto" });
      return;
    }

    const title = sanitize(deliveryForm.title);
    const deadline = deliveryForm.deadline;

    if (!title) return push({ type: "error", title: "Informe o título da entrega" });
    if (!deadline || !isValidDateISO(deadline)) return push({ type: "error", title: "Informe um prazo válido" });
    if (!deliveryForm.providerUid) return push({ type: "error", title: "Selecione um prestador" });

    try {
      await createDelivery({
        projectId: p.id,
        client: p.client,
        project: p.name,
        title,
        deadline,
        status: "PENDENTE" as Status,
        priority: deliveryForm.priority,
        providerUid: deliveryForm.providerUid,
        provider: deliveryForm.providerName || "Prestador",
        description: sanitize(deliveryForm.description),
        checklist: [],
        createdAt: Date.now(),
      });
      setDeliveryModalOpen(false);
      push({ type: "success", title: "Entrega criada" });
      setView("ENTREGAS");
    } catch (e: any) {
      push({ type: "error", title: "Erro ao criar entrega", message: e?.message || "" });
    }
  };

  const removeDelivery = async (d: Delivery) => {
    if (!confirm(`Excluir entrega "${d.title}"?`)) return;
    try {
      await deleteDelivery(d.id);
      push({ type: "success", title: "Entrega excluída" });
      if (selectedDeliveryId === d.id) setSelectedDeliveryId(null);
      setView("ENTREGAS");
    } catch (e: any) {
      push({ type: "error", title: "Erro ao excluir entrega", message: e?.message || "" });
    }
  };

  // ---------- Comments ----------
  const [commentText, setCommentText] = useState("");

  const addComment = async (deliveryId: string) => {
    if (!profile || !user) return;
    const text = sanitize(commentText);
    if (!text) return;

    try {
      const d = deliveries.find((x) => x.id === deliveryId);
      if (!d) return;

      const next = [
        ...(d.comments || []),
        {
          id: Math.random().toString(36).slice(2),
          authorUid: user.uid,
          authorName: profile.name,
          date: nowPtBr(),
          text,
          createdAt: Date.now(),
        },
      ];

      await updateDelivery(deliveryId, { comments: next as any });
      setCommentText("");
      push({ type: "success", title: "Comentário publicado" });

      if (profile.role === "PRESTADOR") {
        const admins = usersList.filter((u) => u.role === "ADMIN" && u.active && u.status === "ACTIVE");
        await Promise.all(
          admins.map((a) =>
            addDoc(collection(db, "notifications"), {
              toUid: a.uid,
              type: "COMMENT",
              title: `Novo comentário: ${d.title}`,
              projectId: d.projectId,
              deliveryId: d.id,
              createdAt: Date.now(),
              read: false,
            })
          )
        );
      }
    } catch (e: any) {
      push({ type: "error", title: "Erro ao publicar comentário", message: e?.message || "" });
    }
  };

  // ---------- Status transitions ----------
  const setDeliveryStatus = async (deliveryId: string, newStatus: Status) => {
    if (!profile || !user) return;

    const d = deliveries.find((x) => x.id === deliveryId);
    if (!d) return;

    try {
      await updateDelivery(deliveryId, { status: newStatus });
      push({ type: "success", title: "Status atualizado", message: newStatus });

      if (profile.role === "PRESTADOR" && newStatus === "REVISAO") {
        const admins = usersList.filter((u) => u.role === "ADMIN" && u.active && u.status === "ACTIVE");
        await Promise.all(
          admins.map((a) =>
            addDoc(collection(db, "notifications"), {
              toUid: a.uid,
              type: "SUBMITTED",
              title: `Entrega enviada para revisão: ${d.title}`,
              projectId: d.projectId,
              deliveryId: d.id,
              createdAt: Date.now(),
              read: false,
            })
          )
        );
      }

      if (profile.role === "ADMIN" && newStatus === "AJUSTES" && d.providerUid) {
        await addDoc(collection(db, "notifications"), {
          toUid: d.providerUid,
          type: "ADJUST_REQUESTED",
          title: `Ajustes solicitados: ${d.title}`,
          projectId: d.projectId,
          deliveryId: d.id,
          createdAt: Date.now(),
          read: false,
        });
      }

      if (profile.role === "ADMIN" && newStatus === "APROVADO" && d.providerUid) {
        await addDoc(collection(db, "notifications"), {
          toUid: d.providerUid,
          type: "APPROVED",
          title: `Entrega aprovada: ${d.title}`,
          projectId: d.projectId,
          deliveryId: d.id,
          createdAt: Date.now(),
          read: false,
        });
      }
    } catch (e: any) {
      push({ type: "error", title: "Erro ao atualizar status", message: e?.message || "" });
    }
  };

  const markAllNotificationsRead = async () => {
    if (!user) return;
    try {
      const unread = notifications.filter((n) => !n.read);
      await Promise.all(unread.map((n) => updateDoc(doc(db, "notifications", n.id), { read: true })));
      push({ type: "success", title: "Notificações marcadas como lidas" });
    } catch (e: any) {
      push({ type: "error", title: "Erro ao marcar notificações", message: e?.message || "" });
    }
  };

  // ---------- Safety docs ----------
  const openProvider = (uid: string) => {
    setSelectedProviderUid(uid);
    setSafetyDocForm({ title: "", issuedAt: "", expiresAt: "", externalUrl: "", notes: "" });
  };

  const saveSafetyDoc = async () => {
    if (!profile || !selectedProviderUid) return;
    const title = sanitize(safetyDocForm.title);
    const issuedAt = safetyDocForm.issuedAt;

    if (!title) return push({ type: "error", title: "Informe o título do registro" });
    if (!issuedAt || !isValidDateISO(issuedAt)) return push({ type: "error", title: "Informe a data de emissão válida" });
    if (safetyDocForm.expiresAt && !isValidDateISO(safetyDocForm.expiresAt)) {
      return push({ type: "error", title: "Data de validade inválida" });
    }

    try {
      await addProviderSafetyDoc(selectedProviderUid, {
        title,
        issuedAt,
        expiresAt: safetyDocForm.expiresAt || "",
        externalUrl: sanitize(safetyDocForm.externalUrl),
        notes: sanitize(safetyDocForm.notes),
        createdAt: Date.now(),
        createdByUid: profile.uid,
        createdByName: profile.name,
      });
      push({ type: "success", title: "Registro adicionado" });
      setSafetyDocForm({ title: "", issuedAt: "", expiresAt: "", externalUrl: "", notes: "" });
    } catch (e: any) {
      push({ type: "error", title: "Erro ao salvar registro", message: e?.message || "" });
    }
  };

  const removeSafetyDoc = async (docId: string) => {
    if (!selectedProviderUid) return;
    if (!confirm("Excluir este registro?")) return;
    try {
      await deleteProviderSafetyDoc(selectedProviderUid, docId);
      push({ type: "success", title: "Registro removido" });
    } catch (e: any) {
      push({ type: "error", title: "Erro ao remover registro", message: e?.message || "" });
    }
  };

  // ---------- Guards ----------
  if (!authReady) return null;

  // ---------- LOGIN ----------
  if (!user && view === "LOGIN") {
    return (
      <>
        <Toasts toasts={toasts} onClose={remove} />
        <div className="min-h-screen flex items-center justify-center bg-[#D6DCE5] p-6 relative overflow-hidden">
          <div className="absolute -top-20 -left-20 w-80 h-80 bg-[#75AD4D] opacity-10 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-[#1895BD] opacity-10 rounded-full blur-3xl"></div>

          <Card className="max-w-xl w-full py-16 px-12 z-10">
            <div className="mb-10 flex flex-col items-center text-center">
              <div className="w-24 h-24 bg-white rounded-3xl flex items-center justify-center mb-6 rotate-3 shadow-xl border border-gray-100">
                <Logo size={72} />
              </div>
              <h1 className="text-[#1895BD] uppercase tracking-tighter mb-4">Portal FMEA</h1>
              <p className="text-gray-500 max-w-md mx-auto text-lg leading-relaxed">
                Faça login para acessar. Se for primeiro acesso, ficará pendente de aprovação.
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

              <Button className="w-full" onClick={doLogin} disabled={authLoading || !email || !senha}>
                {authLoading ? "Entrando..." : "Entrar"}
              </Button>

              <Button className="w-full" variant="outline" onClick={doGoogle} disabled={authLoading}>
                Entrar com Google
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

              <button
                className="w-full text-center text-sm text-gray-500 hover:text-[#1895BD] mt-2 transition-colors"
                onClick={() => {
                  console.log("Abrindo modal de reset password");
                  setResetPasswordModalOpen(true);
                }}
              >
                Esqueci minha senha
              </button>
            </div>
          </Card>
        </div>

        {/* Modal Reset Password - FORA do Card de Login */}
        <Modal open={resetPasswordModalOpen} title="Recuperar Senha" onClose={() => setResetPasswordModalOpen(false)}>
          <div className="space-y-5">
            <p className="text-gray-600">
              Digite seu email cadastrado. Você receberá um link para criar uma nova senha.
            </p>

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">E-mail</p>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-[#1895BD] outline-none shadow-inner"
                placeholder="seu@email.com"
              />
            </div>

            {authError ? (
              <div className="bg-red-50 border border-red-100 text-red-600 rounded-2xl p-4 text-sm font-bold">
                {authError}
              </div>
            ) : null}

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setResetPasswordModalOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={doResetPassword} disabled={authLoading || !email}>
                {authLoading ? "Enviando..." : "Enviar email"}
              </Button>
            </div>
          </div>
        </Modal>
      </>
    );
  }

  // ---------- SIGNUP ----------
  if (!user && view === "SIGNUP") {
    return (
      <>
        <Toasts toasts={toasts} onClose={remove} />
        <div className="min-h-screen flex items-center justify-center bg-[#D6DCE5] p-6 relative overflow-hidden">
          <div className="absolute -top-20 -left-20 w-80 h-80 bg-[#75AD4D] opacity-10 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-[#1895BD] opacity-10 rounded-full blur-3xl"></div>

          <Card className="max-w-xl w-full py-16 px-12 z-10">
            <div className="mb-10 flex flex-col items-center text-center">
              <div className="w-24 h-24 bg-white rounded-3xl flex items-center justify-center mb-6 rotate-3 shadow-xl border border-gray-100">
                <Logo size={72} />
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

              <Button className="w-full" onClick={doSignup} disabled={authLoading || !email || !senha || !nome}>
                {authLoading ? "Criando..." : "Criar conta"}
              </Button>

              <Button className="w-full" variant="outline" onClick={doGoogle} disabled={authLoading}>
                Criar/Entrar com Google
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

        {/* Modal Reset Password */}
        <Modal open={resetPasswordModalOpen} title="Recuperar Senha" onClose={() => setResetPasswordModalOpen(false)}>
          <div className="space-y-5">
            <p className="text-gray-600">
              Digite seu email cadastrado. Você receberá um link para criar uma nova senha.
            </p>

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">E-mail</p>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-[#1895BD] outline-none shadow-inner"
                placeholder="seu@email.com"
              />
            </div>

            {authError ? (
              <div className="bg-red-50 border border-red-100 text-red-600 rounded-2xl p-4 text-sm font-bold">
                {authError}
              </div>
            ) : null}

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setResetPasswordModalOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={doResetPassword} disabled={authLoading || !email}>
                {authLoading ? "Enviando..." : "Enviar email"}
              </Button>
            </div>
          </div>
        </Modal>
      </>
    );
  }

  // ---------- PENDING ----------
  if (user && profile && (!profile.active || profile.status !== "ACTIVE")) {
    return (
      <>
        <Toasts toasts={toasts} onClose={remove} />
        <div className="min-h-screen flex items-center justify-center bg-[#D6DCE5] p-6">
          <Card className="max-w-xl w-full text-center py-16 px-12">
            <div className="mb-8">
              <div className="w-20 h-20 bg-white rounded-3xl mx-auto flex items-center justify-center mb-6 border border-gray-100 shadow-sm">
                <Logo size={56} />
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
      </>
    );
  }

  if (!user || !profile || !role) return null;

  // ---------- App shell ----------
  const onNav = (v: ViewState) => {
    setView(v);
    if (v !== "DETALHE_ENTREGA") setSelectedDeliveryId(null);
    if (v !== "DETALHE_PROJETO") setSelectedProjectId(null);
  };

  // ---------- Views ----------
  return (
    <>
      <Toasts toasts={toasts} onClose={remove} />

      <div className="flex flex-col md:flex-row min-h-screen bg-[#F8FAFC]">
        <Sidebar role={role} userName={userDisplayName} view={view} unread={unreadNotifCount} onNav={onNav} onLogout={doLogout} />

        {/* Modal Reset Password */}
        <Modal open={resetPasswordModalOpen} title="Recuperar Senha" onClose={() => setResetPasswordModalOpen(false)}>
          <div className="space-y-5">
            <p className="text-gray-600">
              Digite seu email cadastrado. Você receberá um link para criar uma nova senha.
            </p>

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">E-mail</p>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-[#1895BD] outline-none shadow-inner"
                placeholder="seu@email.com"
              />
            </div>

            {authError ? (
              <div className="bg-red-50 border border-red-100 text-red-600 rounded-2xl p-4 text-sm font-bold">
                {authError}
              </div>
            ) : null}

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setResetPasswordModalOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={doResetPassword} disabled={authLoading || !email}>
                {authLoading ? "Enviando..." : "Enviar email"}
              </Button>
            </div>
          </div>
        </Modal>

        {/* Modal Criar Projeto */}
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
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Descrição (opcional)</p>
              <textarea
                value={projectForm.description}
                onChange={(e) => setProjectForm((p) => ({ ...p, description: e.target.value }))}
                className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-[#1895BD] outline-none shadow-inner min-h-[100px]"
                placeholder="Descreva o escopo e objetivos do projeto..."
              />
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Membros do projeto</p>
              <select
                multiple
                value={projectForm.memberUids}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                  const selected = Array.from(e.currentTarget.selectedOptions).map(
                    (opt: HTMLOptionElement) => opt.value
                  );
                  setProjectForm((p) => ({ ...p, memberUids: selected }));
                }}
                className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-[#1895BD] outline-none shadow-inner min-h-[120px]"
              >
                {usersList
                  .filter((u) => u.role === "PRESTADOR" && u.active && u.status === "ACTIVE")
                  .map((u) => (
                    <option key={u.uid} value={u.uid}>
                      {u.name}
                    </option>
                  ))}
              </select>
              <p className="text-[10px] text-gray-400 mt-2">
                Dica: segure CTRL (Windows) ou CMD (Mac) para selecionar mais de um.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setProjectModalOpen(false)}>Cancelar</Button>
              <Button onClick={saveProject}>Salvar</Button>
            </div>
          </div>
        </Modal>

        {/* Modal Editar Projeto */}
        <Modal open={projectEditModalOpen} title="Editar Projeto" onClose={() => setProjectEditModalOpen(false)}>
          <div className="space-y-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Cliente</p>
              <input
                value={projectEditForm.client}
                onChange={(e) => setProjectEditForm((p) => ({ ...p, client: e.target.value }))}
                className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm outline-none shadow-inner"
              />
            </div>
            
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Projeto</p>
              <input
                value={projectEditForm.name}
                onChange={(e) => setProjectEditForm((p) => ({ ...p, name: e.target.value }))}
                className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm outline-none shadow-inner"
              />
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Descrição</p>
              <textarea
                value={projectEditForm.description}
                onChange={(e) => setProjectEditForm((p) => ({ ...p, description: e.target.value }))}
                className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm outline-none shadow-inner min-h-[100px]"
                placeholder="Descreva o escopo e objetivos do projeto..."
              />
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Membros do projeto</p>
              <select
                multiple
                value={projectEditForm.memberUids}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                  const selected = Array.from(e.currentTarget.selectedOptions).map(
                    (opt: HTMLOptionElement) => opt.value
                  );
                  setProjectEditForm((p) => ({ ...p, memberUids: selected }));
                }}
                className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm outline-none shadow-inner min-h-[120px]"
              >                 
                {usersList
                  .filter((u) => u.role === "PRESTADOR" && u.active && u.status === "ACTIVE")
                  .map((u) => (
                    <option key={u.uid} value={u.uid}>
                      {u.name}
                    </option>
                  ))}
              </select>
              <p className="text-[10px] text-gray-400 mt-2">
                Selecione os membros que você deseja manter. Desmarque para remover.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setProjectEditModalOpen(false)}>Cancelar</Button>
              <Button onClick={saveProjectEdits}>Salvar Alterações</Button>
            </div>
          </div>
        </Modal>

        <Modal open={deliveryModalOpen} title="Solicitar Entrega" onClose={() => setDeliveryModalOpen(false)}>
          <div className="space-y-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Projeto</p>
              <select
                value={deliveryForm.projectId}
                onChange={(e) => {
                  setDeliveryForm((d) => ({ ...d, projectId: e.target.value, providerUid: "", providerName: "" }));
                }}
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
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Título</p>
              <input
                value={deliveryForm.title}
                onChange={(e) => setDeliveryForm((d) => ({ ...d, title: e.target.value }))}
                className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm outline-none shadow-inner"
                placeholder="Ex: Relatório final..."
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
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
                Prestador (somente membros do projeto)
              </p>
              <select
                value={deliveryForm.providerUid}
                onChange={(e) => {
                  const uid = e.target.value;
                  const u = usersList.find((x) => x.uid === uid) || null;
                  setDeliveryForm((d) => ({ ...d, providerUid: uid, providerName: u?.name || "" }));
                }}
                className="w-full px-5 py-4 bg-white border border-gray-100 rounded-2xl text-sm outline-none shadow-inner"
                disabled={!deliveryForm.projectId}
              >
                <option value="">Selecione</option>
                {projectMembers.map((u) => (
                  <option key={u.uid} value={u.uid}>
                    {u.name}
                  </option>
                ))}
              </select>

              {!deliveryForm.projectId ? (
                <p className="text-[10px] text-gray-400 mt-2">Selecione um projeto para carregar os membros.</p>
              ) : null}
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
              <Button variant="outline" onClick={() => setDeliveryModalOpen(false)}>Cancelar</Button>
              <Button onClick={saveDelivery}>Salvar</Button>
            </div>
          </div>
        </Modal>

        {/* Main */}
        <main className="flex-1 md:ml-80 p-8 md:p-16">
          <div className="max-w-6xl mx-auto space-y-10">

            {/* DASHBOARD */}
            {view === "DASHBOARD" && (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-[#1895BD] mb-2">Resumo</h1>
                    <p className="text-gray-400">Visão geral e notificações.</p>
                  </div>
                  <div className="flex gap-3">
                    {role === "ADMIN" && (
                      <>
                        <Button variant="outline" onClick={markAllNotificationsRead} disabled={unreadNotifCount === 0}>
                          Marcar notificações como lidas
                        </Button>
                        <Button variant="secondary" onClick={() => setProjectModalOpen(true)}>
                          + Novo projeto
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <Card>
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
                      Entregas Pendentes
                    </p>
                    <p className="text-4xl font-black text-[#1895BD]">
                      {deliveries.filter(d => d.status === "PENDENTE").length}
                    </p>
                  </Card>

                  <Card>
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
                      Em Revisão
                    </p>
                    <p className="text-4xl font-black text-[#75AD4D]">
                      {deliveries.filter(d => d.status === "REVISAO").length}
                    </p>
                  </Card>

                  <Card>
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
                      Atrasadas
                    </p>
                    <p className="text-4xl font-black text-red-500">
                      {deliveries.filter(d => d.status === "ATRASADO").length}
                    </p>
                  </Card>

                  <Card>
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
                      {role === "ADMIN" ? "Usuários Pendentes" : "Projetos Ativos"}
                    </p>
                    <p className="text-4xl font-black text-orange-500">
                      {role === "ADMIN" 
                        ? usersList.filter(u => u.status === "PENDING").length
                        : projects.length}
                    </p>
                  </Card>
                </div>

                <Card>
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-2xl text-gray-800">Notificações</h3>
                  </div>

                  <div className="space-y-3">
                    {notifications.slice(0, 15).map((n) => (
                      <div key={n.id} className="p-4 rounded-2xl border border-gray-100 flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black ${n.read ? "bg-gray-100 text-gray-500" : "bg-blue-50 text-[#1895BD]"}`}>
                          {n.type === "COMMENT" ? "💬" : n.type === "SUBMITTED" ? "📤" : n.type === "APPROVED" ? "✅" : "🛠️"}
                        </div>
                        <div className="flex-1">
                          <p className={`font-black ${n.read ? "text-gray-600" : "text-gray-800"}`}>{n.title}</p>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                            {new Date(n.createdAt).toLocaleString("pt-BR")}
                          </p>
                        </div>
                      </div>
                    ))}
                    {notifications.length === 0 ? <div className="py-10 text-center text-gray-300">Sem notificações.</div> : null}
                  </div>
                </Card>
              </>
            )}

            {/* USUARIOS */}
            {view === "USUARIOS" && role === "ADMIN" && (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-[#1895BD]">Usuários</h1>
                    <p className="text-gray-400">Aprovação e gestão.</p>
                  </div>
                </div>

                <Card>
                  <h3 className="text-2xl mb-6 text-gray-800">Pendentes</h3>
                  <div className="space-y-4">
                    {usersPaged.sliced.filter((u) => u.status === "PENDING").map((u) => (
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
                          <Button variant="outline" onClick={() => removeUser(u)}>Remover</Button>
                        </div>
                      </div>
                    ))}
                    {usersList.filter((u) => u.status === "PENDING").length === 0 ? (
                      <div className="py-10 text-center text-gray-300">Sem usuários pendentes.</div>
                    ) : null}

                    {usersPaged.canLoadMore ? (
                      <div className="pt-4 flex justify-center">
                        <Button variant="outline" onClick={usersPaged.loadMore}>Carregar mais</Button>
                      </div>
                    ) : null}
                  </div>
                </Card>

                <Card className="mt-8">
                  <h3 className="text-2xl mb-6 text-gray-800">Ativos</h3>
                  <div className="space-y-3">
                    {usersList.filter((u) => u.status === "ACTIVE").slice(0, 50).map((u) => (
                      <div key={u.uid} className="p-4 border border-gray-100 rounded-2xl flex items-center justify-between">
                        <div>
                          <p className="font-black text-gray-800">{u.name}</p>
                          <p className="text-sm text-gray-500">{u.email}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-black uppercase tracking-widest text-gray-400">{u.role}</span>
                          <Button variant="outline" onClick={() => removeUser(u)}>Remover</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </>
            )}

            {/* PRESTADORES */}
            {view === "PRESTADORES" && role === "ADMIN" && (
              <>
                <div>
                  <h1 className="text-[#1895BD]">Prestadores</h1>
                  <p className="text-gray-400">Cadastro e documentação de segurança (sem upload por enquanto).</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <Card className="lg:col-span-1">
                    <h3 className="text-xl mb-4">Lista</h3>
                    <div className="space-y-2 max-h-[520px] overflow-auto pr-2">
                      {usersList
                        .filter((u) => u.role === "PRESTADOR" && u.status === "ACTIVE")
                        .map((u) => (
                          <button
                            key={u.uid}
                            onClick={() => openProvider(u.uid)}
                            className={`w-full text-left p-4 rounded-2xl border transition ${
                              selectedProviderUid === u.uid ? "border-[#1895BD] bg-blue-50" : "border-gray-100 hover:bg-gray-50"
                            }`}
                          >
                            <p className="font-black text-gray-800">{u.name}</p>
                            <p className="text-xs text-gray-500">{u.email}</p>
                          </button>
                        ))}
                      {usersList.filter((u) => u.role === "PRESTADOR" && u.status === "ACTIVE").length === 0 ? (
                        <div className="py-10 text-center text-gray-300">Sem prestadores ativos.</div>
                      ) : null}
                    </div>
                  </Card>

                  <Card className="lg:col-span-2">
                    {!selectedProviderUid ? (
                      <div className="py-16 text-center text-gray-300">Selecione um prestador para ver os registros.</div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-6">
                          <div>
                            <h3 className="text-2xl text-gray-800">Registros</h3>
                            <p className="text-gray-500 text-sm">
                              Adicione registros como NR-10, NR-33, NR-35, ASO etc. Por enquanto, use link externo.
                            </p>
                          </div>
                        </div>

                        <div className="mt-6 p-6 border border-gray-100 rounded-2xl">
                          <h4 className="font-black text-gray-700 mb-4">Adicionar registro</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <input
                              value={safetyDocForm.title}
                              onChange={(e) => setSafetyDocForm((s) => ({ ...s, title: e.target.value }))}
                              className="px-4 py-3 border border-gray-100 rounded-xl"
                              placeholder="Título (ex: NR-35)"
                            />
                            <input
                              type="date"
                              value={safetyDocForm.issuedAt}
                              onChange={(e) => setSafetyDocForm((s) => ({ ...s, issuedAt: e.target.value }))}
                              className="px-4 py-3 border border-gray-100 rounded-xl"
                              placeholder="Emissão"
                            />
                            <input
                              type="date"
                              value={safetyDocForm.expiresAt}
                              onChange={(e) => setSafetyDocForm((s) => ({ ...s, expiresAt: e.target.value }))}
                              className="px-4 py-3 border border-gray-100 rounded-xl"
                              placeholder="Validade (opcional)"
                            />
                            <input
                              value={safetyDocForm.externalUrl}
                              onChange={(e) => setSafetyDocForm((s) => ({ ...s, externalUrl: e.target.value }))}
                              className="px-4 py-3 border border-gray-100 rounded-xl"
                              placeholder="Link externo (Drive/OneDrive)"
                            />
                            <textarea
                              value={safetyDocForm.notes}
                              onChange={(e) => setSafetyDocForm((s) => ({ ...s, notes: e.target.value }))}
                              className="px-4 py-3 border border-gray-100 rounded-xl md:col-span-2"
                              placeholder="Observações (opcional)"
                            />
                          </div>

                          <div className="mt-4 flex justify-end">
                            <Button onClick={saveSafetyDoc}>Salvar registro</Button>
                          </div>
                        </div>

                        <div className="mt-8 space-y-3">
                          {providerDocs.map((d) => (
                            <div key={d.id} className="p-5 border border-gray-100 rounded-2xl flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <p className="font-black text-gray-800">{d.title}</p>
                                <p className="text-sm text-gray-600">Emissão: {d.issuedAt}</p>
                                {d.expiresAt ? <p className="text-sm text-gray-600">Validade: {d.expiresAt}</p> : null}
                                {d.externalUrl ? (
                                  <a className="text-sm text-[#1895BD] font-black hover:underline" href={d.externalUrl} target="_blank" rel="noreferrer">
                                    Abrir link
                                  </a>
                                ) : null}
                                {d.notes ? <p className="text-sm text-gray-500 mt-2">{d.notes}</p> : null}
                              </div>
                              <div className="flex gap-2">
                                <Button variant="outline" onClick={() => removeSafetyDoc(d.id)}>Excluir</Button>
                              </div>
                            </div>
                          ))}
                          {providerDocs.length === 0 ? (
                            <div className="py-10 text-center text-gray-300">Nenhum registro ainda.</div>
                          ) : null}
                        </div>
                      </>
                    )}
                  </Card>
                </div>
              </>
            )}

            {/* PROJETOS */}
            {view === "PROJETOS" && (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-[#1895BD]">Projetos</h1>
                    <p className="text-gray-400">Cadastro e acompanhamento.</p>
                  </div>
                  {role === "ADMIN" ? <Button variant="secondary" onClick={openCreateProject}>+ Novo Projeto</Button> : null}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                  {projectsPaged.sliced.map((p) => (
                    <Card key={p.id} onClick={() => { setSelectedProjectId(p.id); setView("DETALHE_PROJETO"); }}>
                      <div className="flex justify-between items-start mb-8">
                        <p className="text-[10px] font-black uppercase tracking-[3px] text-gray-300">{p.client}</p>
                        <span className="px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest bg-blue-50 text-[#1895BD]">
                          {p.status.replace("_", " ")}
                        </span>
                      </div>
                      <h3 className="text-2xl text-[#1895BD] mb-8 min-h-[4rem]">{p.name}</h3>

                      <div className="flex justify-between items-center pt-6 border-t border-gray-50">
                        <p className="text-xs font-bold text-gray-500">Gestor: <span className="text-gray-800">{p.manager}</span></p>
                        {role === "ADMIN" ? (
                          <div className="flex gap-2">
                            <Button variant="outline" onClick={(e) => { e.stopPropagation(); openEditProject(p); }}>Editar</Button>
                            <Button variant="danger" onClick={(e) => { e.stopPropagation(); deleteProject(p); }}>Excluir</Button>
                          </div>
                        ) : null}
                      </div>
                    </Card>
                  ))}
                </div>

                {projectsPaged.canLoadMore ? (
                  <div className="flex justify-center pt-4">
                    <Button variant="outline" onClick={projectsPaged.loadMore}>Carregar mais</Button>
                  </div>
                ) : null}
              </>
            )}

            {/* DETALHE PROJETO */}
            {view === "DETALHE_PROJETO" && selectedProject && (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    <button
                      onClick={() => setView("PROJETOS")}
                      className="text-[#1895BD] hover:underline font-black uppercase text-xs tracking-widest"
                    >
                      ← Projetos
                    </button>
                    <h1 className="text-[#1895BD]">{selectedProject.name}</h1>
                  </div>

                  {role === "ADMIN" ? (
                    <div className="flex gap-3">
                      <Button variant="outline" onClick={() => openEditProject(selectedProject)}>Editar projeto</Button>
                      <Button variant="secondary" onClick={() => openCreateDelivery(selectedProject.id)}>+ Solicitar entrega</Button>
                    </div>
                  ) : null}
                </div>

                {/* Descrição do Projeto */}
                {selectedProject.description && (
                  <Card>
                    <h3 className="text-xl mb-3">Descrição do Projeto</h3>
                    <p className="text-gray-700 whitespace-pre-wrap">{selectedProject.description}</p>
                  </Card>
                )}

                {/* Informações do Projeto */}
                <Card>
                  <h3 className="text-xl mb-4">Informações</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Cliente</p>
                      <p className="font-bold text-gray-800">{selectedProject.client}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Gestor</p>
                      <p className="font-bold text-gray-800">{selectedProject.manager}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Status</p>
                      <p className="font-bold text-gray-800">{selectedProject.status.replace("_", " ")}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Membros</p>
                      <p className="font-bold text-gray-800">{selectedProject.memberUids.length} prestador(es)</p>
                    </div>
                  </div>
                </Card>

                <Card>
                  <h3 className="text-xl mb-4">Entregas do projeto</h3>
                  <div className="space-y-3">
                    {deliveries
                      .filter((d) => d.projectId === selectedProject.id)
                      .map((d) => (
                        <div
                          key={d.id}
                          onClick={() => { setSelectedDeliveryId(d.id); setView("DETALHE_ENTREGA"); }}
                          className="p-5 border border-gray-100 rounded-2xl hover:bg-gray-50 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4"
                        >
                          <div>
                            <p className="font-black text-gray-800">{d.title}</p>
                            <p className="text-xs text-gray-500">Prestador: {d.provider}</p>
                            <p className="text-xs text-gray-500">Prazo: {d.deadline}</p>
                          </div>
                          <div className="flex gap-3 items-center">
                            <Badge type="priority" value={d.priority} />
                            <Badge type="status" value={d.status} />
                            {role === "ADMIN" ? (
                              <Button variant="danger" onClick={(e) => { e.stopPropagation(); removeDelivery(d); }}>
                                Excluir
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    {deliveries.filter((d) => d.projectId === selectedProject.id).length === 0 ? (
                      <div className="py-10 text-center text-gray-300">Nenhuma entrega ainda.</div>
                    ) : null}
                  </div>
                </Card>
              </>
            )}

            {/* ENTREGAS */}
            {view === "ENTREGAS" && (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-[#1895BD]">{role === "ADMIN" ? "Entregas" : "Minhas Entregas"}</h1>
                    <p className="text-gray-400">Controle de execução e revisão.</p>
                  </div>
                  {role === "ADMIN" ? <Button variant="secondary" onClick={() => openCreateDelivery()}>+ Solicitar entrega</Button> : null}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                  {deliveriesPaged.sliced.map((d) => (
                    <Card key={d.id} onClick={() => { setSelectedDeliveryId(d.id); setView("DETALHE_ENTREGA"); }}>
                      <div className="flex justify-between items-start mb-6">
                        <p className="text-[10px] font-black uppercase tracking-[2px] text-gray-300 truncate max-w-[160px]">{d.client}</p>
                        <Badge type="priority" value={d.priority} />
                      </div>
                      <h3 className="text-xl text-gray-800 mb-2 leading-tight min-h-[3rem]">{d.title}</h3>
                      <p className="text-xs font-black text-[#1895BD] uppercase tracking-widest mb-8">{d.project}</p>

                      <div className="flex items-center justify-between pt-6 border-t border-gray-50">
                        <div>
                          <p className="text-[9px] uppercase font-black text-gray-300 tracking-widest mb-1">Prazo</p>
                          <p className="text-sm font-black text-gray-600">{d.deadline}</p>
                        </div>
                        <Badge type="status" value={d.status} />
                      </div>

                      {role === "ADMIN" ? (
                        <div className="pt-4">
                          <Button variant="danger" className="w-full" onClick={(e) => { e.stopPropagation(); removeDelivery(d); }}>
                            Excluir
                          </Button>
                        </div>
                      ) : null}
                    </Card>
                  ))}
                </div>

                {deliveriesPaged.canLoadMore ? (
                  <div className="flex justify-center pt-4">
                    <Button variant="outline" onClick={deliveriesPaged.loadMore}>Carregar mais</Button>
                  </div>
                ) : null}
              </>
            )}

            {/* DETALHE ENTREGA */}
            {view === "DETALHE_ENTREGA" && selectedDelivery && (
              <>
                <div className="flex items-center justify-between gap-6">
                  <div className="flex items-center gap-6">
                    <button
                      onClick={() => setView("ENTREGAS")}
                      className="text-[#1895BD] hover:underline font-black uppercase text-xs tracking-widest"
                    >
                      ← Voltar
                    </button>
                    <div>
                      <h1 className="text-[#1895BD] mb-1">{selectedDelivery.title}</h1>
                      <p className="text-gray-400 font-bold uppercase text-xs tracking-[4px]">{selectedDelivery.project}</p>
                    </div>
                  </div>

                  <div className="flex gap-3 flex-wrap">
                    {role === "PRESTADOR" && selectedDelivery.status !== "APROVADO" ? (
                      <Button variant="secondary" onClick={() => setDeliveryStatus(selectedDelivery.id, "REVISAO")}>
                        Enviar para revisão
                      </Button>
                    ) : null}

                    {role === "ADMIN" && selectedDelivery.status === "REVISAO" ? (
                      <>
                        <Button variant="primary" onClick={() => setDeliveryStatus(selectedDelivery.id, "APROVADO")}>
                          Aprovar
                        </Button>
                        <Button variant="outline" onClick={() => setDeliveryStatus(selectedDelivery.id, "AJUSTES")}>
                          Pedir ajustes
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                  <div className="lg:col-span-2 space-y-8">
                    <Card>
                      <h3 className="text-xl mb-3">Escopo</h3>
                      <p className="text-gray-700">{selectedDelivery.description || "Sem descrição."}</p>
                    </Card>

                    <Card>
                      <h3 className="text-xl mb-4">Comentários</h3>

                      <div className="space-y-4">
                        {(selectedDelivery.comments || []).map((c) => (
                          <div key={c.id} className="p-4 rounded-2xl bg-gray-50 border border-gray-100">
                            <div className="flex justify-between items-center mb-1">
                              <p className="text-xs font-black text-[#1895BD] uppercase tracking-widest">{c.authorName}</p>
                              <p className="text-[10px] font-black text-gray-300">{c.date}</p>
                            </div>
                            <p className="text-gray-700">{c.text}</p>
                          </div>
                        ))}

                        {(selectedDelivery.comments || []).length === 0 ? (
                          <div className="py-8 text-center text-gray-300">Nenhum comentário ainda.</div>
                        ) : null}
                      </div>

                      <div className="pt-4">
                        <textarea
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                          placeholder="Adicionar comentário..."
                          className="w-full bg-white border-2 border-gray-100 rounded-2xl p-4 min-h-[120px] outline-none focus:border-[#1895BD]"
                        />
                        <div className="flex justify-end mt-3">
                          <Button onClick={() => addComment(selectedDelivery.id)}>Publicar</Button>
                        </div>
                      </div>
                    </Card>
                  </div>

                  <div className="space-y-8">
                    <Card className="bg-[#1895BD] text-white border-0">
                      <h3 className="text-xl mb-6">Gestão</h3>
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-black uppercase tracking-widest opacity-70">Status</span>
                          <Badge type="status" value={selectedDelivery.status} />
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-black uppercase tracking-widest opacity-70">Prioridade</span>
                          <Badge type="priority" value={selectedDelivery.priority} />
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-black uppercase tracking-widest opacity-70">Prestador</span>
                          <span className="text-sm font-black">{selectedDelivery.provider}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-black uppercase tracking-widest opacity-70">Prazo</span>
                          <span className="text-sm font-black">{selectedDelivery.deadline}</span>
                        </div>
                      </div>
                    </Card>

                    {role === "ADMIN" ? (
                      <Card>
                        <h3 className="text-xl mb-4">Ações</h3>
                        <Button variant="danger" className="w-full" onClick={() => removeDelivery(selectedDelivery)}>
                          Excluir entrega
                        </Button>
                      </Card>
                    ) : null}

                    <Card>
                      <h3 className="text-xl mb-2">Arquivos</h3>
                      <p className="text-sm text-gray-500">
                        Upload desativado no MVP (Storage pago). Por enquanto, use links nos comentários.
                      </p>
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
                  <div className="w-24 h-24 bg-white rounded-3xl mx-auto flex items-center justify-center mb-6 border border-gray-100 shadow-sm">
                    <Logo size={72} />
                  </div>

                  <h2 className="text-2xl text-gray-800 mb-2">{profile.name}</h2>
                  <p className="text-gray-500">{profile.email}</p>

                  <p className="text-[#75AD4D] font-black uppercase tracking-[5px] text-xs mt-6 mb-10">
                    {profile.role}
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10 text-left px-10">
                    <div>
                      <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1">
                        Chave Pix
                      </p>
                      <p className="font-bold text-gray-700">{profile.pixKey || "Não informado"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1">
                        UID
                      </p>
                      <p className="font-bold text-gray-700 break-all">{profile.uid}</p>
                    </div>
                  </div>

                  <div className="mt-12">
                    <Button variant="outline" onClick={doLogout}>
                      Desconectar
                    </Button>
                  </div>

                  <p className="text-xs text-gray-400 mt-6">
                    Foto: para MVP, estamos usando apenas Google photoURL quando entrar com Google. (Depois adicionamos upload).
                  </p>
                </Card>
              </div>
            )}
          </div>
        </main>
      </div>
    </>
  );
}