
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { apiFetch } from "../lib/api";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "staff";
  photoUrl?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface ApiResponse {
  success: boolean;
  message?: string;
  user?: AuthUser;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const response = await apiFetch("/api/auth/me");
      const data = (await response.json()) as ApiResponse;

      if (!response.ok || !data.success || !data.user) {
        setUser(null);
        return;
      }

      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await apiFetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = (await response.json()) as ApiResponse;

      if (!response.ok || !data.success || !data.user) {
        throw new Error(data.message || "Unable to log in.");
      }

      setUser(data.user);
    },
    [],
  );


const logout = useCallback(async () => {
  const response = await apiFetch("/api/auth/logout", {
    method: "POST",
  });

  const data = (await response.json()) as ApiResponse;

  if (!response.ok || !data.success) {
    throw new Error(data.message || "Unable to log out. Please try again.");
  }

  setUser(null);
}, []);


  return (
    <AuthContext.Provider
      value={{ user, loading, login, logout, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}
