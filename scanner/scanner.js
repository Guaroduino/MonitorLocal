const net = require('net');
const os = require('os');
const path = require('path');
const dns = require('dns').promises;
const dgram = require('dgram');
const admin = require('firebase-admin');
const http = require('http');
const https = require('https');

// 1. Initial Configurations
const PORTS_TO_SCAN = [11434, 3000, 80, 443, 22, 8188]; // Ollama, Open WebUI, HTTP, HTTPS, SSH, ComfyUI
const DEFAULT_SERVICE_NAMES = {
  22: "SSH",
  80: "HTTP",
  443: "HTTPS",
  3000: "Open WebUI",
  8188: "ComfyUI",
  11434: "Ollama"
};
const CONCURRENCY_LIMIT = 50; // Max simultaneous TCP connections
const SCAN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes (standard interval)
const SOCKET_TIMEOUT = 1000; // 1 second timeout per connection

// 2. Firebase Initialization
const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');

try {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('[-] Firebase Admin initialized successfully.');
} catch (error) {
  console.error('[ERROR] Failed to load serviceAccountKey.json.');
  console.error('[INFO] Please place your Firebase serviceAccountKey.json in the scanner directory.');
  console.error('[INFO] Running in mock-save mode (will print to console instead of Firebase).');
}

const db = admin.apps.length > 0 ? admin.firestore() : null;

// 2.5. Load User Configuration
const configPath = path.join(__dirname, 'config.json');
let userId = null;

try {
  const config = require(configPath);
  userId = config.userId;
  if (!userId || userId === "REPLACE_WITH_YOUR_FIREBASE_UID") {
    throw new Error("Placeholder UID detected.");
  }
  console.log(`[-] Target Firebase User UID: ${userId}`);
} catch (error) {
  console.error('[ERROR] Failed to load config.json or valid userId.');
  console.error('[INFO] Please open scanner/config.json and paste your Firebase Auth UID from the dashboard.');
  process.exit(1);
}

// 3. Subnet Auto-discovery
function detectSubnet() {
  const interfaces = os.networkInterfaces();
  let detectedSubnet = null;

  for (const name of Object.keys(interfaces)) {
    for (const netInterface of interfaces[name]) {
      // Look for IPv4, non-internal, and commonly used private subnets
      if (netInterface.family === 'IPv4' && !netInterface.internal) {
        const ip = netInterface.address;
        // Verify it belongs to private network classes (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
        if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
          const octets = ip.split('.');
          detectedSubnet = `${octets[0]}.${octets[1]}.${octets[2]}`;
          console.log(`[-] Detected active network interface: ${name} (${ip})`);
          console.log(`[-] Target subnet detected: ${detectedSubnet}.x`);
          return detectedSubnet;
        }
      }
    }
  }

  // Fallback default
  const defaultSubnet = '192.168.1';
  console.warn(`[!] No private IPv4 interface found. Defaulting to: ${defaultSubnet}.x`);
  return defaultSubnet;
}

// 4. Single TCP Port Connection Check
function checkPort(ip, port, timeout = SOCKET_TIMEOUT) {
  return new Promise((resolve) => {
    let resolved = false;
    const socket = new net.Socket();
    
    // Backup timer to guarantee resolution even if the socket hangs
    const backupTimer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try { socket.destroy(); } catch (e) {}
        resolve({ port, open: false });
      }
    }, timeout + 500);

    socket.setTimeout(timeout);

    socket.once('connect', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(backupTimer);
        try { socket.destroy(); } catch (e) {}
        resolve({ port, open: true });
      }
    });

    socket.once('timeout', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(backupTimer);
        try { socket.destroy(); } catch (e) {}
        resolve({ port, open: false });
      }
    });

    socket.once('error', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(backupTimer);
        try { socket.destroy(); } catch (e) {}
        resolve({ port, open: false });
      }
    });

    try {
      socket.connect(port, ip);
    } catch (err) {
      if (!resolved) {
        resolved = true;
        clearTimeout(backupTimer);
        try { socket.destroy(); } catch (e) {}
        resolve({ port, open: false });
      }
    }
  });
}

