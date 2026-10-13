# DayFlow

Un sistema personal de productividad pensado para estudiar: tareas, asignaturas con notas, exámenes
con plan de estudio, horario de clases, hábitos, metas, agenda y modo enfoque, todo conectado en una
sola app. Funciona sin cuenta y sin conexión; inicia sesión solo si quieres el mismo espacio en
varios dispositivos. Está en español.

## Puesta en marcha

```bash
npm install
npm run dev
```

Abre **http://localhost:5174**.

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo con recarga en caliente |
| `npm run build` | Comprueba los tipos y compila a `dist/` |
| `npm run preview` | Sirve la versión compilada (la única donde actúa el service worker) |
| `npm run typecheck` | Solo comprobación de tipos |

No hace falta `.env`: la sincronización viene configurada y es opcional. La compilación es estática,
con rutas por hash (`#/tasks`) y rutas relativas, así que se puede alojar en cualquier sitio, en la
raíz de un dominio o en una subcarpeta, sin reglas de reescritura.

## Qué incluye

- **Hoy**: puntuación del día, tareas, clases de hoy, próximos exámenes, agenda, hábitos, metas y los
  últimos entrenos de PepeLift (solo terminados).
- **Asignaturas**: créditos, periodo, profesorado, aula y enlace al aula virtual. Todo lo demás
  (tareas, bloques, sesiones de enfoque, clases) cuelga de ellas y toma su color.
- **Evaluación y notas**: tú defines las partes de cada asignatura (peso, nota, mínimo, fecha). Calcula
  la nota actual, la máxima posible y **qué nota necesitas** para llegar a un objetivo, respetando los
  mínimos. Nota media del expediente ponderada por créditos.
- **Exámenes**: cuenta atrás, siguiente examen y pasados. **Plan de estudio automático**: reparte
  sesiones entre hoy y la víspera en los huecos libres de la agenda, esquivando clases.
- **Horario**: clases semanales con varios días a la vez, tipo, aula, periodo de clases y días sin clase.
- **Captura rápida y `Ctrl+K`**: «entrega SI viernes 23:59 !alta ~2h» crea la tarea entendiendo fecha,
  hora, prioridad, asignatura y duración. La paleta también busca y navega.
- **Tareas**: lista y tablero, filtros, arrastrar y soltar (en escritorio).
- **Hábitos, metas, agenda semanal, modo enfoque (pomodoro) y análisis.**
- **App instalable y avisos**: se instala en el móvil u ordenador, abre sin conexión y avisa de clases,
  estudio, entregas y exámenes.

## Datos y privacidad

- **Local primero**: el estado vive en `localStorage` (`dayflow.state.v1`) y se valida entero al cargar,
  importar o recibir de la nube (`sanitizeState` en `src/lib/storage.ts`). Cualquier campo nuevo del
  modelo debe añadirse ahí o se descartará.
- **Sincronización opcional**: cuentas de email y contraseña con Supabase Auth. Una fila por usuario en
  `public.dayflow_states` con el espacio entero como JSON. Row-level security activada: cada usuario solo
  ve la suya. La clave publicable de `src/lib/supabase.ts` está pensada para ir en el código del
  navegador; lo que protege los datos es RLS. Se puede sustituir con `VITE_SUPABASE_URL` y
  `VITE_SUPABASE_ANON_KEY`.
- **Qué no se sincroniza**: los ajustes (tema, objetivos) y las preferencias de avisos, que son de cada
  dispositivo.
- **Conflictos**: si la nube y el dispositivo difieren al iniciar sesión, se pregunta cuál conservar y no
  se puede cerrar el diálogo sin elegir. Después gana la última escritura; no es un CRDT, así que editar
  a la vez en dos dispositivos puede perder el cambio más antiguo.
- **Entrenos**: DayFlow lee las tablas de PepeLift (mismo proyecto de Supabase y mismas cuentas) en solo
  lectura. Nunca escribe en ellas.

## Avisos: qué pueden y qué no

Funcionan **sin servidor**: DayFlow calcula qué toca avisar y lo muestra mientras está abierto, en una
pestaña o como app instalada en segundo plano. No hay avisos con la app completamente cerrada: eso
exigiría un servidor de notificaciones push. En iPhone, los avisos solo existen con la app instalada en
la pantalla de inicio.

## Estructura

```
src/
  types.ts                 Modelo de datos
  lib/                     Lógica pura, sin React: notas, exámenes, horario, captura rápida, avisos…
  store/                   Reducer único (AppStore) y motor de sincronización (SyncProvider)
  features/                Una carpeta por pantalla (today, tasks, subjects, exams, timetable…)
  components/              Interfaz común (Card, Modal, Field…) y la estructura de la app
  i18n/es.ts               Textos y autoridad de claves
public/                    Manifiesto, service worker (sw.js) e iconos
```

Sin librerías de más a propósito: router por hash propio, gráficos en SVG a mano, arrastrar y soltar
nativo, un solo reducer y un diccionario tipado en lugar de una librería de i18n.

## Publicar (Vercel)

1. Sube este repositorio a GitHub.
2. En Vercel, **Add New → Project** e importa el repositorio. Vercel detecta Vite: no cambies nada
   (comando `npm run build`, salida `dist`). No necesita variables de entorno.
3. Cuando tengas la dirección, añádela en Supabase → **Authentication → URL Configuration** (Site URL y
   Redirect URLs). Sin eso, el enlace del correo de confirmación de una cuenta nueva no volvería a la app.
4. HTTPS es obligatorio para instalar la app y para los avisos; Vercel ya lo da.

Cada `git push` a `main` se despliega solo.
