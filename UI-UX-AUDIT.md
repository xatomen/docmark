# Docmark — Auditoría completa de UI/UX

**Fecha:** 2 de octubre de 2026  
**Estado auditado:** commit `0baebb0` (`feat: add logical page numbering`), rama `main`  
**Tipo de revisión:** análisis estático del repositorio y revisión de la vista accesible de `http://localhost:3000/editor`. No se modificó código de producto ni se ejecutó una prueba de accesibilidad automatizada.

## Resumen ejecutivo

Docmark ya tiene una base visual adecuada para una herramienta de escritura: editor y página se ven juntos en escritorio, la hoja usa dimensiones físicas reales, la paleta es sobria y el preview comparte ajustes y paginación con la impresión. No hay una colección de Cards ni una capa decorativa excesiva. Los problemas de mayor impacto son de jerarquía y disponibilidad del espacio: una gran cantidad de ajustes permanece visible sobre el preview, la vista de dos paneles se convierte en dos paneles apilados en pantallas estrechas, y el contenedor principal fija su altura y oculta desbordamiento.

Hay una discrepancia importante entre el contexto del encargo y el código: **HeroUI v3 no está instalado ni configurado en este repositorio**. `package.json` contiene Tailwind CSS 4 y no declara `@heroui/react` o `@heroui/styles`; `src/app/globals.css` tampoco importa los estilos de HeroUI. Los controles presentes son elementos HTML nativos con clases Tailwind y algunos componentes locales. Por tanto, no es posible evaluar si HeroUI v3 se está usando correctamente en la aplicación actual. Sí es posible proponer dónde aportaría valor, sin recomendar que se reemplace indiscriminadamente cada control nativo.

No se identificaron bloqueos P0 en la vista y el código inspeccionados. Sí hay hallazgos P1 para el contraste de texto secundario, la composición móvil/tablet, la saturación del panel de ajustes y la exposición de errores de guardado.

## Alcance y método

Se inspeccionaron `src/app`, `src/components/editor`, `src/components/preview`, `src/components/document`, `src/styles`, las hojas globales/de impresión, `package.json`, `pnpm-lock.yaml`, PostCSS, Next config, documentación de arquitectura y suites E2E. En el navegador local se revisó el árbol accesible de `/editor` y sus controles iniciales. Los tamaños tablet/móvil se valoraron a partir de los breakpoints y reglas CSS del repositorio; **no se hizo una inspección visual en dispositivos físicos ni se midió cada viewport**.

Las afirmaciones sobre el producto describen código observado. Las propuestas se expresan como recomendaciones. La revisión no implementa las propuestas.

## 1. Inventario de rutas y áreas

