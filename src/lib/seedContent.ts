import type { CategoryKey, ColorKey, HabitFrequency, Language, Priority, TaskStatus } from '@/types'

/**
 * Contenido de demostración. La siembra ocurre una sola vez al instalar, así
 * que el espacio de ejemplo llega ya en español.
 */

export interface HabitPreset {
  key: string
  name: string
  description: string
  icon: string
  color: ColorKey
  frequency: HabitFrequency
}

interface HistoryTitle {
  title: string
  category: CategoryKey
}

interface LiveTask {
  title: string
  status: TaskStatus
  priority: Priority
  category: CategoryKey
  dueTime: string | null
  estimateMin: number
}

interface GoalSeed {
  title: string
  description: string
  milestones: string[]
}

export interface SeedContent {
  habits: HabitPreset[]
  history: HistoryTitle[]
  live: LiveTask[]
  goals: {
    project: GoalSeed
    running: GoalSeed
    reading: GoalSeed
    language: GoalSeed
    savings: GoalSeed
  }
  blocks: {
    deepWork: string[]
    meetings: string[]
    study: string[]
    lunch: string
    gym: string
    longRun: string
    mobility: string
    errands: string
    weeklyReview: string
    weeklyReviewNote: string
  }
  defaultPrimaryGoal: string
}


