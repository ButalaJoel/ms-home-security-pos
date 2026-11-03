
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

// The last signed-in user is remembered on this device so the till still
// opens when there is no internet (offline sales). The server keeps checking
// the real session for everything it saves.
const CACHED_USER_KEY = "ms-pos-signed-in-user";

function readCachedUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(CACHED_USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function writeCachedUser(user: AuthUser | null) {
  try {
    if (user) localStorage.setItem(CACHED_USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(CACHED_USER_KEY);
  } catch {
    // Storage unavailable: offline opening just won't be possible.
  }
}

interface ApiResponse {
  success: boolean;
  message?: string;
  user?: AuthUser;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    let response: Response;
    try {
      response = await apiFetch("/api/auth/me");
    } catch {
      // No connection: keep working as the last signed-in user (offline mode).
      setUser(readCachedUser());
      setLoading(false);
      return;
    }

    try {
      const data = (await response.json()) as ApiResponse;

      if (!response.ok || !data.success || !data.user) {
        // A server error while it starts up is not a sign-out.
        if (response.status >= 500 && readCachedUser()) {
          setUser(readCachedUser());
          return;
        }
        writeCachedUser(null);
        setUser(null);
        return;
      }

      writeCachedUser(data.user);
      setUser(data.user);
    } catch {
      setUser(readCachedUser());
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

      writeCachedUser(data.user);
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

  writeCachedUser(null);
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
