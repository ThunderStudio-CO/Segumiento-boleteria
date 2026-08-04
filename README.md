# Cuaderno de Cobros

**Sistema de crédito para boletería** — lleva el control de quién debe, en cuántas cuotas, con qué interés y para cuándo. Incluye seguimiento por cuota, panel de ingresos y notificaciones automáticas por correo.

[![React](https://img.shields.io/badge/React-18-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com)
[![Vercel](https://img.shields.io/badge/Vercel-Deploy-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com)

---

## Resumen

Una aplicación web diseñada para la venta de boletería a crédito. Reemplaza el clásico "cuaderno de fiado" por un sistema digital que **calcula intereses**, **genera planes de pago por cuotas** y **avisa por correo** cuándo hay cobros vencidos o por vencer.

Los datos se sincronizan en tiempo real entre dispositivos a través de Supabase, por lo que varias personas pueden consultar y actualizar el mismo cuaderno desde su celular.

## Características

- **Venta a crédito con plan de pagos** — define la cantidad de boletas, el precio unitario, el número de cuotas y la periodicidad (semanal, quincenal o mensual).
- **Tasa de interés personalizable** — se aplica por cuota sobre el capital pendiente (interés decreciente), con desglose visible de capital e interés.
- **Seguimiento tipo CRM** — por cada cliente se ve el estado de cada cuota: capital, interés, total, monto ingresado y saldo restante.
- **Panel de ingresos** — indicadores de por cobrar, cobrado, cobros vencidos e ingresos del mes separados en **capital** e **intereses**.
- **Gestión de abonos** — cada pago se aplica automáticamente primero a intereses pendientes y luego a capital, en orden de cuotas.
- **Búsqueda y filtros** — busca por cliente y filtra por estado: vencido, próximo, al día o pagado.
- **Notificaciones por correo** — resumen diario automático y avisos al registrar una venta o un abono.
- **Sincronización en tiempo real** — los cambios se reflejan al instante en todos los dispositivos conectados.
- **Diseño tipo cuaderno de contabilidad** — interfaz pensada para móvil con estética de ledger a lápiz.

## Stack tecnológico

| Tecnología | Uso |
| --- | --- |
| **React 18** | Interfaz de usuario (SPA) |
| **Vite 5** | Build tool y servidor de desarrollo |
| **Tailwind CSS 3** | Estilos y diseño responsive |
| **JavaScript (ESM)** | Lógica de negocio |
| **Supabase** | Base de datos + sincronización en tiempo real |
| **Nodemailer** | Envío de correos (SMTP) |
| **Vercel** | Despliegue, funciones serverless y cron diario |

## Cómo funciona

### Modelo financiero

1. **Capital** = boletas × precio unitario.
2. El capital se divide en **N cuotas iguales**.
3. A cada cuota se le suma el **interés de la tasa configurada** calculado sobre el capital pendiente (no sobre el total), por lo que las primeras cuotas tienen más interés que las últimas.
4. Cada **abono** se distribuye primero sobre el interés pendiente y luego sobre el capital, recorriendo las cuotas en orden.

**Ejemplo:** venta de $100.000 en 4 cuotas con 3% de interés.

| Cuota | Capital | Interés (3%) | Total |
| --- | --- | --- | --- |
| 1 | $25.000 | $3.000 (sobre $100.000) | $28.000 |
| 2 | $25.000 | $2.250 (sobre $75.000) | $27.250 |
| 3 | $25.000 | $1.500 (sobre $50.000) | $26.500 |
| 4 | $25.000 | $750 (sobre $25.000) | $25.750 |

### Notificaciones por correo

- **Resumen diario** — cada día a las 7:00 AM (hora Colombia) se envía un correo con los cobros vencidos y las cuotas por vencer en los próximos 3 días.
- **Avisos al instante** — al registrar una venta o un abono se envía una notificación con el detalle de la operación y el saldo restante.

## Estructura del proyecto

```
├── api/
│   └── notify.js            # Función serverless: resumen diario + avisos por correo
├── src/
│   ├── App.jsx              # Aplicación principal (ventas, cuotas, CRM y panel)
│   ├── main.jsx             # Punto de entrada
│   ├── supabaseClient.js    # Cliente de Supabase
│   └── index.css            # Estilos base
├── supabase-setup.sql       # Script SQL para crear la base de datos (una sola vez)
├── vercel.json              # Cron diario para el resumen de cobros
├── index.html
├── package.json
├── tailwind.config.js
├── postcss.config.js
└── vite.config.js
```

## Puesta en marcha local

Requisitos: Node.js 18+, una cuenta gratuita de [Supabase](https://supabase.com) y una de [Vercel](https://vercel.com).

**1. Crear la base de datos (una sola vez)**

1. En Supabase, crea un proyecto nuevo.
2. Ve a **SQL Editor → New query**, pega el contenido de `supabase-setup.sql` y ejecútalo.
3. En **Project Settings → API**, copia el **Project URL** y el **anon public key**.

**2. Configurar el entorno**

Crea un archivo `.env` en la raíz con las siguientes variables:

```env
VITE_SUPABASE_URL=tu-project-url
VITE_SUPABASE_ANON_KEY=tu-anon-public-key

# Notificaciones por correo (SMTP)
SMTP_HOST=smtp.tu-proveedor.com
SMTP_USER=tu-usuario-smtp
SMTP_PASSWORD=tu-contrasena-smtp
SMTP_PORT=puerto-smtp
SMTP_FROM_EMAIL=tu-correo-remitente
NOTIFY_TO=correo-donde-recibir-los-avisos
```

**3. Ejecutar**

```bash
npm install
npm run dev
```

La aplicación estará disponible en `http://localhost:5173`.

## Despliegue en Vercel

1. Sube el repositorio a GitHub.
2. En Vercel, importa el repositorio (se detecta como proyecto Vite automáticamente).
3. En **Settings → Environment Variables**, agrega las mismas variables del archivo `.env`.
4. Haz **Deploy**.

El cron diario (`vercel.json`) se activa automáticamente en el entorno de producción y ejecuta la función `api/notify.js` todos los días a las 12:00 UTC (7:00 AM hora Colombia).

## Seguridad

- La política de la base de datos (`RLS`) permite leer y escribir con la `anon key`: es suficiente para un uso interno entre personas de confianza.
- Las credenciales SMTP solo existen en las variables de entorno del servidor (Vercel) y **nunca** viajan al navegador.
- Si en el futuro se necesita acceso por usuario, se puede agregar autenticación con Supabase Auth.

## Roadmap

- [ ] Autenticación de usuarios (Supabase Auth)
- [ ] Exportación de reportes (CSV / PDF)
- [ ] Recordatorios automáticos a los clientes
- [ ] Historial completo de ventas

---

*Proyecto personal — uso interno.*
