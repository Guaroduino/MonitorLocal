# MonitorLocal 🌐

**MonitorLocal** es una solución privada y multiusuario de monitoreo de red local y encendido remoto (Wake-on-LAN). Permite escanear dispositivos y servicios activos dentro de tu red local (como Ollama, ComfyUI, Open WebUI, SSH y servidores HTTP/HTTPS) en tiempo real, visualizar su estado desde un dashboard web minimalista accesible desde cualquier parte del mundo, y encender equipos apagados a través de internet de forma segura.

---

## 🚀 Características Principales

*   **Autodescubrimiento de Subred:** El escáner detecta automáticamente la interfaz de red local activa (ej. `192.168.0.x`) sin necesidad de configuración manual.
*   **Escaneo Concurrente de Puertos:** Escaneo rápido de los rangos de IPs (1-254) sobre puertos específicos (`22` SSH, `80` HTTP, `443` HTTPS, `3000` Open WebUI, `8188` ComfyUI, `11434` Ollama) controlado por lotes de concurrencia para evitar saturación de red.
*   **Encendido Remoto (Wake-on-LAN):** Envío de *Magic Packets* UDP de WoL a las tarjetas de red de dispositivos locales apagados (offline) directamente presionando un botón en la web.
*   **Escaneo a Petición (On-Demand):** El escáner corre en segundo plano cada 5 minutos por defecto, pero puedes forzar un escaneo completo de red de manera instantánea desde la interfaz web.
*   **Resolución de Nombres (DNS Reverso):** Intenta resolver de forma automática los nombres de host locales (ej. `Luis-PC`, `comfy-server`) a través del DNS de tu red.
*   **Nombres/Alias Personalizables:** Asigna alias fáciles de recordar a cada IP directamente desde el dashboard (ej. "Mi Servidor de IA"). Los alias se guardan en la nube y no se pierden en nuevos escaneos.
*   **Vistas de Dispositivos y Servicios:** Alterna el dashboard para ver la red ordenada por nodos tradicionales, o agrupada directamente por servicios activos (ComfyUI, Ollama, Open WebUI, SSH, HTTP, HTTPS).
*   **Filtro Inteligente de Puertos Comunes (SSH/HTTP):** Filtro toggle para ocultar puertos SSH (22), HTTP (80) y HTTPS (443). Si un dispositivo encendido solo cuenta con estos puertos genéricos abiertos, se oculta por completo del panel para evitar ruidos y concentrarse en servicios de IA locales.
*   **Acceso Directo Web:** Desde la vista de servicios, las tarjetas de servicios web (HTTP, HTTPS, ComfyUI, Ollama y Open WebUI) incluyen un botón de acceso directo para abrir la app web del dispositivo en el navegador en un clic.
*   **Arquitectura Multiusuario Aislada:** Los datos se estructuran de forma aislada por el `UID` de autenticación de Google de cada usuario (`/users/{userId}/...`). Dos personas pueden usar el mismo proyecto de Firebase y ver solo sus redes correspondientes sin interferencias.
*   **Diseño Industrial Minimalista:** Interfaz limpia en blanco y negro con resaltados en rojo. Soporta modo oscuro manual persisted en el navegador a través de `localStorage`.
*   **PWA Completa (Progressive Web App):** Cumple con los requisitos de Service Worker y manifiesto para ser instalable como una aplicación nativa en tu computadora o dispositivo móvil.

---

## 📁 Estructura del Proyecto

```
MonitorLocal/
├── firestore.rules               # Reglas estrictas de seguridad de Firestore (aisladas por UID)
├── firebase.json                 # Configuración de despliegue para Firebase Hosting y Rules
├── scanner/                      # Módulo del Escáner Local (Node.js)
│   ├── package.json
│   ├── scanner.js                # Lógica del escáner y escucha de peticiones WoL/Scan
│   ├── config.json               # Configuración local con tu UID de usuario (ignorado en Git)
│   ├── serviceAccountKey.json    # Llave de Firebase Admin SDK (ignorado en Git)
│   ├── run-hidden.vbs            # Script para ejecutar el escáner de forma oculta en Windows
│   └── run-scanner.bat           # Lanzador autogestionado de un solo clic para Windows
└── dashboard/                    # Módulo Frontend Web (Next.js + Tailwind CSS v4)
    ├── package.json
    ├── next.config.mjs           # Configuración de compilación para exportación estática
    └── src/
        ├── app/                  # Estructura del enrutador de Next.js
        ├── components/           # Componentes modulares (Login, Dashboard, NodeCard)
        └── lib/                  # Inicialización del SDK cliente de Firebase
```

---

## 🛠️ Guía de Configuración e Instalación

