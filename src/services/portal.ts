// src/services/portal.ts
import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { Delivery, Project, Status } from "../types";

function toMillis(v: any): number {
  if (!v) return Date.now();
  if (typeof v === "number") return v;
  if (typeof v?.toMillis === "function") return v.toMillis();
  const d = new Date(v);
  const t = d.getTime();
  return Number.isFinite(t) ? t : Date.now();
}

export async function listProjectsAdmin(): Promise<Project[]> {
  const q = query(collection(db, "projects"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data: any = d.data();
    return {
      id: d.id,
      client: data.client || "",
      name: data.name || "",
      manager: data.manager || "",
      managerUid: data.managerUid || "",
      memberUids: Array.isArray(data.memberUids) ? data.memberUids : [],
      status: data.status || "PENDENTE",
      completionRate: typeof data.completionRate === "number" ? data.completionRate : 0,
      createdAt: toMillis(data.createdAt),
      updatedAt: data.updatedAt ? toMillis(data.updatedAt) : undefined,
    } satisfies Project;
  });
}

export async function listProjectsForUser(uid: string): Promise<Project[]> {
  const q = query(
    collection(db, "projects"),
    where("memberUids", "array-contains", uid),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data: any = d.data();
    return {
      id: d.id,
      client: data.client || "",
      name: data.name || "",
      manager: data.manager || "",
      managerUid: data.managerUid || "",
      memberUids: Array.isArray(data.memberUids) ? data.memberUids : [],
      status: data.status || "PENDENTE",
      completionRate: typeof data.completionRate === "number" ? data.completionRate : 0,
      createdAt: toMillis(data.createdAt),
      updatedAt: data.updatedAt ? toMillis(data.updatedAt) : undefined,
    } satisfies Project;
  });
}

export async function createProject(payload: Omit<Project, "id" | "createdAt" | "updatedAt">): Promise<void> {
  await addDoc(collection(db, "projects"), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateProject(projectId: string, patch: Partial<Project>): Promise<void> {
  await updateDoc(doc(db, "projects", projectId), {
    ...patch,
    updatedAt: serverTimestamp(),
  } as any);
}

export async function listDeliveriesAdmin(): Promise<Delivery[]> {
  const q = query(collection(db, "deliveries"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data: any = d.data();
    return {
      id: d.id,
      projectId: data.projectId || "",
      client: data.client || "",
      project: data.project || "",
      title: data.title || "",
      description: data.description || "",
      deadline: data.deadline || "",
      status: data.status || "PENDENTE",
      priority: data.priority || "MEDIA",
      provider: data.provider || "",
      providerUid: data.providerUid || "",
      checklist: Array.isArray(data.checklist) ? data.checklist : [],
      attachments: Array.isArray(data.attachments) ? data.attachments : [],
      comments: Array.isArray(data.comments) ? data.comments : [],
      createdAt: toMillis(data.createdAt),
      updatedAt: data.updatedAt ? toMillis(data.updatedAt) : undefined,
    } satisfies Delivery;
  });
}

export async function listDeliveriesForProvider(providerUid: string): Promise<Delivery[]> {
  const q = query(
    collection(db, "deliveries"),
    where("providerUid", "==", providerUid),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data: any = d.data();
    return {
      id: d.id,
      projectId: data.projectId || "",
      client: data.client || "",
      project: data.project || "",
      title: data.title || "",
      description: data.description || "",
      deadline: data.deadline || "",
      status: data.status || "PENDENTE",
      priority: data.priority || "MEDIA",
      provider: data.provider || "",
      providerUid: data.providerUid || "",
      checklist: Array.isArray(data.checklist) ? data.checklist : [],
      attachments: Array.isArray(data.attachments) ? data.attachments : [],
      comments: Array.isArray(data.comments) ? data.comments : [],
      createdAt: toMillis(data.createdAt),
      updatedAt: data.updatedAt ? toMillis(data.updatedAt) : undefined,
    } satisfies Delivery;
  });
}

export async function createDelivery(payload: Omit<Delivery, "id" | "createdAt" | "updatedAt">): Promise<void> {
  await addDoc(collection(db, "deliveries"), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateDeliveryStatus(deliveryId: string, status: Status): Promise<void> {
  await updateDoc(doc(db, "deliveries", deliveryId), {
    status,
    updatedAt: serverTimestamp(),
  });
}
