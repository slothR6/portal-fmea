export type UserRole = "ADMIN" | "PRESTADOR";
export type UserStatus = "PENDING" | "ACTIVE" | "REJECTED" | "DELETED";

export type Status = "PENDENTE" | "REVISAO" | "AJUSTES" | "APROVADO" | "ATRASADO";
export type Priority = "BAIXA" | "MEDIA" | "ALTA";

export type ViewState =
  | "LOGIN"
  | "SIGNUP"
  | "PENDING"
  | "DASHBOARD"
  | "PROJETOS"
  | "DETALHE_PROJETO"
  | "ENTREGAS"
  | "DETALHE_ENTREGA"
  | "USUARIOS"
  | "PRESTADORES"
  | "PERFIL";

export interface UserProfile {
  uid: string;
  email: string;
  name: string;

  role: UserRole;
  status: UserStatus;
  active: boolean;

  pixKey?: string;
  photoURL?: string;

  createdAt: number;
  approvedAt?: number;
  deletedAt?: number;
}

export interface Comment {
  id: string;
  authorUid: string;
  authorName: string;
  date: string;
  text: string;
  createdAt: number;
}

export interface Attachment {
  id: string;
  name: string;
  size: string;
  date: string;
  uploaderUid: string;
  uploaderName: string;
  url?: string;
  storagePath?: string;
  createdAt: number;
}

export interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
}

export interface Delivery {
  id: string;
  projectId: string;
  client: string;
  project: string;

  title: string;
  deadline: string;
  status: Status;
  priority: Priority;

  provider: string;
  providerUid?: string;

  description: string;
  checklist: ChecklistItem[];

  // MVP sem storage: attachments pode ficar vazio.
  attachments: Attachment[];
  comments: Comment[];

  createdAt: number;
  deletedAt?: number;
}

export interface Project {
  id: string;
  client: string;
  name: string;
  description?: string; // NOVO CAMPO
  manager: string;
  managerUid: string;
  memberUids: string[];
  status: "EM_ANDAMENTO" | "CONCLUIDO" | "PAUSADO";
  completionRate: number;
  createdAt: number;
  updatedAt?: number;
  deletedAt?: number;
}

export type NotifType = "COMMENT" | "SUBMITTED" | "APPROVED" | "ADJUST_REQUESTED";

export interface AppNotification {
  id: string;
  toUid: string;
  type: NotifType;
  title: string;
  projectId?: string;
  deliveryId?: string;
  createdAt: number;
  read: boolean;
}

export interface ProviderSafetyDoc {
  id: string;
  title: string;        // ex: NR-35
  issuedAt: string;     // YYYY-MM-DD
  expiresAt?: string;   // YYYY-MM-DD
  notes?: string;
  externalUrl?: string; // link (Drive/OneDrive) enquanto sem Storage
  createdAt: number;
  createdByUid: string;
  createdByName: string;
}
