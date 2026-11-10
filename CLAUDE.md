# Maykelsgym Shop

Panel de control del negocio de Maykel's Gym (La Habana): matrículas, nevera, vitrina, mensajería, inventario, cobros y ganancias. El dueño quiere digitalizar el negocio y hacerlo crecer en dinero y en clientes.

**Idioma:** todo (código de UI, textos, commits, respuestas) en español.

## Stack
- React 18 + Vite 5 + Tailwind 3, PWA (`vite-plugin-pwa`). Sin TypeScript, sin lint, sin tests automáticos.
- Backend: Supabase, proyecto `maykelsgymshop-nuevo` (id `dzyupwadmryxywanydqf`, us-east-1).
- Despliegue: **Vercel** (proyecto `maykelsgymshop`, producción en `maykelsgymshop.vercel.app`, se despliega solo al fusionar a `main`; cada rama genera una vista previa). Las cabeceras de seguridad (CSP, etc.) viven en `vercel.json`. `netlify.toml` es un resto de cuando se usaba Netlify: si se cambia la CSP, mantener ambos archivos iguales.
- Variables: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (ver `.env.example`; la clave es la publicable, nunca poner claves secretas en el repo).

## Comandos
- `npm run dev` – servidor local
- `npm run build` – única comprobación automática; debe pasar antes de entregar

## Estructura
- `src/App.jsx`, `src/pages/` (Panel, Login, Catalogo, NuevaContrasena)
- `src/sections/` – una pantalla por archivo (Resumen, Inventario, Vitrina, Cobrar, Matriculas, Nevera, Gastos, Fondos, Cierre, Equipo, Actividad, Avisos). `Inventario` tiene su carpeta `src/sections/inventario/`.
- `src/lib/` – `fecha.js` (fechas en hora de Cuba, rangos de historial), `formato.js` (`n` CUP, `usd`, `precio`), `negocio.js` (WhatsApp del negocio para el catálogo). No volver a copiar estas funciones dentro de las pantallas.
- `src/supabaseClient.js`
- `supabase/migrations/` – migraciones SQL numeradas (`0001_…` en adelante)

## Reglas de datos y seguridad (importante)
- **La app nunca lee ni escribe tablas directamente.** Todo pasa por funciones SQL (`supabase.rpc`) que comprueban permisos. Las tablas no dan privilegios a `anon` ni a `authenticated`, tampoco las futuras.
- RLS activo en todas las tablas. Toda tabla o función nueva debe seguir el mismo patrón.
- Roles: `admin`, `operador_plus`, `operador`, `lectura`, `mensajero`, `cobrador` (recepción del gym: solo ve Cobrar y Avisos).
  - Ajustar stock y registrar entradas: admin y operador_plus.
  - Quitar y reactivar productos: solo admin (baja suave; quitar no pone el stock en cero).
- Quien se registra solo queda **inactivo**; `usuario_crear` (Equipo) crea cuentas activas. Las listas exigen usuario activo.
- Fotos: bucket `productos`, solo JPG/PNG/WebP de hasta 2 MB.
- Los precios aceptan centavos.
- Cuenta con proveedores (solo admin, pantalla Proveedores): lo que se debe = entradas de inventario con nombre de proveedor (cantidad × costo) − pagos en `proveedor_pagos`. El proveedor de VitOBest se llama `VitoBeast`; la mercancía se carga con “Entró mercancía”.

## Migraciones
1. Crear `supabase/migrations/NNNN_descripcion.sql` con el siguiente número libre (la última es `0045_gym_funciones_search_path.sql`).
2. Aplicarla al proyecto real con `apply_migration` (MCP de Supabase) y guardar el mismo archivo en el repo.
3. Antes: comprobaciones previas sobre los datos existentes. Después: simular cada rol dentro de la base y comprobar que lo no permitido falla.
4. Revisar `get_advisors` (seguridad) tras cambiar el esquema.

