import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";

export const config = { maxDuration: 60 };

const ROW_ID = "main";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

function fmtMoney(n) {
  const v = Math.round(n || 0);
  return "$" + v.toLocaleString("es-CO");
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getTotal(c) {
  return (Number(c.boletos) || 0) * (Number(c.precioUnitario) || 0);
}

function getCuotas(c) {
  if (Array.isArray(c.cuotas) && c.cuotas.length) return c.cuotas;
  const total = getTotal(c);
  return [
    {
      numero: 1,
      fecha: c.fechaCobro || todayISO(),
      capital: total,
      interes: 0,
      total,
    },
  ];
}

function getSaldos(c) {
  const cuotas = getCuotas(c).map((cu) => ({
    ...cu,
    capital: Number(cu.capital) || 0,
    interes: Number(cu.interes) || 0,
    total: Number(cu.total) || 0,
    pagadoCapital: 0,
    pagadoInteres: 0,
  }));
  const abonos = [...(c.abonos || [])].sort((a, b) =>
    (a.fecha || "").localeCompare(b.fecha || "")
  );
  for (const ab of abonos) {
    let restante = Number(ab.monto) || 0;
    for (const cu of cuotas) {
      if (restante <= 0) break;
      const falInteres = cu.interes - cu.pagadoInteres;
      if (falInteres > 0) {
        const ap = Math.min(restante, falInteres);
        cu.pagadoInteres += ap;
        restante -= ap;
      }
      const falCapital = cu.capital - cu.pagadoCapital;
      if (restante > 0 && falCapital > 0) {
        const ap = Math.min(restante, falCapital);
        cu.pagadoCapital += ap;
        restante -= ap;
      }
    }
  }
  cuotas.forEach((cu) => (cu.pagadoTotal = cu.pagadoCapital + cu.pagadoInteres));
  const total = cuotas.reduce((s, cu) => s + cu.total, 0);
  const pagado = cuotas.reduce((s, cu) => s + cu.pagadoTotal, 0);
  return { cuotas, total, pagado, saldo: Math.max(0, total - pagado) };
}

async function readClientes() {
  const { data, error } = await supabase
    .from("cuaderno")
    .select("data")
    .eq("id", ROW_ID)
    .maybeSingle();
  if (error) throw error;
  return data?.data || [];
}

async function findCliente(id) {
  const clientes = await readClientes();
  return clientes.find((c) => c.id === id) || null;
}

function makeTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    requireTLS: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
}

async function sendMail(subject, html) {
  const transport = makeTransport();
  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM_EMAIL,
      to: process.env.NOTIFY_TO,
      subject,
      html,
    });
  } finally {
    transport.close();
  }
}

function wrap(title, body) {
  return `
  <div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; background: #FDFBF6; padding: 24px; border-radius: 8px; border: 1px solid #BFD2B6;">
    <h1 style="font-size: 20px; margin: 0 0 4px; color: #1E2B20;">Cuaderno de Cobros</h1>
    <p style="margin: 0 0 16px; color: #57695A; font-size: 13px;">${title}</p>
    ${body}
    <p style="margin-top: 24px; font-size: 12px; color: #93AC8B; border-top: 1px dashed #BFD2B6; padding-top: 12px;">
      Enviado automáticamente por Cuaderno de Cobros.
    </p>
  </div>`;
}

function tablaHtml(items, label) {
  if (!items.length)
    return `<p style="color:#57695A; font-size:14px;">Sin ${label.toLowerCase()} por ahora. &#128512;</p>`;
  const rows = items
    .map(
      (i) => `
    <tr style="border-bottom: 1px solid #E9F1E4;">
      <td style="padding: 8px 6px; font-weight: 600; color: #1E2B20;">${i.nombre}</td>
      <td style="padding: 8px 6px; color: #57695A;">Cuota #${i.cuota}<br/><span style="font-size:12px;">${fmtDate(i.fecha)}</span></td>
      <td style="padding: 8px 6px; color: #1E2B20; text-align: right;">${fmtMoney(i.cuotaPendiente)}</td>
      <td style="padding: 8px 6px; color: #A93A2C; text-align: right;">${fmtMoney(i.saldo)}</td>
    </tr>`
    )
    .join("");
  return `
  <h2 style="font-size: 16px; color: #1E2B20; margin: 20px 0 8px;">${label}</h2>
  <table style="width:100%; border-collapse: collapse; font-size: 14px;">
    <tr style="color:#57695A; text-align:left; font-size:12px; text-transform: uppercase;">
      <th style="padding: 6px;">Cliente</th>
      <th style="padding: 6px;">Cuota</th>
      <th style="padding: 6px; text-align:right;">Pendiente</th>
      <th style="padding: 6px; text-align:right;">Saldo total</th>
    </tr>
    ${rows}
  </table>`;
}

