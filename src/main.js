import "./style.css";
import { hayDb, leer, escribir, alCambiar } from "./db.js";

// Se puede editar si hay base de datos configurada (Supabase). Sin ella, solo lectura.
const editable = hayDb;

const menu = document.getElementById("menu");
const content = document.getElementById("content");
const total = document.getElementById("total");

let secciones = [];
let progreso = {};
const abiertas = new Set();
let editando = null; // id de la card en edicion, o "nueva"

// ---------- Carga y guardado ----------

async function cargarSemilla() {
  const res = await fetch(`${import.meta.env.BASE_URL}data.json?t=${Date.now()}`);
  return res.json();
}

async function cargar() {
  try {
    const fila = hayDb ? await leer() : null;
    if (fila && Array.isArray(fila.data) && fila.data.length) {
      secciones = fila.data;
      progreso = fila.progress || {};
    } else {
      // Base vacia (o sin base): arrancamos con public/data.json
      secciones = await cargarSemilla();
      progreso = (fila && fila.progress) || {};
    }
  } catch (e) {
    console.error(e);
    content.textContent = "No se pudo cargar el checklist.";
    return;
  }
  abiertas.add(leerRuta().seccion.id);
  render();

  if (hayDb) {
    alCambiar((fila) => {
      secciones = fila.data;
      progreso = fila.progress || {};
      renderMenu();
      if (!editando) renderContenido(); // no pisamos un formulario abierto
    });
  }
}

// Aplica un cambio: primero en pantalla (rapido) y despues lo manda a la base,
// releyendo antes lo ultimo guardado para no pisar lo que hicieron los otros.
async function cambiar(fn) {
  fn();
  render();
  try {
    const fila = await leer();
    if (fila && Array.isArray(fila.data) && fila.data.length) {
      secciones = fila.data;
      progreso = fila.progress || {};
      fn();
    }
    await escribir(secciones, progreso);
    render();
  } catch (e) {
    console.error(e);
    alert("No se pudo guardar el cambio. Revisa tu conexion e intenta de nuevo.");
    await cargar();
  }
}

// ---------- Helpers ----------

// Ruta: #seccion  o  #seccion/subseccion
function leerRuta() {
  const [sec, sub] = location.hash.slice(1).split("/");
  const seccion = secciones.find((s) => s.id === sec) || secciones[0];
  let subseccion = null;
  if (seccion.subsecciones) {
    subseccion = seccion.subsecciones.find((x) => x.id === sub) || seccion.subsecciones[0];
  }
  return { seccion, subseccion };
}

// Busca la lista de tareas (en el estado actual) a partir de los ids de la ruta
function fuenteDe(secId, subId) {
  const s = secciones.find((x) => x.id === secId);
  if (!s) return null;
  return subId ? s.subsecciones.find((x) => x.id === subId) : s;
}

const tareasDe = (s) => (s.subsecciones ? s.subsecciones.flatMap((x) => x.tareas) : s.tareas);

function contar(tareas) {
  return { hechas: tareas.filter((t) => progreso[t.id]).length, total: tareas.length };
}