| Vista/área | Propósito y componentes principales | Acciones y relación | Problemas observados |
|---|---|---|---|
| `/` — inicio | `src/app/page.tsx`; marca, propuesta de valor, CTA y pie | “Open the editor” lleva a `/editor` | Es una landing breve y coherente, pero usa un CTA propio sin variante reutilizable; no se ven ejemplos de documentos, capacidades de edición ni una explicación visible de qué significa “local-first”. No afecta al flujo principal una vez abierto el editor. |
| `/editor` — workspace | `src/app/editor/page.tsx` monta `EditorWorkspace`; header superior y grid de editor/preview | Es la vista principal; enlaza con inicio y contiene gestión, archivos, exportación y todas las configuraciones | En escritorio reparte atención entre dos paneles equivalentes. En altura limitada, los controles de configuración restan área al preview. En anchuras menores a `md`, ambos paneles se apilan dentro de un contenedor de altura restringida. |
| Header global del editor | `EditorWorkspace`: marca, `DocumentSwitcher`, `MarkdownFileActions`, estado local y `Export PDF` | Crea/cambia documentos; abre/guarda archivos; imprime | Todas las áreas aparecen juntas y el botón de exportación usa borde, sin un énfasis visual mayor que `File`. El estado local se oculta en anchos menores a `sm`; el error detallado queda en `title`, que no es una presentación fiable para tacto o lector de pantalla. |
| Selector/gestor de documentos | `src/components/editor/document-switcher.tsx`; disclosure `<details>` con lista | Crear, abrir, renombrar, duplicar y eliminar | Un único popover reúne cambio de contexto y administración. Renombrar/duplicar/eliminar quedan en una fila de acciones pequeñas; `Delete` depende de `window.confirm`. La lista usa elementos semánticos de lista y botones, pero no tiene un patrón de menú compuesto ni gestión de foco implementada en el componente. |
| Acciones de archivo | `src/components/editor/markdown-file-actions.tsx`; disclosure “File” | Abrir `.md`, guardar y guardar como; muestra resultado de archivo | El menú está hecho con `<details>` y posicionamiento CSS. No existe un componente compartido con el menú de documentos. El feedback se trunca a `25vw` y el texto completo se deja en `title`; puede perderse en móvil. |
| Editor Markdown | `src/components/editor/markdown-editor.tsx`; CodeMirror 6 con números de línea, resaltado y wrapping | Escribir; copiar Markdown; insertar `:::toc` y `:::pagebreak`; undo/redo e indentación por los keymaps de CodeMirror | Toolbar mínima y comprensible, pero las tres acciones tienen peso visual parecido. `spellcheck` está desactivado. Undo/redo y shortcuts de inserción no se anuncian; no se encontraron shortcuts propios para TOC o salto. |
| Barra de controles del documento | `src/components/preview/document-settings-controls.tsx`; tamaño/orientación, márgenes y theme | Ajusta formato físico, cuatro márgenes y apariencia del documento | Es una banda que envuelve controles y múltiples fieldsets; sus grupos y separadores aumentan la densidad justo encima del documento. Los controles usan texto pequeño y estilos repetidos. |
| Ajustes de portada y tipografía | Fieldsets dentro de `DocumentSettingsControls` | Activar portada y editar título/subtítulo/autor/organización/fecha; familia, tamaño, interlineado y alineación | La portada revela cinco campos y la tipografía cuatro controles; quedan a la vista de forma continua. El contenido editorial y la configuración física conviven en el mismo flujo vertical. |
| Ajustes de numeración, header/footer y portabilidad | Mismo componente | Activar número, posición, inicio y exclusión de portada; activar cabecera/pie, texto/alineación; incluir metadata Docmark al guardar Markdown | Controles de uso menos frecuente compiten por altura y atención con preview. Hay coherencia funcional y campos se deshabilitan cuando corresponden, pero no hay secciones plegables ni separación entre básico y avanzado. |
| Preview paginado | `src/components/preview/document-preview.tsx`, `DocumentCover`, `PageDecorations` | Leer la hoja, sus límites, número de páginas y medidas; revisar portada, TOC, cabecera y pie | La hoja blanca sobre canvas gris comunica el formato impreso y evita ruido. Se escala al ancho disponible y se desplaza verticalmente; no hay zoom, salto a página, miniaturas ni indicador de página actual. “Live” permanece como etiqueta aunque la paginación esté ocupada; Exportar se deshabilita, pero el estado de preparación no se explica junto al preview. |
| Impresión / Save as PDF | `src/styles/print.css` y `printDocument` en `EditorWorkspace`; diálogo nativo del navegador | Abrir la impresión del navegador y elegir Guardar como PDF | No hay ruta o diálogo PDF propio, de acuerdo con el enfoque local. El botón explica su efecto con `title`; la interfaz no puede controlar la presentación posterior del navegador. La hoja usa su paginación ya medida. |
| Confirmación destructiva | `window.confirm` en `EditorWorkspace` antes de eliminar | Confirmar/cancelar eliminación | La confirmación no está estilizada ni integrada visualmente con Docmark; depende del navegador/OS. No se hallaron otros dialogs, modals o drawers implementados. |
| Loading, error y empty | `EditorWorkspace`, `DocumentPreview`, `DocumentSettingsControls` | Restaurar IndexedDB, cambiar documentos, terminar paginación; informar errores de metadata/Markdown/impresión | Hay textos de estado y errores, `role="status"` y `aria-live` en algunos flujos. El estado de guardado local se oculta en móvil; algunos errores se exponen solo como `title`. No hay skeleton. El listado incluye “No documents yet”, aunque normalmente se crea o restaura un documento activo. |

**Áreas no encontradas:** rutas separadas de documentos/settings/exportación, navegación entre páginas del preview, selector de tema claro/oscuro, preferencias de usuario, command palette, ayuda de shortcuts, componentes compartidos en `src/components/ui`, ni implementaciones de Card/Surface/Modal/Drawer/Tabs/Tooltip de HeroUI. El preview incluye themes del documento; no son themes de la interfaz.

## 2. Auditoría visual y sistema existente

### Lo que funciona

- El producto da prioridad al contenido y a la hoja; no usa Cards apiladas. El grid, las reglas entre paneles y los fieldsets tienen una función de separación reconocible.
- El preview usa fondo distinto de la página, sombra tenue y dimensiones A4/Letter; la hoja se conserva blanca en modo oscuro, apropiadamente para representar el resultado impreso (`src/styles/document/page.css`). La impresión elimina controles y sombras (`src/styles/print.css`).
- La paleta global tiene nombres semánticos y variantes claras/oscuras. La página de inicio usa una tipografía grande y un ancho de lectura limitado. Los cuatro themes del documento viven separados de la UI (`src/lib/document/themes.ts`, `src/styles/document/base.css`).
- Los controles principales son textos visibles; los botones no dependen exclusivamente de iconos. Esto favorece su descubribilidad y evita necesitar un tooltip para cada acción.

### Tokens encontrados

