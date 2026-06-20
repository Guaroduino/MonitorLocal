"use client";

import React from "react";
import { LogIn } from "lucide-react";

export default function Login({ onLogin, error, loading }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-black px-4 transition-colors duration-200">
      
      <div className="w-full max-w-sm border border-zinc-200 dark:border-zinc-800 rounded-xl p-8 bg-white dark:bg-black transition-colors duration-200">
        
        {/* Minimalist Logo/Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-lg border border-red-600 dark:border-red-500 flex items-center justify-center mb-4">
            <span className="text-xl font-bold font-mono text-red-600 dark:text-red-500">ml</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 font-mono">
            MonitorLocal
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 text-center font-mono">
            network services dashboard
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-lg text-xs text-red-800 dark:text-red-400 font-mono">
            <p className="font-bold mb-1">ACCESO DENEGADO</p>
            <p>{error}</p>
          </div>
        )}

        <div className="space-y-4">
          <button
            onClick={onLogin}
            disabled={loading}
            className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-500 disabled:opacity-50 text-white font-semibold rounded-lg text-sm transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer font-mono active:scale-[0.98]"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>INICIAR SESIÓN CON GOOGLE</span>
              </>
            )}
          </button>
          
          <div className="text-center pt-2">
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono uppercase tracking-wider">
              acceso de administrador
            </span>
          </div>
        </div>

      </div>
    </div>
  );
}