function buildResumen(clientes) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const vencidos = [];
  const proximos = [];
  for (const c of clientes) {
    const { cuotas, saldo } = getSaldos(c);
    if (saldo <= 0) continue;
    const pend = cuotas.find((cu) => cu.pagadoTotal < cu.total);
    if (!pend) continue;
    const venc = new Date(pend.fecha + "T00:00:00");
    const diff = Math.round((venc - hoy) / 86400000);
    const item = {
      nombre: c.nombre,
      cuota: pend.numero,
      fecha: pend.fecha,
      cuotaPendiente: pend.total - pend.pagadoTotal,
      saldo,
    };
    if (diff < 0) vencidos.push(item);
    else if (diff <= 3) proximos.push(item);
  }
  vencidos.sort((a, b) => a.fecha.localeCompare(b.fecha));
  proximos.sort((a, b) => a.fecha.localeCompare(b.fecha));
  return { vencidos, proximos };
}

async function sendResumen(clientes) {
  const { vencidos, proximos } = buildResumen(clientes);
  const hayAlgo = vencidos.length > 0 || proximos.length > 0;
  const body =
    tablaHtml(vencidos, "Cobros vencidos") +
    tablaHtml(proximos, "Cuotas por vencer (próximos 3 días)");
  const subject = hayAlgo
    ? `Cuaderno de Cobros · ${vencidos.length} vencidos, ${proximos.length} por vencer`
    : "Cuaderno de Cobros · Todo al día";
  await sendMail(subject, wrap("Resumen diario del cuaderno", body));
  return { vencidos: vencidos.length, proximos: proximos.length };
}

async function sendVenta(cliente) {
  const { saldo, total } = getSaldos(cliente);
  const body = `
    <p style="font-size:15px; color:#1E2B20;">Se registró una <b>nueva venta a crédito</b>.</p>
    <table style="width:100%; border-collapse: collapse; font-size:14px; background:#F7FBF4;">
      <tr><td style="padding:6px; color:#57695A;">Cliente</td><td style="padding:6px; font-weight:600;">${cliente.nombre}</td></tr>
      <tr><td style="padding:6px; color:#57695A;">Boletas</td><td style="padding:6px;">${cliente.boletos} × ${fmtMoney(cliente.precioUnitario)}</td></tr>
      <tr><td style="padding:6px; color:#57695A;">Cuotas</td><td style="padding:6px;">${cliente.numeroCuotas} (${cliente.tasaInteres || 0}% interés)</td></tr>
      <tr><td style="padding:6px; color:#57695A;">Total a pagar</td><td style="padding:6px; font-weight:700;">${fmtMoney(total)}</td></tr>
      <tr><td style="padding:6px; color:#57695A;">Saldo pendiente</td><td style="padding:6px; font-weight:700; color:#A93A2C;">${fmtMoney(saldo)}</td></tr>
    </table>`;
  await sendMail(`Nueva venta · ${cliente.nombre}`, wrap("Aviso de venta", body));
}

async function sendAbono(cliente, monto, fecha) {  const { saldo } = getSaldos(cliente);
  const body = `
    <p style="font-size:15px; color:#1E2B20;">Se registró un <b>abono</b>.</p>
    <table style="width:100%; border-collapse: collapse; font-size:14px; background:#F7FBF4;">
      <tr><td style="padding:6px; color:#57695A;">Cliente</td><td style="padding:6px; font-weight:600;">${cliente.nombre}</td></tr>
      <tr><td style="padding:6px; color:#57695A;">Abono</td><td style="padding:6px; font-weight:700;">${fmtMoney(monto)}</td></tr>
      <tr><td style="padding:6px; color:#57695A;">Fecha</td><td style="padding:6px;">${fmtDate(fecha)}</td></tr>
      <tr><td style="padding:6px; color:#57695A;">Saldo restante</td><td style="padding:6px; font-weight:700; color:#A93A2C;">${fmtMoney(saldo)}</td></tr>
    </table>`;
  await sendMail(`Abono de ${fmtMoney(monto)} · ${cliente.nombre}`, wrap("Aviso de abono", body));
}

export default async function handler(req, res) {
  try {
    const isCron = Boolean(req.headers["x-vercel-cron-schedule"]);

    if (req.method === "GET") {
      if (!isCron) return res.status(401).json({ error: "No autorizado" });
      const clientes = await readClientes();
      const resultado = await sendResumen(clientes);
      return res.status(200).json({ ok: true, ...resultado });
    }

    if (req.method === "POST") {
      const body = req.body || {};
      const type = body.type;
      if (type === "venta") {
        const cliente = await findCliente(body.clienteId);
        if (!cliente) return res.status(404).json({ error: "Cliente no encontrado" });
        await sendVenta(cliente);
      } else if (type === "abono") {
        const cliente = await findCliente(body.clienteId);
        if (!cliente) return res.status(404).json({ error: "Cliente no encontrado" });
        await sendAbono(cliente, body.monto, body.fecha);
      } else {
        return res.status(400).json({ error: "Tipo no soportado" });
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Método no permitido" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
}

export { getSaldos, buildResumen, sendResumen, sendMail };