| Token/decisión | Valor o uso observado | Evaluación |
|---|---|---|
| Fondo claro / texto | `#f8f8f6` / `#20211e` | Paleta cálida, neutra y sobria. |
| Texto secundario | `#777971` | La relación de contraste calculada contra el fondo claro `#f8f8f6` es aproximadamente **4.15:1**. No alcanza 4.5:1 para texto normal; aparece en muchas etiquetas y metadatos pequeños (`text-muted`). Revisar el token y medir todos sus fondos de uso. |
| Superficie sutil / borde | `#f0f0ed` / `#dedfd9` | Contraste de borde contra el fondo principal aproximadamente **1.26:1**. Puede bastar como división decorativa, pero no debe ser la única señal que identifica un control o límite necesario. |
| Acento claro | `#536e55`; texto blanco | Contraste calculado aproximado **5.30:1** contra el fondo principal; buen punto de partida para CTA. |
| Tema oscuro | fondo `#171815`, texto `#efefe9`, muted `#a2a49a`, borde `#363832`, acento `#91b993` | Se activa con `prefers-color-scheme`; el par muted/fondo calculado es cercano a 7.06:1. No hay selector manual ni preferencia de aplicación. |
| Tipografía UI | Arial/Helvetica; Cascadia Code/Consolas para mono | Legible y disponible, pero la identidad visual de la UI descansa casi completamente en fuentes de sistema. Montserrat es seleccionable como tipografía del documento, no como tipografía de la interfaz. |
| Tipografía del documento | Arial por defecto; Arial, Helvetica, Georgia, Times New Roman, Courier New y Montserrat; 9–16 pt | Ajuste funcional. Las WOFF2 de Montserrat se alojan localmente. El preview documenta/configura estas opciones en el panel. |
| Espaciado | Escala Tailwind habitual más arbitrarios como `18px`, `0.6875rem`, `44vw`, `50vh`, `40rem` y medidas `mm` | La mayoría del layout se compone con utilities, pero todavía no hay escala Docmark documentada para controles, paneles y microtipografía. Los valores físicos del papel son deliberados y deben permanecer separados de tokens UI. |
| Radios y sombras | `rounded`, `rounded-md`, `rounded-full`; `shadow-lg/xl`; sombra independiente de página | Consistentes en términos generales, pero sin un token común de radio/elevación. Los menús usan sombras más fuertes que la hoja y entre sí no tienen el mismo ancho/padding. |
| Estados | hover, disabled y `focus-visible` en buena parte de settings; estilos CodeMirror propios | No hay componente Button/Field compartido que asegure la misma altura, foco, hover y disabled en header, toolbar, menú y ajustes. Algunos botones del selector no declaran un `focus-visible` propio, mientras los summaries y los inputs sí. |

Los cocientes de contraste anteriores son cálculos de los colores literales en `src/app/globals.css`, no una auditoría de cada estado, superficie o theme documental. La medida visual final debe verificarse en pantalla después de cualquier ajuste.

## 3. Flujos UX y jerarquía de acciones

### Flujo principal observado

1. Al entrar, Docmark restaura el último documento de IndexedDB o crea uno inicial.
2. Se escribe Markdown en CodeMirror; el estado se guarda automáticamente en IndexedDB y el preview se vuelve a paginar.
3. Se modifican las opciones de página, estilo, portada o decoraciones directamente sobre el panel derecho.
4. Para contenido estructural se insertan TOC o page break desde la toolbar; su fuente sigue siendo Markdown.
5. `Export PDF` abre el diálogo nativo de imprimir/guardar.

El flujo está conceptualmente bien integrado: no hace falta navegar entre páginas y la fuente permanece editable. La fricción proviene de que **escribir, configurar y revisar** comparten una pantalla donde el panel de ajustes toma mucho espacio y no hay un modo alternativo de concentrarse en editor o preview.

### Clasificación recomendada

| Clase | Acciones | Presentación recomendada |
|---|---|---|
| **Primary** | Export PDF; editar Markdown como tarea central | Dar a Export PDF la única variante primaria del header. El editor conserva el área y el foco visual principales. Mostrar claramente cuándo se está preparando la paginación. |
| **Secondary** | Abrir Markdown, guardar/guardar como, insertar TOC o salto, cambiar documento, nueva copia | Mantener las acciones que se usan con frecuencia visibles, con variantes secundarias o agrupadas por contexto. Guardar y abrir pertenecen a File; TOC/page break pertenecen a una toolbar identificada del editor. |
| **Tertiary** | Márgenes, familia/tamaño, numeración, portada, cabecera/pie, portabilidad, renombrar | Organizar bajo Ajustes del documento con grupos semánticos que se puedan plegar. Mostrar un resumen de ajustes importantes cuando el panel esté cerrado. |
| **Destructive** | Eliminar documento | Mantener separado de abrir/duplicar; estilizar como acción de peligro y usar diálogo integrado con título, consecuencia, Cancelar y Eliminar. No hacer que el peligro dependa solo del color. |

En la implementación actual, `Export PDF` tiene borde y está al nivel de `File`, aunque sea el fin del flujo descrito. En la toolbar del editor, “Copy Markdown”, “Insert TOC” y “Page Break” comparten clase y proximidad; la acción estructural menos frecuente no debería reclamar el mismo énfasis que copiar o editar. La gestión del documento distribuye Rename/Duplicate/Delete en botones pequeños y cercanos; conviene mantener Eliminar aparte de las tareas habituales.

## 4. Auditoría específica del editor

`MarkdownEditor` implementa CodeMirror 6 correctamente como área de edición dedicada, con wrapping de línea, números de línea, selección, resaltado Markdown y feedback de copia. `historyKeymap` e `indentWithTab` aportan undo/redo e indentación estándar. El tema define colores propios y el foco del editor recibe un contorno.

