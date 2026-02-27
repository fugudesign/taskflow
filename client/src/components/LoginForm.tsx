import React, { FormEvent, useState } from 'react';
import { useAuth } from '../hooks/useAuth';

interface Props {
  onSwitchToRegister: () => void;
}

export default function LoginForm({ onSwitchToRegister }: Props) {
  const { login, isLoggingIn, loginError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await login({ email, password });
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Connexion</h2>
      <form onSubmit={handleSubmit} style={styles.form}>
        <label style={styles.label}>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            style={styles.input}
          />
        </label>
        <label style={styles.label}>
          Mot de passe
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            style={styles.input}
          />
        </label>
        {loginError && (
          <p style={styles.error}>
            {(loginError as { response?: { data?: { error?: string } } })
              .response?.data?.error ?? 'Identifiants invalides'}
          </p>
        )}
        <button type="submit" disabled={isLoggingIn} style={styles.button}>
          {isLoggingIn ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
      <p style={styles.switchText}>
        Pas encore de compte ?{' '}
        <button onClick={onSwitchToRegister} style={styles.linkButton}>
          S'inscrire
        </button>
      </p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { maxWidth: 400, margin: '80px auto', padding: 32, border: '1px solid #ddd', borderRadius: 8 },
  title: { marginBottom: 24, textAlign: 'center' },
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  label: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14, fontWeight: 500 },
  input: { padding: '8px 12px', fontSize: 14, border: '1px solid #ccc', borderRadius: 4 },
  error: { color: '#c0392b', fontSize: 13, margin: 0 },
  button: { padding: '10px 0', fontSize: 14, fontWeight: 600, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' },
  switchText: { marginTop: 16, textAlign: 'center', fontSize: 13 },
  linkButton: { background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', textDecoration: 'underline', fontSize: 13 },
};
