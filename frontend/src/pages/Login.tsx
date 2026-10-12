import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useApi.ts";
import { ApiError } from "../api/client.ts";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(username, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось войти");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 p-6 border border-slate-800 rounded-lg">
        <h1 className="text-xl font-semibold">Bot Control Center</h1>
        <input
          className="w-full rounded bg-slate-800 px-3 py-2 text-sm"
          placeholder="имя пользователя"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
        />
        <input
          type="password"
          className="w-full rounded bg-slate-800 px-3 py-2 text-sm"
          placeholder="пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-emerald-600 py-2 text-sm font-medium disabled:opacity-50"
        >
          {submitting ? "Вход..." : "Войти"}
        </button>
      </form>
    </div>
  );
}