// 4.5. Helper to probe HTTP/HTTPS services and identify them by HTML title or signature
function probeHttpService(ip, port, timeout = 1500) {
  return new Promise((resolve) => {
    let resolved = false;
    let req;

    // Global backup timer to guarantee resolution under any hung socket scenario
    const backupTimer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.warn(`[Scanner] Warning: Probe timed out via backup timer for ${ip}:${port}`);
        if (req) {
          try { req.destroy(); } catch (err) {}
        }
        resolve(null);
      }
    }, timeout + 500);

    // Helper to parse title or signatures from HTML content
    const parseTitle = (html) => {
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        const title = titleMatch[1].trim();
        return title.replace(/\s+/g, ' ');
      } else if (html.includes('Ollama is running')) {
        return 'Ollama';
      }
      return null;
    };

    try {
      const isHttps = port === 443;
      const client = isHttps ? https : http;
      const url = `${isHttps ? 'https' : 'http'}://${ip}:${port}/`;

      req = client.get(url, { timeout }, (res) => {
        let data = '';
        
        // Limit data size to 10KB to avoid reading huge payloads
        res.on('data', (chunk) => {
          data += chunk;
          if (data.length > 10240) {
            try { req.destroy(); } catch (err) {}
            if (!resolved) {
              resolved = true;
              clearTimeout(backupTimer);
              resolve(parseTitle(data));
            }
          }
        });

        res.on('end', () => {
          clearTimeout(backupTimer);
          if (resolved) return;
          resolved = true;
          resolve(parseTitle(data));
        });
      });

      req.on('error', () => {
        clearTimeout(backupTimer);
        try { req.destroy(); } catch (err) {}
        if (!resolved) {
          resolved = true;
          resolve(null);
        }
      });

      req.on('timeout', () => {
        clearTimeout(backupTimer);
        try { req.destroy(); } catch (err) {}
        if (!resolved) {
          resolved = true;
          resolve(null);
        }
      });
    } catch (err) {
      clearTimeout(backupTimer);
      if (req) {
        try { req.destroy(); } catch (e) {}
      }
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    }
  });
}

// 5. Scan a single IP for all target ports
async function scanIP(ip) {
  const openPorts = [];
  for (const port of PORTS_TO_SCAN) {
    const res = await checkPort(ip, port);
    if (res.open) {
      openPorts.push(port);
    }
  }
  return { ip, openPorts };
}

// 6. Concurrency controller
async function limitConcurrency(tasks, limit) {
  const results = [];
  const executing = new Set();
  
  for (const task of tasks) {
    const p = Promise.resolve().then(() => task());
    results.push(p);
    executing.add(p);
    
    const clean = () => executing.delete(p);
    p.then(clean, clean);
    
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  
  return Promise.all(results);
}

// 6.5. Reverse DNS Lookup (Hostname Resolution)
function resolveHostname(ip, timeout = 600) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(null);
    }, timeout);
    
    dns.reverse(ip)
      .then((hostnames) => {
        clearTimeout(timer);
        if (hostnames && hostnames.length > 0) {
          // Remove suffix if it has local domains, keep it clean
          resolve(hostnames[0]);
        } else {
          resolve(null);
        }
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(null);
      });
  });
}

