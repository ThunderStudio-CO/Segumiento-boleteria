# Cuaderno de Cobros

App para llevar el control de venta de boletería a crédito: cuánto debe cada
cliente, sus abonos, y recordatorios de cobros vencidos o próximos a vencer.
Los datos se guardan en Supabase, así que se ven igual desde cualquier
celular o computador conectado.

## 1. Crear la base de datos (una sola vez)

1. Crea una cuenta gratis en https://supabase.com y un proyecto nuevo.
2. Ve a **SQL Editor** → **New query**, pega el contenido de
   `supabase-setup.sql` y dale **Run**.
3. Ve a **Project Settings → API** y copia dos valores:
   - **Project URL**
   - **anon public key**

## 2. Probar en tu computador (opcional)

```bash
npm install
cp .env.example .env
# pega los dos valores del paso 1 en .env
npm run dev
```

## 3. Subir a GitHub

```bash
git init
git add .
git commit -m "Cuaderno de cobros"
```

Crea un repositorio en GitHub y sigue las instrucciones para subir (`git
remote add origin ...` y `git push`).

## 4. Desplegar en Vercel

1. Entra a https://vercel.com → **Add New Project** → importa el repo de
   GitHub.
2. Vercel detecta que es un proyecto Vite automáticamente.
3. Antes de darle **Deploy**, abre **Environment Variables** y agrega:
   - `VITE_SUPABASE_URL` → el Project URL del paso 1
   - `VITE_SUPABASE_ANON_KEY` → el anon public key del paso 1
4. Dale **Deploy**. En 1-2 minutos te da una URL pública.

Esa URL es la que comparten la pareja de tu mamá y el socio — cada uno la
abre desde su celular y ven los mismos datos, actualizados casi al
instante.

## Nota sobre seguridad

La política de la base de datos deja leer y escribir a cualquiera que tenga
el enlace de la app (no hay login). Está bien para uso interno entre
personas de confianza, pero si más adelante quieres agregarle una
contraseña o cuentas de usuario, se puede hacer con Supabase Auth.
