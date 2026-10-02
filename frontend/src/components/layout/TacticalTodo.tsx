import { useState, useRef, useEffect } from 'react';
import { useUiStore } from '../../core/store/uiStore';
import { ListTodo, X, Plus, Trash2, CheckCircle2, Circle } from 'lucide-react';
import { cn } from '../../lib/utils';

export function TacticalTodo() {
  const { todoPanelOpen, toggleTodoPanel, todos, addTodo, toggleTodo, removeTodo, clearTodos } = useUiStore();
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (todoPanelOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [todoPanelOpen]);

  const handleAdd = () => {
    if (!inputValue.trim()) return;
    addTodo(inputValue.trim());
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAdd();
  };

  const completedCount = todos.filter(t => t.done).length;
  const progress = todos.length === 0 ? 0 : Math.round((completedCount / todos.length) * 100);

  return (
    <>
      {/* Botón Flotante Lateral (Solo visible si el panel está cerrado) */}
      {!todoPanelOpen && (
        <button
          onClick={toggleTodoPanel}
          className="absolute right-0 top-1/3 -translate-y-1/2 bg-indigo-600 hover:bg-indigo-500 text-white p-3 rounded-l-xl shadow-lg border-y border-l border-indigo-500/50 z-40 transition-all flex items-center justify-center print:hidden"
          title="Abrir Tareas Tácticas"
        >
          <ListTodo size={20} />
        </button>
      )}

      {/* Panel Deslizable */}
      <div
        className={cn(
          "absolute right-0 top-0 h-full w-80 sm:w-96 bg-slate-50 dark:bg-[#060a13] border-l border-slate-200 dark:border-slate-800 shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out print:hidden",
          todoPanelOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0b1120] shrink-0">
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
            <ListTodo size={18} />
            <h2 className="text-xs font-black uppercase tracking-widest">To-Do Táctico</h2>
          </div>
          <button onClick={toggleTodoPanel} className="text-slate-400 hover:text-rose-500 transition-colors p-1">
            <X size={18} />
          </button>
        </div>

        {/* Progress Bar */}
        {todos.length > 0 && (
          <div className="px-4 py-3 bg-indigo-50/50 dark:bg-indigo-900/10 border-b border-indigo-100 dark:border-indigo-900/30 shrink-0">
            <div className="flex justify-between text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1.5">
              <span>Progreso del ataque</span>
              <span className="text-indigo-600 dark:text-indigo-400">{progress}% ({completedCount}/{todos.length})</span>
            </div>
            <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {/* Input Area */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ej: Revisar NFS en 10.0.0.12..."
              className="flex-1 bg-white dark:bg-[#0b1120] border border-slate-300 dark:border-slate-700 text-xs px-3 py-2 rounded-md outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 dark:text-slate-200 shadow-sm"
            />
            <button onClick={handleAdd} className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-md shadow-sm transition-colors flex items-center justify-center">
              <Plus size={16} />
            </button>
          </div>
        </div>

        {/* Lista de Tareas */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
          {todos.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-50 space-y-3">
              <ListTodo size={40} />
              <p className="text-[10px] font-bold uppercase tracking-widest text-center">Sin tareas pendientes<br/>Añade vectores de ataque</p>
            </div>
          ) : (
            todos.map(todo => (
              <div key={todo.id} className={cn(
                "group flex items-start gap-3 p-3 rounded-lg border transition-all",
                todo.done 
                  ? "bg-slate-50 dark:bg-[#020617] border-slate-200 dark:border-slate-800 opacity-60" 
                  : "bg-white dark:bg-[#0b1120] border-slate-200 dark:border-slate-700 shadow-sm hover:border-indigo-500/50"
              )}>
                <button onClick={() => toggleTodo(todo.id)} className={cn("mt-0.5 shrink-0 transition-colors", todo.done ? "text-indigo-500" : "text-slate-300 dark:text-slate-600 hover:text-indigo-400")}>
                  {todo.done ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                </button>
                <span className={cn("flex-1 text-[11px] leading-relaxed break-words", todo.done ? "text-slate-500 line-through" : "text-slate-700 dark:text-slate-200")}>
                  {todo.text}
                </span>
                <button onClick={() => removeTodo(todo.id)} className="text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer Actions */}
        {todos.length > 0 && (
          <div className="p-3 border-t border-slate-200 dark:border-slate-800 shrink-0 bg-slate-50 dark:bg-[#020617]">
            <button onClick={clearTodos} className="w-full py-2 text-[10px] font-bold uppercase tracking-widest text-rose-500 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 rounded-md transition-colors">
              Limpiar Tareas
            </button>
          </div>
        )}
      </div>
    </>
  );
}
