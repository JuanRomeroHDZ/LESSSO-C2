// frontend/src/core/store/authStore.ts
import { create } from 'zustand';

interface AuthState {
  token: string | null;
  username: string | null;
  isAuthenticated: boolean;
  
  login: (token: string, username: string) => void;
  logout: () => void;
}

// Intentamos recuperar la sesión anterior del localStorage de Tauri/Web
const savedToken = localStorage.getItem('c2_token');
const savedUsername = localStorage.getItem('c2_username');

export const useAuthStore = create<AuthState>((set) => ({
  token: savedToken,
  username: savedUsername,
  isAuthenticated: !!savedToken,

  login: (token: string, username: string) => {
    localStorage.setItem('c2_token', token);
    localStorage.setItem('c2_username', username);
    set({ token, username, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('c2_token');
    localStorage.removeItem('c2_username');
    set({ token: null, username: null, isAuthenticated: false });
  },
}));
