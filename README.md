# EstudiaFácil

Toda tu vida académica en un solo lugar: materias, tareas y entregas, exámenes con seguimiento
de temas, notas, archivos, recursos y **audios de memorización activa**, con Modo Focus Pomodoro
y sincronización entre computadora y celular.

## Stack y por qué

| Capa | Tecnología | Motivo |
|---|---|---|
| UI | **React 19 + TypeScript + Vite** | SPA rápida, tipado estricto, build estático desplegable en cualquier hosting |
| Estilos | **Tailwind CSS 3** + variables CSS | Tokens de diseño con modo claro/oscuro sin duplicar estilos |
| Datos locales | **Dexie (IndexedDB)** | *Local-first*: funciona sin cuenta ni conexión; guarda audios y PDFs como `Blob` |
| Nube | **Firebase Auth (Google) + Firestore** | Sincronización en tiempo real; binarios divididos en fragmentos de ~500 KB |
| Estado UI | **zustand** | Filtro global, tema, reproductor y Focus sin boilerplate |
| Reordenar | **dnd-kit** | Arrastrar y soltar con mouse, táctil y teclado, con animación |
| Audio | **Web Audio API + MediaRecorder** | Grabador con onda en vivo y sintetizador de sonidos ambientales sin archivos |
| Tipografía | Instrument Serif · Geist · Geist Mono (autoalojadas) | Carácter editorial, legibilidad y números tabulares |

Sistema de diseño: ver [DESIGN.md](DESIGN.md). Sincronización: ver [docs/SYNC.md](docs/SYNC.md).

## Desarrollo

```bash
npm install
npm run dev
```

Para habilitar la nube copia `.env.example` a `.env.local` y completa las claves de Firebase.
Sin ellas la app funciona 100 % en local.

## Despliegue

Cada push a `main` publica la app en GitHub Pages mediante `.github/workflows/deploy.yml`.
Las claves de Firebase se cargan como *secrets* del repositorio (`VITE_FIREBASE_*`).

## Estructura

```
src/
  lib/            modelo de datos, base local, hooks, utilidades de tiempo y audio
  components/ui/  primitivas del sistema de diseño
  components/layout/
  features/       dashboard · subjects · tasks · exams · notes · study · focus · notifications · sync
```
