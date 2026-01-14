import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { Delivery, Project, SafetyDoc, UserProfile, UserRole, UserStatus } from "../types";

type FireUserDoc = {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  active: boolean;
  pixKey?: string;
  photoURL?: string;
  createdAt?: any;
  approvedAt?: any;
};

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const d = snap.data() as FireUserDoc;
  return {
    uid: d.uid || uid,
    email: d.email || "",
    name: d.name || "Usuário",
    role: d.role || "PRESTADOR",
    status: d.status || "PENDING",
    active: !!d.active,
    pixKey: d.pixKey,
    photoURL: d.photoURL,
    createdAt: typeof d.createdAt === "number" ? d.createdAt : Date.now(),
    approvedAt: typeof d.approvedAt === "number" ? d.approvedAt : undefined,
  };
}

export async function listProjects(): Promise<Project[]> {
  const qy = query(collection(db, "projects"), orderBy("createdAt", "desc"));
  const snap = await getDocs(qy);

  return snap.docs.map((s) => {
    const d = s.data() as any;
    return {
      id: s.id,
      client: d.client || "",
      name: d.name || "",
      description: d.description || "",
      externalLink: d.externalLink || "",
      manager: d.manager || "",
      managerUid: d.managerUid || "",
      memberUids: Array.isArray(d.memberUids) ? d.memberUids : [],
      status: d.status || "PENDENTE",
      completionRate: typeof d.completionRate === "number" ? d.completionRate : 0,
      createdAt: typeof d.createdAt === "number" ? d.createdAt : Date.now(),
      updatedAt: typeof d.updatedAt === "number" ? d.updatedAt : undefined,
    } as Project;
  });
}

export async function listDeliveries(): Promise<Delivery[]> {
  const qy = query(collection(db, "deliveries"), orderBy("createdAt", "desc"));
  const snap = await getDocs(qy);

  return snap.docs.map((s) => {
    const d = s.data() as any;
    return {
      id: s.id,
      projectId: d.projectId || "",
      client: d.client || "",
      project: d.project || "",
      title: d.title || "",
      description: d.description || "",
      deadline: d.deadline || "",
      status: d.status || "PENDENTE",
      priority: d.priority || "MEDIA",
      provider: d.provider || "",
      providerUid: d.providerUid || "",
      externalLink: d.externalLink || "",
      createdAt: typeof d.createdAt === "number" ? d.createdAt : Date.now(),
      updatedAt: typeof d.updatedAt === "number" ? d.updatedAt : undefined,
    } as Delivery;
  });
}

export async function addSafetyDoc(docData: Omit<SafetyDoc, "id">): Promise<string> {
  const ref = await addDoc(collection(db, "safetyDocs"), {
    ...docData,
    createdAt: docData.createdAt || Date.now(),
    createdAtServer: serverTimestamp(),
  });
  return ref.id;
}

export async function deleteSafetyDoc(id: string): Promise<void> {
  await deleteDoc(doc(db, "safetyDocs", id));
}

export async function deleteUserProfile(uid: string): Promise<void> {
  await deleteDoc(doc(db, "users", uid));
}

export async function updateUserProfile(uid: string, patch: Partial<UserProfile>): Promise<void> {
  await updateDoc(doc(db, "users", uid), {
    ...patch,
    updatedAt: Date.now(),
  } as any);
}

export async function listSafetyDocsForProvider(uid: string): Promise<SafetyDoc[]> {
  const qy = query(
    collection(db, "safetyDocs"),
    where("uid", "==", uid),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(qy);

  return snap.docs.map((s) => {
    const d = s.data() as any;
    return {
      id: s.id,
      uid: d.uid,
      title: d.title || "",
      issuedAt: d.issuedAt || "",
      expiresAt: d.expiresAt || "",
      externalLink: d.externalLink || "",
      notes: d.notes || "",
      createdAt: typeof d.createdAt === "number" ? d.createdAt : Date.now(),
    } as SafetyDoc;
  });
}