const ES: SeedContent = {
  habits: [
    { key: 'move', name: 'Moverme 30 minutos', description: 'Cualquier cosa que suba las pulsaciones.', icon: 'dumbbell', color: 'emerald', frequency: 'daily' },
    { key: 'read', name: 'Leer 20 páginas', description: 'En papel o e-reader, sin redes.', icon: 'book', color: 'violet', frequency: 'daily' },
    { key: 'deepwork', name: 'Un bloque de trabajo profundo', description: 'Noventa minutos sin interrupciones.', icon: 'brain', color: 'indigo', frequency: 'weekdays' },
    { key: 'water', name: 'Beber 2L de agua', description: 'Rellenar la botella cuatro veces.', icon: 'water', color: 'sky', frequency: 'daily' },
    { key: 'journal', name: 'Diario de la noche', description: 'Con tres líneas basta.', icon: 'write', color: 'amber', frequency: 'daily' },
    { key: 'sleep', name: 'Luces fuera a las 23:00', description: 'El móvil se carga fuera del dormitorio.', icon: 'moon', color: 'teal', frequency: 'daily' },
    { key: 'walk', name: '10.000 pasos', description: 'Ir dando el rodeo largo.', icon: 'steps', color: 'rose', frequency: 'daily' },
    { key: 'language', name: 'Practicar idiomas', description: 'Quince minutos de ejercicios.', icon: 'language', color: 'violet', frequency: 'weekdays' },
  ],
  history: [
    { title: 'Revisar pull requests', category: 'work' },
    { title: 'Escribir el resumen semanal', category: 'work' },
    { title: 'Refactorizar el módulo de ajustes', category: 'work' },
    { title: 'Preparar notas de la planificación', category: 'work' },
    { title: 'Arreglar el test intermitente del checkout', category: 'work' },
    { title: 'Redactar el esquema de la hoja de ruta', category: 'work' },
    { title: 'Responder al hilo de feedback de diseño', category: 'work' },
    { title: 'Pagar la factura de la luz', category: 'admin' },
    { title: 'Presentar la nota de gastos', category: 'admin' },
    { title: 'Renovar el dominio', category: 'admin' },
    { title: 'Pedir cita con el dentista', category: 'admin' },
    { title: 'Preparar las comidas de la semana', category: 'health' },
    { title: 'Tirada larga, 8km', category: 'health' },
    { title: 'Sesión de estiramientos y movilidad', category: 'health' },
    { title: 'Terminar el capítulo de genéricos', category: 'learning' },
    { title: 'Ver la charla de diseño de sistemas', category: 'learning' },
    { title: 'Repasar vocabulario de inglés', category: 'learning' },
    { title: 'Bocetar tres ideas de logo', category: 'creative' },
    { title: 'Editar las fotos del finde', category: 'creative' },
    { title: 'Escribir 500 palabras', category: 'creative' },
    { title: 'Llamar a la familia', category: 'personal' },
    { title: 'Planear la escapada del finde', category: 'personal' },
    { title: 'Ordenar el escritorio', category: 'personal' },
  ],
  live: [
    { title: 'Esbozar el anuncio de lanzamiento', status: 'today', priority: 'high', category: 'work', dueTime: '10:00', estimateMin: 45 },
    { title: 'Revisar de principio a fin los textos de bienvenida', status: 'today', priority: 'medium', category: 'work', dueTime: '11:30', estimateMin: 30 },
    { title: 'Contestar los correos de la lista de espera', status: 'today', priority: 'medium', category: 'admin', dueTime: '14:00', estimateMin: 25 },
    { title: 'Sesión de fuerza en el gimnasio', status: 'today', priority: 'high', category: 'health', dueTime: '18:00', estimateMin: 45 },
    { title: 'Leer 20 páginas antes de dormir', status: 'today', priority: 'low', category: 'learning', dueTime: '21:30', estimateMin: 30 },
    { title: 'Montar el panel de análisis', status: 'in_progress', priority: 'urgent', category: 'work', dueTime: '16:00', estimateMin: 120 },
    { title: 'Redactar la página de precios', status: 'in_progress', priority: 'high', category: 'creative', dueTime: null, estimateMin: 90 },
    { title: 'Buscar plataforma de newsletter', status: 'backlog', priority: 'low', category: 'admin', dueTime: null, estimateMin: 30 },
    { title: 'Configurar copias de seguridad automáticas', status: 'backlog', priority: 'medium', category: 'work', dueTime: null, estimateMin: 60 },
    { title: 'Planear el viaje de otoño', status: 'backlog', priority: 'low', category: 'personal', dueTime: null, estimateMin: 45 },
    { title: 'Renovar la web del portfolio', status: 'backlog', priority: 'medium', category: 'creative', dueTime: null, estimateMin: 180 },
    { title: 'Pedir la revisión médica anual', status: 'backlog', priority: 'medium', category: 'health', dueTime: null, estimateMin: 15 },
    { title: 'Escribir el caso de éxito del cliente', status: 'backlog', priority: 'high', category: 'creative', dueTime: null, estimateMin: 120 },
    { title: 'Comparar programas de contabilidad', status: 'backlog', priority: 'low', category: 'admin', dueTime: null, estimateMin: 45 },
  ],
  goals: {
    project: {
      title: 'Lanzar la primera versión de mi proyecto',
      description: 'El resultado que haría que este trimestre valiera la pena.',
      milestones: [
        'Validar la idea con cinco personas',
        'Diseñar los flujos principales',
        'Construir el MVP',
        'Beta privada con 20 personas',
        'Lanzamiento público',
      ],
    },
    running: {
      title: 'Correr una media maratón',
      description: 'Llegar a 21km sin destrozarme las rodillas.',
      milestones: [
        'Correr 5km sin parar',
        'Aguantar una tirada de 10km',
        'Llegar a una tirada de 15km',
        'Día de la carrera',
      ],
    },
    reading: {
      title: 'Leer 24 libros este año',
      description: 'Dos al mes, alternando ficción y ensayo.',
      milestones: ['Los primeros seis libros', 'A mitad, doce libros', 'Dieciocho libros', 'Veinticuatro libros'],
    },
    language: {
      title: 'Aprender inglés conversacional',
      description: 'En pausa hasta que pase el lanzamiento.',
      milestones: ['Terminar el curso A1', 'Treinta clases con profe', 'Mantener una charla de 15 minutos'],
    },
    savings: {
      title: 'Crear un colchón de seis meses',
      description: 'Transferencia automática el día 1 de cada mes.',
      milestones: [
        'Abrir una cuenta de ahorro aparte',
        'Llegar a tres meses de gastos',
        'Llegar a seis meses de gastos',
      ],
    },
  },
  blocks: {
    deepWork: [
      'Trabajo profundo: producto',
      'Trabajo profundo: escritura',
      'Trabajo profundo: arquitectura',
      'Trabajo profundo: caza de bugs',
    ],
    meetings: ['Daily del equipo', 'Revisión de diseño', 'Uno a uno', 'Reunión con cliente'],
    study: ['Módulo del curso', 'Bloque de lectura', 'Ejercicios de idiomas'],
    lunch: 'Comida y paseo',
    gym: 'Gimnasio',
    longRun: 'Tirada larga',
    mobility: 'Movilidad y estiramientos',
    errands: 'Recados y compra',
    weeklyReview: 'Revisión semanal y planificación',
    weeklyReviewNote: 'Cerrar la semana y dejar lista la siguiente.',
  },
  defaultPrimaryGoal: 'Lanzar la primera versión de mi proyecto',
}

/** DayFlow solo siembra contenido en español. */
export function seedContent(_lang: Language): SeedContent {
  return ES
}