function crear(tag, clase, texto) {
  const el = document.createElement(tag);
  if (clase) el.className = clase;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

// ---------- Menu ----------

function itemMenu(texto, tareas, href, clase, onClick) {
  const { hechas, total } = contar(tareas);
  const a = crear("a", clase);
  a.href = href;
  a.append(crear("span", "", texto), crear("small", "", `${hechas}/${total}`));
  if (onClick) a.addEventListener("click", onClick);
  return a;
}

function renderMenu() {
  const { seccion: actual, subseccion } = leerRuta();
  menu.innerHTML = "";

  for (const s of secciones) {
    if (!s.subsecciones) {
      const activo = s.id === actual.id ? " activo" : "";
      menu.appendChild(itemMenu(s.titulo, s.tareas, `#${s.id}`, "menu-item" + activo));
      continue;
    }

    // Seccion desplegable: el click abre/cierra sin cambiar de pagina
    const abierta = abiertas.has(s.id);
    menu.appendChild(
      itemMenu(s.titulo, tareasDe(s), "#", "menu-item padre" + (abierta ? " abierto" : ""), (e) => {
        e.preventDefault();
        if (abierta) abiertas.delete(s.id);
        else abiertas.add(s.id);
        renderMenu();
      }),
    );

    if (abierta) {
      const sub = crear("div", "submenu");
      for (const x of s.subsecciones) {
        const activo = s.id === actual.id && x.id === subseccion.id ? " activo" : "";
        sub.appendChild(itemMenu(x.titulo, x.tareas, `#${s.id}/${x.id}`, "menu-item hijo" + activo));
      }
      menu.appendChild(sub);
    }
  }

  const { hechas, total: n } = contar(secciones.flatMap(tareasDe));
  const pct = n ? Math.round((hechas / n) * 100) : 0;
  total.textContent = `Progreso total: ${pct}% (${hechas}/${n})`;
}

// ---------- Cards ----------

function formulario(ref, tarea) {
  const form = crear("form", "tarea form");

  const lblT = crear("label", "", "Titulo");
  const titulo = crear("input");
  titulo.type = "text";
  titulo.required = true;
  titulo.value = tarea ? tarea.titulo : "";
  lblT.appendChild(titulo);

  const lblD = crear("label", "", "Descripcion (un renglon por linea)");
  const desc = crear("textarea");
  desc.rows = 4;
  desc.value = tarea ? tarea.desc || "" : "";
  lblD.appendChild(desc);

  const acciones = crear("div", "acciones");
  const guardar = crear("button", "btn primario", "Guardar");
  guardar.type = "submit";
  const cancelar = crear("button", "btn", "Cancelar");
  cancelar.type = "button";
  cancelar.addEventListener("click", () => {
    editando = null;
    renderContenido();
  });
  acciones.append(guardar, cancelar);

  form.append(lblT, lblD, acciones);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const textoTitulo = titulo.value.trim();
    const textoDesc = desc.value.trim();
    if (!textoTitulo) return;
    editando = null;

    if (tarea) {
      const id = tarea.id;
      cambiar(() => {
        const t = fuenteDe(ref.sec, ref.sub)?.tareas.find((x) => x.id === id);
        if (t) {
          t.titulo = textoTitulo;
          t.desc = textoDesc;
        }
      });
    } else {
      const nueva = { id: `t-${Date.now().toString(36)}`, titulo: textoTitulo, desc: textoDesc };
      cambiar(() => fuenteDe(ref.sec, ref.sub)?.tareas.push(nueva));
    }
  });

  setTimeout(() => titulo.focus());
  return form;
}

function eliminar(ref, tarea) {
  if (!confirm(`Eliminar "${tarea.titulo}"?`)) return;
  cambiar(() => {
    const f = fuenteDe(ref.sec, ref.sub);
    if (f) f.tareas = f.tareas.filter((t) => t.id !== tarea.id);
    delete progreso[tarea.id];
  });
}

// Modal con la card completa. Usa <dialog>: Esc cierra y el foco queda dentro.
function abrirModal(ref, id) {
  const t = fuenteDe(ref.sec, ref.sub)?.tareas.find((x) => x.id === id);
  if (!t) return;

  const dialog = crear("dialog", "modal");
  dialog.setAttribute("aria-labelledby", "modal-titulo");

  const cabecera = crear("div", "modal-cabecera");
  const titulo = crear("h3", "", t.titulo);
  titulo.id = "modal-titulo";
  const cerrarX = crear("button", "icono", "✕");
  cerrarX.type = "button";
  cerrarX.setAttribute("aria-label", "Cerrar");
  cabecera.append(titulo, cerrarX);

  const cuerpo = crear("div", "modal-cuerpo");
  if (t.desc) cuerpo.textContent = t.desc;
  else cuerpo.append(crear("em", "", "Sin descripcion"));

  const pie = crear("div", "modal-pie");

  const estado = crear("label", "modal-estado");
  const check = crear("input");
  check.type = "checkbox";
  check.checked = !!progreso[t.id];
  check.disabled = !editable;
  check.addEventListener("change", () => {
    const marcado = check.checked;
    cambiar(() => {
      if (marcado) progreso[t.id] = true;
      else delete progreso[t.id];
    });
  });
  estado.append(check, document.createTextNode(" Hecho"));
  pie.appendChild(estado);

  if (editable) {
    const editar = crear("button", "btn", "Editar");
    editar.type = "button";
    editar.addEventListener("click", () => {
      dialog.close();
      editando = t.id;
      renderContenido();
    });
    const borrar = crear("button", "btn peligro", "Eliminar");
    borrar.type = "button";
    borrar.addEventListener("click", () => {
      dialog.close();
      eliminar(ref, t);
    });
    pie.append(editar, borrar);
  }
  const cerrar = crear("button", "btn primario", "Cerrar");
  cerrar.type = "button";
  pie.appendChild(cerrar);

  dialog.append(cabecera, cuerpo, pie);
  document.body.appendChild(dialog);

  cerrarX.addEventListener("click", () => dialog.close());
  cerrar.addEventListener("click", () => dialog.close());
  // Click en el fondo oscuro cierra
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => dialog.remove());

  dialog.showModal();
}

