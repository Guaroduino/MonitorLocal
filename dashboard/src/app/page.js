"use client";

import React, { useState, useEffect } from "react";
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut 
} from "firebase/auth";
import { auth } from "../lib/firebase";
import Login from "../components/Login";
import Dashboard from "../components/Dashboard";

const ADMIN_EMAIL_PLACEHOLDER = "coradogranadillo@gmail.com";

export default function Home() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [isDarkMode, setIsDarkMode] = useState(false); // Default to Light Mode

  // Read theme from localStorage on client-side mount
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark") {
      setIsDarkMode(true);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        if (currentUser.email === ADMIN_EMAIL_PLACEHOLDER) {
          setUser(currentUser);
          setAuthError("");
        } else {
          signOut(auth).then(() => {
            setUser(null);
            setAuthError(`El correo ${currentUser.email} no está autorizado para acceder a este dashboard.`);
          });
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setAuthError("");
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      prompt: 'select_account'
    });

    try {
      const result = await signInWithPopup(auth, provider);
      const loggedInUser = result.user;
      
      if (loggedInUser.email !== ADMIN_EMAIL_PLACEHOLDER) {
        await signOut(auth);
        setUser(null);
        setAuthError(`El correo ${loggedInUser.email} no está autorizado para acceder a este dashboard.`);
      }
    } catch (error) {
      console.error("Error during Google Sign-in:", error);
      if (error.code !== "auth/popup-closed-by-user") {
        setAuthError("Ocurrió un error al intentar iniciar sesión con Google. Reinténtalo.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    try {
      await signOut(auth);
      setUser(null);
      setAuthError("");
    } catch (error) {
      console.error("Error during Sign-out:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleDarkMode = () => {
    setIsDarkMode((prev) => {
      const next = !prev;
      localStorage.setItem("theme", next ? "dark" : "light");
      return next;
    });
  };

  // Render wrapper with dark mode styling classes
  return (
    <div className={isDarkMode ? "dark min-h-screen bg-black text-zinc-100" : "min-h-screen bg-white text-zinc-950"}>
      {loading && !user ? (
        <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-black text-zinc-950 dark:text-zinc-100">
          <div className="w-8 h-8 border-2 border-zinc-200 dark:border-zinc-800 border-t-red-600 dark:border-t-red-500 rounded-full animate-spin mb-4"></div>
          <p className="text-zinc-500 dark:text-zinc-400 text-xs font-mono">Cargando...</p>
        </div>
      ) : !user ? (
        <Login 
          onLogin={handleGoogleLogin} 
          error={authError} 
          loading={loading} 
        />
      ) : (
        <Dashboard 
          user={user} 
          onLogout={handleLogout} 
          isDarkMode={isDarkMode} 
          toggleDarkMode={toggleDarkMode}
        />
      )}
    </div>
  );
}
