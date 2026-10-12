import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useApi.ts";

const LINKS = [
  { to: "/", label: "Дашборд" },
  { to: "/services", label: "Службы" },
  { to: "/incidents", label: "Инциденты" },
  { to: "/settings", label: "Настройки" },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { logout } = useAuth();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-800 px-6 py-3 flex items-center justify-between">
        <span className="font-semibold text-lg">Bot Control Center</span>
        <nav className="flex gap-4 text-sm">
          {LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={location.pathname === link.to ? "text-white" : "text-slate-400 hover:text-white"}
            >
              {link.label}
            </Link>
          ))}
          <button onClick={() => logout()} className="text-slate-400 hover:text-white">
            Выйти
          </button>
        </nav>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
