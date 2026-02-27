import React, { useState, FormEvent } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask } from '../hooks/useTasks';

export default function TasksPage() {
  const { user, logout } = useAuth();
  const { data: tasks, isLoading } = useTasks();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const [title, setTitle] = useState('');

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await createTask.mutateAsync({ title: title.trim() });
    setTitle('');
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.heading}>TaskFlow</h1>
        <div style={styles.userBar}>
          <span style={styles.userName}>{user?.name}</span>
          <button onClick={logout} style={styles.logoutBtn}>Déconnexion</button>
        </div>
      </header>

      <form onSubmit={handleCreate} style={styles.form}>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Nouvelle tâche…"
          style={styles.input}
        />
        <button type="submit" disabled={createTask.isPending} style={styles.addBtn}>
          Ajouter
        </button>
      </form>

      {isLoading && <p style={styles.info}>Chargement…</p>}

      <ul style={styles.list}>
        {tasks?.map((task) => (
          <li key={task.id} style={styles.item}>
            <input
              type="checkbox"
              checked={task.done}
              onChange={() => updateTask.mutate({ id: task.id, done: !task.done })}
              style={styles.checkbox}
            />
            <span style={{ ...styles.taskTitle, textDecoration: task.done ? 'line-through' : 'none', opacity: task.done ? 0.5 : 1 }}>
              {task.title}
            </span>
            <button onClick={() => deleteTask.mutate(task.id)} style={styles.deleteBtn}>✕</button>
          </li>
        ))}
      </ul>

      {tasks?.length === 0 && !isLoading && (
        <p style={styles.info}>Aucune tâche pour l'instant.</p>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { maxWidth: 600, margin: '0 auto', padding: '32px 16px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  heading: { margin: 0, fontSize: 24, fontWeight: 700 },
  userBar: { display: 'flex', alignItems: 'center', gap: 12 },
  userName: { fontSize: 14, color: '#555' },
  logoutBtn: { padding: '6px 12px', fontSize: 13, background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' },
  form: { display: 'flex', gap: 8, marginBottom: 24 },
  input: { flex: 1, padding: '8px 12px', fontSize: 14, border: '1px solid #ccc', borderRadius: 4 },
  addBtn: { padding: '8px 16px', fontSize: 14, fontWeight: 600, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' },
  list: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 },
  item: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 6 },
  checkbox: { width: 16, height: 16, cursor: 'pointer' },
  taskTitle: { flex: 1, fontSize: 14 },
  deleteBtn: { background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 14, lineHeight: 1 },
  info: { textAlign: 'center', color: '#9ca3af', fontSize: 14 },
};
