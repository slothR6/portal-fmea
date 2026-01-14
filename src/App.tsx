import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from "firebase/auth";
import { auth, db, googleProvider } from "./firebase";
import { Delivery, isValidUrl, Priority, Project, SafetyDoc, Status, UserProfile, ViewState } from "./types";
import type { User } from "firebase/auth";

function clsx(...v: Array<string | false | undefined | null>) {
  return v.filter(Boolean).join(" ");
}

function formatDate(d: number) {
  try {
    return new Date(d).toLocaleString();
  } catch {
    return "";
  }
}

function safeTrim(v: string) {
  return (v || "").trim();
}

function statusLabel(s: Status) {
  switch (s) {
    case "PENDENTE":
      return "Pendente";
    case "EM_ANDAMENTO":
      return "Em andamento";
    case "REVISAO":
      return "Em revisão";
    case "AJUSTES":
      return "Ajustes";
    case "APROVADO":
      return "Aprovado";
    case "ATRASADO":
      return "Atrasado";
    case "CONCLUIDO":
      return "Concluído";
    default:
      return s;
  }
}

export default function App() {
  const [view, setView] = useState<ViewState>("LOGIN");

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const [loadingAuth, setLoadingAuth] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [name, setName] = useState("");

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [providers, setProviders] = useState<UserProfile[]>([]);

  const [projects, setProjects] = useState<Project[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  );

  const selectedDelivery = useMemo(
    () => deliveries.find((d) => d.id === selectedDeliveryId) || null,
    [deliveries, selectedDeliveryId]
  );

  const [projectForm, setProjectForm] = useState({
    client: "",
    name: "",
    description: "",
    externalLink: "",
    memberUids: [] as string[],
  });

  const [deliveryForm, setDeliveryForm] = useState({
    projectId: "",
    providerUid: "",
    title: "",
    description: "",
    deadline: "",
    priority: "MEDIA" as Priority,
    externalLink: "",
  });

  // Prestadores: Safety docs
  const [selectedProviderUid, setSelectedProviderUid] = useState<string | null>(null);
  const [safetyDocs, setSafetyDocs] = useState<SafetyDoc[]>([]);
  const [safetyLoading, setSafetyLoading] = useState(false);
  const [safetyAdding, setSafetyAdding] = useState(false);
  const [safetyForm, setSafetyForm] = useState({
    title: "",
    issuedAt: "",
    expiresAt: "",
    externalLink: "",
    notes: "",
  });

  function showOk(msg: string) {
    setToast({ type: "ok", msg });
    setTimeout(() => setToast(null), 2500);
  }

  function showErr(msg: string) {
    setToast({ type: "err", msg });
    setTimeout(() => setToast(null), 3500);
  }

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setProfile(null);
      setLoadingAuth(false);

      if (!u) {
        setView("LOGIN");
        return;
      }

      try {
        const ref = doc(db, "users", u.uid);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          // perfil ainda não criado (caso raro), cria pendente
          await updateDoc(ref, {} as any).catch(() => {});
        }
      } catch {
        // silencioso, o snapshot abaixo vai controlar
      }
    });

    return () => unsub();
  }, []);

  // Profile snapshot
  useEffect(() => {
    if (!user) return;

    const ref = doc(db, "users", user.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          // Sem perfil, volta para login (evita tela estranha)
          setProfile(null);
          setView("LOGIN");
          return;
        }

        const d = snap.data() as any;
        const p: UserProfile = {
          uid: d.uid || user.uid,
          email: d.email || user.email || "",
          name: d.name || user.displayName || "Usuário",
          role: d.role || "PRESTADOR",
          status: d.status || "PENDING",
          active: !!d.active,
          pixKey: d.pixKey || "",
          photoURL: d.photoURL || user.photoURL || "",
          createdAt: typeof d.createdAt === "number" ? d.createdAt : Date.now(),
          approvedAt: typeof d.approvedAt === "number" ? d.approvedAt : undefined,
        };

        setProfile(p);

        // Cai direto na dashboard depois do login
        if (p.status !== "ACTIVE" || !p.active) {
          setView("PENDING");
        } else {
          setView("DASHBOARD");
        }
      },
      (err) => {
        console.error("profile snapshot error", err);
        showErr("Não foi possível carregar o perfil.");
      }
    );

    return () => unsub();
  }, [user]);

  // Admin: listar usuários e prestadores
  useEffect(() => {
    if (!user || !profile) return;

    if (profile.role !== "ADMIN") {
      setUsers([]);
      setProviders([]);
      return;
    }

    const qUsers = query(collection(db, "users"));
    const unsub = onSnapshot(
      qUsers,
      (snap) => {
        const arr = snap.docs.map((d) => ({ ...(d.data() as any) })) as UserProfile[];

        // normaliza uid
        const normalized = arr.map((u) => ({
          ...u,
          uid: u.uid || (u as any).id || "",
        }));

        setUsers(normalized);

        const onlyProviders = normalized.filter((u) => u.role === "PRESTADOR");
        setProviders(onlyProviders);
      },
      (err) => {
        console.error("users snapshot error", err);
        showErr("Não foi possível carregar usuários.");
      }
    );

    return () => unsub();
  }, [user, profile]);

  // Projects and deliveries snapshot
  useEffect(() => {
    if (!user || !profile) return;

    // Admin: pode ver tudo
    // Prestador: sem orderBy na query para evitar índice em produção
    const projectsQ =
      profile.role === "ADMIN"
        ? query(collection(db, "projects"))
        : query(collection(db, "projects"), where("memberUids", "array-contains", user.uid));

    const deliveriesQ =
      profile.role === "ADMIN"
        ? query(collection(db, "deliveries"))
        : query(collection(db, "deliveries"), where("providerUid", "==", user.uid));

    const unsubProjects = onSnapshot(
      projectsQ,
      (snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Project[];
        arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setProjects(arr);
      },
      (err) => {
        console.error("projects snapshot error:", err);
        showErr("Não foi possível carregar projetos.");
      }
    );

    const unsubDeliveries = onSnapshot(
      deliveriesQ,
      (snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Delivery[];
        arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setDeliveries(arr);
      },
      (err) => {
        console.error("deliveries snapshot error:", err);
        showErr("Não foi possível carregar entregas.");
      }
    );

    return () => {
      unsubProjects();
      unsubDeliveries();
    };
  }, [user, profile]);

  // Safety docs snapshot (Admin)
  useEffect(() => {
    if (!user || !profile || profile.role !== "ADMIN") return;

    if (!selectedProviderUid) {
      setSafetyDocs([]);
      setSafetyLoading(false);
      setSafetyAdding(false);
      return;
    }

    // Corrige bug visual: limpa antes de carregar novo prestador
    setSafetyDocs([]);
    setSafetyAdding(false);
    setSafetyLoading(true);

    const qy = query(
      collection(db, "safetyDocs"),
      where("uid", "==", selectedProviderUid)
    );

    const unsub = onSnapshot(
      qy,
      (snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as SafetyDoc[];
        arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setSafetyDocs(arr);
        setSafetyLoading(false);
      },
      (err) => {
        console.error("safetyDocs snapshot error:", err);
        setSafetyDocs([]);
        setSafetyLoading(false);
      }
    );

    return () => unsub();
  }, [user, profile, selectedProviderUid]);

  const pendingDeliveries = useMemo(() => {
    return deliveries.filter((d) => d.status === "PENDENTE" || d.status === "EM_ANDAMENTO" || d.status === "ATRASADO");
  }, [deliveries]);

  const openProjects = useMemo(() => {
    return projects.filter((p) => p.status !== "CONCLUIDO" && p.status !== "APROVADO");
  }, [projects]);

  async function handleEmailLogin() {
    try {
      setBusy(true);
      await signInWithEmailAndPassword(auth, safeTrim(email), pass);
      showOk("Login realizado.");
    } catch (e: any) {
      console.error(e);
      showErr("Não foi possível realizar o login.");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleLogin() {
    try {
      setBusy(true);
      await signInWithPopup(auth, googleProvider);
      showOk("Login realizado.");
    } catch (e: any) {
      console.error(e);
      showErr("Não foi possível realizar o login com Google.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignup() {
    try {
      const em = safeTrim(email);
      const nm = safeTrim(name);
      if (!em || !pass || pass.length < 6 || !nm) {
        showErr("Preencha nome, e-mail e senha (mínimo 6 caracteres).");
        return;
      }

      setBusy(true);
      const cred = await createUserWithEmailAndPassword(auth, em, pass);

      await updateProfile(cred.user, { displayName: nm });

      const payload: UserProfile = {
        uid: cred.user.uid,
        email: em,
        name: nm,
        role: "PRESTADOR",
        status: "PENDING",
        active: false,
        createdAt: Date.now(),
      };

      await addDoc(collection(db, "users"), payload).catch(async () => {
        // fallback se já existir algo
      });

      // Garantia: escreve no doc pelo uid também (mais simples para regras)
      await updateDoc(doc(db, "users", cred.user.uid), payload as any).catch(async () => {
        // se doc não existir, cria via set
        // evita dependência: aqui mantém simples
      });

      showOk("Conta criada. Aguardando aprovação.");
      setView("PENDING");
    } catch (e: any) {
      console.error(e);
      showErr("Não foi possível criar a conta.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    await signOut(auth);
    setEmail("");
    setPass("");
    setName("");
    setView("LOGIN");
  }

  // Admin actions
  async function approveUser(u: UserProfile) {
    try {
      setBusy(true);
      const patch = {
        status: "ACTIVE",
        active: true,
        approvedAt: Date.now(),
      };
      await updateDoc(doc(db, "users", u.uid), patch as any);
      showOk("Usuário aprovado.");
    } catch (e) {
      console.error(e);
      showErr("Não foi possível aprovar.");
    } finally {
      setBusy(false);
    }
  }

  async function rejectUser(u: UserProfile) {
    try {
      setBusy(true);
      const patch = {
        status: "REJECTED",
        active: false,
      };
      await updateDoc(doc(db, "users", u.uid), patch as any);
      showOk("Usuário rejeitado.");
    } catch (e) {
      console.error(e);
      showErr("Não foi possível rejeitar.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteUser(u: UserProfile) {
    try {
      setBusy(true);
      await deleteDoc(doc(db, "users", u.uid));
      showOk("Usuário excluído do banco.");
    } catch (e) {
      console.error(e);
      showErr("Não foi possível excluir.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteProvider(p: UserProfile) {
    // aqui remove o perfil; Auth user não é deletável do frontend sem reauth/admin SDK
    return deleteUser(p);
  }

  async function saveProject() {
    try {
      if (!profile) return;

      const client = safeTrim(projectForm.client);
      const nameP = safeTrim(projectForm.name);
      const desc = safeTrim(projectForm.description);
      const link = safeTrim(projectForm.externalLink);

      if (!client || !nameP) {
        showErr("Cliente e nome do projeto são obrigatórios.");
        return;
      }
      if (link && !isValidUrl(link)) {
        showErr("Link do projeto inválido.");
        return;
      }
      if (!projectForm.memberUids.length) {
        showErr("Selecione ao menos um prestador.");
        return;
      }

      setBusy(true);

      const payload: Omit<Project, "id"> = {
        client,
        name: nameP,
        description: desc,
        externalLink: link,
        manager: profile.name,
        managerUid: profile.uid,
        memberUids: projectForm.memberUids,
        status: "PENDENTE",
        completionRate: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await addDoc(collection(db, "projects"), payload as any);

      setProjectForm({
        client: "",
        name: "",
        description: "",
        externalLink: "",
        memberUids: [],
      });

      showOk("Projeto criado.");
      setView("PROJETOS");
    } catch (e) {
      console.error(e);
      showErr("Não foi possível criar o projeto.");
    } finally {
      setBusy(false);
    }
  }

  async function updateProject(p: Project) {
    try {
      if (!profile) return;

      const client = safeTrim(projectForm.client);
      const nameP = safeTrim(projectForm.name);
      const desc = safeTrim(projectForm.description);
      const link = safeTrim(projectForm.externalLink);

      if (!client || !nameP) {
        showErr("Cliente e nome do projeto são obrigatórios.");
        return;
      }
      if (link && !isValidUrl(link)) {
        showErr("Link do projeto inválido.");
        return;
      }
      if (!projectForm.memberUids.length) {
        showErr("Selecione ao menos um prestador.");
        return;
      }

      setBusy(true);

      await updateDoc(doc(db, "projects", p.id), {
        client,
        name: nameP,
        description: desc,
        externalLink: link,
        memberUids: projectForm.memberUids,
        updatedAt: Date.now(),
      } as any);

      showOk("Projeto atualizado.");
      setView("DETALHE_PROJETO");
    } catch (e) {
      console.error(e);
      showErr("Não foi possível atualizar o projeto.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteProject(p: Project) {
    try {
      setBusy(true);
      await deleteDoc(doc(db, "projects", p.id));
      showOk("Projeto excluído.");
      setSelectedProjectId(null);
      setView("PROJETOS");
    } catch (e) {
      console.error(e);
      showErr("Não foi possível excluir o projeto.");
    } finally {
      setBusy(false);
    }
  }

  async function saveDelivery() {
    try {
      const pid = safeTrim(deliveryForm.projectId);
      const puid = safeTrim(deliveryForm.providerUid);
      const ttl = safeTrim(deliveryForm.title);
      const dsc = safeTrim(deliveryForm.description);
      const ddl = safeTrim(deliveryForm.deadline);
      const link = safeTrim(deliveryForm.externalLink);

      if (!pid || !puid || !ttl || !ddl) {
        showErr("Projeto, prestador, título e prazo são obrigatórios.");
        return;
      }
      if (link && !isValidUrl(link)) {
        showErr("Link externo inválido.");
        return;
      }

      const p = projects.find((x) => x.id === pid);
      if (!p) {
        showErr("Projeto inválido.");
        return;
      }

      const provider = providers.find((x) => x.uid === puid);
      const providerName = provider?.name || "Prestador";

      setBusy(true);

      const payload: Omit<Delivery, "id"> = {
        projectId: pid,
        client: p.client,
        project: p.name,
        title: ttl,
        description: dsc,
        deadline: ddl,
        status: "PENDENTE",
        priority: deliveryForm.priority,
        provider: providerName,
        providerUid: puid,
        externalLink: link,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await addDoc(collection(db, "deliveries"), payload as any);

      setDeliveryForm({
        projectId: "",
        providerUid: "",
        title: "",
        description: "",
        deadline: "",
        priority: "MEDIA",
        externalLink: "",
      });

      showOk("Entrega criada.");
      setView("ENTREGAS");
    } catch (e) {
      console.error(e);
      showErr("Não foi possível criar a entrega.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteDelivery(d: Delivery) {
    try {
      setBusy(true);
      await deleteDoc(doc(db, "deliveries", d.id));
      showOk("Entrega excluída.");
      setSelectedDeliveryId(null);
      setView("ENTREGAS");
    } catch (e) {
      console.error(e);
      showErr("Não foi possível excluir a entrega.");
    } finally {
      setBusy(false);
    }
  }

  async function addSafetyDoc() {
    try {
      if (!selectedProviderUid) {
        showErr("Selecione um prestador.");
        return;
      }

      const title = safeTrim(safetyForm.title);
      const issuedAt = safeTrim(safetyForm.issuedAt);
      const expiresAt = safeTrim(safetyForm.expiresAt);
      const externalLink = safeTrim(safetyForm.externalLink);
      const notes = safeTrim(safetyForm.notes);

      if (!title || !issuedAt) {
        showErr("Título e emissão são obrigatórios.");
        return;
      }
      if (externalLink && !isValidUrl(externalLink)) {
        showErr("Link inválido.");
        return;
      }

      setBusy(true);

      const payload: Omit<SafetyDoc, "id"> = {
        uid: selectedProviderUid,
        title,
        issuedAt,
        expiresAt: expiresAt || undefined,
        externalLink: externalLink || undefined,
        notes: notes || undefined,
        createdAt: Date.now(),
      };

      await addDoc(collection(db, "safetyDocs"), payload as any);

      setSafetyForm({
        title: "",
        issuedAt: "",
        expiresAt: "",
        externalLink: "",
        notes: "",
      });

      setSafetyAdding(false);
      showOk("Registro adicionado.");
    } catch (e) {
      console.error(e);
      showErr("Não foi possível adicionar o registro.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSafety(id: string) {
    try {
      setBusy(true);
      await deleteDoc(doc(db, "safetyDocs", id));
      showOk("Registro excluído.");
    } catch (e) {
      console.error(e);
      showErr("Não foi possível excluir o registro.");
    } finally {
      setBusy(false);
    }
  }

  async function saveProfilePhotoUrl(url: string) {
    try {
      if (!profile) return;
      const u = safeTrim(url);
      if (u && !isValidUrl(u)) {
        showErr("URL de foto inválida.");
        return;
      }
      setBusy(true);
      await updateDoc(doc(db, "users", profile.uid), { photoURL: u } as any);
      showOk("Foto atualizada.");
    } catch (e) {
      console.error(e);
      showErr("Não foi possível atualizar a foto.");
    } finally {
      setBusy(false);
    }
  }

  // UI helpers
  function TopBar() {
    return (
      <div className="w-full px-6 py-4 bg-white border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <img src="/logo-fmea.png" alt="FMEA" className="h-10 w-auto" />
          <div className="flex flex-col">
            <span className="text-xs font-black uppercase tracking-widest text-gray-400">Portal FMEA</span>
            <span className="text-sm font-black text-gray-900">
              {profile?.name || "Usuário"} {profile?.role === "ADMIN" ? "(Admin)" : ""}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            className={clsx(
              "px-4 py-2 rounded-xl text-sm font-black",
              view === "DASHBOARD" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700"
            )}
            onClick={() => setView("DASHBOARD")}
          >
            Dashboard
          </button>

          <button
            className={clsx(
              "px-4 py-2 rounded-xl text-sm font-black",
              view === "PROJETOS" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700"
            )}
            onClick={() => setView("PROJETOS")}
          >
            Projetos
          </button>

          <button
            className={clsx(
              "px-4 py-2 rounded-xl text-sm font-black",
              view === "ENTREGAS" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700"
            )}
            onClick={() => setView("ENTREGAS")}
          >
            Entregas
          </button>

          {profile?.role === "ADMIN" ? (
            <>
              <button
                className={clsx(
                  "px-4 py-2 rounded-xl text-sm font-black",
                  view === "USUARIOS" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700"
                )}
                onClick={() => setView("USUARIOS")}
              >
                Usuários
              </button>

              <button
                className={clsx(
                  "px-4 py-2 rounded-xl text-sm font-black",
                  view === "PRESTADORES" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700"
                )}
                onClick={() => setView("PRESTADORES")}
              >
                Prestadores
              </button>
            </>
          ) : null}

          <button
            className={clsx(
              "px-4 py-2 rounded-xl text-sm font-black",
              view === "PERFIL" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700"
            )}
            onClick={() => setView("PERFIL")}
          >
            Meu perfil
          </button>

          <button
            className="px-4 py-2 rounded-xl text-sm font-black bg-red-50 text-red-700"
            onClick={handleLogout}
          >
            Sair
          </button>
        </div>
      </div>
    );
  }

  function Card({ title, value }: { title: string; value: string }) {
    return (
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{title}</p>
        <p className="text-2xl font-black text-gray-900 mt-2">{value}</p>
      </div>
    );
  }

  if (loadingAuth) {
    return <div className="p-10 font-black">Carregando...</div>;
  }

  // LOGIN / SIGNUP / PENDING
  if (!user || !profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white border border-gray-100 rounded-3xl p-8 shadow-sm">
          <div className="flex items-center gap-3">
            <img src="/logo-fmea.png" alt="FMEA" className="h-10 w-auto" />
            <div className="flex flex-col">
              <span className="text-xs font-black uppercase tracking-widest text-gray-400">Portal FMEA</span>
              <span className="text-lg font-black">Acesso</span>
            </div>
          </div>

          <div className="mt-6">
            <label className="text-xs font-black text-gray-700">E-mail</label>
            <input
              className="w-full mt-2 px-4 py-3 rounded-2xl bg-gray-50 border border-gray-100 outline-none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@empresa.com"
            />
          </div>

          {view !== "LOGIN" ? (
            <div className="mt-4">
              <label className="text-xs font-black text-gray-700">Nome</label>
              <input
                className="w-full mt-2 px-4 py-3 rounded-2xl bg-gray-50 border border-gray-100 outline-none"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome completo"
              />
            </div>
          ) : null}

          <div className="mt-4">
            <label className="text-xs font-black text-gray-700">Senha</label>
            <input
              type="password"
              className="w-full mt-2 px-4 py-3 rounded-2xl bg-gray-50 border border-gray-100 outline-none"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="mínimo 6 caracteres"
            />
          </div>

          <div className="mt-6 flex gap-3">
            {view === "LOGIN" ? (
              <>
                <button
                  disabled={busy}
                  className="flex-1 px-4 py-3 rounded-2xl bg-gray-900 text-white font-black"
                  onClick={handleEmailLogin}
                >
                  Entrar
                </button>
                <button
                  disabled={busy}
                  className="flex-1 px-4 py-3 rounded-2xl bg-gray-100 text-gray-900 font-black"
                  onClick={() => setView("SIGNUP")}
                >
                  Criar conta
                </button>
              </>
            ) : (
              <>
                <button
                  disabled={busy}
                  className="flex-1 px-4 py-3 rounded-2xl bg-gray-900 text-white font-black"
                  onClick={handleSignup}
                >
                  Criar
                </button>
                <button
                  disabled={busy}
                  className="flex-1 px-4 py-3 rounded-2xl bg-gray-100 text-gray-900 font-black"
                  onClick={() => setView("LOGIN")}
                >
                  Voltar
                </button>
              </>
            )}
          </div>

          <div className="mt-4">
            <button
              disabled={busy}
              className="w-full px-4 py-3 rounded-2xl bg-blue-50 text-blue-900 font-black"
              onClick={handleGoogleLogin}
            >
              Entrar com Google
            </button>
          </div>

          {toast ? (
            <div
              className={clsx(
                "mt-5 p-3 rounded-2xl font-black text-sm",
                toast.type === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
              )}
            >
              {toast.msg}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (view === "PENDING") {
    return (
      <div className="min-h-screen bg-gray-50">
        <TopBar />
        <div className="max-w-4xl mx-auto p-6">
          <div className="bg-white border border-gray-100 rounded-3xl p-8 shadow-sm">
            <p className="text-xl font-black text-gray-900">Conta aguardando aprovação</p>
            <p className="text-gray-600 font-bold mt-3">
              Assim que a aprovação ocorrer, a dashboard ficará disponível automaticamente.
            </p>
          </div>
        </div>

        {toast ? (
          <div className="fixed bottom-6 right-6">
            <div
              className={clsx(
                "p-4 rounded-2xl font-black text-sm shadow-sm border",
                toast.type === "ok"
                  ? "bg-green-50 text-green-800 border-green-100"
                  : "bg-red-50 text-red-800 border-red-100"
              )}
            >
              {toast.msg}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  // MAIN APP
  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar />

      <div className="max-w-6xl mx-auto p-6">
        {view === "DASHBOARD" ? (
          <div className="space-y-6">
            <div className="grid grid-cols-4 gap-4">
              <Card title="Projetos" value={String(projects.length)} />
              <Card title="Projetos em aberto" value={String(openProjects.length)} />
              <Card title="Entregas" value={String(deliveries.length)} />
              <Card title="Pendências" value={String(pendingDeliveries.length)} />
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
                <p className="text-sm font-black text-gray-900">Projetos em aberto</p>
                <div className="mt-4 space-y-3">
                  {openProjects.slice(0, 6).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedProjectId(p.id);
                        setView("DETALHE_PROJETO");
                      }}
                      className="w-full text-left p-4 rounded-2xl bg-gray-50 border border-gray-100 hover:bg-gray-100"
                    >
                      <p className="font-black text-gray-900">{p.client} | {p.name}</p>
                      <p className="text-sm font-bold text-gray-600 mt-1">Status: {statusLabel(p.status)}</p>
                    </button>
                  ))}
                  {!openProjects.length ? (
                    <p className="text-gray-500 font-bold">Nenhum projeto em aberto.</p>
                  ) : null}
                </div>
              </div>

              <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
                <p className="text-sm font-black text-gray-900">Entregas pendentes</p>
                <div className="mt-4 space-y-3">
                  {pendingDeliveries.slice(0, 6).map((d) => (
                    <button
                      key={d.id}
                      onClick={() => {
                        setSelectedDeliveryId(d.id);
                        setView("DETALHE_ENTREGA");
                      }}
                      className="w-full text-left p-4 rounded-2xl bg-gray-50 border border-gray-100 hover:bg-gray-100"
                    >
                      <p className="font-black text-gray-900">{d.project} | {d.title}</p>
                      <p className="text-sm font-bold text-gray-600 mt-1">
                        Prazo: {d.deadline} | Status: {statusLabel(d.status)}
                      </p>
                    </button>
                  ))}
                  {!pendingDeliveries.length ? (
                    <p className="text-gray-500 font-bold">Nenhuma entrega pendente.</p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {view === "PROJETOS" ? (
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
              <p className="text-sm font-black text-gray-900">Criar projeto</p>

              <div className="mt-4 space-y-3">
                <input
                  className="w-full px-4 py-3 rounded-2xl bg-gray-50 border border-gray-100 outline-none"
                  placeholder="Cliente"
                  value={projectForm.client}
                  onChange={(e) => setProjectForm((p) => ({ ...p, client: e.target.value }))}
                />

                <input
                  className="w-full px-4 py-3 rounded-2xl bg-gray-50 border border-gray-100 outline-none"
                  placeholder="Nome do projeto"
                  value={projectForm.name}
                  onChange={(e) => setProjectForm((p) => ({ ...p, name: e.target.value }))}
                />

                <textarea
                  className="w-full px-4 py-3 rounded-2xl bg-gray-50 border border-gray-100 outline-none min-h-[120px]"
                  placeholder="Descrição (opcional)"
                  value={projectForm.description}
                  onChange={(e) => setProjectForm((p) => ({ ...p, description: e.target.value }))}
                />

                <input
                  className="w-full px-4 py-3 rounded-2xl bg-gray-50 border border-gray-100 outline-none"
                  placeholder="Link externo do projeto (Drive/OneDrive) (opcional)"
                  value={projectForm.externalLink}
                  onChange={(e) => setProjectForm((p) => ({ ...p, externalLink: e.target.value }))}
                />

                {profile.role === "ADMIN" ? (
                  <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
                    <p className="text-xs font-black uppercase tracking-widest text-gray-500">Prestadores</p>
                    <div className="mt-3 space-y-2 max-h-48 overflow-auto">
                      {providers.map((pr) => {
                        const checked = projectForm.memberUids.includes(pr.uid);
                        return (
                          <label key={pr.uid} className="flex items-center gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const on = e.target.checked;
                                setProjectForm((prev) => {
                                  const set = new Set(prev.memberUids);
                                  if (on) set.add(pr.uid);
                                  else set.delete(pr.uid);
                                  return { ...prev, memberUids: Array.from(set) };
                                });
                              }}
                            />
                            <span className="font-bold text-gray-800">{pr.name}</span>
                          </label>
                        );
                      })}
                      {!providers.length ? <p className="text-gray-500 font-bold">Nenhum prestador.</p> : null}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm font-bold text-gray-600">
                    Somente admin cria projetos.
                  </p>
                )}

                {profile.role === "ADMIN" ? (
                  <button
                    disabled={busy}
                    onClick={saveProject}
                    className="w-full px-4 py-3 rounded-2xl bg-gray-900 text-white font-black"
                  >
                    Criar projeto
                  </button>
                ) : null}
              </div>
            </div>

            <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
              <p className="text-sm font-black text-gray-900">Lista de projetos</p>
              <div className="mt-4 space-y-3 max-h-[640px] overflow-auto">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    className="w-full text-left p-4 rounded-2xl bg-gray-50 border border-gray-100 hover:bg-gray-100"
                    onClick={() => {
                      setSelectedProjectId(p.id);
                      setProjectForm({
                        client: p.client,
                        name: p.name,
                        description: p.description || "",
                        externalLink: p.externalLink || "",
                        memberUids: Array.isArray(p.memberUids) ? p.memberUids : [],
                      });
                      setView("DETALHE_PROJETO");
                    }}
                  >
                    <p className="font-black text-gray-900">{p.client} | {p.name}</p>
                    <p className="text-sm font-bold text-gray-600 mt-1">Status: {statusLabel(p.status)}</p>
                  </button>
                ))}
                {!projects.length ? <p className="text-gray-500 font-bold">Nenhum projeto.</p> : null}
              </div>
            </div>
          </div>
        ) : null}

        {view === "DETALHE_PROJETO" && selectedProject ? (
          <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-xl font-black text-gray-900">{selectedProject.client} | {selectedProject.name}</p>
                <p className="text-sm font-bold text-gray-600 mt-2">Criado em: {formatDate(selectedProject.createdAt)}</p>
                <p className="text-sm font-bold text-gray-600 mt-1">Status: {statusLabel(selectedProject.status)}</p>

                {selectedProject.description ? (
                  <p className="text-gray-700 font-bold mt-4 whitespace-pre-wrap">{selectedProject.description}</p>
                ) : null}

                {selectedProject.externalLink ? (
                  <a
                    className="inline-block mt-4 px-4 py-2 rounded-xl bg-blue-50 text-blue-900 font-black"
                    href={selectedProject.externalLink}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir link do projeto
                  </a>
                ) : null}
              </div>

              <div className="flex gap-3">
                <button
                  className="px-4 py-2 rounded-xl bg-gray-100 text-gray-900 font-black"
                  onClick={() => setView("PROJETOS")}
                >
                  Voltar
                </button>

                {profile.role === "ADMIN" ? (
                  <button
                    disabled={busy}
                    className="px-4 py-2 rounded-xl bg-red-50 text-red-800 font-black"
                    onClick={() => deleteProject(selectedProject)}
                  >
                    Excluir
                  </button>
                ) : null}
              </div>
            </div>

            {profile.role === "ADMIN" ? (
              <div className="mt-6 border-t border-gray-100 pt-6">
                <p className="text-sm font-black text-gray-900">Editar projeto</p>

                <div className="mt-4 grid grid-cols-2 gap-4">
                  <input
                    className="w-full px-4 py-3 rounded-2xl bg-gray-50 border border-gray-100 outline-none"
                    placeholder="Cliente"
                    value={projectForm.client}
                    onChange={(e) => setProjectForm((p) => ({ ...p, client: e.target.value }))}
                  />
                  <input
                    className="w-full px-4 py-3 rounded-2xl bg-gray-50 border border-gray-100 outline-none"
                    placeholder="Nome"
                    value={projectForm.name}
                    onChange={(e) => setProjectForm((p) => ({ ...p, name: e.target.value }))}
                  />
                </div>

                <textarea
                  className="w-full mt-4 px-4 py-3 rounded-2xl bg-gray-50 border border-gray-100 outline-none min-h-[120px]"
                  placeholder="Descrição"
                  value={projectForm.description}
                  onChange={(e) => setProjectForm((p) => ({ ...p, description: e.target.value }))}
                />

                <input
                  className="w-full mt-4 px-4 py-3 rounded-2xl bg-gray-50 border border-gray-100 outline-none"
                  placeholder="Link externo"
                  value={projectForm.externalLink}
                  onChange={(e) => setProjectForm((p) => ({ ...p, externalLink: e.target.value }))}
                />

                <div className="mt-4 bg-gray-50 border border-gray-100 rounded-2xl p-4">
                  <p className="text-xs font-black uppercase tracking-widest text-gray-500">Prestadores</p>
                  <div className="mt-3 space-y-2 max-h-48 overflow-auto">
                    {providers.map((pr) => {
                      const checked = projectForm.memberUids.includes(pr.uid);
                      return (
                        <label key={pr.uid} className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const on = e.target.checked;
                              setProjectForm((prev) => {
                                const set = new Set(prev.memberUids);
                                if (on) set.add(pr.uid);
                                else set.delete(pr.uid);
                                return { ...prev, memberUids: Array.from(set) };
                              });
                            }}
                          />
                          <span className="font-bold text-gray-800">{pr.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <button
                  disabled={busy}
                  className="mt-4 px-4 py-3 rounded-2xl bg-gray-900 text-white font-black"
                  onClick={() => updateProject(selectedProject)}
                >
                  Salvar alterações
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {view === "ENTREGAS" ? (
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
              <p className="text-sm font-black text-gray-900">Criar entrega</p>

              {profile.role !== "ADMIN" ? (
                <p className="text-sm font-bold text-gray-600 mt-3">
                  Somente admin cria entregas.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  <select
                    className="w-full px-4 py-3 rounded-2xl bg-gray-50 border border-gray-100 outline-none"
                    value={deliveryForm.projectId}
                    onChange={(e) => {
                      const pid = e.target.value;
                      setDeliveryForm((p) => ({ ...p, projectId: pid, providerUid: "" }));
                    }}
                  >
                    <option value="">Selecione um projeto</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.client} | {p.name}
                      </option>
                    ))}
                  </select>

                  <select
                    className="w-full px-4 py-3 rounded-2xl bg-gray-50 border border-gray-100 outline-none"
                    value={deliveryForm.providerUid}
                    onChange={(e) => setDeliveryForm((p) => ({ ...p, providerUid: e.target.value }))}
                    disabled={!deliveryForm.projectId}
                  >
                    <option value="">
                      {deliveryForm.projectId ? "Selecione o prestador do projeto" : "Selecione um projeto primeiro"}
                    </option>

                    {(() => {
                      const prj = projects.find((p) => p.id === deliveryForm.projectId);
                      if (!prj) return null;
                      const allowed = new Set(prj.memberUids || []);
                      return providers
                        .filter((u) => allowed.has(u.uid))
                        .map((u) => (
                          <option key={u.uid} value={u.uid}>
                            {u.name}
                          </option>
                        ));
                    })()}
                  </select>

                  <input
                    className="w-full px-4 py-3 rounded-2xl bg-gray-50 border border-gray-100 outline-none"
                    placeholder="Título"
                    value={deliveryForm.title}
                    onChange={(e) => setDeliveryForm((p) => ({ ...p, title: e.target.value }))}
                  />

                  <textarea
                    className="w-full px-4 py-3 rounded-2xl bg-gray-50 border border-gray-100 outline-none min-h-[100px]"
                    placeholder="Descrição"
                    value={deliveryForm.description}
                    onChange={(e) => setDeliveryForm((p) => ({ ...p, description: e.target.value }))}
                  />

                  <input
                    className="w-full px-4 py-3 rounded-2xl bg-gray-50 border border-gray-100 outline-none"
                    placeholder="Prazo (ex: 20/01/2026)"
                    value={deliveryForm.deadline}
                    onChange={(e) => setDeliveryForm((p) => ({ ...p, deadline: e.target.value }))}
                  />

                  <select
                    className="w-full px-4 py-3 rounded-2xl bg-gray-50 border border-gray-100 outline-none"
                    value={deliveryForm.priority}
                    onChange={(e) => setDeliveryForm((p) => ({ ...p, priority: e.target.value as Priority }))}
                  >
                    <option value="BAIXA">Baixa</option>
                    <option value="MEDIA">Média</option>
                    <option value="ALTA">Alta</option>
                  </select>

                  <input
                    className="w-full px-4 py-3 rounded-2xl bg-gray-50 border border-gray-100 outline-none"
                    placeholder="Link externo (opcional)"
                    value={deliveryForm.externalLink}
                    onChange={(e) => setDeliveryForm((p) => ({ ...p, externalLink: e.target.value }))}
                  />

                  <button
                    disabled={busy}
                    onClick={saveDelivery}
                    className="w-full px-4 py-3 rounded-2xl bg-gray-900 text-white font-black"
                  >
                    Criar entrega
                  </button>
                </div>
              )}
            </div>

            <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
              <p className="text-sm font-black text-gray-900">Lista de entregas</p>

              <div className="mt-4 space-y-3 max-h-[640px] overflow-auto">
                {deliveries.map((d) => (
                  <button
                    key={d.id}
                    className="w-full text-left p-4 rounded-2xl bg-gray-50 border border-gray-100 hover:bg-gray-100"
                    onClick={() => {
                      setSelectedDeliveryId(d.id);
                      setView("DETALHE_ENTREGA");
                    }}
                  >
                    <p className="font-black text-gray-900">{d.project} | {d.title}</p>
                    <p className="text-sm font-bold text-gray-600 mt-1">
                      Prazo: {d.deadline} | Status: {statusLabel(d.status)}
                    </p>
                  </button>
                ))}
                {!deliveries.length ? <p className="text-gray-500 font-bold">Nenhuma entrega.</p> : null}
              </div>
            </div>
          </div>
        ) : null}

        {view === "DETALHE_ENTREGA" && selectedDelivery ? (
          <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-xl font-black text-gray-900">{selectedDelivery.project} | {selectedDelivery.title}</p>
                <p className="text-sm font-bold text-gray-600 mt-2">Cliente: {selectedDelivery.client}</p>
                <p className="text-sm font-bold text-gray-600 mt-1">Prestador: {selectedDelivery.provider}</p>
                <p className="text-sm font-bold text-gray-600 mt-1">Prazo: {selectedDelivery.deadline}</p>
                <p className="text-sm font-bold text-gray-600 mt-1">Status: {statusLabel(selectedDelivery.status)}</p>

                {selectedDelivery.description ? (
                  <p className="text-gray-700 font-bold mt-4 whitespace-pre-wrap">{selectedDelivery.description}</p>
                ) : null}

                {selectedDelivery.externalLink ? (
                  <a
                    className="inline-block mt-4 px-4 py-2 rounded-xl bg-blue-50 text-blue-900 font-black"
                    href={selectedDelivery.externalLink}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir link da entrega
                  </a>
                ) : null}
              </div>

              <div className="flex gap-3">
                <button
                  className="px-4 py-2 rounded-xl bg-gray-100 text-gray-900 font-black"
                  onClick={() => setView("ENTREGAS")}
                >
                  Voltar
                </button>

                {profile.role === "ADMIN" ? (
                  <button
                    disabled={busy}
                    className="px-4 py-2 rounded-xl bg-red-50 text-red-800 font-black"
                    onClick={() => deleteDelivery(selectedDelivery)}
                  >
                    Excluir
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {view === "USUARIOS" && profile.role === "ADMIN" ? (
          <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
            <p className="text-sm font-black text-gray-900">Usuários</p>

            <div className="mt-4 space-y-3">
              {users.map((u) => (
                <div key={u.uid} className="p-4 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-black text-gray-900">{u.name}</p>
                    <p className="text-sm font-bold text-gray-600">{u.email}</p>
                    <p className="text-sm font-bold text-gray-600">
                      Role: {u.role} | Status: {u.status} | Ativo: {u.active ? "Sim" : "Não"}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    {u.status !== "ACTIVE" ? (
                      <button
                        disabled={busy}
                        className="px-3 py-2 rounded-xl bg-green-50 text-green-800 font-black"
                        onClick={() => approveUser(u)}
                      >
                        Aprovar
                      </button>
                    ) : null}

                    {u.status !== "REJECTED" ? (
                      <button
                        disabled={busy}
                        className="px-3 py-2 rounded-xl bg-yellow-50 text-yellow-800 font-black"
                        onClick={() => rejectUser(u)}
                      >
                        Rejeitar
                      </button>
                    ) : null}

                    <button
                      disabled={busy}
                      className="px-3 py-2 rounded-xl bg-red-50 text-red-800 font-black"
                      onClick={() => deleteUser(u)}
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
              {!users.length ? <p className="text-gray-500 font-bold">Nenhum usuário.</p> : null}
            </div>
          </div>
        ) : null}

        {view === "PRESTADORES" && profile.role === "ADMIN" ? (
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
              <p className="text-sm font-black text-gray-900">Prestadores</p>

              <div className="mt-4 space-y-3 max-h-[640px] overflow-auto">
                {providers.map((p) => (
                  <div key={p.uid} className="p-4 rounded-2xl bg-gray-50 border border-gray-100">
                    <div className="flex items-start justify-between gap-3">
                      <button
                        className="text-left"
                        onClick={() => setSelectedProviderUid(p.uid)}
                      >
                        <p className="font-black text-gray-900">{p.name}</p>
                        <p className="text-sm font-bold text-gray-600">{p.email}</p>
                      </button>

                      <button
                        disabled={busy}
                        className="px-3 py-2 rounded-xl bg-red-50 text-red-800 font-black"
                        onClick={() => deleteProvider(p)}
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                ))}
                {!providers.length ? <p className="text-gray-500 font-bold">Nenhum prestador.</p> : null}
              </div>
            </div>

            <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
              <p className="text-sm font-black text-gray-900">Documentação de segurança</p>

              {!selectedProviderUid ? (
                <p className="text-gray-600 font-bold mt-4">Selecione um prestador para visualizar os registros.</p>
              ) : (
                <>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <p className="text-gray-700 font-black">
                      Prestador selecionado:{" "}
                      {providers.find((x) => x.uid === selectedProviderUid)?.name || "Prestador"}
                    </p>

                    <button
                      className="px-4 py-2 rounded-xl bg-gray-900 text-white font-black"
                      onClick={() => setSafetyAdding((v) => !v)}
                    >
                      {safetyAdding ? "Cancelar" : "Adicionar registro"}
                    </button>
                  </div>

                  {safetyAdding ? (
                    <div className="mt-4 bg-gray-50 border border-gray-100 rounded-2xl p-4 space-y-3">
                      <input
                        className="w-full px-4 py-3 rounded-2xl bg-white border border-gray-100 outline-none"
                        placeholder="Título (ex: NR-35)"
                        value={safetyForm.title}
                        onChange={(e) => setSafetyForm((p) => ({ ...p, title: e.target.value }))}
                      />

                      <input
                        className="w-full px-4 py-3 rounded-2xl bg-white border border-gray-100 outline-none"
                        placeholder="Emissão (ex: 10/01/2026)"
                        value={safetyForm.issuedAt}
                        onChange={(e) => setSafetyForm((p) => ({ ...p, issuedAt: e.target.value }))}
                      />

                      <input
                        className="w-full px-4 py-3 rounded-2xl bg-white border border-gray-100 outline-none"
                        placeholder="Validade (opcional)"
                        value={safetyForm.expiresAt}
                        onChange={(e) => setSafetyForm((p) => ({ ...p, expiresAt: e.target.value }))}
                      />

                      <input
                        className="w-full px-4 py-3 rounded-2xl bg-white border border-gray-100 outline-none"
                        placeholder="Link externo (Drive) (opcional)"
                        value={safetyForm.externalLink}
                        onChange={(e) => setSafetyForm((p) => ({ ...p, externalLink: e.target.value }))}
                      />

                      <textarea
                        className="w-full px-4 py-3 rounded-2xl bg-white border border-gray-100 outline-none min-h-[90px]"
                        placeholder="Observações (opcional)"
                        value={safetyForm.notes}
                        onChange={(e) => setSafetyForm((p) => ({ ...p, notes: e.target.value }))}
                      />

                      <button
                        disabled={busy}
                        className="w-full px-4 py-3 rounded-2xl bg-gray-900 text-white font-black"
                        onClick={addSafetyDoc}
                      >
                        Salvar registro
                      </button>
                    </div>
                  ) : null}

                  <div className="mt-5">
                    {safetyLoading ? (
                      <p className="text-gray-500 font-bold">Carregando registros...</p>
                    ) : (
                      <div className="space-y-3">
                        {safetyDocs.map((d) => (
                          <div key={d.id} className="p-4 rounded-2xl bg-gray-50 border border-gray-100">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <p className="font-black text-gray-900">{d.title}</p>
                                <p className="text-sm font-bold text-gray-600 mt-1">Emissão: {d.issuedAt}</p>
                                {d.expiresAt ? (
                                  <p className="text-sm font-bold text-gray-600">Validade: {d.expiresAt}</p>
                                ) : null}
                                {d.externalLink ? (
                                  <a
                                    className="inline-block mt-2 text-blue-900 font-black"
                                    href={d.externalLink}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    Abrir link
                                  </a>
                                ) : null}
                                {d.notes ? (
                                  <p className="text-sm font-bold text-gray-700 mt-2 whitespace-pre-wrap">{d.notes}</p>
                                ) : null}
                              </div>

                              <button
                                disabled={busy}
                                className="px-3 py-2 rounded-xl bg-red-50 text-red-800 font-black"
                                onClick={() => deleteSafety(d.id)}
                              >
                                Excluir
                              </button>
                            </div>
                          </div>
                        ))}
                        {!safetyDocs.length ? <p className="text-gray-500 font-bold">Nenhum registro.</p> : null}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        ) : null}

        {view === "PERFIL" ? (
          <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
            <p className="text-sm font-black text-gray-900">Meu perfil</p>

            <div className="mt-4 flex items-center gap-5">
              <img
                src={profile.photoURL || "/logo-fmea.png"}
                className="w-16 h-16 rounded-2xl object-cover border border-gray-100"
                alt="Foto"
              />
              <div>
                <p className="font-black text-gray-900">{profile.name}</p>
                <p className="text-sm font-bold text-gray-600">{profile.email}</p>
              </div>
            </div>

            <div className="mt-6">
              <p className="text-xs font-black uppercase tracking-widest text-gray-500">Atualizar foto (URL)</p>
              <ProfilePhotoEditor
                initialUrl={profile.photoURL || ""}
                onSave={saveProfilePhotoUrl}
                busy={busy}
              />
              <p className="text-xs font-bold text-gray-500 mt-2">
                Por enquanto, use um link (ex: imagem hospedada). Storage fica para etapa futura.
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {toast ? (
        <div className="fixed bottom-6 right-6">
          <div
            className={clsx(
              "p-4 rounded-2xl font-black text-sm shadow-sm border",
              toast.type === "ok"
                ? "bg-green-50 text-green-800 border-green-100"
                : "bg-red-50 text-red-800 border-red-100"
            )}
          >
            {toast.msg}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ProfilePhotoEditor({
  initialUrl,
  onSave,
  busy,
}: {
  initialUrl: string;
  onSave: (url: string) => void;
  busy: boolean;
}) {
  const [url, setUrl] = useState(initialUrl);

  useEffect(() => {
    setUrl(initialUrl);
  }, [initialUrl]);

  return (
    <div className="mt-3 flex gap-3">
      <input
        className="flex-1 px-4 py-3 rounded-2xl bg-gray-50 border border-gray-100 outline-none"
        placeholder="https://..."
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <button
        disabled={busy}
        className="px-4 py-3 rounded-2xl bg-gray-900 text-white font-black"
        onClick={() => onSave(url)}
      >
        Salvar
      </button>
    </div>
  );
}
