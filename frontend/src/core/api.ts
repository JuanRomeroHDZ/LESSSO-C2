// frontend/src/core/api.ts
import { useAuthStore } from './store/authStore';

// ¡CORREGIDO: Apuntando al puerto 8001!
const BASE_URL = 'http://localhost:8001/api';

export async function apiFetch(endpoint: string, options: RequestInit = {}) {
  const token = useAuthStore.getState().token;
  const headers = new Headers(options.headers || {});
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  if (!headers.has('Content-Type') && !(options.body instanceof FormData) && !(options.body instanceof URLSearchParams)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    useAuthStore.getState().logout();
    throw new Error('Sesión expirada o inválida. Por favor, inicie sesión nuevamente.');
  }

  let data;
  try {
    data = await response.json();
  } catch (e) {
    data = null;
  }

  if (!response.ok) {
    throw new Error(data?.detail || `Error HTTP: ${response.status}`);
  }

  return data;
}
