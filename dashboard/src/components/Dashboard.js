"use client";

import React, { useState, useEffect } from "react";
import { collection, onSnapshot, query, doc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import NodeCard from "./NodeCard";
import { LogOut, Search, Activity, Network, ServerCrash, RefreshCw, Sun, Moon, ExternalLink, ChevronDown, ChevronUp, Wifi, WifiOff, AlertTriangle } from "lucide-react";

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

export default function Dashboard({ user, onLogout, isDarkMode, toggleDarkMode }) {
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isSyncing, setIsSyncing] = useState(false);
  const [viewMode, setViewMode] = useState("devices"); // "devices" | "services"
  const [showCommon, setShowCommon] = useState(false);
  const [showScannersPanel, setShowScannersPanel] = useState(false);
  
  const [scanStatus, setScanStatus] = useState({
    scan_requested: false,
    scan_in_progress: false,
    last_scan_time: null,
    scanners: {}
  });

  // Listen to manual scan control status
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "users", user.uid, "scanner_control", "status"), (docSnap) => {
      if (docSnap.exists()) {
        setScanStatus(docSnap.data());
      }
    }, (error) => {
      console.error("Error listening to scanner control status:", error);
    });
    return () => unsubscribe();
  }, [user.uid]);

  const handleRequestScan = async () => {
    try {
      const docRef = doc(db, "users", user.uid, "scanner_control", "status");
      await updateDoc(docRef, {
        scan_requested: true
      });
    } catch (error) {
      console.error("Error requesting manual scan:", error);
    }
  };

  useEffect(() => {
    const q = query(collection(db, "users", user.uid, "network_nodes"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const nodesData = [];
      snapshot.forEach((doc) => {
        nodesData.push({ id: doc.id, ...doc.data() });
      });

      // Sort nodes: Online first, then numerically by IP
      nodesData.sort((a, b) => {
        const aLastSeen = a.last_seen ? a.last_seen.seconds * 1000 : 0;
        const bLastSeen = b.last_seen ? b.last_seen.seconds * 1000 : 0;
        
        const aOnline = aLastSeen && (Date.now() - aLastSeen < 10 * 60 * 1000) && a.ports && a.ports.length > 0;
        const bOnline = bLastSeen && (Date.now() - bLastSeen < 10 * 60 * 1000) && b.ports && b.ports.length > 0;

        if (aOnline && !bOnline) return -1;
        if (!aOnline && bOnline) return 1;

        const aOctets = a.ip.split(".").map(Number);
        const bOctets = b.ip.split(".").map(Number);
        for (let i = 0; i < 4; i++) {
          if (aOctets[i] !== bOctets[i]) {
            return aOctets[i] - bOctets[i];
          }
        }
        return 0;
      });

      setNodes(nodesData);
      setLoading(false);
      
      setIsSyncing(true);
      const timer = setTimeout(() => setIsSyncing(false), 800);
      return () => clearTimeout(timer);
    }, (error) => {
      console.error("Firestore snapshot listener error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const COMMON_PORTS = [22, 80, 443];

  const visibleNodes = nodes.filter(node => {
    if (!showCommon && node.ports && node.ports.length > 0) {
      const hasOnlyCommon = node.ports.every(port => COMMON_PORTS.includes(port));
      if (hasOnlyCommon) return false;
    }
    return true;
  }).map(node => {
    return {
      ...node,
      ports: node.ports ? node.ports.filter(port => showCommon || !COMMON_PORTS.includes(port)) : []
    };
  });

  const totalNodes = visibleNodes.length;
  const onlineNodes = visibleNodes.filter(node => {
    const lastSeen = node.last_seen ? node.last_seen.seconds * 1000 : 0;
    return lastSeen && (Date.now() - lastSeen < 10 * 60 * 1000) && node.ports && node.ports.length > 0;
  }).length;
  const offlineNodes = totalNodes - onlineNodes;
  
  const totalServices = visibleNodes.reduce((acc, node) => {
    const lastSeen = node.last_seen ? node.last_seen.seconds * 1000 : 0;
    const isOnline = lastSeen && (Date.now() - lastSeen < 10 * 60 * 1000);
    return acc + (isOnline && node.ports ? node.ports.length : 0);
  }, 0);

  const filteredNodes = visibleNodes.filter(node => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
      node.ip.toLowerCase().includes(searchLower) ||
      (node.custom_name && node.custom_name.toLowerCase().includes(searchLower)) ||
      (node.hostname && node.hostname.toLowerCase().includes(searchLower));
    const lastSeen = node.last_seen ? node.last_seen.seconds * 1000 : 0;
    const isOnline = lastSeen && (Date.now() - lastSeen < 10 * 60 * 1000) && node.ports && node.ports.length > 0;

    if (statusFilter === "online") return matchesSearch && isOnline;
    if (statusFilter === "offline") return matchesSearch && !isOnline;
    return matchesSearch;
  });

  const getGroupedServices = () => {
    const servicesMap = {
      11434: { name: "Ollama", port: 11434, devices: [] },
      8188: { name: "ComfyUI", port: 8188, devices: [] },
      3000: { name: "Open WebUI", port: 3000, devices: [] },
      22: { name: "SSH", port: 22, devices: [] },
      80: { name: "HTTP", port: 80, devices: [] },
      443: { name: "HTTPS", port: 443, devices: [] }
    };

    filteredNodes.forEach(node => {
      const lastSeen = node.last_seen ? node.last_seen.seconds * 1000 : 0;
      const isOnline = lastSeen && (Date.now() - lastSeen < 10 * 60 * 1000) && node.ports && node.ports.length > 0;
      
      if (isOnline && node.ports && node.ports.length > 0) {
        node.ports.forEach(port => {
          if (servicesMap[port]) {
            servicesMap[port].devices.push(node);
          } else {
            servicesMap[port] = { name: `Puerto ${port}`, port: port, devices: [] };
            servicesMap[port].devices.push(node);
          }
        });
      }
    });

    return Object.values(servicesMap).filter(service => service.devices.length > 0);
  };

  const scanners = scanStatus.scanners || {};
  
  // Calculate scanner list and their online status
  const scannerList = Object.values(scanners).map(scanner => {
    const lastHeartbeat = scanner.last_heartbeat 
      ? new Date(scanner.last_heartbeat.seconds * 1000) 
      : null;
    const isOnline = lastHeartbeat && (Date.now() - lastHeartbeat.getTime() < 120 * 1000); // 2 minutes
    return {
      ...scanner,
      lastHeartbeatDate: lastHeartbeat,
      isOnline
    };
  });

  const onlineScanners = scannerList.filter(s => s.isOnline);
  const isAnyScannerOnline = onlineScanners.length > 0;

  return (
    <div className="min-h-screen bg-white dark:bg-black text-zinc-900 dark:text-zinc-100 flex flex-col pb-12 transition-colors duration-200">
      
      {/* Header */}
      <header className="sticky top-0 z-30 w-full border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded border border-red-600 dark:border-red-500 flex items-center justify-center">
              <Network className="w-4 h-4 text-red-600 dark:text-red-500" />
            </div>
            <div>
              <h1 className="text-md font-bold tracking-tight font-mono flex items-center gap-1.5">
                MonitorLocal
                <span className={`w-1.5 h-1.5 rounded-full bg-red-600 dark:bg-red-500 ${isSyncing ? 'animate-ping' : ''}`} />
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Theme Toggle Button */}
            <button
              onClick={toggleDarkMode}
              className="p-2 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50 transition cursor-pointer"
              title={isDarkMode ? "Cambiar a Modo Claro" : "Cambiar a Modo Oscuro"}
            >
              {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <div className="hidden md:flex flex-col items-end text-right text-xs font-mono">
              <span className="font-bold text-zinc-800 dark:text-zinc-200">{user?.displayName || "Admin"}</span>
              <span className="text-zinc-400 dark:text-zinc-500">{user?.email}</span>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(user.uid);
                  alert("UID copiado al portapapeles. Pégalo en el config.json de tu escáner.");
                }}
                className="text-[9px] text-zinc-500 dark:text-zinc-650 hover:text-red-650 dark:hover:text-red-500 mt-0.5 underline cursor-pointer"
                title="Haga clic para copiar UID"
              >
                UID: {user.uid.substring(0, 8)}...
              </button>
            </div>
            
            <button
              onClick={onLogout}
              className="py-2 px-3 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 rounded-lg transition flex items-center gap-1.5 text-xs font-mono cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">CERRAR SESIÓN</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main dashboard content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 w-full flex-grow">
        
        {/* Warning Banner when all scanners are offline */}
        {!isAnyScannerOnline && (
          <div className="mb-6 p-4 border border-red-500/20 dark:border-red-500/10 bg-red-500/5 rounded-xl flex items-start gap-3 text-xs font-mono text-red-650 dark:text-red-400 animate-pulse-subtle">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600 dark:text-red-500" />
            <div>
              <span className="font-bold uppercase tracking-wider">Sin Escáneres Activos:</span> El monitor no está recibiendo actualizaciones. Asegúrate de ejecutar <code className="bg-red-500/15 px-1.5 py-0.5 rounded text-red-700 dark:text-red-300 font-bold">run-scanner.bat</code> en tu red local.
            </div>
          </div>
        )}

        {/* Scanners Status & List Panel */}
        <div className="mb-6 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50/30 dark:bg-zinc-950/10 overflow-hidden transition-all duration-200">
          <button
            onClick={() => setShowScannersPanel(!showScannersPanel)}
            className="w-full p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left font-mono text-xs cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-950/35 transition-colors"
          >
            <div className="flex items-center gap-3">
              {isAnyScannerOnline ? (
                <div className="w-8 h-8 rounded border border-emerald-500/20 bg-emerald-500/5 flex items-center justify-center text-emerald-600 dark:text-emerald-500">
                  <Wifi className="w-4 h-4 animate-pulse-green" />
                </div>
              ) : (
                <div className="w-8 h-8 rounded border border-red-500/20 bg-red-500/5 flex items-center justify-center text-red-600 dark:text-red-500">
                  <WifiOff className="w-4 h-4" />
                </div>
              )}
              <div>
                <h4 className="font-bold text-zinc-900 dark:text-zinc-50 text-xs uppercase tracking-wider flex items-center gap-2">
                  <span>Escáneres de Red</span>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                    isAnyScannerOnline 
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" 
                      : "bg-red-500/10 text-red-600 dark:text-red-400"
                  }`}>
                    {onlineScanners.length} activo{onlineScanners.length === 1 ? '' : 's'}
                  </span>
                </h4>
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                  {isAnyScannerOnline 
                    ? `Monitoreando subred: ${onlineScanners.map(s => s.scanner_subnet).filter((v, i, a) => a.indexOf(v) === i).join(', ')}`
                    : "No hay escáneres reportando actividad"
                  }
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-zinc-500 dark:text-zinc-400 text-[11px] self-end sm:self-center">
              <span className="hidden md:inline">
                {isAnyScannerOnline ? "Click para ver detalles de los equipos" : "Click para expandir"}
              </span>
              {showScannersPanel ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </button>

          {showScannersPanel && (
            <div className="border-t border-zinc-200 dark:border-zinc-800 p-4 bg-zinc-50/50 dark:bg-zinc-950/20 transition-all duration-300">
              {scannerList.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {scannerList.map((scanner) => (
                    <div 
                      key={scanner.scanner_hostname + "_" + scanner.scanner_ip} 
                      className={`border rounded-lg p-3 bg-white dark:bg-black font-mono text-[11px] flex flex-col justify-between transition-colors ${
                        scanner.isOnline 
                          ? "border-zinc-200 dark:border-zinc-800 hover:border-emerald-500/40" 
                          : "border-zinc-200 dark:border-zinc-800 opacity-60 hover:opacity-100"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-900 pb-1.5 mb-2">
                          <span className="font-bold text-zinc-900 dark:text-zinc-100 truncate block max-w-[70%]">
                            {scanner.scanner_hostname}
                          </span>
                          <span className={`flex items-center gap-1 text-[9px] uppercase font-bold ${
                            scanner.isOnline ? "text-emerald-600 dark:text-emerald-505" : "text-zinc-400 dark:text-zinc-550"
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${scanner.isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400'}`} />
                            {scanner.isOnline ? "activo" : "inactivo"}
                          </span>
                        </div>

                        <div className="space-y-1.5 text-zinc-600 dark:text-zinc-400">
                          <div>
                            <span className="text-zinc-400 dark:text-zinc-500 font-bold uppercase text-[9px]">IP:</span>{" "}
                            {scanner.scanner_ip} <span className="text-[10px] text-zinc-450">({scanner.scanner_interface})</span>
                          </div>
                          <div>
                            <span className="text-zinc-400 dark:text-zinc-500 font-bold uppercase text-[9px]">Subred:</span>{" "}
                            {scanner.scanner_subnet}
                          </div>
                          <div>
                            <span className="text-zinc-400 dark:text-zinc-500 font-bold uppercase text-[9px]">SO:</span>{" "}
                            <span className="text-[10px] truncate block" title={scanner.scanner_os}>{scanner.scanner_os}</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 pt-2 border-t border-dashed border-zinc-100 dark:border-zinc-900 text-[10px] text-zinc-500 dark:text-zinc-400 flex flex-col gap-0.5">
                        <div>
                          <span className="font-bold text-zinc-400">Actividad:</span>{" "}
                          {getRelativeTimeString(scanner.lastHeartbeatDate)}
                        </div>
                        {scanner.last_scan_duration && (
                          <div>
                            <span className="font-bold text-zinc-400">Último escaneo:</span>{" "}
                            {scanner.last_scan_duration}s{" "}
                            {scanner.last_scan_time && (
                              <span className="text-[9px] text-zinc-450 font-normal">
                                ({getRelativeTimeString(new Date(scanner.last_scan_time.seconds * 1000))})
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-6 text-center text-zinc-400 dark:text-zinc-500 font-mono text-xs">
                  Aún no se han registrado escáneres en la base de datos.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Statistics cards */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 bg-white dark:bg-black transition-colors duration-200">
            <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest font-mono mb-1">monitoreados</p>
            <h3 className="text-xl font-bold font-mono text-zinc-950 dark:text-zinc-50">{loading ? "..." : totalNodes}</h3>
          </div>

          <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 bg-white dark:bg-black transition-colors duration-200">
            <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest font-mono mb-1">activos</p>
            <h3 className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-500">{loading ? "..." : onlineNodes}</h3>
          </div>

          <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 bg-white dark:bg-black transition-colors duration-200">
            <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest font-mono mb-1">inactivos</p>
            <h3 className="text-xl font-bold font-mono text-red-600 dark:text-red-500">{loading ? "..." : offlineNodes}</h3>
          </div>

          <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 bg-white dark:bg-black transition-colors duration-200">
            <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest font-mono mb-1">servicios</p>
            <h3 className="text-xl font-bold font-mono text-red-600 dark:text-red-500">{loading ? "..." : totalServices}</h3>
          </div>

        </section>

        {/* Controls (Search, Filters) */}
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center mb-6">
          <div className="relative flex-grow max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400 dark:text-zinc-500">
              <Search className="w-3.5 h-3.5" />
            </div>
            <input
              type="text"
              placeholder="Buscar por IP..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs font-mono focus:outline-none focus:border-red-600 dark:focus:border-red-500 bg-white dark:bg-black text-zinc-950 dark:text-zinc-50 transition-colors"
            />
          </div>

          {/* Controls right group */}
          <div className="flex flex-wrap gap-2.5 items-center">
            
            {/* Filter tabs */}
            <div className="flex border border-zinc-200 dark:border-zinc-800 p-0.5 rounded-lg bg-white dark:bg-black font-mono text-[10px] font-bold uppercase">
              <button
                onClick={() => setStatusFilter("all")}
                className={`px-3 py-1.5 rounded transition cursor-pointer ${
                  statusFilter === "all" ? "bg-red-600 text-white" : "text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-200"
                }`}
              >
                todos
              </button>
              <button
                onClick={() => setStatusFilter("online")}
                className={`px-3 py-1.5 rounded transition cursor-pointer ${
                  statusFilter === "online" ? "bg-red-600 text-white" : "text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-200"
                }`}
              >
                online
              </button>
              <button
                onClick={() => setStatusFilter("offline")}
                className={`px-3 py-1.5 rounded transition cursor-pointer ${
                  statusFilter === "offline" ? "bg-red-600 text-white" : "text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-200"
                }`}
              >
                offline
              </button>
            </div>

            {/* View Mode Toggle */}
            <div className="flex border border-zinc-200 dark:border-zinc-800 p-0.5 rounded-lg bg-white dark:bg-black font-mono text-[10px] font-bold uppercase">
              <button
                onClick={() => setViewMode("devices")}
                className={`px-3 py-1.5 rounded transition cursor-pointer ${
                  viewMode === "devices" ? "bg-red-600 text-white" : "text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-200"
                }`}
              >
                Dispositivos
              </button>
              <button
                onClick={() => setViewMode("services")}
                className={`px-3 py-1.5 rounded transition cursor-pointer ${
                  viewMode === "services" ? "bg-red-600 text-white" : "text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-200"
                }`}
              >
                Servicios
              </button>
            </div>

            {/* Common Services Toggle */}
            <button
              onClick={() => setShowCommon(!showCommon)}
              className={`px-3 py-1.5 border rounded-lg text-[10px] font-mono font-bold uppercase transition flex items-center gap-1.5 cursor-pointer ${
                showCommon 
                  ? "border-red-600 dark:border-red-500 text-red-650 dark:text-red-500 bg-red-50/50 dark:bg-red-950/10" 
                  : "border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-250 hover:bg-zinc-50 dark:hover:bg-zinc-900"
              }`}
              title="Mostrar u ocultar servicios comunes (SSH, HTTP, HTTPS)"
            >
              <span>SSH/HTTP: {showCommon ? "SÍ" : "NO"}</span>
            </button>

            {/* Manual scan button */}
            <button
              onClick={handleRequestScan}
              disabled={scanStatus.scan_in_progress || scanStatus.scan_requested}
              className="px-3 py-1.5 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 rounded-lg text-[10px] font-mono font-bold uppercase transition flex items-center gap-1.5 disabled:opacity-50 text-zinc-600 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-500 cursor-pointer"
              title="Iniciar escaneo de red de forma inmediata"
            >
              <RefreshCw className={`w-3 h-3 ${scanStatus.scan_in_progress ? 'animate-spin' : ''}`} />
              <span>
                {scanStatus.scan_in_progress ? "Escaneando..." : "Escanear Red"}
              </span>
            </button>

          </div>
        </div>

        {/* Grid - Nodes or Services */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-zinc-200 dark:border-zinc-800 border-t-red-600 rounded-full animate-spin mb-3"></div>
            <p className="text-zinc-400 dark:text-zinc-500 text-xs font-mono">Cargando...</p>
          </div>
        ) : viewMode === "devices" ? (
          filteredNodes.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredNodes.map((node) => (
                <NodeCard key={node.id} node={node} userId={user.uid} />
              ))}
            </div>
          ) : (
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-12 text-center flex flex-col items-center justify-center bg-white dark:bg-black font-mono">
              <ServerCrash className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mb-2" />
              <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-widest mb-1">sin nodos</h4>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 max-w-xs">
                No hay dispositivos registrados en Firestore para la búsqueda actual.
              </p>
            </div>
          )
        ) : (
          getGroupedServices().length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {getGroupedServices().map((service) => (
                <ServiceCard key={service.port} service={service} />
              ))}
            </div>
          ) : (
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-12 text-center flex flex-col items-center justify-center bg-white dark:bg-black font-mono">
              <ServerCrash className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mb-2" />
              <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-widest mb-1">sin servicios</h4>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 max-w-xs">
                No hay servicios activos corriendo en la red para la búsqueda actual.
              </p>
            </div>
          )
        )}

      </main>
    </div>
  );
}

function ServiceCard({ service }) {
  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 bg-white dark:bg-black transition-colors duration-200 flex flex-col justify-between min-h-[200px] hover:border-red-600 dark:hover:border-red-500 group">
      <div>
        {/* Title: Service Name & Port in red */}
        <div className="flex items-center justify-between mb-4 border-b border-zinc-200 dark:border-zinc-800 pb-2">
          <h3 className="font-mono text-sm font-bold tracking-tight text-zinc-950 dark:text-zinc-50 flex items-center gap-2">
            <span>{service.name}</span>
            <span className="text-red-650 dark:text-red-500 font-extrabold font-mono text-xs">
              :{service.port}
            </span>
          </h3>
          <span className="text-[9px] font-mono uppercase bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-2 py-0.5 rounded text-zinc-500 dark:text-zinc-400 font-bold">
            {service.devices.length} {service.devices.length === 1 ? 'equipo' : 'equipos'}
          </span>
        </div>

        {/* List of active nodes running this service */}
        <div className="space-y-3 font-mono">
          {service.devices.map((device) => {
            const displayTitle = device.custom_name || device.hostname || device.ip;
            const hasSubLabel = device.custom_name || device.hostname;
            const isWeb = [80, 443, 3000, 8188, 11434].includes(service.port);
            const protocol = service.port === 443 ? "https" : "http";
            const url = `${protocol}://${device.ip}:${service.port}`;

            return (
              <div 
                key={device.id} 
                className="flex items-start justify-between gap-2 p-2 border border-zinc-100 dark:border-zinc-900 rounded-lg hover:border-zinc-200 dark:hover:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/20 transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate block">
                      {displayTitle}
                    </span>
                  </div>
                  {hasSubLabel && (
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500 block ml-3">
                      {device.ip}
                    </span>
                  )}
                </div>

                {isWeb && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-400 hover:text-red-650 dark:hover:text-red-500 rounded border border-transparent hover:border-zinc-250 dark:hover:border-zinc-850 transition cursor-pointer"
                    title={`Abrir ${service.name} en el navegador`}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