function tarjeta(ref, t) {
  const card = crear("div", "tarea" + (progreso[t.id] ? " hecha" : ""));

  const input = crear("input");
  input.type = "checkbox";
  input.checked = !!progreso[t.id];
  input.disabled = !editable;
  input.setAttribute("aria-label", t.titulo);
  input.addEventListener("change", () => {
    const marcado = input.checked;
    cambiar(() => {
      if (marcado) progreso[t.id] = true;
      else delete progreso[t.id];
    });
  });

  // Click en el texto de la card abre el modal (el boton "Ver" es la via por teclado)
  const texto = crear("div", "tarea-texto clicable");
  texto.appendChild(crear("strong", "", t.titulo));
  if (t.desc) texto.appendChild(crear("p", "desc", t.desc));
  texto.addEventListener("click", () => abrirModal(ref, t.id));

  card.append(input, texto);

  const botones = crear("div", "botones");
  const ver = crear("button", "btn-ver", "Ver");
  ver.type = "button";
  ver.setAttribute("aria-label", `Ver ${t.titulo}`);
  ver.addEventListener("click", () => abrirModal(ref, t.id));
  botones.appendChild(ver);
  if (editable) {
    const editar = crear("button", "icono", "✎");
    editar.type = "button";
    editar.title = "Editar";
    editar.setAttribute("aria-label", `Editar ${t.titulo}`);
    editar.addEventListener("click", () => {
      editando = t.id;
      renderContenido();
    });
    const borrar = crear("button", "icono peligro", "🗑");
    borrar.type = "button";
    borrar.title = "Eliminar";
    borrar.setAttribute("aria-label", `Eliminar ${t.titulo}`);
    borrar.addEventListener("click", () => eliminar(ref, t));
    botones.append(editar, borrar);
  }
  card.appendChild(botones);

  return card;
}

function renderContenido() {
  const { seccion, subseccion } = leerRuta();
  const fuente = subseccion || seccion;
  const ref = { sec: seccion.id, sub: subseccion ? subseccion.id : null };
  content.innerHTML = "";

  content.appendChild(crear("h2", "", subseccion ? `${seccion.titulo} / ${subseccion.titulo}` : seccion.titulo));
  if (!editable) content.appendChild(crear("p", "aviso", "Modo solo lectura"));

  for (const t of fuente.tareas) {
    if (editando === t.id) {
      content.appendChild(formulario(ref, t));
      continue;
    }
    content.appendChild(tarjeta(ref, t));
  }

  if (editable) {
    if (editando === "nueva") {
      content.appendChild(formulario(ref, null));
    } else {
      const agregar = crear("button", "btn agregar", "+ Agregar card");
      agregar.type = "button";
      agregar.addEventListener("click", () => {
        editando = "nueva";
        renderContenido();
      });
      content.appendChild(agregar);
    }
  }
}

function render() {
  renderMenu();
  renderContenido();
}

window.addEventListener("hashchange", () => {
  if (!secciones.length) return;
  editando = null;
  abiertas.add(leerRuta().seccion.id); // al navegar, se abre la seccion activa
  render();
});

cargar();
