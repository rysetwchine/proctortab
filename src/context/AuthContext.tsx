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
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem("user");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        return {
          id: parsed.uid || parsed.id || '',
          uid: parsed.uid || parsed.id || '',
          name: parsed.name || '',
          role: parsed.role || 'student',
          studentNumber: parsed.studentNumber || '',
          course: parsed.course || '',
          year: parsed.year || '',
        } as any;
      } catch (e) {
        console.error('Failed to parse user from localStorage', e);
      }
    }
    return null;
  });

  // Keep AuthContext user in sync with localStorage updates in real time
  useEffect(() => {
    const handleStorageChange = () => {
      const stored = localStorage.getItem("user");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setUser({
            id: parsed.uid || parsed.id || '',
            uid: parsed.uid || parsed.id || '',
            name: parsed.name || '',
            role: parsed.role || 'student',
            studentNumber: parsed.studentNumber || '',
            course: parsed.course || '',
            year: parsed.year || '',
          } as any);
        } catch {
          setUser(null);
        }
      } else {
        setUser(null);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    const interval = setInterval(handleStorageChange, 1000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((firebaseUser) => {
      if (!firebaseUser) {
        const stored = localStorage.getItem("user");
        if (!stored) {
          signInAnonymously(auth).catch((e) => {
            console.warn('[Auth] Anonymous Firebase auth failed:', e instanceof Error ? e.message : e);
          });
        }
      }
    });
    return unsubscribe;
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