| Mantener visible | Agrupar | Shortcuts recomendados / estado actual |
|---|---|---|
| Acciones estructurales del editor que se necesiten sin buscar: TOC y salto de página, junto con selección/estado de bloque | Copy Markdown puede pasar a un menú de acciones del editor; también es una acción disponible en el menú contextual estándar si se selecciona texto, aunque hoy copia todo el documento | Undo/redo depende de `historyKeymap`; Tab indenta. No se implementaron shortcuts de Docmark para TOC/page break y la UI no enseña atajos. No inventar combinaciones nuevas antes de documentar y evitar conflictos con el navegador/CodeMirror. |

Recomendaciones basadas en fricción concreta:

- Dar un nombre accesible a la toolbar (`role="toolbar"` o `HeroUI Toolbar`) y agrupar botones cercanos con separación semántica; el componente actual solo es un `div` visual.
- Mantener nombres visibles si se adoptan iconos. Si una acción pasa a icon-only, usar Button HeroUI con `aria-label` y Tooltip al recibir foco/hover; no sustituir texto claro por iconos no estándar.
- Ofrecer spellcheck como preferencia o justificar el `spellcheck: false`: en una herramienta de escritura, la revisión ortográfica del navegador puede ayudar, aunque tenga falsos positivos en código/identificadores.
- Añadir una forma de mostrar shortcuts y feedback de inserción (“TOC insertado”, “Salto añadido”), además del movimiento del cursor; hoy la región de estado informa solamente de clipboard o bloqueo de contexto.
- Evitar aumentar line numbers, toolbar y padding simultáneamente en una pantalla pequeña; el editor necesita preservar suficiente ancho para escribir Markdown sin que la numeración se coma demasiado espacio.

## 5. Preview y controles del documento

### Preview

El canvas separado, la página en blanco, la escala proporcional y el caption con tamaño/orientación/márgenes son decisiones acertadas. `PageDecorations` y páginas físicas compartidas con impresión ayudan a que la configuración corresponda al resultado real. Las páginas se presentan como artículos con nombre accesible “Page N”.

No existe zoom controlado por el usuario ni navegación por páginas. El escalado automático solo garantiza cabida horizontal (`Math.min(1, viewport.clientWidth / width)`), así que en pantallas amplias la vista no amplía por encima de su tamaño físico CSS; puede quedar visualmente pequeña en monitores grandes. El preview es desplazable pero carece de índice de páginas o página actual para documentos largos. Un zoom no debería cambiar la medida de impresión ni paginación.

La etiqueta “Live” no comunica si la actualización está al día. Existe `paginationReady` para deshabilitar Export PDF durante el cálculo, pero no se ve un estado de progreso junto al caption; si la paginación falla, aparece un mensaje en canvas. Recomiendo un estado discreto “Actualizando preview…” que desaparezca al estabilizarse y que no compita con el texto.

### Settings

El conjunto de controles de `DocumentSettingsControls` tiene grupos semánticos `fieldset`/`legend`, lo cual es un buen inicio. La información está aplanada en una sola banda que puede crecer en numerosas líneas: márgenes, página, orientación, theme, portada, cuatro ajustes tipográficos, portabilidad, numeración, header y footer. En un editor de texto esto hace que los settings dominen la mitad derecha y empujen la hoja hacia abajo.

Estructura sugerida:

1. **Página:** tamaño, orientación y márgenes (habituales, compactos).
2. **Apariencia:** theme, tipografía, alineación e interlineado.
3. **Portada:** switch y sus campos relacionados; ocultar campos cuando esté desactivada.
4. **Encabezado y pie:** contenido, alineación y activación agrupados.
5. **Numeración:** inicio y exclusión de portada; mantener claro que ocultar el adorno no altera el número del TOC.
6. **Archivo:** metadata portable y advertencias del Front Matter.

En escritorio, mostrar estos grupos en un panel lateral solicitado por botón (“Ajustes”, con cantidad/resumen opcional) o en una región colapsable que pueda cerrarse para devolver altura al preview. En móvil, presentarlos en Drawer/Sheet de pantalla completa o página superpuesta con cierre y retorno de foco. No recomiendo Tabs dentro de settings por defecto: hay pocas categorías pero contienen combinaciones relacionadas y los tabs esconden campos; Disclosure permite mantener una categoría visible sin saltos de contexto.

## 6. Uso de HeroUI v3

### Hechos del repositorio

- No hay dependencia `@heroui/react` ni `@heroui/styles` en `package.json` o lockfile.
- `src/app/globals.css` importa Tailwind y CSS documental, no `@heroui/styles`.
- No hay proveedor ni configuración específica de HeroUI; v3 es CSS-first y no requiere un provider para sus estilos.
- No se usa `Button`, `ButtonGroup`, `Toolbar`, `Tooltip`, `Popover`, `Dropdown`, `Drawer`, `Modal`, `Tabs`, `Surface`, `Input`, `Select`, `Switch`, `Checkbox`, `RadioGroup`, `Disclosure` o `Divider` de HeroUI. Existen controles HTML nativos equivalentes y markup local.
- La custom UI está distribuida en componentes funcionales grandes, sin primitives comunes de botón/input/popover y con classes repetidas.

