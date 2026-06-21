"use client";

import React, { useState } from "react";
import { Clock, Edit2, Check, X, Power, AlertTriangle } from "lucide-react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

// Service map
const SERVICE_NAMES = {
  22: "SSH",
  80: "HTTP",
  443: "HTTPS",
  3000: "Open WebUI",
  8188: "ComfyUI",
  11434: "Ollama"
};

function getRelativeTimeString(date) {
  if (!date) return "Nunca";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);

  if (diffMins < 1) return "hace un momento";
  if (diffMins < 60) return `hace ${diffMins}m`;
  if (diffHours < 24) return `hace ${diffHours}h`;
  
  return date.toLocaleDateString();
}

export default function NodeCard({ node, userId }) {
  const [isEditing, setIsEditing] = useState(false);
  const [alias, setAlias] = useState(node.custom_name || "");
  const [isSaving, setIsSaving] = useState(false);

  const [isEditingMac, setIsEditingMac] = useState(false);
  const [macAddress, setMacAddress] = useState(node.mac_address || "");
  const [isSavingMac, setIsSavingMac] = useState(false);

  const [waking, setWaking] = useState(false);

  const lastSeen = node.last_seen ? new Date(node.last_seen.seconds * 1000) : null;
  
  // Online if last_seen < 10 mins AND has at least one active port
  const tenMinutesAgo = 10 * 60 * 1000;
  const isOnline = lastSeen && (Date.now() - lastSeen.getTime() < tenMinutesAgo) && node.ports && node.ports.length > 0;

  // Primary label to display (Custom alias -> Hostname -> IP)
  const displayTitle = node.custom_name || node.hostname || node.ip;
  const hasSubLabel = node.custom_name || node.hostname;

  const handleSaveAlias = async () => {
    setIsSaving(true);
    try {
      const docRef = doc(db, "users", userId, "network_nodes", node.id);
      await updateDoc(docRef, {
        custom_name: alias.trim() || null
      });
      setIsEditing(false);
    } catch (error) {
      console.error("Error updating node custom name:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveMac = async () => {
    setIsSavingMac(true);
    // Format MAC Address to standard (remove separators, make uppercase, format as AA:BB:CC:DD:EE:FF)
    let cleaned = macAddress.toUpperCase().replace(/[^A-F0-9]/g, "");
    if (cleaned.length === 12) {
      const formatted = cleaned.match(/.{1,2}/g).join(":");
      try {
        const docRef = doc(db, "users", userId, "network_nodes", node.id);
        await updateDoc(docRef, {
          mac_address: formatted
        });
        setMacAddress(formatted);
        setIsEditingMac(false);
      } catch (error) {
        console.error("Error updating MAC Address:", error);
      }
    } else if (cleaned.length === 0) {
      try {
        const docRef = doc(db, "users", userId, "network_nodes", node.id);
        await updateDoc(docRef, {
          mac_address: null
        });
        setMacAddress("");
        setIsEditingMac(false);
      } catch (error) {
        console.error("Error clearing MAC Address:", error);
      }
    } else {
      alert("Por favor ingresa una dirección MAC válida de 12 dígitos hexadecimales.");
    }
    setIsSavingMac(false);
  };

  const handleWakeDevice = async () => {
    setWaking(true);
    try {
      const docRef = doc(db, "users", userId, "network_nodes", node.id);
      await updateDoc(docRef, {
        wake_requested: true,
        wake_status: "pending"
      });
      // Clear waking local loading indicator after 2 seconds
      setTimeout(() => setWaking(false), 2500);
    } catch (error) {
      console.error("Error triggering WoL:", error);
      setWaking(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      handleSaveAlias();
    } else if (e.key === "Escape") {
      setAlias(node.custom_name || "");
      setIsEditing(false);
    }
  };

  const handleMacKeyDown = (e) => {
    if (e.key === "Enter") {
      handleSaveMac();
    } else if (e.key === "Escape") {
      setMacAddress(node.mac_address || "");
      setIsEditingMac(false);
    }
  };

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 bg-white dark:bg-black transition-colors duration-200 flex flex-col justify-between min-h-[220px] hover:border-red-600 dark:hover:border-red-500 group relative">
      
      <div>
        {/* Header Title & Status */}
        <div className="flex items-start justify-between mb-1 gap-2">
          
          <div className="flex-grow min-w-0">
            {isEditing ? (
              <div className="flex items-center gap-1 mt-0.5">
                <input
                  type="text"
                  value={alias}
                  onChange={(e) => setAlias(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isSaving}
                  placeholder="Ej. Mi PC, Router..."
                  className="w-full px-2 py-0.5 text-xs border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black text-zinc-950 dark:text-zinc-50 rounded focus:outline-none focus:border-red-600 dark:focus:border-red-500 font-mono"
                  autoFocus
                />
                <button 
                  onClick={handleSaveAlias}
                  disabled={isSaving}
                  className="p-1 border border-zinc-200 dark:border-zinc-800 text-emerald-600 dark:text-emerald-500 hover:bg-zinc-50 dark:hover:bg-zinc-900 rounded cursor-pointer"
                >
                  <Check className="w-3 h-3" />
                </button>
                <button 
                  onClick={() => {
                    setAlias(node.custom_name || "");
                    setIsEditing(false);
                  }}
                  disabled={isSaving}
                  className="p-1 border border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-900 rounded cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 group/title">
                <h3 className="font-mono text-sm font-bold tracking-tight text-zinc-950 dark:text-zinc-50 truncate">
                  {displayTitle}
                </h3>
                <button
                  onClick={() => {
                    setAlias(node.custom_name || "");
                    setIsEditing(true);
                  }}
                  className="opacity-0 group-hover:opacity-100 group-hover/title:opacity-100 p-0.5 text-zinc-400 hover:text-red-600 dark:hover:text-red-500 transition cursor-pointer animate-fade-in"
                  title="Editar alias"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
          
          {/* Online/Offline Status */}
          <div className="flex items-center gap-1.5 px-2 py-0.5 border border-zinc-200 dark:border-zinc-800 rounded text-[9px] font-mono uppercase tracking-wider font-semibold shrink-0">
            <span className={`w-1.5 h-1.5 rounded-full ${
              isOnline 
                ? "bg-emerald-500 animate-pulse-green" 
                : "bg-red-500 animate-pulse-red"
            }`} />
            <span className="text-zinc-500 dark:text-zinc-400">
              {isOnline ? "online" : "offline"}
            </span>
          </div>
        </div>

        {/* IP and Hostname info */}
        {hasSubLabel && (
          <div className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500 mb-1">
            {node.ip} {node.custom_name && node.hostname && `(${node.hostname})`}
          </div>
        )}

        {/* Seen info */}
        <div className="flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400 font-mono mb-3">
          <Clock className="w-3 h-3" />
          <span>visto: {getRelativeTimeString(lastSeen)}</span>
        </div>

        {/* MAC Address Section */}
        <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 flex items-center gap-1 mb-4">
          <span className="text-[10px] uppercase font-bold text-zinc-400 dark:text-zinc-500">MAC:</span>
          {isEditingMac ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={macAddress}
                onChange={(e) => setMacAddress(e.target.value)}
                onKeyDown={handleMacKeyDown}
                disabled={isSavingMac}
                placeholder="AABBCCDDEEFF"
                maxLength={17}
                className="px-1.5 py-0.5 text-[10px] border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black rounded focus:outline-none focus:border-red-600 dark:focus:border-red-500 font-mono w-28"
                autoFocus
              />
              <button
                onClick={handleSaveMac}
                disabled={isSavingMac}
                className="p-0.5 border border-zinc-200 dark:border-zinc-800 text-emerald-600 dark:text-emerald-500 hover:bg-zinc-50 dark:hover:bg-zinc-900 rounded cursor-pointer"
              >
                <Check className="w-2.5 h-2.5" />
              </button>
              <button
                onClick={() => {
                  setMacAddress(node.mac_address || "");
                  setIsEditingMac(false);
                }}
                disabled={isSavingMac}
                className="p-0.5 border border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-900 rounded cursor-pointer"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 group/mac">
              <span className="text-zinc-700 dark:text-zinc-300 font-semibold">
                {node.mac_address || "Sin configurar"}
              </span>
              <button
                onClick={() => {
                  setMacAddress(node.mac_address || "");
                  setIsEditingMac(true);
                }}
                className="opacity-0 group-hover:opacity-100 group-hover/mac:opacity-100 p-0.5 text-zinc-400 hover:text-red-600 dark:hover:text-red-500 transition cursor-pointer"
                title="Editar MAC"
              >
                <Edit2 className="w-2.5 h-2.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Footer (WOL button OR ports list) */}
      <div className="mt-2 space-y-4">
        
        {/* Active Ports List */}
        <div>
          <div className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-2 font-mono">
            puertos / servicios
          </div>
          {node.ports && node.ports.length > 0 ? (
            <div className="space-y-1">
              {node.ports.map((port) => {
                const serviceName = (node.services && node.services[port]) || SERVICE_NAMES[port] || "Servicio Desconocido";
                const isFallback = node.services_fallback && node.services_fallback[port] === true;

                return (
                  <div 
                    key={port} 
                    className="flex items-center gap-2 text-xs font-mono text-zinc-700 dark:text-zinc-300"
                  >
                    <span className="text-red-650 dark:text-red-500 font-bold min-w-[42px] border-r border-zinc-200 dark:border-zinc-800 pr-1.5 text-right font-mono">
                      {port}
                    </span>
                    <span className="text-zinc-800 dark:text-zinc-200 font-medium flex items-center gap-1.5">
                      {serviceName}
                      {isFallback && (
                        <AlertTriangle 
                          className="w-3.5 h-3.5 text-amber-500 animate-pulse" 
                          title="Este servicio no respondió a la petición de título. Se está mostrando el valor predeterminado." 
                        />
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-1 py-1 text-xs text-zinc-400 dark:text-zinc-500 italic font-mono">
              <span>sin servicios activos</span>
            </div>
          )}
        </div>

        {/* Wake-on-LAN Button (only when offline) */}
        {!isOnline && (
          <div className="pt-2 border-t border-dashed border-zinc-200 dark:border-zinc-800">
            {node.mac_address ? (
              <button
                onClick={handleWakeDevice}
                disabled={waking || node.wake_requested}
                className="w-full py-2 bg-zinc-50 hover:bg-red-50 text-zinc-700 hover:text-red-600 dark:bg-zinc-950 dark:hover:bg-red-950/20 dark:text-zinc-300 dark:hover:text-red-500 border border-zinc-200 dark:border-zinc-800 hover:border-red-300 dark:hover:border-red-900/40 rounded text-[10px] font-bold font-mono transition-all duration-150 uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Power className="w-3.5 h-3.5" />
                <span>
                  {waking || node.wake_requested
                    ? "Enviando Señal..."
                    : node.wake_status === "sent"
                    ? "Señal Enviada!"
                    : "Encender Equipo"}
                </span>
              </button>
            ) : (
              <div className="text-[9px] text-zinc-400 dark:text-zinc-500 font-mono text-center uppercase tracking-wide py-1.5 border border-dashed border-zinc-200 dark:border-zinc-800 rounded">
                Configura MAC para encender
              </div>
            )}
          </div>
        )}

      </div>

    </div>
  );
}
