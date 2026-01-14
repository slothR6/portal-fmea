import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  query,
  where,
  orderBy,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { Delivery, Project, Status, UserRole } from '../types';

type UserDoc = {
  name?: string;
  role?: UserRole;
  active?: boolean;
};

export async function getUserProfile(uid: string): Promise<{ name: string; role: UserRole; active: boolean }> {
  const snap = await getDoc(doc(db, 'users', uid));
  const data = (snap.data() || {}) as UserDoc;

  return {
    name: data.name || 'Usuário',
    role: data.role || 'PRESTADOR',
    active: data.active !== false,
  };
}

export async function listProjects(params: { role: UserRole; uid: string }): Promise<Project[]> {
  const ref = collection(db, 'projects');

  // Admin: tudo. Prestador: só projetos onde participa
  const q =
    params.role === 'ADMIN'
      ? query(ref, orderBy('updatedAt', 'desc'))
      : query(ref, where('memberUids', 'array-contains', params.uid));

  const snap = await getDocs(q);

  return snap.docs.map((d) => {
    const x = d.data() as any;
    return {
      id: d.id,
      client: x.client || '',
      name: x.name || '',
      manager: x.manager || '',
      managerUid: x.managerUid,
      memberUids: x.memberUids || [],
      status: x.status || 'EM_ANDAMENTO',
      completionRate: typeof x.completionRate === 'number' ? x.completionRate : 0,
    };
  });
}

export async function listDeliveries(params: { role: UserRole; uid: string }): Promise<Delivery[]> {
  const ref = collection(db, 'deliveries');

  // Admin: tudo. Prestador: só as próprias
  const q =
    params.role === 'ADMIN'
      ? query(ref, orderBy('deadline', 'asc'))
      : query(ref, where('providerUid', '==', params.uid), orderBy('deadline', 'asc'));

  const snap = await getDocs(q);

  return snap.docs.map((d) => {
    const x = d.data() as any;
    return {
      id: d.id,
      projectId: x.projectId || '',
      client: x.client || '',
      project: x.project || '',
      title: x.title || '',
      deadline: x.deadline || '',
      status: x.status || 'PENDENTE',
      priority: x.priority || 'MEDIA',
      provider: x.provider || '',
      providerUid: x.providerUid,
      description: x.description || '',
      checklist: Array.isArray(x.checklist) ? x.checklist : [],
      attachments: Array.isArray(x.attachments) ? x.attachments : [],
      comments: Array.isArray(x.comments) ? x.comments : [],
    };
  });
}

export async function createProject(input: {
  client: string;
  name: string;
  manager: string;
  managerUid?: string;
  memberUids: string[];
}): Promise<void> {
  await addDoc(collection(db, 'projects'), {
    client: input.client,
    name: input.name,
    manager: input.manager,
    managerUid: input.managerUid || null,
    memberUids: input.memberUids,
    status: 'EM_ANDAMENTO',
    completionRate: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function createDelivery(input: {
  projectId: string;
  client: string;
  project: string;
  title: string;
  description: string;
  deadline: string; // YYYY-MM-DD
  priority: 'BAIXA' | 'MEDIA' | 'ALTA';
  provider: string;
  providerUid: string;
}): Promise<void> {
  await addDoc(collection(db, 'deliveries'), {
    projectId: input.projectId,
    client: input.client,
    project: input.project,
    title: input.title,
    description: input.description,
    deadline: input.deadline,
    priority: input.priority,
    status: 'PENDENTE',
    provider: input.provider,
    providerUid: input.providerUid,
    checklist: [],
    attachments: [],
    comments: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateDeliveryStatus(deliveryId: string, status: Status): Promise<void> {
  await updateDoc(doc(db, 'deliveries', deliveryId), {
    status,
    updatedAt: serverTimestamp(),
  });
}