### Recomendaciones v3 justificadas

| Patrón actual | Oportunidad HeroUI v3 | Justificación / límite |
|---|---|---|
| Botones creados uno por uno con clases divergentes (`markdown-editor`, `editor-workspace`, `document-switcher`, menús) | `Button` con variantes `primary`, `secondary`, `tertiary`, `outline`, `ghost`, `danger`/`danger-soft`; `ButtonGroup` solo para acciones del mismo grupo | Unifica altura, disabled, pressed y focus-visible. `Export PDF` tiene sentido como único primary; Eliminar, danger. No convertir todos los enlaces/labels en botones ni dar a cada botón la variante primary. |
| Toolbar local hecha como `div` con tres botones | `Toolbar` más `ButtonGroup` donde haya conjunto contiguo | HeroUI Toolbar incluye navegación por flechas; aporta semántica y accesibilidad útil a un editor. No es necesaria si se conserva una fila estática con Tab, pero debe etiquetarse. Fuente: [Toolbar](https://heroui.com/docs/react/components/toolbar). |
| Menú File en `<details>` | `Dropdown` con items Open/Save/Save As | Acciones discretas, homogéneas y de menú; aprovecha navegación de menú/teclado. Mantener la opción Save disabled/feedback correcto por estado. Fuente: [Dropdown](https://heroui.com/en/docs/react/components/dropdown). |
| Gestor de documentos complejo en `<details>` con lista, edición y acciones por fila | `Popover`/`Popover.Dialog` o panel dedicado; `Dropdown` por documento para acciones secundarias | Tiene contenido interactivo (crear, lista, renombrar, duplicar y eliminar), por lo que un menú plano deja de ser adecuado. Popover permite conservar contexto; debe gestionar foco, teclado y cierre. Fuentes: [Popover](https://heroui.com/en/docs/react/components/popover), [Dropdown](https://heroui.com/en/docs/react/components/dropdown). |
| Ajustes de márgenes flotantes en `<details>` | `Popover` con heading y 4 `NumberField`/Inputs | El popover puede colocarse, invertir ubicación y asociar diálogo/heading. Si permanece nativo `<details>`, también es válido para contenido no modal simple; no migrar por uniformidad solamente. |
| Confirmación `window.confirm` al eliminar | `Modal`/`AlertDialog` accesible | Necesidad concreta: confirmar destrucción, incluir título/descripción, foco gestionado, Cancelar/Eliminar, estilo consistente. Fuente: [Modal](https://heroui.com/en/docs/react/components/modal). |
| Native selects y checkboxes | `Select`, `Checkbox`, `Switch` de HeroUI solo donde ayuden a estados y labels coherentes | Los native select/checkbox funcionan y suelen ser accesibles. HeroUI tiene sentido para estilizar de forma uniforme y soportar más opciones; Switch comunica un estado binario activado/desactivado como “Show cover”. No reemplazar checkbox por switch si la acción es selección, ni customizar entradas nativas para micro-estilos sin necesidad. |
| No hay tooltip custom; hay `title` nativo y labels visibles | `Tooltip` solo en icon-only, abreviaciones o acciones cuyo significado no cabe en pantalla | En botones textuales como Export PDF o Copy Markdown el tooltip duplicaría el label; mantener descripción persistente para feedback esencial. |
| Panel de preview y papel | `Surface` solo si representa una superficie UI real; la hoja no debe parecer una Card de aplicación | La página es el artefacto documental; conservar aspecto de papel y estilos físicos propios. No envolver cada grupo o página en Card. |
| Editor/preview lado a lado sin alternativa | `Tabs`/toggle accesible en mobile para seleccionar Editor o Preview | Mejora el espacio en pantallas estrechas; conservar opción de split al ancho suficiente. La pestaña debe conservar estado/foco y no resetear scroll o contenido. |
| Secciones `fieldset`/`legend`, controles nativos | `Disclosure` opcional; `Divider` solo donde aporte separación y no repita reglas | El grupo semántico nativo está bien. Una migración debe preservar fieldset/legend y no sumar un borde HeroUI más un border CSS. |

HeroUI v3 separa comportamiento React y hojas CSS; su guía indica `@heroui/react` más la importación `@heroui/styles` en CSS y un patrón de composición por subcomponentes. No se debe aplicar API de v2 (por ejemplo `color`/`variant="solid"`) al iniciar una adopción v3. Véanse [Introducing HeroUI v3](https://heroui.com/en/docs/react/releases/v3-0-0), [Button v3](https://heroui.com/docs/react/components/button) y [Styling & Theming](https://heroui.com/en/docs/react/migration/styling). La tabla anterior es una evaluación de encaje, **no una propuesta para instalar ahora**.

## 7. Responsive

| Rango conceptual | Código actual | Riesgo | Comportamiento objetivo |
|---|---|---|---|
| Desktop grande | Grid 2 columnas desde `md`; editor y preview simultáneos | La escala del papel tiene límite `1`, sin zoom. Muchos settings reducen la altura útil de preview. | Split view con ancho razonable, settings plegables, zoom independiente de impresión, mantener barra de acciones estable. |
| Laptop | Mismo split 50/50; toolbar/settings envuelven controles | Un texto largo reduce espacio de escritura; varios grupos del panel derecho consumen pantalla vertical. | Split con proporciones ajustables o límites mínimos documentados; settings cerrados por defecto salvo los de página esenciales. |
| Tablet | Breakpoint Tailwind `md` cambia a dos columnas en 768 px; debajo apila | A 768 px cada lado puede quedar alrededor de 384 px y sigue habiendo muchos controles de preview. Es un breakpoint abrupto para el flujo principal. | Decidir por ancho útil real: split a tablet landscape/desktop; selector Editor/Preview en tablet portrait. |
| Mobile | Una columna; cada panel declara `min-h-[50vh]`; raíz `h-screen min-h-[40rem] overflow-hidden` | Los dos paneles apilados requieren como mínimo aproximadamente una pantalla de alto cada uno más header, dentro de una raíz fija que oculta overflow. Hay riesgo de que el segundo panel quede fuera del área visible o se vuelva difícil de alcanzar; no existe modo de un solo panel. | Editor o Preview como vistas intercambiables con tabs/segmented control, barra compacta con File/Export y ajustes en drawer a pantalla completa; conservar el contenido/estado al cambiar. |

La conclusión de mobile es un riesgo derivado directamente de la combinación de reglas CSS, no una afirmación de clipping verificada en todos los dispositivos. Debe confirmarse a 320, 375 y 430 px; tablet portrait/landscape, laptop 1280×800 y desktop ≥1440 px; también con una altura de viewport corta.

## 8. Accesibilidad — hallazgos concretos

| Hallazgo observado | Consecuencia | Prioridad sugerida |
|---|---|---|
| `--muted: #777971` contra `--background: #f8f8f6` ofrece aproximadamente 4.15:1. Muchos labels/status con `text-muted` están en 11–12 px. | Texto normal pequeño no llega al mínimo WCAG AA de 4.5:1 en ese par de colores. Ajustar token o uso/fondo y verificar también estados muted dentro de fieldsets. | P1 |
| Persistencia muestra `role="status"`, pero el status tiene `hidden sm:inline`; además, al ocurrir error, presenta “Document operation failed” y expone el detalle en `title={documentError}`. | En viewport pequeño desaparece un estado importante; `title` no garantiza acceso por táctil ni por lector. El usuario puede no saber si sus cambios se guardaron ni cómo recuperarse. | P1 |
| `html lang="en"` en `src/app/layout.tsx`; UI y labels inspeccionados están escritos en inglés. | Es coherente hoy con el contenido visible. Si se prevé interfaz española/multilingüe, el idioma debe cambiar con la localización para lector de pantalla y pronunciación; no hay selector/localización observados. | P2 condicional |
| Focus rings se definen de forma desigual: ajustes y summaries incluyen `focus-visible:ring`; toolbar y varios botones de la lista no tienen regla propia explícita. | La visibilidad dependerá de estilos de navegador/Preflight y no es uniforme. Verificar con teclado y centralizar el estado de foco. | P2 |
| Muchos checkboxes tienen `aria-label` además de texto vecino; algunos selectores se nombran por `<label>` y otros con `aria-label`. | No hay falta general de nombre, pero los patrones son redundantes/inconsistentes y suben el coste de mantener el formulario. Preferir label visible asociado y usar `aria-label` solo sin texto visible. | P3 |
| Mensajes transitorios de clipboard duran 2,4 s y limpian la región; copia usa `role="status" aria-live="polite"`. | El anuncio accesible es una buena decisión; para usuarios que necesiten más tiempo, el feedback visual breve puede desaparecer antes de leerlo. Considerar mantener un estado “Copied” persistente hasta la siguiente acción. | P2 |
| `spellcheck: "false"` para el área editable CodeMirror | Se desactiva el corrector nativo del navegador incluso en el texto de prosa. | P2 |
| Targets pequeños en botones `Rename`, `Duplicate` y `Delete`: clases `text-[0.6875rem]`, `px-1.5`, `py-0.5`. | Objetivos con poca área interactiva dentro de un popover; especialmente difícil para touch/precisión limitada. | P2 |
| No se observaron componentes Dialog propios, labels de dialog ni patrones de foco modal; la eliminación utiliza confirmación nativa del sistema. | La apariencia no sigue el sistema de la app; el comportamiento depende del navegador. HeroUI Modal/AlertDialog permitiría foco, título y descripción asociados. | P2 |

También son fortalezas observadas: labels explícitos en entradas principales, `fieldset`/`legend`, landmarks editor/preview, CodeMirror con nombre y descripción, `aria-live` para guardado/copia y artículos con nombres de página. La inspección de árbol accesible no sustituye una prueba manual de NVDA/VoiceOver, zoom del navegador, alto contraste ni teclado de principio a fin.

## 9. Deuda de UI y consistencia

- El README menciona `src/components/ui`, hooks y types como áreas “as they become useful”; esos directorios no están en el árbol actual. No hay una capa compartida de primitivas de UI.
- Varias cadenas largas de clases están repetidas: especialmente control de texto/Select/input con `rounded border border-border bg-background ... focus-visible:ring-2`. Botones de header, menú y toolbar tienen estilos diferentes sin variante central.
- Los valores de diseño se dividen entre tokens de color globales, números Tailwind, CSS documental, estilos inline para páginas en mm y clases de página. La separación print/documento frente a UI está justificada; lo pendiente es nombrar y consolidar la capa UI.
- `DocumentSettingsControls` concentra página, portada, tipografía, metadata, numeración, header y footer, validación de márgenes y múltiples grupos. Es el componente de UI más denso y un punto natural para dividir por secciones si se rediseña.
- `EditorWorkspace` coordina estado de documentos, persistencia, archivos, carga y exportación además del layout. Su tamaño hace más difícil evaluar/iterar independientemente el header y estados, pero el comportamiento actual tiene tests amplios; dividirlo se justifica por acoplamiento UX/estado, no solo por cantidad de líneas.
- Hay CSS de impresión, página, contenido y themes con tokens propios; `page.css` contiene reglas de canvas/papel y una media query dark. La hoja física blanca intencional no debe heredar el fondo oscuro de la app.
- No se encontraron componentes Card duplicados, CSS-in-JS ad hoc, icon package, ni animaciones constantes. La auditoría no recomienda añadir Cards, iconos o motion para “hacerlo premium”.

## 10. Priorización y matriz final

**P0:** bloqueante crítico para completar tarea o acceder a la aplicación. No se confirmó uno en esta revisión.  
**P1:** impacto alto en legibilidad, flujo principal, contenido guardado o uso de la pantalla.  
**P2:** mejora importante de eficiencia, adaptabilidad o accesibilidad.  
**P3:** pulido, consistencia o reducción de deuda moderada. El esfuerzo es una estimación relativa, no un plan de trabajo.

| Área | Problema | Impacto | Prioridad | Esfuerzo | Recomendación | HeroUI |
|---|---|---:|---:|---:|---|---|
| Accesibilidad visual | Muted claro ~4.15:1 contra fondo; usado en microtexto | Alto | P1 | Low | Ajustar/consolidar token muted y volver a medir usos con sus superficies reales | Theme tokens |
| Mobile | Split pasa a paneles apilados con mínimos `50vh`; raíz fija y `overflow-hidden` | Alto | P1 | High | En mobile usar Editor/Preview seleccionables y ajustar altura a viewport dinámico; validar visualmente | Tabs pueden aportar; no son obligatorios |
| Preview/settings | Todos los grupos de settings compiten por espacio antes de la página | Alto | P1 | Medium | Botón Ajustes; categorías en Disclosure/drawer, con valores esenciales resumidos | Popover/Drawer/Disclosure según presentación |
| Feedback de guardado | Estado oculto debajo de `sm`; error real está en `title` | Alto | P1 | Medium | Mantener Saved/Saving/Error accesible en todos los breakpoints y mostrar error accionable con Alert persistente | Alert/Toast para feedback; no esconderlo |
| Stack UI | No hay HeroUI pese a que el contexto declara HeroUI v3 | Alto (requisito de diseño) | P1 | Medium | Aclarar el stack objetivo antes de una migración; si se adopta, usar v3 CSS + React, no API v2 | Integración HeroUI v3 selectiva |
| Jerarquía global | Export PDF no destaca como acción principal | Medio-alto | P2 | Low | Variante primaria única; Save/File secundarios | Button variants |
| Preview largo | Sin zoom, página actual o navegación | Medio | P2 | Medium | Zoom independiente de paginación/impresión y navegación por páginas solo si documentos largos lo justifican | Buttons/Slider, opcional |
| Editor | Toolbar sin landmark ni shortcuts de inserción anunciados | Medio | P2 | Medium | Nombrar toolbar, agrupar y documentar shortcuts con ayuda contextual | Toolbar, ButtonGroup, Tooltip donde haga falta |
| Destructivo | `window.confirm` no sigue el lenguaje visual; delete cercano a otras acciones | Medio-alto | P2 | Medium | Modal/AlertDialog consistente, foco y consecuencia clara; separar la acción destructiva | Modal/AlertDialog |
| Gestión de documentos | Selector de contexto y gestión mezclan tareas en un popover de filas | Medio | P2 | Medium | Mantener selección simple; llevar acciones por fila a Dropdown y rename a interacción enfocada | Popover + Dropdown |
| Targets táctiles | Botones de administración en 11 px y padding escaso | Medio | P2 | Low | Aumentar hit-area manteniendo texto compacto y ordenando por menú en mobile | Button size/variants |
| Idioma | HTML/UI fijados a `en` | Bajo/medio | P2 condicional | Medium | Mantener coherencia; planificar mensajes/`lang` dinámicos si se añade español | No es cuestión de componente |
| Editor | Spellcheck deshabilitado | Medio | P2 | Low | Confirmar si es deliberado; habilitar o exponer preferencia para prosa | Sin componente requerido |
| UI primitives | Controles/botones repiten estilos locales | Medio | P2 | Medium | Consolidar una pequeña capa de Button, Field, Select, Checkbox y estados antes de ampliar superficies | Button/Input/Select/Checkbox/Switch |
| Feedback corto | “Copied” desaparece en 2,4 s | Bajo/medio | P2 | Low | Mantener hasta acción siguiente o permitir suficiente tiempo de lectura | Toast/Alert opcional |
| Focus | Focus-visible desigual entre secciones | Medio | P2 | Low | Definir estado y tokens comunes; revisar tab order en flujo principal | Button/Input de v3 ofrece estados consistentes |
| UI tokens | No hay escala común documentada para radius/elevation/tamaño de control | Medio | P3 | Medium | Formalizar tokens a partir de valores existentes, sin cambiar los de documento impreso | CSS variables/HeroUI styles |
| Iconografía | Se usan caracteres `▾`, `✓`, `+` puntuales | Bajo | P3 | Low | Conservar textos; si se adopta un set de iconos, normalizar tamaño/alineación y nombre accesible | Button icon-only solo para casos compactos |
| Home | Inicio minimalista sin vista de capacidades | Bajo | P3 | Low | Mejorar guía de primera sesión con ejemplos si se valida necesidad | Button primario compartido |

## 11. Quick wins

1. Subir el contraste del token `muted` en claro y probarlo sobre `background` y `subtle`.
2. No ocultar el estado de guardado en móvil; sustituir el `title` de error por mensaje visible y anunciado, con acción/recuperación clara.
3. Dar a `Export PDF` la variante primaria y reservar outline/ghost para tareas secundarias.
4. Hacer explícito el estado “Preparando preview…” durante la paginación y asociarlo con el botón deshabilitado.
5. Aumentar área táctil de Rename/Duplicate/Delete y mostrar Eliminar como acción de peligro separada.
6. Plegar inicialmente ajustes secundarios (tipografía, portada metadata, decoraciones/portabilidad) y permitir cerrar todo el panel de settings para recuperar espacio.
7. Revisar el estado focus-visible uniforme de toolbar, listas, File y controles.
8. Hacer persistente el mensaje de copia hasta la siguiente acción, manteniendo `aria-live`.

## 12. Mejoras estructurales

1. Definir el modelo de workspace responsive: split view en escritorio y elección Editor/Preview en móvil/tablet portrait, sin perder estado de CodeMirror ni scroll.
2. Separar los grupos de `DocumentSettingsControls` en regiones con una IA simple, y decidir entre panel lateral colapsable desktop y Drawer/Sheet móvil.
3. Si HeroUI v3 es un requisito real, adoptarlo como una capa de componentes/estilos pequeña y progresiva: Button/variants, Toolbar, Dropdown, Popover y Modal primero. No es necesario migrar las páginas documentales ni envolver cada fieldset con una Surface.
4. Consolidar tokens UI de color/contraste, foco, radios, elevation, alturas, spacing de control y tamaños tipográficos; conservar aparte el sistema físico de documentos, themes y print CSS.
5. Desacoplar presentación de estados de persistencia/archivo/preview para poder mostrar errores, progreso, panel móvil y cambios de foco sin aumentar más el workspace monolítico.
6. Añadir navegación para documentos largos solo tras definir el modelo deseado (zoom, página actual, miniaturas o tabla de páginas) y garantizar que no cambie el resultado impreso.
7. Planificar localización del producto y `lang` si Docmark soportará más de un idioma.

## 13. Estado objetivo

Después de un rediseño, Docmark debería sentirse como una mesa de trabajo para redactar y revisar documentos: el texto tiene la mayor jerarquía, la hoja sigue siendo el centro visual del preview y los ajustes aparecen cuando se necesitan. En desktop debe ser fácil comparar fuente y página sin bordes innecesarios; en mobile, el usuario debe poder elegir entre escribir y revisar sin que un split comprimido ni los ajustes le quiten espacio. Las acciones frecuentes se reconocen de inmediato, las opciones avanzadas permanecen disponibles pero ordenadas, guardar/exportar comunica su estado, y los patrones de teclado, foco y feedback son consistentes. El lenguaje visual puede tomar componentes accesibles de HeroUI v3 y tokens compartidos sin convertir la aplicación en un dashboard ni alterar la fidelidad física del PDF.

## Fuentes oficiales de HeroUI v3

- [Introducing HeroUI v3](https://heroui.com/en/docs/react/releases/v3-0-0) — arquitectura CSS-first y composición.
- [Styling & Theming](https://heroui.com/en/docs/react/migration/styling) — importación de estilos y tokens v3.
- [Button](https://heroui.com/docs/react/components/button) — variantes y estados de interacción.
- [Toolbar](https://heroui.com/docs/react/components/toolbar) — patrón accesible para controles relacionados.
- [Dropdown](https://heroui.com/en/docs/react/components/dropdown) — estructura compuesta de menú.
- [Popover](https://heroui.com/en/docs/react/components/popover) — contenido contextual y composición.
- [Modal](https://heroui.com/en/docs/react/components/modal) — patrón de diálogo y gestión de foco.
- [Tabs](https://heroui.com/docs/react/components/tabs) — navegación por paneles para un workspace con espacio limitado.
