import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useApi.ts";

const LINKS = [
  { to: "/", label: "Дашборд" },
  { to: "/services", label: "Службы" },
  { to: "/incidents", label: "Инциденты" },
  { to: "/settings", label: "Настройки" },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();

  // Always leave the page, even if the server call fails (e.g. the session
  // already expired). Otherwise the user would stay on a protected page.
  const onLogout = async () => {
    try {
      await logout();
    } catch {
      sessionStorage.removeItem("bcc_role");
    }
    navigate("/login", { replace: true });
  };

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
          <button onClick={onLogout} className="text-slate-400 hover:text-white">
            Выйти
          </button>
        </nav>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
