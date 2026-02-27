import React, { FormEvent, useState } from 'react';
import { useAuth } from '../hooks/useAuth';

interface Props {
  onSwitchToLogin: () => void;
}

export default function RegisterForm({ onSwitchToLogin }: Props) {
  const { register, isRegistering, registerError } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await register({ name, email, password });
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Inscription</h2>
      <form onSubmit={handleSubmit} style={styles.form}>
        <label style={styles.label}>
          Nom
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
            style={styles.input}
          />
        </label>
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
            minLength={8}
            autoComplete="new-password"
            style={styles.input}
          />
        </label>
        {registerError && (
          <p style={styles.error}>
            {(registerError as { response?: { data?: { error?: string } } })
              .response?.data?.error ?? 'Erreur lors de l\'inscription'}
          </p>
        )}
        <button type="submit" disabled={isRegistering} style={styles.button}>
          {isRegistering ? 'Inscription…' : 'Créer un compte'}
        </button>
      </form>
      <p style={styles.switchText}>
        Déjà un compte ?{' '}
        <button onClick={onSwitchToLogin} style={styles.linkButton}>
          Se connecter
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
  button: { padding: '10px 0', fontSize: 14, fontWeight: 600, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' },
  switchText: { marginTop: 16, textAlign: 'center', fontSize: 13 },
  linkButton: { background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', textDecoration: 'underline', fontSize: 13 },
};
