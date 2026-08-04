import React, { useState, useEffect, useMemo } from "react";
import {
  Plus,
  Search,
  X,
  ChevronDown,
  ChevronUp,
  Trash2,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
} from "lucide-react";
import { supabase, isSupabaseConfigured } from "./supabaseClient";

const ROW_ID = "main";

const colors = {
  paper: "#E9F1E4",
  paperCard: "#F7FBF4",
  paperCardAlt: "#F1F7EC",
  rule: "#BFD2B6",
  ruleDark: "#93AC8B",
  ink: "#1E2B20",
  inkMuted: "#57695A",
  forest: "#2C4A34",
  forestDark: "#1B2E22",
  stampRed: "#A93A2C",
  stampAmber: "#B97A22",
  stampBlue: "#2E4F73",
  cream: "#FDFBF6",
};

const fontDisplay = "'Special Elite', monospace";
const fontMono = "'Courier Prime', monospace";
const fontSans = "'Work Sans', sans-serif";

const CADENCIA = { semanal: 7, quincenal: 15, mensual: 30 };

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

function fmtMoney(n) {
  const v = Math.round(n || 0);
  return "$" + v.toLocaleString("es-CO");
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtMes(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d
    .toLocaleDateString("es-CO", { month: "long", year: "numeric" })
    .replace(/^./, (c) => c.toUpperCase());
}

function addDaysISO(iso, n) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

function getTotal(c) {
  return (Number(c.boletos) || 0) * (Number(c.precioUnitario) || 0);
}

function generarCuotas(boletos, precio, tasa, numCuotas, fechaVenta, cadencia) {
  const capTotal = boletos * precio;
  const N = Math.max(1, Math.round(numCuotas) || 1);
  const capBase = Math.round(capTotal / N);
  let restante = capTotal;
  const arr = [];
  for (let i = 1; i <= N; i++) {
    const capital = i === N ? restante : capBase;
    const antes = restante;
    restante -= capital;
    const interes = Math.round((Number(tasa) / 100) * antes);
    arr.push({
      numero: i,
      fecha: addDaysISO(fechaVenta, cadencia * i),
      capital,
      interes,
      total: capital + interes,
    });
  }
  return arr;
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
  let total = 0,
    pagado = 0,
    capitalPagado = 0,
    interesPagado = 0;
  cuotas.forEach((cu) => {
    cu.pagadoTotal = cu.pagadoCapital + cu.pagadoInteres;
    total += cu.total;
    pagado += cu.pagadoTotal;
    capitalPagado += cu.pagadoCapital;
    interesPagado += cu.pagadoInteres;
  });
  return {
    cuotas,
    total,
    pagado,
    saldo: Math.max(0, total - pagado),
    capitalPagado,
    interesPagado,
  };
}

function getAllocations(c) {
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
  const detalle = abonos.map((ab) => {
    let restante = Number(ab.monto) || 0;
    let aCapital = 0,
      aInteres = 0;
    for (const cu of cuotas) {
      if (restante <= 0) break;
      const falInteres = cu.interes - cu.pagadoInteres;
      if (falInteres > 0) {
        const ap = Math.min(restante, falInteres);
        cu.pagadoInteres += ap;
        aInteres += ap;
        restante -= ap;
      }
      const falCapital = cu.capital - cu.pagadoCapital;
      if (restante > 0 && falCapital > 0) {
        const ap = Math.min(restante, falCapital);
        cu.pagadoCapital += ap;
        aCapital += ap;
        restante -= ap;
      }
    }
    return { ...ab, capital: aCapital, interes: aInteres };
  });
  return { detalle, cuotas };
}

function getProximaFecha(c) {
  const { cuotas, saldo } = getSaldos(c);
  if (saldo <= 0) return null;
  const pend = cuotas.find((cu) => cu.pagadoTotal < cu.total);
  return pend ? pend.fecha : c.fechaCobro || null;
}

function getEstado(c) {
  const { cuotas, saldo } = getSaldos(c);
  if (saldo <= 0) return "pagado";
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const pend = cuotas.find((cu) => cu.pagadoTotal < cu.total) || cuotas[0];
  const venc = new Date((pend?.fecha || c.fechaCobro || todayISO()) + "T00:00:00");
  const diffDias = Math.round((venc - hoy) / 86400000);
  if (diffDias < 0) return "vencido";
  if (diffDias <= 3) return "proximo";
  return "al_dia";
}

async function notificar(tipo, data) {
  if (import.meta.env.DEV) return true;
  try {
    const res = await fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: tipo, ...data }),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return true;
  } catch (e) {
    console.warn("No se pudo enviar la notificación por correo:", e);
    return false;
  }
}

const ESTADO_ORDEN = { vencido: 0, proximo: 1, al_dia: 2, pagado: 3 };

const ESTADO_LABEL = {
  vencido: "Vencido",
  proximo: "Próximo",
  al_dia: "Al día",
  pagado: "Pagado",
};