## Cobros del gym (migraciones 0042 a 0045)
- Permisos nuevos: `gym.cobrar` (admin y cobrador), `gym.anular` y `gym.configurar` (solo admin). Todo el cobro pasa por funciones `gym_*`.
- Precio de la matrícula en USD (`configuracion.precio_matricula_usd`) y **tasa de cobro** con "vigente desde" (`tasas_cobro`, la fija el dueño; puede ir atrasada respecto al mercado). Monto sugerido = precio USD × tasa.
- Un cobro (`cliente_visitas`) guarda `monto` (total en CUP), `efectivo_cup`, `transferencia_cup`, `efectivo_usd`, `tasa`, caso social y quién cobró. Los pagos viejos tienen esas columnas vacías y se leen como "todo efectivo CUP". Anular saca el cobro de `cliente_visitas` y lo guarda en `cobros_anulados` (todo lo demás deja de contarlo solo).
- **Dos fechas por cliente**: la fecha de cobro (la pone quien cobra) y la fecha oficial (`clientes_gym.fecha_oficial`, origen `mobidb`, `cobro` o `manual`). El vencimiento cuenta desde la oficial; el cobro la deja provisional hasta que llegue MobiDB.
- `gym_fechas_importar` (pantalla "Importar MobiDB") solo actualiza fechas oficiales, nunca crea pagos. Regla de 5 días: si MobiDB está a ≤ 5 días del cobro se queda la de MobiDB; si está más vieja se queda la del cobro; si está más nueva se queda la de MobiDB y se avisa; lo editado a mano no se pisa.
- `configuracion.gym_cobros_desde` es la fecha de corte: desde ahí el importador antiguo de Matrículas (que crea pagos) no carga filas, para no contar el dinero doble.
- `caja_esperada_dia` (Cierre) cuenta del gym solo el efectivo en CUP; los dólares y las transferencias se cuentan en el cuadre del gym (`gym_caja_contar`).
- Pendiente: fotos de clientes y modo sin conexión (iPad de la recepción); plan en la conversación de diseño.

## Cómo probar pantallas
Se prueban con Playwright (ya instalado en el entorno), simulando las llamadas a Supabase con datos reales. Dos trampas conocidas:
- El menú es un cajón: hay que abrirlo con “Abrir menú”.
- `Resumen` exige respuestas muy detalladas; al probar otras pantallas conviene sustituirla por un componente vacío.

## Flujo de trabajo
- Rama de trabajo asignada por sesión; no hacer push a otra. Si el PR anterior ya se fusionó, partir del `main` actualizado.
- No crear PR salvo que se pida.
- `main` incluye ya: inventario del día a día (0037), endurecimiento de seguridad (0038), descripción de productos (0039) y cuenta con proveedores (0040).

## Pendientes conocidos
- Ventas de los últimos 30 días figuran en 0: “Qué comprar” y “Más vendidos” no ordenan bien. Confirmar cómo se registran las ventas.
- Datos reales (8-nov-2026): 110 productos, 61 unidades de VitoBeast en stock, 77 productos sin foto. Las ventas de VitoBeast se registran descontando stock y los pagos al proveedor se anotan en Proveedores.
- Catálogo público (`/catalogo`, sin login): buscador, categorías, pedido de varios productos por WhatsApp (número en `src/lib/negocio.js`). Solo muestra productos con stock > 0 (`catalogo_publico`).
- Inventario → “Mensaje para el grupo”: arma el texto para el grupo de WhatsApp (novedades = mercancía llegada en los últimos 7/14/30 días según `ultima_entrada`, ofertas puestas a mano solo para ese mensaje, existencias por categoría y el enlace al catálogo). Lógica en `src/lib/mensajeGrupo.js`, pantalla en `src/sections/inventario/MensajeGrupo.jsx`. Las ofertas NO se guardan ni cambian precios (promociones reales siguen sin hacerse).
- Ideas sin empezar: ocultar productos por producto, precios por volumen y promociones, código de barras, ficha de cliente.
- Acciones del dueño en Supabase: desactivar “Allow new users to sign up”, activar protección de contraseñas filtradas, 2FA en la cuenta admin.
