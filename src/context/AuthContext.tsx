import { createContext, useEffect, useState, ReactNode } from 'react';
import { User, UserRole } from '@/types';
import { signInAnonymously } from 'firebase/auth';
import { auth } from '@/firebase';

interface AuthContextType {
  user: User | null;
  login: (username: string, role: UserRole) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);

  // IMPORTANT:
  // This project uses a local (non-Firebase) login state for UI, but Firebase Storage/Firestore
  // security rules commonly require `request.auth != null`.
  // To make Learning Module PDF upload/view work in dev without touching the PDF extraction system,
  // we sign in anonymously to Firebase in the background.
  useEffect(() => {
    if (auth.currentUser) return;
    signInAnonymously(auth).catch((e) => {
      // If anonymous auth is disabled in Firebase console, uploads will still fail with 401/403
      // (often surfacing as a CORS/preflight error). We'll keep UI running either way.
      console.warn('[Auth] Anonymous Firebase auth failed:', e instanceof Error ? e.message : e);
    });
  }, []);

  const login = (username: string, role: UserRole) => {
    setUser({
      id: `user-${Date.now()}`,
      name: username,
      role,
    });
  };

  const logout = () => {
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
