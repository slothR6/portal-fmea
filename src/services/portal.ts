import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  Delivery,
  Project,
  ProviderSafetyDoc,
  UserProfile,
  UserRole,
} from "../types";
import { PAGE_SIZE } from "../constants";

// ---------- USERS ----------
export async function approveUser(uid: string, role: UserRole) {
  await updateDoc(doc(db, "users", uid), {
    role,
    status: "ACTIVE",
    active: true,
    approvedAt: Date.now(),
  });
}

export async function rejectUser(uid: string) {
  await updateDoc(doc(db, "users", uid), {
    status: "REJECTED",
    active: false,
  });
}

export async function softDeleteUser(uid: string) {
  await updateDoc(doc(db, "users", uid), {
    status: "DELETED",
    active: false,
    deletedAt: Date.now(),
  });
}

// ---------- PROJECTS ----------
export async function createProject(payload: Omit<Project, "id">) {
  await addDoc(collection(db, "projects"), payload);
}

export async function updateProject(projectId: string, patch: Partial<Project>) {
  await updateDoc(doc(db, "projects", projectId), {
    ...patch,
    updatedAt: Date.now(),
  });
}

export async function deleteProject(projectId: string) {
  const batch = writeBatch(db);
  batch.delete(doc(db, "projects", projectId));

  const qDel = query(
    collection(db, "deliveries"),
    where("projectId", "==", projectId),
    limit(200)
  );
  const snap = await getDocs(qDel);
  snap.docs.forEach((d) => batch.delete(d.ref));

  await batch.commit();
}

// ---------- DELIVERIES ----------
export async function createDelivery(payload: Omit<Delivery, "id" | "attachments" | "comments">) {
  await addDoc(collection(db, "deliveries"), {
    ...payload,
    attachments: [],
    comments: [],
  });
}

export async function updateDelivery(deliveryId: string, patch: Partial<Delivery>) {
  await updateDoc(doc(db, "deliveries", deliveryId), patch);
}

export async function deleteDelivery(deliveryId: string) {
  await deleteDoc(doc(db, "deliveries", deliveryId));
}

// ---------- PROVIDER SAFETY DOCS ----------
export async function addProviderSafetyDoc(
  providerUid: string,
  docPayload: Omit<ProviderSafetyDoc, "id">
) {
  await addDoc(collection(db, "providers", providerUid, "safetyDocs"), docPayload);
}

export async function deleteProviderSafetyDoc(providerUid: string, docId: string) {
  await deleteDoc(doc(db, "providers", providerUid, "safetyDocs", docId));
}

// ---------- QUERY HELPERS ----------
export function getBaseUsersQuery(isAdmin: boolean) {
  if (isAdmin) {
    // Admin: busca TODOS os usuários e filtra DELETED no client-side
    // Evita precisar de índice composto adicional
    return query(
      collection(db, "users"),
      orderBy("createdAt", "desc"),
      limit(PAGE_SIZE * 100)
    );
  }
  
  // Prestador: apenas ativos, ordenado por data
  return query(
    collection(db, "users"),
    where("status", "==", "ACTIVE"),
    where("active", "==", true),
    orderBy("createdAt", "desc"),
    limit(PAGE_SIZE * 50)
  );
}

export function getBaseProjectsQuery(isAdmin: boolean, uid: string) {
  if (isAdmin) {
    // Admin: todos projetos, ordenado por data
    return query(
      collection(db, "projects"),
      orderBy("createdAt", "desc"),
      limit(PAGE_SIZE * 50)
    );
  }
  
  // Prestador: apenas onde é membro, ordenado por data
  return query(
    collection(db, "projects"),
    where("memberUids", "array-contains", uid),
    orderBy("createdAt", "desc"),
    limit(PAGE_SIZE * 50)
  );
}

export function getBaseDeliveriesQuery(isAdmin: boolean, uid: string) {
  if (isAdmin) {
    // Admin: todas entregas, ordenado por data
    return query(
      collection(db, "deliveries"),
      orderBy("createdAt", "desc"),
      limit(PAGE_SIZE * 50)
    );
  }
  
  // Prestador: apenas suas entregas, ordenado por data
  return query(
    collection(db, "deliveries"),
    where("providerUid", "==", uid),
    orderBy("createdAt", "desc"),
    limit(PAGE_SIZE * 50)
  );
}

export function getSafetyDocsQuery(providerUid: string) {
  // Safety docs ordenado por data
  return query(
    collection(db, "providers", providerUid, "safetyDocs"),
    orderBy("createdAt", "desc"),
    limit(PAGE_SIZE * 50)
  );
}