### Paso 1: Configurar el Proyecto de Firebase
1.  Ve a la consola de [Firebase](https://console.firebase.google.com/) y crea un proyecto.
2.  **Habilitar Autenticación:** Ve a *Authentication* -> *Sign-in method* -> *Add new provider* y activa **Google**.
3.  **Habilitar Firestore:** Ve a *Firestore Database* e inicializa una base de datos en tu región preferida.
4.  **Registrar Aplicación Web:** Crea una app web en la configuración del proyecto y obtén las credenciales cliente (API Key, Project ID, etc.).

### Paso 2: Configurar las Reglas de Seguridad en Firestore
1.  Abre el archivo [firestore.rules](firestore.rules).
2.  Reemplaza el correo `"coradogranadillo@gmail.com"` por tu dirección de correo electrónico autorizada (si deseas restringir accesos), o ajusta la regla según tus necesidades.
3.  Copia su contenido y pégalo en la pestaña **Rules** (Reglas) de tu Firestore Database en la consola de Firebase, luego haz clic en **Publish** (o despliégalo usando la CLI de Firebase con `npx firebase deploy --only firestore:rules`).

### Paso 3: Configurar y Desplegar el Dashboard Web (Frontend)
1.  Ve a la carpeta [dashboard/src/lib/firebase.js](dashboard/src/lib/firebase.js) y reemplaza la constante `firebaseConfig` con las credenciales de tu proyecto creadas en el Paso 1.
2.  Instala las dependencias y construye/despliega la app:
    ```bash
    cd dashboard
    npm install
    npm run build
    ```
3.  Puedes servir los archivos de la carpeta `dashboard/out` con cualquier hosting estático gratuito, o desplegarlos en **Firebase Hosting** usando:
    ```bash
    cd ..
    npx firebase deploy --only hosting
    ```
4.  Entra a la URL de tu sitio desplegado y presiona **Iniciar Sesión con Google**.
5.  En la esquina superior derecha del Dashboard, haz clic en el enlace **`UID: XXXXXXXX...`** para copiar tu ID de Usuario único al portapapeles.

### Paso 4: Configurar el Escáner Local (Módulo 1)
1.  En la consola de Firebase, ve a *Configuración del Proyecto* (icono de engranaje) -> *Cuentas de servicio*.
2.  Haz clic en **Generar nueva clave privada**, descarga el archivo JSON generado, cámbiale el nombre a `serviceAccountKey.json` y colócalo dentro de la carpeta `scanner/`.
3.  Abre el archivo [scanner/config.json](scanner/config.json) y pega tu ID de Usuario copiado de la web:
    ```json
    {
      "userId": "TU_UID_AQUI_PEGADO"
    }
    ```

### Paso 5: Configurar los Equipos que deseas encender (Wake-on-LAN)
Para que WoL funcione en los dispositivos que monitorizas:
1.  **Habilitar en BIOS/UEFI:** Reinicia la PC destino, entra a la BIOS y activa **Wake on LAN**, **Power On By PCI-E** o **Resume by Onboard LAN**.
2.  **Habilitar en Windows:**
    *   Abre el *Administrador de dispositivos*.
    *   Despliega *Adaptadores de red*, haz clic derecho en tu tarjeta Ethernet -> *Propiedades*.
    *   En **Administración de energía**, marca: *Permitir que este dispositivo reactive el equipo* y *Permitir solo un Magic Packet para reactivar el equipo*.
    *   En **Opciones avanzadas**, asegúrate de que **Wake on Magic Packet** esté *Habilitado*.

---

## 🏃‍♂️ Ejecución y Automatización del Escáner

### Ejecución en Windows (Sencilla y en segundo plano)
1.  Entra en la carpeta `scanner/` y haz doble clic sobre el archivo **`run-scanner.bat`**.
2.  *Este archivo batch instalará de forma automática las dependencias (si no existen) y lanzará el escáner en segundo plano de manera 100% invisible. Puedes cerrar la ventana de consola sin problemas.*
3.  **Para automatizar al encender la PC:** Presiona `Windows + R`, escribe `shell:startup`, dale Enter, y arrastra un **acceso directo** de `run-scanner.bat` a esa carpeta. Se ejecutará invisible cada vez que inicies sesión en Windows.
4.  **Para detener el escáner:** Abre el *Administrador de tareas* (Ctrl + Shift + Esc), busca el proceso **Node.js JavaScript Runtime** (`node.exe`) y finalízalo.

### Ejecución con PM2 (Opción Recomendada/Profesional)
PM2 ejecutará el script de forma invisible como un servicio del sistema que se auto-recupera y arranca al iniciar el equipo.
1.  Instala PM2 de forma global:
    ```bash
    npm install -g pm2
    ```
2.  Inicia el escáner:
    ```bash
    cd scanner
    pm2 start scanner.js --name monitor-scanner
    ```
3.  Guarda la configuración para que se inicie al arrancar el sistema operativo (en Linux/Raspberry Pi):
    ```bash
    pm2 startup
    pm2 save
    ```
4.  **Logs e inspección:** Puedes verificar el estado con `pm2 status` y ver los reportes de escaneo en vivo con `pm2 logs`.

---

## 🔒 Licencia
Uso estrictamente personal y educativo. Desarrollado como solución a medida de código abierto.
