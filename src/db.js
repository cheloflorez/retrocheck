import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Si no hay credenciales, la web funciona en solo lectura con public/data.json
export const hayDb = Boolean(url && key)
const supabase = hayDb ? createClient(url, key) : null

const FILA = 1

// Devuelve { data, progress } o null si la fila esta vacia / no existe
export async function leer() {
  const { data, error } = await supabase
    .from('checklist')
    .select('data, progress')
    .eq('id', FILA)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function escribir(secciones, progreso) {
  const { error } = await supabase.from('checklist').upsert({
    id: FILA,
    data: secciones,
    progress: progreso,
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
}

// Avisa cuando otra persona cambia algo
export function alCambiar(callback) {
  supabase
    .channel('checklist-cambios')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist' }, (payload) => {
      if (payload.new && payload.new.data) callback(payload.new)
    })
    .subscribe()
}
