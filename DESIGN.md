# EstudiaFácil — Sistema de diseño

## Dirección estética: "Cuaderno editorial"
Una herramienta de estudio seria y calmada, inspirada en cuadernos de papel, apuntes a mano y
publicaciones editoriales (referencias: Things 3, Linear, Notion calendar, revistas académicas).
No es un SaaS genérico: nada de gradientes violeta, glassmorphism ni emojis decorativos.

- **Base cálida de papel** en claro; **pizarra profunda** en oscuro.
- **Un solo acento** (verde pizarra) para acciones primarias. El color de cada materia es el
  segundo sistema de color y vive en *chips*, filetes laterales y puntos — nunca en fondos grandes.
- **Resaltador** amarillo sólo para "lo importante ahora" (próximo examen, fijado).
- Estados semánticos: `danger` (vencido/urgente), `warn` (pronto), `ok` (completado/dominado).

## Tipografía
| Rol | Fuente | Uso |
|---|---|---|
| Display | Instrument Serif (400, itálica) | Títulos de sección, números grandes de KPIs y cuentas regresivas |
| UI / texto | Geist Variable | Todo lo demás |
| Mono | Geist Mono Variable | Notas, fórmulas, siglas, tiempos (`tabular-nums`) |

Escala: `text-xs 12` · `sm 14` · `base 15/16` · `lg 18` · `xl 20` · display `3xl–5xl` sólo en serif.

## Tokens (CSS variables en `src/index.css`, mapeados en Tailwind)
`bg` fondo · `surface` tarjeta · `surface-2` hundido/inputs · `line` bordes · `ink` texto ·
`ink-2` secundario · `ink-3` terciario/placeholder · `accent` / `accent-ink` (texto sobre acento) ·
`accent-soft` · `hl` resaltador · `danger` `warn` `ok` (+ `-soft`).

Usar SIEMPRE clases Tailwind de tokens (`bg-surface`, `text-ink-2`, `border-line`…). Prohibido
hardcodear colores salvo el color de materia (que viene del dato).

## Forma y espacio
- Radios: `rounded-lg` (8px) controles, `rounded-xl` (12px) tarjetas, `rounded-2xl` modales.
- Bordes 1px `border-line`; sombras mínimas (`shadow-card`) sólo en elementos flotantes.
- Grilla de 4px. Padding de tarjeta `p-4 sm:p-5`. Gutter de página `px-4 sm:px-6`, máx `max-w-6xl`.
- Objetivo táctil mínimo 40px (44px en móvil para acciones primarias).

## Movimiento
150–220ms, `ease-out`. Reordenamiento con dnd-kit (transición de transform). Respetar
`prefers-reduced-motion`.

## Componentes base (`src/components/ui`)
`Button` (primary | secondary | ghost | danger, sizes sm/md, `icon`), `IconButton`, `Card`,
`Modal` (altura adaptable `max-h-[calc(100dvh-2rem)]`, scroll interno, cierra con Esc),
`Field`/`Input`/`Textarea`/`Select`, `Badge`, `SubjectChip`, `EmptyState`, `ProgressBar`,
`Countdown`, `PageHeader`, `SearchInput`, `SegmentedControl`, `SortableList`/`ReorderButtons`.

## Copy
Español rioplatense neutro, tuteo ("Agregá" no; usar "Agrega"/"Crea"). Frases cortas.
Los estados vacíos explican el siguiente paso con un botón.

## Responsive
320px mínimo. Escritorio: navegación superior. Móvil: barra de navegación horizontal desplazable
bajo la cabecera. Modales a pantalla casi completa en móvil.