function cuotaEstado(cu) {
  if (cu.pagadoTotal >= cu.total)
    return { text: "Pagada", color: colors.stampBlue };
  if (cu.pagadoTotal > 0)
    return { text: "Parcial", color: colors.stampAmber };
  return { text: "Pendiente", color: colors.inkMuted };
}

function Stamp({ estado }) {
  if (estado === "al_dia") {
    return (
      <span style={{ fontFamily: fontSans, color: colors.inkMuted, fontSize: 12 }}>
        Al día
      </span>
    );
  }
  const cfg = {
    vencido: { text: "VENCIDO", color: colors.stampRed, rot: -3 },
    proximo: { text: "PRÓXIMO", color: colors.stampAmber, rot: 2 },
    pagado: { text: "PAGADO", color: colors.stampBlue, rot: -2 },
  }[estado];
  return (
    <span
      style={{
        display: "inline-block",
        fontFamily: fontDisplay,
        fontSize: 11,
        letterSpacing: "0.06em",
        color: cfg.color,
        border: `2px solid ${cfg.color}`,
        borderRadius: 3,
        padding: "2px 6px",
        transform: `rotate(${cfg.rot}deg)`,
        opacity: 0.85,
        mixBlendMode: "multiply",
        whiteSpace: "nowrap",
      }}
    >
      {cfg.text}
    </span>
  );
}

