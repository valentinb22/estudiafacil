# Sincronización en la nube (Firebase)

EstudiaFácil es **local-first**: todo se guarda en el navegador (IndexedDB) y funciona sin conexión.
La nube es opcional: si configuras Firebase, cada persona puede iniciar sesión con Google y sus
datos se copian a su cuenta y se mantienen al día entre dispositivos.

Si no defines las variables de entorno, la app funciona igual y el botón **Sincronizar** explica que
la nube no está configurada. Firebase sólo se descarga cuando está configurado.

## 1. Crear el proyecto

1. Entra a <https://console.firebase.google.com> y crea un proyecto (Analytics no es necesario).
2. En **Configuración del proyecto → General → Tus apps**, agrega una app **Web** (`</>`).
   No hace falta Firebase Hosting.
3. Copia los valores de `firebaseConfig`.

## 2. Variables de entorno

Copia `.env.example` como `.env.local` (no se sube al repositorio) y completa:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=tu-proyecto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=tu-proyecto
VITE_FIREBASE_STORAGE_BUCKET=tu-proyecto.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Estos valores no son secretos (viajan en el bundle); la seguridad la dan las reglas de Firestore.
Para GitHub Pages, guárdalos como *secrets* o *variables* del repositorio y pásalos como variables
de entorno al paso `npm run build` del workflow.

## 3. Habilitar el inicio de sesión con Google

1. **Authentication → Comenzar → Método de acceso → Google → Habilitar**.
2. Elige un correo de asistencia y guarda.
3. **Authentication → Configuración → Dominios autorizados**: agrega
   - `localhost` (suele venir por defecto)
   - tu dominio de GitHub Pages, por ejemplo `tu-usuario.github.io`
   - cualquier otro dominio donde publiques la app.

Si falta el dominio verás el error «Este dominio no está autorizado en Firebase».

> El inicio de sesión usa una ventana emergente. Si el navegador la bloquea (o en la app instalada
> como PWA) se usa la redirección. En navegadores que bloquean el almacenamiento de terceros la
> redirección puede fallar en dominios distintos de `authDomain`; la ventana emergente funciona en
> todos los casos, así que conviene permitirla.

## 4. Crear Firestore

1. **Firestore Database → Crear base de datos**, en modo **producción**, en la región más cercana.
2. Publica las reglas del archivo `firestore.rules` de este repositorio:
   - desde la consola: pestaña **Reglas**, pega el contenido y **Publicar**; o
   - con la CLI:
     ```
     npm i -g firebase-tools
     firebase login
     firebase use --add            # elige tu proyecto
     firebase deploy --only firestore:rules
     ```
     (si no tienes `firebase.json`, créalo con `{ "firestore": { "rules": "firestore.rules" } }`).

Las reglas permiten que cada usuario lea y escriba **sólo** `users/{su uid}/**`.

## Cómo se guardan los datos

| Ruta | Contenido |
|---|---|
| `users/{uid}/{tabla}/{id}` | Registro completo de `subjects`, `tasks`, `exams`, `notes`, `audios`, `files`, `resources` |
| `users/{uid}/blobs/{blobId}` | Metadatos del binario: `mime`, `size`, `chunks`, `updatedAt` |
| `users/{uid}/blobs/{blobId}/chunks/{n}` | Trozo `n` del binario en base64 (~500 KB de bytes por trozo) |

- **Conflictos**: gana la versión con `updatedAt` más reciente, registro por registro.
- **Borrados**: son lógicos (`deleted: true`) para propagarse a otros dispositivos. Al borrar un
  audio o archivo también se elimina su binario en la nube.
- **Sin conexión**: Firestore usa una caché persistente; los cambios quedan en cola y se suben al
  volver la conexión. Los binarios se suben/descargan sólo con conexión.
- **Binarios**: se suben después de que su registro llega al servidor y se descargan (2 a la vez)
  cuando un dispositivo tiene el registro pero no el archivo.
- Al cerrar sesión los datos permanecen en el dispositivo. Si en el mismo dispositivo inicia sesión
  otra cuenta, los datos locales se fusionan con esa cuenta.

## Cuotas

El plan gratuito (Spark) incluye 1 GiB de almacenamiento en Firestore y 50 000 lecturas /
20 000 escrituras diarias. Los audios y PDFs grandes son lo que más consume: cada 500 KB es un
documento.