// 7. Core Scanner Execution Loop
async function runScan() {
  console.log(`\n[${new Date().toISOString()}] Starting network scan...`);
  const subnet = detectSubnet();
  
  // Build a list of scanning tasks for IPs 1 to 254
  const scanTasks = [];
  for (let i = 1; i <= 254; i++) {
    const ip = `${subnet}.${i}`;
    scanTasks.push(() => scanIP(ip));
  }

  // Execute scan with controlled concurrency
  console.log(`[-] Scanning IPs ${subnet}.1 to ${subnet}.254 for ports: ${PORTS_TO_SCAN.join(', ')}`);
  const startTime = Date.now();
  const scanResults = await limitConcurrency(scanTasks, CONCURRENCY_LIMIT);
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`[-] Scan completed in ${duration} seconds.`);

  // Filter out nodes that have open ports
  const scannedActiveNodes = scanResults.filter(node => node.openPorts.length > 0);
  console.log(`[-] Resolving hostnames and services for ${scannedActiveNodes.length} active node(s)...`);
  
  const activeNodes = await Promise.all(
    scannedActiveNodes.map(async (node) => {
      const hostname = await resolveHostname(node.ip);
      
      const services = {};
      const services_fallback = {};
      
      for (const port of node.openPorts) {
        if ([80, 443, 3000, 8188, 11434].includes(port)) {
          const detectedName = await probeHttpService(node.ip, port);
          if (detectedName) {
            services[port] = detectedName;
            services_fallback[port] = false;
          } else {
            services[port] = DEFAULT_SERVICE_NAMES[port] || `Puerto ${port}`;
            services_fallback[port] = true;
          }
        } else if (port === 22) {
          services[port] = "SSH";
          services_fallback[port] = false;
        } else {
          services[port] = DEFAULT_SERVICE_NAMES[port] || `Puerto ${port}`;
          services_fallback[port] = false;
        }
      }

      return { ...node, hostname, services, services_fallback };
    })
  );

  console.log(`[-] Found ${activeNodes.length} active node(s) with open ports.`);
  activeNodes.forEach(node => {
    const hostLabel = node.hostname ? ` (${node.hostname})` : '';
    console.log(`    -> ${node.ip}${hostLabel} [Ports: ${node.openPorts.join(', ')}]`);
  });

  // 8. Sync Results to Firebase
  if (!db) {
    console.log('[!] Offline/Mock mode active. Firebase sync skipped.');
    return;
  }

  try {
    const collectionRef = db.collection('users').doc(userId).collection('network_nodes');
    
    // Fetch currently registered nodes from Firestore to check who we need to update/clean up
    const snapshot = await collectionRef.get();
    const existingNodes = {};
    snapshot.forEach(doc => {
      existingNodes[doc.id] = doc.data();
    });

    const batch = db.batch();
    let batchOperations = 0;

    // Process nodes that currently have open ports
    for (const node of activeNodes) {
      const docRef = collectionRef.doc(node.ip);
      batch.set(docRef, {
        ip: node.ip,
        ports: node.openPorts,
        services: node.services || {},
        services_fallback: node.services_fallback || {},
        last_seen: admin.firestore.FieldValue.serverTimestamp(),
        hostname: node.hostname || null
      }, { merge: true });
      batchOperations++;
      
      // Remove from list of existing nodes so we don't clean it up
      delete existingNodes[node.ip];
    }

    // Process remaining nodes (were previously active, but now have no open ports)
    // We clear their ports list so the dashboard knows they are offline
    for (const ip of Object.keys(existingNodes)) {
      const nodeData = existingNodes[ip];
      // Only update if it had active ports before, to prevent unnecessary writes
      if (nodeData.ports && nodeData.ports.length > 0) {
        console.log(`[-] Cleaning up offline node: ${ip} (No active ports detected)`);
        const docRef = collectionRef.doc(ip);
        batch.set(docRef, {
          ports: [],
          services: {},
          services_fallback: {}
          // We preserve the last_seen so the dashboard can verify offline status duration
        }, { merge: true });
        batchOperations++;
      }
    }

    if (batchOperations > 0) {
      await batch.commit();
      console.log(`[-] Successfully synchronized ${batchOperations} operations to Firebase.`);
    } else {
      console.log('[-] No updates required in Firestore.');
    }
    
    // Send heartbeat with scan duration and completion timestamp
    await sendHeartbeat(duration, Date.now());
  } catch (error) {
    console.error('[ERROR] Failed to sync data with Firestore:', error);
  }
}

