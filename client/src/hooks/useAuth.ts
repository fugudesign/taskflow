import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  createElement,
} from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/client';

interface User {
  id: string;
  email: string;
  name: string;
}

interface LoginCredentials {
  email: string;
  password: string;
}

interface RegisterData {
  name: string;
  email: string;
  password: string;
}

interface AuthResponse {
  token: string;
  user: User;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  isLoggingIn: boolean;
  isRegistering: boolean;
  loginError: Error | null;
  registerError: Error | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('user');
    return stored ? (JSON.parse(stored) as User) : null;
  });
  const queryClient = useQueryClient();

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    queryClient.clear();
  };

  useEffect(() => {
    window.addEventListener('auth:logout', logout);
    return () => window.removeEventListener('auth:logout', logout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loginMutation = useMutation({
    mutationFn: (credentials: LoginCredentials) =>
      apiClient.post<AuthResponse>('/auth/login', credentials).then((r) => r.data),
    onSuccess: ({ token, user: u }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(u));
      setUser(u);
    },
  });

  const registerMutation = useMutation({
    mutationFn: (data: RegisterData) =>
      apiClient.post<AuthResponse>('/auth/register', data).then((r) => r.data),
    onSuccess: ({ token, user: u }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(u));
      setUser(u);
    },
  });

  return createElement(AuthContext.Provider, {
    value: {
      user,
      isAuthenticated: !!user,
      login: async (credentials) => { await loginMutation.mutateAsync(credentials); },
      register: async (data) => { await registerMutation.mutateAsync(data); },
      logout,
      isLoggingIn: loginMutation.isPending,
      isRegistering: registerMutation.isPending,
      loginError: loginMutation.error,
      registerError: registerMutation.error,
    },
    children,
  });
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
