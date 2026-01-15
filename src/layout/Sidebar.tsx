import React from "react";
import Logo from "../components/Logo";
import { UserRole, ViewState } from "../types";

export default function Sidebar({
  role,
  userName,
  view,
  unread,
  onNav,
  onLogout,
}: {
  role: UserRole;
  userName: string;
  view: ViewState;
  unread: number;
  onNav: (v: ViewState) => void;
  onLogout: () => void;
}) {
  const NavItem = ({
    id,
    label,
    icon,
    badge,
  }: {
    id: ViewState;
    label: string;
    icon: string;
    badge?: number;
  }) => (
    <button
      onClick={() => onNav(id)}
      className={`w-full flex items-center gap-4 px-6 py-4 rounded-xl transition-all text-sm font-black uppercase tracking-widest ${
        view === id ? "bg-[#1895BD] text-white shadow-lg" : "text-gray-500 hover:bg-gray-50"
      }`}
    >
      <span className="text-xl">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {badge && badge > 0 ? (
        <span className="px-2 py-1 text-[10px] rounded-full bg-red-100 text-red-600 font-black">
          {badge}
        </span>
      ) : null}
    </button>
  );

  return (
    <aside className="hidden md:flex flex-col w-80 bg-white border-r border-gray-100 fixed inset-y-0 z-50">
      <div className="p-10 mb-6 flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-white border border-gray-100 shadow-sm flex items-center justify-center">
          <Logo size={36} />
        </div>
        <div>
          <h2 className="text-[#1895BD] text-2xl font-black uppercase tracking-tighter">FMEA</h2>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            Portal de Gestão
          </p>
        </div>
      </div>

      <nav className="flex-1 px-6 space-y-2">
        <NavItem id="DASHBOARD" label="Dashboard" icon="⚡" badge={unread} />
        <NavItem id="PROJETOS" label="Projetos" icon="📂" />
        <NavItem id="ENTREGAS" label={role === "ADMIN" ? "Entregas" : "Minhas Entregas"} icon="📦" />
        {role === "ADMIN" ? <NavItem id="USUARIOS" label="Usuários" icon="🧩" /> : null}
        {role === "ADMIN" ? <NavItem id="PRESTADORES" label="Prestadores" icon="👷" /> : null}
        <NavItem id="PERFIL" label="Meu Perfil" icon="👤" />
      </nav>

      <div className="p-8 mt-auto border-t border-gray-50 bg-gray-50/50">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-full bg-[#D6DCE5] border-2 border-white shadow-sm flex items-center justify-center text-[#1895BD] font-black">
            {userName.charAt(0)}
          </div>
          <div className="flex-1 truncate">
            <p className="text-sm font-black text-gray-800 truncate">{userName}</p>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{role}</p>
          </div>
        </div>

        <button
          onClick={onLogout}
          className="w-full text-center py-3 text-red-500 text-xs font-black uppercase tracking-widest hover:bg-red-50 rounded-xl transition-colors"
        >
          Encerrar Sessão
        </button>
      </div>
    </aside>
  );
}