// 8.5. Send Heartbeat to Firebase
async function sendHeartbeat(lastScanDuration = null, lastScanTime = null) {
  if (!db) return;
  try {
    const interfaces = os.networkInterfaces();
    let scannerIp = 'unknown';
    let scannerSubnet = 'unknown';
    let interfaceName = 'unknown';

    for (const name of Object.keys(interfaces)) {
      for (const netInterface of interfaces[name]) {
        if (netInterface.family === 'IPv4' && !netInterface.internal) {
          const ip = netInterface.address;
          if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
            scannerIp = ip;
            const octets = ip.split('.');
            scannerSubnet = `${octets[0]}.${octets[1]}.${octets[2]}.x`;
            interfaceName = name;
            break;
          }
        }
      }
      if (scannerIp !== 'unknown') break;
    }

    const docRef = db.collection('users').doc(userId).collection('scanner_control').doc('status');
    const scannerKey = os.hostname().replace(/[./#$[\]]/g, '_');
    
    const scannerData = {
      last_heartbeat: admin.firestore.FieldValue.serverTimestamp(),
      scanner_ip: scannerIp,
      scanner_subnet: scannerSubnet,
      scanner_interface: interfaceName,
      scanner_hostname: os.hostname(),
      scanner_os: `${os.type()} ${os.release()} (${os.arch()})`
    };

    if (lastScanDuration !== null) {
      scannerData.last_scan_duration = parseFloat(lastScanDuration);
    }
    if (lastScanTime !== null) {
      scannerData.last_scan_time = admin.firestore.Timestamp.fromDate(new Date(lastScanTime));
    }

    const updateData = {
      scanners: {
        [scannerKey]: scannerData
      }
    };

    await docRef.set(updateData, { merge: true });
  } catch (error) {
    console.error('[ERROR] Failed to send heartbeat to Firestore:', error);
  }
}

// Start heartbeat loop (every 30 seconds)
sendHeartbeat();
setInterval(() => sendHeartbeat(), 30 * 1000);

// Start initial scan and set interval
runScan();
setInterval(runScan, SCAN_INTERVAL_MS);

// 9. Wake-on-LAN (WoL) Implementation
function sendWakeOnLan(macAddress) {
  return new Promise((resolve, reject) => {
    // Clean MAC address (remove colons, hyphens, or spaces)
    const cleanMac = macAddress.replace(/[: -]/g, '');
    if (cleanMac.length !== 12) {
      return reject(new Error('Invalid MAC address length'));
    }
    
    // Create magic packet: 6 bytes of 0xFF, followed by 16 repetitions of MAC address
    const buffer = Buffer.alloc(102);
    for (let i = 0; i < 6; i++) {
      buffer[i] = 0xff;
    }
    
    const macBuffer = Buffer.from(cleanMac, 'hex');
    for (let i = 0; i < 16; i++) {
      macBuffer.copy(buffer, 6 + i * 6);
    }
    
    const socket = dgram.createSocket('udp4');
    socket.once('error', (err) => {
      socket.close();
      reject(err);
    });
    
    socket.bind(() => {
      socket.setBroadcast(true);
      // Broadcast to 255.255.255.255 on UDP port 9
      socket.send(buffer, 0, buffer.length, 9, '255.255.255.255', (err) => {
        socket.close();
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

function startWakeOnLanListener() {
  if (!db) return;
  console.log('[-] Starting Wake-on-LAN listener...');
  
  db.collection('users').doc(userId).collection('network_nodes')
    .where('wake_requested', '==', true)
    .onSnapshot((snapshot) => {
      snapshot.forEach(async (doc) => {
        const data = doc.data();
        if (data.mac_address) {
          console.log(`[WoL] Received wake request for IP ${data.ip} (${data.mac_address})`);
          try {
            await sendWakeOnLan(data.mac_address);
            console.log(`[WoL] Magic packet successfully sent to ${data.mac_address}`);
            await doc.ref.update({
              wake_requested: false,
              wake_status: 'sent'
            });
          } catch (err) {
            console.error(`[WoL] Failed to send magic packet:`, err);
            await doc.ref.update({
              wake_requested: false,
              wake_status: 'error'
            });
          }
        } else {
          console.warn(`[WoL] Wake requested for IP ${data.ip} but MAC address is missing.`);
          await doc.ref.update({
            wake_requested: false,
            wake_status: 'missing_mac'
          });
        }
      });
    }, (error) => {
      console.error('[WoL] Firestore listener error:', error);
    });
}

startWakeOnLanListener();

// 10. Manual Scan Request Listener
async function startScanRequestListener() {
  if (!db) return;
  console.log('[-] Starting Scan Request listener...');
  
  let lastScanTime = 0;
  let isExecutingManualScan = false;
  const MIN_SCAN_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes cooldown
  
  const docRef = db.collection('users').doc(userId).collection('scanner_control').doc('status');
  try {
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      await docRef.set({
        scan_requested: false,
        scan_in_progress: false,
        scan_in_progress_by: null,
        last_scan_time: null
      });
    } else {
      // Clean up any stuck states from a previous run on startup
      const data = docSnap.data();
      const updates = {};
      
      if (data.scan_in_progress && (!data.scan_in_progress_by || data.scan_in_progress_by === os.hostname())) {
        console.log('[Scanner] Resetting stuck scan_in_progress flag on startup.');
        updates.scan_in_progress = false;
        updates.scan_in_progress_by = null;
      }
      
      if (data.scan_requested) {
        updates.scan_requested = false;
      }
      
      if (Object.keys(updates).length > 0) {
        await docRef.update(updates);
      }
    }
  } catch (err) {
    console.error('[Scanner] Failed to initialize scanner_control collection:', err);
  }
  
  docRef.onSnapshot(async (docSnap) => {
    if (!docSnap.exists) return;
    const data = docSnap.data();
    
    // Auto-heal: If Firestore reports scan in progress by this host, but we are actually idle
    if (data.scan_in_progress && data.scan_in_progress_by === os.hostname() && !isExecutingManualScan) {
      console.warn('[Scanner] Auto-healing: Firestore reports scan_in_progress: true for this host, but scanner is idle. Resetting.');
      try {
        await docRef.update({
          scan_in_progress: false,
          scan_in_progress_by: null
        });
      } catch (updateErr) {
        console.error('[Scanner] Failed to auto-heal stuck scan_in_progress flag:', updateErr);
      }
      return;
    }
    
    if (data.scan_requested && !data.scan_in_progress) {
      // Check cooldown
      let firestoreLastScanTime = 0;
      if (data.last_scan_time) {
        firestoreLastScanTime = typeof data.last_scan_time.toDate === 'function'
          ? data.last_scan_time.toDate().getTime()
          : new Date(data.last_scan_time).getTime();
      }
      
      const effectiveLastScanTime = Math.max(lastScanTime, firestoreLastScanTime);
      const now = Date.now();
      const timeSinceLastScan = now - effectiveLastScanTime;
      
      if (timeSinceLastScan < MIN_SCAN_COOLDOWN_MS) {
        const remainingSeconds = Math.ceil((MIN_SCAN_COOLDOWN_MS - timeSinceLastScan) / 1000);
        console.warn(`[Scanner] Manual scan requested too soon. Cooldown active. Ignored. (${remainingSeconds}s remaining)`);
        
        // Reset the scan_requested flag in Firestore
        try {
          await docRef.update({
            scan_requested: false
          });
        } catch (updateErr) {
          console.error('[Scanner] Failed to reset scan_requested flag during cooldown:', updateErr);
        }
        return;
      }
      
      console.log('\n[Scanner] Manual scan requested via Firestore!');
      try {
        isExecutingManualScan = true;
        
        // Set scan_in_progress to true, specify owner, and reset request flag
        await docRef.update({
          scan_requested: false,
          scan_in_progress: true,
          scan_in_progress_by: os.hostname()
        });
        
        // Execute the scan
        await runScan();
        lastScanTime = Date.now(); // Update local cooldown timestamp
        
        isExecutingManualScan = false;
        
        // Mark scan as completed and record timestamp
        await docRef.update({
          scan_in_progress: false,
          scan_in_progress_by: null,
          last_scan_time: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log('[Scanner] Manual scan completed.');
      } catch (err) {
        console.error('[Scanner] Manual scan execution failed:', err);
        isExecutingManualScan = false;
        try {
          await docRef.update({
            scan_in_progress: false,
            scan_in_progress_by: null,
            scan_requested: false
          });
        } catch (updateErr) {
          console.error('[Scanner] Failed to reset flags after execution error:', updateErr);
        }
      }
    }
  }, (error) => {
    console.error('[Scanner] Scan request listener error:', error);
  });
}

startScanRequestListener();
