// src/types.ts
export type UserRole = "ADMIN" | "PRESTADOR";

export type UserStatus = "PENDING" | "ACTIVE" | "REJECTED" | "DELETED";

export type Status = "PENDENTE" | "REVISAO" | "AJUSTES" | "APROVADO" | "ATRASADO";
export type Priority = "BAIXA" | "MEDIA" | "ALTA";

export type SafetyDocType = "NR10" | "NR33" | "NR35" | "ASO" | "OUTRO";

export interface SafetyDoc {
  id: string;
  uid: string; // uid do prestador
  type: SafetyDocType;
  title: string;
  issueDate?: string; // yyyy-mm-dd
  expiryDate?: string; // yyyy-mm-dd
  url?: string; // link externo (Drive, OneDrive etc)
  notes?: string;
  createdAt: number;
  updatedAt?: number;
}
export interface Delivery {
  // ...
  managerUid?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  active: boolean;

  pixKey?: string;

  photoUrl?: string; // url externa ou photoURL do Google
  phone?: string;

  createdAt: number;
  updatedAt?: number;

  deletedAt?: number;
}

export interface Project {
  id: string;
  client: string;
  name: string;

  manager: string;
  managerUid: string;

  memberUids: string[]; // prestadores vinculados ao projeto

  status: Status;
  completionRate: number;

  createdAt: number;
  updatedAt?: number;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Attachment {
  id: string;
  name: string;
  url: string;
  createdAt: number;
}

export interface Comment {
  id: string;
  uid: string;
  author: string;
  message: string;
  createdAt: number;
}

export interface Delivery {
  id: string;
  projectId: string;

  client: string;
  project: string;

  title: string;
  description?: string;

  deadline?: string; // yyyy-mm-dd

  status: Status;
  priority: Priority;

  provider: string;
  providerUid: string;

  checklist: ChecklistItem[];
  attachments: Attachment[];
  comments: Comment[];

  createdAt: number;
  updatedAt?: number;
}

export interface AppNotification {
  id: string;
  uid: string;
  title: string;
  message: string;
  createdAt: number;
  read: boolean;
}

export type ViewState =
  | "LOGIN"
  | "SIGNUP"
  | "PENDING"
  | "DASHBOARD"
  | "USUARIOS"
  | "PRESTADORES"
  | "PROJETOS"
  | "ENTREGAS"
  | "DETALHE_PROJETO"
  | "DETALHE_ENTREGA"
  | "MEU_PERFIL";