export default function App() {
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [expandedId, setExpandedId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [sinConfig, setSinConfig] = useState(false);
  const [notifyError, setNotifyError] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setSinConfig(true);
      setLoading(false);
      return;
    }
    let channel;
    (async () => {
      try {
        let { data, error: selError } = await supabase
          .from("cuaderno")
          .select("data")
          .eq("id", ROW_ID)
          .maybeSingle();
        if (selError) throw selError;
        if (!data) {
          await supabase.from("cuaderno").insert({ id: ROW_ID, data: [] });
          setClientes([]);
        } else {
          setClientes(data.data || []);
        }
        setError(false);
      } catch (e) {
        console.error(e);
        setError(true);
      } finally {
        setLoading(false);
      }

      channel = supabase
        .channel("cuaderno-changes")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "cuaderno", filter: `id=eq.${ROW_ID}` },
          (payload) => {
            if (payload.new && payload.new.data) setClientes(payload.new.data);
          }
        )
        .subscribe();
    })();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  async function persist(next) {
    if (!isSupabaseConfigured) return;
    setClientes(next);
    try {
      const { error: upError } = await supabase
        .from("cuaderno")
        .upsert({ id: ROW_ID, data: next, updated_at: new Date().toISOString() });
      if (upError) throw upError;
      setError(false);
    } catch (e) {
      console.error(e);
      setError(true);
    }
  }

  async function addVenta(data) {
    const cadencia = CADENCIA[data.periodicidad] || CADENCIA.semanal;
    const cuotas = generarCuotas(
      Number(data.boletos),
      Number(data.precioUnitario),
      Number(data.tasaInteres) || 0,
      Number(data.numeroCuotas) || 1,
      data.fechaVenta,
      cadencia
    );
    const nuevo = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      nombre: data.nombre.trim(),
      boletos: Number(data.boletos),
      precioUnitario: Number(data.precioUnitario),
      fechaVenta: data.fechaVenta,
      fechaCobro: cuotas[0].fecha,
      tasaInteres: Number(data.tasaInteres) || 0,
      numeroCuotas: Number(data.numeroCuotas) || 1,
      periodicidad: data.periodicidad,
      cuotas,
      abonos:
        Number(data.abonoInicial) > 0
          ? [{ id: "a0", fecha: data.fechaVenta, monto: Number(data.abonoInicial) }]
          : [],
    };
    persist([nuevo, ...clientes]);
    const ok = await notificar("venta", {
      clienteId: nuevo.id,
      clienteNombre: nuevo.nombre,
      boletos: nuevo.boletos,
      totalPagar: cuotas.reduce((a, cu) => a + cu.total, 0),
    });
    setNotifyError(!ok);
    setShowAdd(false);
  }

  async function addAbono(clienteId, monto, fecha, nuevaFechaCobro) {
    const next = clientes.map((c) => {
      if (c.id !== clienteId) return c;
      const abono = { id: Date.now().toString(36), fecha, monto: Number(monto) };
      let updated = { ...c, abonos: [...(c.abonos || []), abono] };
      if (nuevaFechaCobro) {
        if (Array.isArray(c.cuotas) && c.cuotas.length) {
          const { cuotas } = getSaldos(c);
          const idx = cuotas.findIndex((cu) => cu.pagadoTotal < cu.total);
          updated = {
            ...updated,
            cuotas: c.cuotas.map((cu, i) =>
              i === idx ? { ...cu, fecha: nuevaFechaCobro } : cu
            ),
          };
        } else {
          updated = { ...updated, fechaCobro: nuevaFechaCobro };
        }
      }
      return updated;
    });
    persist(next);
    const ok = await notificar("abono", { clienteId, monto: Number(monto), fecha });
    setNotifyError(!ok);
  }

  function updateFechaCobro(clienteId, nuevaFecha) {
    const next = clientes.map((c) => {
      if (c.id !== clienteId) return c;
      if (Array.isArray(c.cuotas) && c.cuotas.length) {
        const { cuotas } = getSaldos(c);
        const idx = cuotas.findIndex((cu) => cu.pagadoTotal < cu.total);
        return {
          ...c,
          cuotas: c.cuotas.map((cu, i) =>
            i === idx ? { ...cu, fecha: nuevaFecha } : cu
          ),
        };
      }
      return { ...c, fechaCobro: nuevaFecha };
    });
    persist(next);
  }

  function deleteCliente(clienteId) {
    persist(clientes.filter((c) => c.id !== clienteId));
    setConfirmDeleteId(null);
    if (expandedId === clienteId) setExpandedId(null);
  }

  function resetTodo() {
    persist([]);
    setConfirmReset(false);
  }

  const resumen = useMemo(() => {
    let porCobrar = 0,
      cobrado = 0,
      vencidos = 0,
      proximos = 0,
      capitalMes = 0,
      interesMes = 0;
    const mesPrefix = todayISO().slice(0, 7);
    clientes.forEach((c) => {
      const s = getSaldos(c);
      porCobrar += s.saldo;
      cobrado += s.pagado;
      const e = getEstado(c);
      if (e === "vencido") vencidos++;
      if (e === "proximo") proximos++;
      getAllocations(c).detalle.forEach((d) => {
        if ((d.fecha || "").startsWith(mesPrefix)) {
          capitalMes += d.capital;
          interesMes += d.interes;
        }
      });
    });
    return { porCobrar, cobrado, vencidos, proximos, capitalMes, interesMes };
  }, [clientes]);

  const listaFiltrada = useMemo(() => {
    let list = clientes.map((c) => ({ ...c, _estado: getEstado(c) }));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((c) => c.nombre.toLowerCase().includes(q));
    }
    if (filtro !== "todos") {
      list = list.filter((c) => c._estado === filtro);
    }
    list.sort((a, b) => {
      const d = ESTADO_ORDEN[a._estado] - ESTADO_ORDEN[b._estado];
      if (d !== 0) return d;
      return (a.fechaCobro || "").localeCompare(b.fechaCobro || "");
    });
    return list;
  }, [clientes, search, filtro]);

  const ledgerBg = {
    backgroundColor: colors.paper,
    backgroundImage: `repeating-linear-gradient(${colors.rule} 0, ${colors.rule} 1px, transparent 1px, transparent 34px)`,
    minHeight: "100vh",
  };

  return (
    <div style={{ ...ledgerBg, fontFamily: fontSans }} className="pb-28">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Special+Elite&family=Courier+Prime:wght@400;700&family=Work+Sans:wght@400;500;600;700&display=swap');
        input[type="date"]::-webkit-calendar-picker-indicator { opacity: 0.6; }
      `}</style>

      <div className="max-w-md mx-auto">
        <div
          style={{ backgroundColor: colors.forest }}
          className="px-5 pt-8 pb-6 relative overflow-hidden"
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `repeating-linear-gradient(${colors.forestDark} 0, ${colors.forestDark} 1px, transparent 1px, transparent 34px)`,
              opacity: 0.5,
            }}
          />
          <h1
            style={{ fontFamily: fontDisplay, color: colors.cream, fontSize: 26 }}
            className="relative"
          >
            Cuaderno de Cobros
          </h1>
          <p
            style={{ fontFamily: fontSans, color: "#C9DBC5", fontSize: 13 }}
            className="relative mt-1"
          >
            Boletería a crédito — quién debe, cuánto y para cuándo
          </p>
        </div>

        <div
          style={{
            backgroundColor: colors.paperCard,
            borderTop: `2px solid ${colors.ruleDark}`,
            borderBottom: `2px solid ${colors.ruleDark}`,
          }}
          className="grid grid-cols-3 divide-x"
        >
          {[
            { label: "Por cobrar", value: fmtMoney(resumen.porCobrar), color: colors.ink },
            { label: "Cobrado", value: fmtMoney(resumen.cobrado), color: colors.ink },
            {
              label: "Vencidos",
              value: resumen.vencidos,
              color: resumen.vencidos > 0 ? colors.stampRed : colors.ink,
            },
          ].map((s, i) => (
            <div key={i} className="px-2 py-3 text-center" style={{ borderColor: colors.rule }}>
              <div style={{ fontFamily: fontMono, fontWeight: 700, color: s.color, fontSize: 15 }}>
                {s.value}
              </div>
              <div style={{ fontFamily: fontSans, color: colors.inkMuted, fontSize: 11 }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            backgroundColor: colors.paperCard,
            borderBottom: `2px solid ${colors.ruleDark}`,
          }}
          className="grid grid-cols-2 divide-x"
        >
          <div className="px-2 py-2.5 text-center" style={{ borderColor: colors.rule }}>
            <div style={{ fontFamily: fontMono, fontWeight: 700, color: colors.forest, fontSize: 15 }}>
              {fmtMoney(resumen.capitalMes)}
            </div>
            <div style={{ fontFamily: fontSans, color: colors.inkMuted, fontSize: 11 }}>
              Ingresos de capital del mes
            </div>
          </div>
          <div className="px-2 py-2.5 text-center" style={{ borderColor: colors.rule }}>
            <div style={{ fontFamily: fontMono, fontWeight: 700, color: colors.stampAmber, fontSize: 15 }}>
              {fmtMoney(resumen.interesMes)}
            </div>
            <div style={{ fontFamily: fontSans, color: colors.inkMuted, fontSize: 11 }}>
              Ingresos por intereses del mes
            </div>
          </div>
        </div>

        {(resumen.vencidos > 0 || resumen.proximos > 0) && (
          <button
            onClick={() => setFiltro(resumen.vencidos > 0 ? "vencido" : "proximo")}
            style={{ backgroundColor: "#F3E4D8", color: colors.stampRed, fontFamily: fontSans, fontSize: 13 }}
            className="w-full flex items-center gap-2 px-5 py-2.5 text-left"
          >
            <AlertTriangle size={16} style={{ flexShrink: 0 }} />
            <span>
              Tienes <b>{resumen.vencidos}</b> cobro{resumen.vencidos !== 1 ? "s" : ""} vencido
              {resumen.vencidos !== 1 ? "s" : ""}
              {resumen.proximos > 0 && (
                <>
                  {" "}
                  y <b>{resumen.proximos}</b> próximo{resumen.proximos !== 1 ? "s" : ""} a vencer
                </>
              )}
              .
            </span>
          </button>
        )}

        <div className="px-4 pt-4">
          {sinConfig ? (
            <div
              style={{
                backgroundColor: colors.paperCard,
                border: `1px dashed ${colors.stampRed}`,
                color: colors.ink,
                fontFamily: fontSans,
              }}
              className="text-center py-8 px-6 rounded-lg text-sm"
            >
              <div style={{ fontWeight: 700, color: colors.stampRed, fontSize: 14, marginBottom: 6 }}>
                Faltan las credenciales de Supabase
              </div>
              <div style={{ color: colors.inkMuted }}>
                En Vercel entra a tu proyecto → <b>Settings → Environment Variables</b> y agrega:
              </div>
              <div style={{ fontFamily: fontMono, fontSize: 12, color: colors.ink, marginTop: 8 }}>
                VITE_SUPABASE_URL
                <br />
                VITE_SUPABASE_ANON_KEY
              </div>
              <div style={{ color: colors.inkMuted, marginTop: 8 }}>
                Copia los valores de tu archivo .env, luego ve a <b>Deployments</b> → Redeploy.
              </div>
            </div>
          ) : (
            <>
          <div
            style={{ backgroundColor: colors.paperCard, border: `1px solid ${colors.rule}` }}
            className="flex items-center gap-2 rounded-lg px-3 py-2 mb-3"
          >
            <Search size={16} color={colors.inkMuted} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente..."
              style={{ fontFamily: fontSans, color: colors.ink, background: "transparent" }}
              className="flex-1 outline-none text-sm"
            />
            {search && (
              <button onClick={() => setSearch("")}>
                <X size={14} color={colors.inkMuted} />
              </button>
            )}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-3 -mx-1 px-1">
            {[
              ["todos", "Todos"],
              ["vencido", "Vencidos"],
              ["proximo", "Próximos"],
              ["al_dia", "Al día"],
              ["pagado", "Pagados"],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFiltro(key)}
                style={{
                  fontFamily: fontSans,
                  fontSize: 12,
                  whiteSpace: "nowrap",
                  backgroundColor: filtro === key ? colors.forest : colors.paperCard,
                  color: filtro === key ? colors.cream : colors.inkMuted,
                  border: `1px solid ${filtro === key ? colors.forest : colors.rule}`,
                }}
                className="px-3 py-1.5 rounded-full"
              >
                {label}
              </button>
            ))}
          </div>
            </>
          )}
        </div>

        {!sinConfig && (
        <div className="px-4">
          {loading ? (
            <div style={{ color: colors.inkMuted, fontFamily: fontSans }} className="text-center py-10 text-sm">
              Cargando cuaderno...
            </div>
          ) : listaFiltrada.length === 0 ? (
            <div
              style={{
                backgroundColor: colors.paperCard,
                border: `1px dashed ${colors.ruleDark}`,
                color: colors.inkMuted,
                fontFamily: fontSans,
              }}
              className="text-center py-10 px-6 rounded-lg text-sm"
            >
              {clientes.length === 0
                ? "El cuaderno está vacío. Toca el + para registrar la primera venta."
                : "No hay clientes que coincidan con este filtro."}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {listaFiltrada.map((c) => {
                const saldo = getSaldos(c).saldo;
                const proxFecha = getProximaFecha(c);
                const isOpen = expandedId === c.id;
                return (
                  <div
                    key={c.id}
                    style={{ backgroundColor: colors.paperCard, border: `1px solid ${colors.rule}` }}
                    className="rounded-lg overflow-hidden"
                  >
                    <button
                      onClick={() => setExpandedId(isOpen ? null : c.id)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <div style={{ fontFamily: fontSans, fontWeight: 600, color: colors.ink }} className="text-sm truncate">
                          {c.nombre}
                        </div>
                        <div style={{ fontFamily: fontMono, color: colors.inkMuted, fontSize: 12 }} className="mt-0.5">
                          Saldo {fmtMoney(saldo)} · cobra {fmtDate(proxFecha)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pl-2 flex-shrink-0">
                        <Stamp estado={c._estado} />
                        {isOpen ? <ChevronUp size={16} color={colors.inkMuted} /> : <ChevronDown size={16} color={colors.inkMuted} />}
                      </div>
                    </button>

                    {isOpen && (
                      <ClienteDetalle
                        cliente={c}
                        onAddAbono={addAbono}
                        onUpdateFecha={updateFechaCobro}
                        confirmDelete={confirmDeleteId === c.id}
                        onAskDelete={() => setConfirmDeleteId(c.id)}
                        onCancelDelete={() => setConfirmDeleteId(null)}
                        onDelete={() => deleteCliente(c.id)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        )}

        {clientes.length > 0 && (
          <div className="px-4 pt-6 pb-2 text-center">
            {confirmReset ? (
              <div style={{ fontFamily: fontSans, fontSize: 12, color: colors.inkMuted }}>
                ¿Vaciar todo el cuaderno?{" "}
                <button onClick={resetTodo} style={{ color: colors.stampRed, fontWeight: 600 }}>
                  Sí, vaciar
                </button>{" "}
                ·{" "}
                <button onClick={() => setConfirmReset(false)} style={{ color: colors.ink }}>
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmReset(true)}
                style={{ fontFamily: fontSans, fontSize: 12, color: colors.inkMuted }}
                className="inline-flex items-center gap-1"
              >
                <RotateCcw size={12} /> Vaciar cuaderno
              </button>
            )}
          </div>
        )}

        {error && (
          <div style={{ fontFamily: fontSans, fontSize: 12, color: colors.stampRed }} className="text-center px-4 pt-2">
            No se pudo conectar con la base de datos. Revisa las variables de entorno de Supabase.
          </div>
        )}

        {notifyError && (
          <div
            style={{
              fontFamily: fontSans,
              fontSize: 12,
              color: colors.stampAmber,
              backgroundColor: "#F3E4D8",
              border: `1px solid ${colors.stampAmber}`,
            }}
            className="text-center mx-4 mt-3 px-3 py-2 rounded"
          >
            El correo de notificación no se pudo enviar. Revisa que las variables SMTP estén
            configuradas en Vercel (Settings → Environment Variables).
          </div>
        )}
      </div>

      <button
        onClick={() => setShowAdd(true)}
        style={{ backgroundColor: colors.forest }}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-lg flex items-center justify-center"
      >
        <Plus color={colors.cream} size={26} />
      </button>

      {showAdd && <NuevaVentaModal onClose={() => setShowAdd(false)} onSave={addVenta} />}
    </div>
  );
}

function ClienteDetalle({
  cliente,
  onAddAbono,
  onUpdateFecha,
  confirmDelete,
  onAskDelete,
  onCancelDelete,
  onDelete,
}) {
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(todayISO());

  const s = useMemo(() => getSaldos(cliente), [cliente]);
  const { cuotas, total, saldo, capitalPagado, interesPagado } = s;
  const capTotal = total - cuotas.reduce((a, cu) => a + cu.interes, 0);
  const interesTotal = total - capTotal;
  const prox = cuotas.find((cu) => cu.pagadoTotal < cu.total);
  const [nuevaFecha, setNuevaFecha] = useState(prox ? prox.fecha : cliente.fechaCobro || todayISO());

  const historial = [...(cliente.abonos || [])].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const mesPrefix = todayISO().slice(0, 7);
  const cuotaMes = cuotas.find((cu) => (cu.fecha || "").startsWith(mesPrefix));

  function submitAbono(e) {
    e.preventDefault();
    if (!monto || Number(monto) <= 0) return;
    onAddAbono(cliente.id, monto, fecha, saldo - Number(monto) > 0 ? nuevaFecha : null);
    setMonto("");
  }

  return (
    <div style={{ borderTop: `1px dashed ${colors.rule}`, backgroundColor: colors.paperCardAlt }} className="px-4 py-3">
      <div style={{ fontFamily: fontMono, color: colors.inkMuted, fontSize: 12 }} className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
        <span>
          {cliente.boletos} bol. × {fmtMoney(cliente.precioUnitario)}
        </span>
        <span>Capital {fmtMoney(capTotal)}</span>
        <span>Interés {fmtMoney(interesTotal)}</span>
        <span>A pagar {fmtMoney(total)}</span>
      </div>

      {Array.isArray(cliente.cuotas) && cliente.cuotas.length > 0 && (
        <div style={{ fontFamily: fontMono, color: colors.inkMuted, fontSize: 11 }} className="mb-2">
          {cliente.numeroCuotas} cuota{cliente.numeroCuotas !== 1 ? "s" : ""} ·{" "}
          {cliente.tasaInteres > 0 ? `${cliente.tasaInteres}% de interés por cuota` : "sin interés"}
          {cliente.periodicidad ? ` · ${cliente.periodicidad}` : ""}
        </div>
      )}

      {/* Seguimiento de cuotas */}
      <div className="mb-3">
        <div style={{ fontFamily: fontSans, fontSize: 11, color: colors.inkMuted }} className="mb-1 uppercase tracking-wide">
          Seguimiento por cuotas
        </div>
        <div className="flex flex-col gap-1.5">
          {cuotas.map((cu) => {
            const st = cuotaEstado(cu);
            const esMes = (cu.fecha || "").startsWith(mesPrefix);
            return (
              <div
                key={cu.numero}
                style={{
                  backgroundColor: esMes ? "#EAF1E4" : colors.paperCard,
                  border: `1px solid ${esMes ? colors.ruleDark : colors.rule}`,
                  borderRadius: 6,
                  padding: "5px 8px",
                }}
              >
                <div className="flex justify-between items-center" style={{ fontFamily: fontSans, fontSize: 12, color: colors.ink }}>
                  <span style={{ fontWeight: 600 }}>
                    Cuota #{cu.numero} · {fmtDate(cu.fecha)}
                    {esMes && <span style={{ color: colors.forest }}> · este mes</span>}
                  </span>
                  <span style={{ color: st.color, fontSize: 11 }}>{st.text}</span>
                </div>
                <div className="flex justify-between" style={{ fontFamily: fontMono, fontSize: 11, color: colors.ink }}>
                  <span>Capital {fmtMoney(cu.capital)} · Interés {fmtMoney(cu.interes)}</span>
                  <span>Total {fmtMoney(cu.total)}</span>
                </div>
                <div className="flex justify-between" style={{ fontFamily: fontMono, fontSize: 11, color: colors.inkMuted }}>
                  <span>Ingresado {fmtMoney(cu.pagadoTotal)} de {fmtMoney(cu.total)}</span>
                  <span>Cap {fmtMoney(cu.pagadoCapital)} · Int {fmtMoney(cu.pagadoInteres)}</span>
                </div>
              </div>
            );
          })}
        </div>
        {cuotaMes && (
          <div style={{ fontFamily: fontMono, fontSize: 12, color: colors.forest }} className="mt-1.5">
            Cuota de {fmtMes(cuotaMes.fecha)}: {fmtMoney(cuotaMes.pagadoTotal)} de {fmtMoney(cuotaMes.total)}
          </div>
        )}
      </div>

      {/* Historial */}
      {historial.length > 0 && (
        <div className="mb-3">
          <div style={{ fontFamily: fontSans, fontSize: 11, color: colors.inkMuted }} className="mb-1 uppercase tracking-wide">
            Historial de pagos
          </div>
          <div className="flex flex-col gap-1">
            {historial.map((a) => (
              <div key={a.id} style={{ fontFamily: fontMono, fontSize: 12, color: colors.ink }} className="flex justify-between">
                <span>{fmtDate(a.fecha)}</span>
                <span>{fmtMoney(a.monto)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reprogramar fecha */}
      {saldo > 0 && prox && (
        <div className="flex items-center gap-2 mb-3">
          <span style={{ fontFamily: fontSans, fontSize: 12, color: colors.inkMuted }}>
            Próximo cobro
          </span>
          <input
            type="date"
            value={prox.fecha}
            onChange={(e) => onUpdateFecha(cliente.id, e.target.value)}
            style={{ fontFamily: fontMono, fontSize: 12, color: colors.ink, background: colors.paperCard, border: `1px solid ${colors.rule}` }}
            className="rounded px-2 py-1"
          />
        </div>
      )}

      {saldo > 0 ? (
        <form onSubmit={submitAbono} className="flex flex-col gap-2 mb-3">
          <div style={{ fontFamily: fontSans, fontSize: 11, color: colors.inkMuted }} className="uppercase tracking-wide">
            Registrar abono
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              min="1"
              placeholder="Monto"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              style={{ fontFamily: fontMono, fontSize: 13, color: colors.ink, background: colors.paperCard, border: `1px solid ${colors.rule}` }}
              className="flex-1 rounded px-2 py-1.5 min-w-0"
            />
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              style={{ fontFamily: fontMono, fontSize: 12, color: colors.ink, background: colors.paperCard, border: `1px solid ${colors.rule}` }}
              className="rounded px-2 py-1.5"
            />
          </div>
          {Number(monto) > 0 && saldo - Number(monto) > 0 && (
            <div className="flex items-center gap-2">
              <span style={{ fontFamily: fontSans, fontSize: 12, color: colors.inkMuted }}>
                Nueva fecha de cobro
              </span>
              <input
                type="date"
                value={nuevaFecha}
                onChange={(e) => setNuevaFecha(e.target.value)}
                style={{ fontFamily: fontMono, fontSize: 12, color: colors.ink, background: colors.paperCard, border: `1px solid ${colors.rule}` }}
                className="rounded px-2 py-1"
              />
            </div>
          )}
          <button
            type="submit"
            style={{ backgroundColor: colors.forest, color: colors.cream, fontFamily: fontSans, fontSize: 13 }}
            className="rounded py-1.5 font-medium"
          >
            Guardar abono
          </button>
        </form>
      ) : (
        <div style={{ color: colors.stampBlue, fontFamily: fontSans, fontSize: 13 }} className="flex items-center gap-1.5 mb-3">
          <CheckCircle2 size={15} /> Cuenta saldada
        </div>
      )}

      <div className="text-right">
        {confirmDelete ? (
          <span style={{ fontFamily: fontSans, fontSize: 12, color: colors.inkMuted }}>
            ¿Eliminar cliente?{" "}
            <button onClick={onDelete} style={{ color: colors.stampRed, fontWeight: 600 }}>
              Sí
            </button>{" "}
            ·{" "}
            <button onClick={onCancelDelete} style={{ color: colors.ink }}>
              No
            </button>
          </span>
        ) : (
          <button onClick={onAskDelete} style={{ color: colors.inkMuted }} className="inline-flex items-center gap-1">
            <Trash2 size={13} />
            <span style={{ fontFamily: fontSans, fontSize: 12 }}>Eliminar</span>
          </button>
        )}
      </div>
    </div>
  );
}

function NuevaVentaModal({ onClose, onSave }) {
  const [nombre, setNombre] = useState("");
  const [boletos, setBoletos] = useState("");
  const [precioUnitario, setPrecioUnitario] = useState("");
  const [tasaInteres, setTasaInteres] = useState("");
  const [numeroCuotas, setNumeroCuotas] = useState("1");
  const [periodicidad, setPeriodicidad] = useState("semanal");
  const [fechaVenta, setFechaVenta] = useState(todayISO());
  const [abonoInicial, setAbonoInicial] = useState("");

  const capTotal = (Number(boletos) || 0) * (Number(precioUnitario) || 0);
  const N = Math.max(1, Number(numeroCuotas) || 1);
  const preview =
    capTotal > 0
      ? generarCuotas(
          Number(boletos),
          Number(precioUnitario),
          Number(tasaInteres) || 0,
          N,
          fechaVenta,
          CADENCIA[periodicidad] || CADENCIA.semanal
        )
      : [];
  const totalIntereses = preview.reduce((a, cu) => a + cu.interes, 0);
  const totalPagar = preview.reduce((a, cu) => a + cu.total, 0);

  const valido =
    nombre.trim() &&
    Number(boletos) > 0 &&
    Number(precioUnitario) > 0 &&
    Number(numeroCuotas) >= 1 &&
    fechaVenta;

  function submit(e) {
    e.preventDefault();
    if (!valido) return;
    onSave({
      nombre,
      boletos,
      precioUnitario,
      tasaInteres,
      numeroCuotas,
      periodicidad,
      fechaVenta,
      abonoInicial,
    });
  }

  return (
    <div
      style={{ backgroundColor: "rgba(30,43,32,0.55)" }}
      className="fixed inset-0 flex items-end justify-center z-50"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ backgroundColor: colors.cream, maxHeight: "88vh" }}
        className="w-full max-w-md rounded-t-2xl overflow-y-auto"
      >
        <div style={{ borderBottom: `1px solid ${colors.rule}`, backgroundColor: colors.cream }} className="flex items-center justify-between px-5 py-4 sticky top-0 z-10">
          <h2 style={{ fontFamily: fontDisplay, color: colors.ink, fontSize: 18 }}>Nueva venta</h2>
          <button onClick={onClose}>
            <X size={20} color={colors.inkMuted} />
          </button>
        </div>

        <form onSubmit={submit} className="px-5 py-4 flex flex-col gap-4">
          <Field label="Nombre del cliente">
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Carlos Restrepo" style={inputStyle} autoFocus />
          </Field>

          <div className="flex gap-3">
            <Field label="Boletos" className="flex-1">
              <input type="number" min="1" value={boletos} onChange={(e) => setBoletos(e.target.value)} placeholder="0" style={{ ...inputStyle, fontFamily: fontMono }} />
            </Field>
            <Field label="Precio unidad" className="flex-1">
              <input type="number" min="1" value={precioUnitario} onChange={(e) => setPrecioUnitario(e.target.value)} placeholder="0" style={{ ...inputStyle, fontFamily: fontMono }} />
            </Field>
          </div>

          <div className="flex gap-3">
            <Field label="Tasa de interés (%)" className="flex-1">
              <input
                type="number"
                min="0"
                step="0.1"
                value={tasaInteres}
                onChange={(e) => setTasaInteres(e.target.value)}
                placeholder="0"
                style={{ ...inputStyle, fontFamily: fontMono }}
              />
            </Field>
            <Field label="N.º de cuotas" className="flex-1">
              <input
                type="number"
                min="1"
                value={numeroCuotas}
                onChange={(e) => setNumeroCuotas(e.target.value)}
                placeholder="1"
                style={{ ...inputStyle, fontFamily: fontMono }}
              />
            </Field>
          </div>

          <Field label="Pagar cada (periodicidad)">
            <select
              value={periodicidad}
              onChange={(e) => setPeriodicidad(e.target.value)}
              style={inputStyle}
            >
              <option value="semanal">Semana</option>
              <option value="quincenal">Quincena</option>
              <option value="mensual">Mes</option>
            </select>
          </Field>

          {preview.length > 0 && (
            <div style={{ backgroundColor: colors.paperCard, border: `1px solid ${colors.rule}` }} className="rounded-lg px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <span style={{ fontFamily: fontSans, fontSize: 13, color: colors.inkMuted }}>
                  Capital boletas
                </span>
                <span style={{ fontFamily: fontMono, fontWeight: 700, color: colors.ink, fontSize: 14 }}>
                  {fmtMoney(capTotal)}
                </span>
              </div>
              <div className="flex items-center justify-between mb-1">
                <span style={{ fontFamily: fontSans, fontSize: 13, color: colors.inkMuted }}>
                  Intereses ({Number(tasaInteres) || 0}%)
                </span>
                <span style={{ fontFamily: fontMono, fontWeight: 700, color: colors.stampAmber, fontSize: 14 }}>
                  {fmtMoney(totalIntereses)}
                </span>
              </div>
              <div style={{ borderTop: `1px dashed ${colors.rule}`, margin: "6px 0" }} />
              <div className="flex items-center justify-between">
                <span style={{ fontFamily: fontSans, fontSize: 14, color: colors.inkMuted }}>
                  Total a pagar en {N} cuota{N !== 1 ? "s" : ""}
                </span>
                <span style={{ fontFamily: fontMono, fontWeight: 700, fontSize: 18, color: colors.ink }}>
                  {fmtMoney(totalPagar)}
                </span>
              </div>
              {preview.length > 1 && (
                <div className="mt-2 flex flex-col gap-0.5" style={{ maxHeight: 140, overflowY: "auto" }}>
                  {preview.map((cu) => (
                    <div key={cu.numero} style={{ fontFamily: fontMono, fontSize: 11, color: colors.inkMuted }} className="flex justify-between">
                      <span>
                        #{cu.numero} · {fmtDate(cu.fecha)}
                      </span>
                      <span>
                        Cap {fmtMoney(cu.capital)} · Int {fmtMoney(cu.interes)} = {fmtMoney(cu.total)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <Field label="Fecha de venta">
            <input type="date" value={fechaVenta} onChange={(e) => setFechaVenta(e.target.value)} style={{ ...inputStyle, fontFamily: fontMono }} />
          </Field>

          <Field label="Abono inicial (opcional)">
            <input type="number" min="0" value={abonoInicial} onChange={(e) => setAbonoInicial(e.target.value)} placeholder="0" style={{ ...inputStyle, fontFamily: fontMono }} />
          </Field>

          <button
            type="submit"
            disabled={!valido}
            style={{ backgroundColor: valido ? colors.forest : colors.rule, color: colors.cream, fontFamily: fontSans }}
            className="rounded-lg py-3 font-semibold mt-1 mb-4"
          >
            Registrar venta
          </button>
        </form>
      </div>
    </div>
  );
}

const inputStyle = {
  fontFamily: fontSans,
  fontSize: 14,
  color: colors.ink,
  backgroundColor: colors.paperCard,
  border: `1px solid ${colors.rule}`,
  borderRadius: 8,
  padding: "8px 12px",
  width: "100%",
};

function Field({ label, children, className }) {
  return (
    <label className={className}>
      <div style={{ fontFamily: fontSans, fontSize: 12, color: colors.inkMuted }} className="mb-1">
        {label}
      </div>
      {children}
    </label>
  );
}
