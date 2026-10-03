import { useEffect, useState } from 'react';
import { useScanStore } from './core/store/useScanStore';
import { useUiStore } from './core/store/uiStore';
import { useAuthStore } from './core/store/authStore';  

import { TerminalPanel } from './features/scanner/TerminalPanel';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { Footer } from './components/layout/Footer';
import { WorkspaceRouter } from './components/layout/WorkspaceRouter';
import { TacticalTodo } from './components/layout/TacticalTodo';

type WorkspaceType = 'recon' | 'topo' | 'inventory' | 'fuzz' | 'arsenal' | 'cerebro' | 'intel' | 'reports';

function LoginScreen() {
  const [isSetupMode, setIsSetupMode] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const login = useAuthStore(state => state.login);

  // Función para cambiar de modo limpiando los datos para evitar confusiones
  const toggleMode = () => {
    setIsSetupMode(!isSetupMode);
    setError('');
    setPassword(''); // Limpiamos el password por seguridad
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSetupMode) {
        // --- MODO CREAR USUARIO MAESTRO ---
        const response = await fetch('http://localhost:8001/api/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },

          body: JSON.stringify({ username, password }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.detail || 'Error al crear el usuario. ¿Ya existe uno?');
        }
        
        setIsSetupMode(false);
        setPassword(''); // Obligamos a que ponga la clave de nuevo para loguearse
        setError('¡Operador creado con éxito! Por favor, inicia sesión.');
      } else {
        // --- MODO LOGIN NORMAL ---
        const formData = new URLSearchParams();
        formData.append('username', username);
        formData.append('password', password);

        const response = await fetch('http://localhost:8001/api/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.detail || 'Credenciales inválidas');
        }

        login(data.access_token, username);
      }
    } catch (err: any) {
      // Si el backend no está corriendo, fetch arrojará un TypeError (Failed to fetch)
      if (err.message === 'Failed to fetch') {
          setError('No se pudo conectar con el motor. ¿Está corriendo el contenedor Docker en el puerto 8001?');
      } else {
          setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-[#0b1120] text-slate-200 font-mono">
      <div className="w-full max-w-md p-8 border border-slate-700 rounded-lg bg-[#0f172a] shadow-2xl relative">
        
        <button  
            type="button"
            onClick={toggleMode}
            className="absolute top-4 right-4 text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
            {isSetupMode ? "Volver al Login" : "Setup Inicial"}
        </button>

        <h1 className="text-2xl font-bold text-red-500 mb-6 flex items-center gap-2">
          <span className="text-3xl">☠</span> {isSetupMode ? 'LESSSO C2 - INIT' : 'LESSSO C2'}
        </h1>
        
        {error && (
            <div className={`mb-4 p-3 border rounded ${error.includes('éxito') ? 'bg-green-900/50 border-green-500 text-green-200' : 'bg-red-900/50 border-red-500 text-red-200'}`}>
                {error}
            </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">
                {isSetupMode ? 'Nuevo Operador' : 'Operador'}
            </label>
            <input  
              type="text"  
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-[#1e293b] border border-slate-600 rounded p-2 text-white focus:border-red-500 focus:outline-none"
              required  
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">
                {isSetupMode ? 'Nueva Clave' : 'Clave de Acceso'}
            </label>
            <input  
              type="password"  
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#1e293b] border border-slate-600 rounded p-2 text-white focus:border-red-500 focus:outline-none"
              required  
            />
          </div>
          <button  
            type="submit"  
            disabled={loading}
            className="w-full py-2 px-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded transition-colors disabled:opacity-50 mt-4"
          >
            {loading ? 'PROCESANDO...' : isSetupMode ? 'CREAR OPERADOR MAESTRO' : 'INICIAR ENLACE'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  const { theme, activeWorkspace, isTerminalOpen } = useUiStore();
  const { checkVpnStatus, pingBackend } = useScanStore();
  
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) return;

    checkVpnStatus();
    const vpnInterval = setInterval(checkVpnStatus, 5000);
    
    pingBackend();
    const interval = setInterval(() => pingBackend(), 30_000);
    
    return () => {
      clearInterval(vpnInterval);
      clearInterval(interval);
    };
  }, [checkVpnStatus, pingBackend, isAuthenticated]);

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <div className={`${theme} flex flex-col h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-200 font-sans transition-colors duration-200 print:bg-white print:text-black`}>
      <Header />

      <div className="flex flex-1 overflow-hidden min-h-0 relative print:h-auto print:overflow-visible">
        <Sidebar />

        <main className="flex-1 flex flex-col min-w-0 relative print:h-auto print:overflow-visible">
          
          <WorkspaceRouter activeWorkspace={activeWorkspace as WorkspaceType} />

          <TacticalTodo />

          <div   
            className={`bg-[#0b1120] transition-all duration-300 ease-in-out z-40 print:hidden flex flex-col shrink-0 min-h-0 ${
              isTerminalOpen ? 'h-[35vh] border-t border-slate-300 dark:border-slate-700' : 'h-0 border-transparent overflow-hidden'
            }`}
          >
            <TerminalPanel />
          </div>

        </main>
      </div>

      <Footer />
    </div>
  );
}
