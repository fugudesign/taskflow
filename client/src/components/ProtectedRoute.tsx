import React, { ReactNode, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import LoginForm from './LoginForm';
import RegisterForm from './RegisterForm';

interface Props {
  children: ReactNode;
}

export default function ProtectedRoute({ children }: Props) {
  const { isAuthenticated } = useAuth();
  const [view, setView] = useState<'login' | 'register'>('login');

  if (!isAuthenticated) {
    return view === 'login'
      ? <LoginForm onSwitchToRegister={() => setView('register')} />
      : <RegisterForm onSwitchToLogin={() => setView('login')} />;
  }

  return <>{children}</>;
}
