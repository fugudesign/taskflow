import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './hooks/useAuth';
import ProtectedRoute from './components/ProtectedRoute';
import TasksPage from './components/TasksPage';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ProtectedRoute>
          <TasksPage />
        </ProtectedRoute>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
