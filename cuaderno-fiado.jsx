import React, { useState, useEffect, useMemo, useRef } from "react";
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

const STORAGE_KEY = "clientes-boleteria";

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

function getTotal(c) {
  return (Number(c.boletos) || 0) * (Number(c.precioUnitario) || 0);
}
function getAbonado(c) {
  return (c.abonos || []).reduce((s, a) => s + (Number(a.monto) || 0), 0);
}
function getSaldo(c) {
  return Math.max(0, getTotal(c) - getAbonado(c));
}
function getEstado(c) {
  if (getSaldo(c) <= 0) return "pagado";
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date((c.fechaCobro || todayISO()) + "T00:00:00");
  const diffDias = Math.round((venc - hoy) / 86400000);
  if (diffDias < 0) return "vencido";
  if (diffDias <= 3) return "proximo";
  return "al_dia";
}

const ESTADO_ORDEN = { vencido: 0, proximo: 1, al_dia: 2, pagado: 3 };

const ESTADO_LABEL = {
  vencido: "Vencido",
  proximo: "Próximo",
  al_dia: "Al día",
  pagado: "Pagado",
};

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
  const loadedRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY, false);
        setClientes(res ? JSON.parse(res.value) : []);
      } catch (e) {
        setClientes([]);
      } finally {
        setLoading(false);
        loadedRef.current = true;
      }
    })();
  }, []);

  async function persist(next) {
    setClientes(next);
    try {
      const res = await window.storage.set(STORAGE_KEY, JSON.stringify(next), false);
      if (!res) setError(true);
      else setError(false);
    } catch (e) {
      setError(true);
    }
  }

  function addVenta(data) {
    const nuevo = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      nombre: data.nombre.trim(),
      boletos: Number(data.boletos),
      precioUnitario: Number(data.precioUnitario),
      fechaVenta: data.fechaVenta,
      fechaCobro: data.fechaCobro,
      abonos:
        Number(data.abonoInicial) > 0
          ? [{ id: "a0", fecha: data.fechaVenta, monto: Number(data.abonoInicial) }]
          : [],
    };
    persist([nuevo, ...clientes]);
    setShowAdd(false);
  }

  function addAbono(clienteId, monto, fecha, nuevaFechaCobro) {
    const next = clientes.map((c) => {
      if (c.id !== clienteId) return c;
      const abono = { id: Date.now().toString(36), fecha, monto: Number(monto) };
      return {
        ...c,
        abonos: [...(c.abonos || []), abono],
        fechaCobro: nuevaFechaCobro || c.fechaCobro,
      };
    });
    persist(next);
  }

  function updateFechaCobro(clienteId, nuevaFecha) {
    const next = clientes.map((c) =>
      c.id === clienteId ? { ...c, fechaCobro: nuevaFecha } : c
    );
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
      proximos = 0;
    clientes.forEach((c) => {
      porCobrar += getSaldo(c);
      cobrado += getAbonado(c);
      const e = getEstado(c);
      if (e === "vencido") vencidos++;
      if (e === "proximo") proximos++;
    });
    return { porCobrar, cobrado, vencidos, proximos };
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
        {/* Header */}
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

        {/* Summary strip */}
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
              <div
                style={{ fontFamily: fontMono, fontWeight: 700, color: s.color, fontSize: 15 }}
              >
                {s.value}
              </div>
              <div style={{ fontFamily: fontSans, color: colors.inkMuted, fontSize: 11 }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* Alert banner */}
        {(resumen.vencidos > 0 || resumen.proximos > 0) && (
          <button
            onClick={() => setFiltro(resumen.vencidos > 0 ? "vencido" : "proximo")}
            style={{
              backgroundColor: "#F3E4D8",
              color: colors.stampRed,
              fontFamily: fontSans,
              fontSize: 13,
            }}
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

        {/* Search + filters */}
        <div className="px-4 pt-4">
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
        </div>

        {/* List */}
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
                const saldo = getSaldo(c);
                const total = getTotal(c);
                const abonado = getAbonado(c);
                const isOpen = expandedId === c.id;
                return (
                  <div
                    key={c.id}
                    style={{
                      backgroundColor: colors.paperCard,
                      border: `1px solid ${colors.rule}`,
                    }}
                    className="rounded-lg overflow-hidden"
                  >
                    <button
                      onClick={() => setExpandedId(isOpen ? null : c.id)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <div
                          style={{ fontFamily: fontSans, fontWeight: 600, color: colors.ink }}
                          className="text-sm truncate"
                        >
                          {c.nombre}
                        </div>
                        <div
                          style={{ fontFamily: fontMono, color: colors.inkMuted, fontSize: 12 }}
                          className="mt-0.5"
                        >
                          Saldo {fmtMoney(saldo)} · cobra {fmtDate(c.fechaCobro)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pl-2 flex-shrink-0">
                        <Stamp estado={c._estado} />
                        {isOpen ? (
                          <ChevronUp size={16} color={colors.inkMuted} />
                        ) : (
                          <ChevronDown size={16} color={colors.inkMuted} />
                        )}
                      </div>
                    </button>

                    {isOpen && (
                      <ClienteDetalle
                        cliente={c}
                        total={total}
                        abonado={abonado}
                        saldo={saldo}
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

        {/* Reset */}
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
          <div
            style={{ fontFamily: fontSans, fontSize: 12, color: colors.stampRed }}
            className="text-center px-4 pt-2"
          >
            No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.
          </div>
        )}
      </div>

      {/* FAB */}
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
  total,
  abonado,
  saldo,
  onAddAbono,
  onUpdateFecha,
  confirmDelete,
  onAskDelete,
  onCancelDelete,
  onDelete,
}) {
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(todayISO());
  const [nuevaFecha, setNuevaFecha] = useState(cliente.fechaCobro);

  const historial = [...(cliente.abonos || [])].sort((a, b) =>
    b.fecha.localeCompare(a.fecha)
  );

  function submitAbono(e) {
    e.preventDefault();
    if (!monto || Number(monto) <= 0) return;
    onAddAbono(cliente.id, monto, fecha, saldo - Number(monto) > 0 ? nuevaFecha : null);
    setMonto("");
  }

  return (
    <div
      style={{ borderTop: `1px dashed ${colors.rule}`, backgroundColor: colors.paperCardAlt }}
      className="px-4 py-3"
    >
      <div
        style={{ fontFamily: fontMono, color: colors.inkMuted, fontSize: 12 }}
        className="flex flex-wrap gap-x-4 gap-y-1 mb-3"
      >
        <span>
          {cliente.boletos} bol. × {fmtMoney(cliente.precioUnitario)} = {fmtMoney(total)}
        </span>
        <span>Abonado {fmtMoney(abonado)}</span>
      </div>

      {/* Historial */}
      {historial.length > 0 && (
        <div className="mb-3">
          <div style={{ fontFamily: fontSans, fontSize: 11, color: colors.inkMuted }} className="mb-1 uppercase tracking-wide">
            Historial de pagos
          </div>
          <div className="flex flex-col gap-1">
            {historial.map((a) => (
              <div
                key={a.id}
                style={{ fontFamily: fontMono, fontSize: 12, color: colors.ink }}
                className="flex justify-between"
              >
                <span>{fmtDate(a.fecha)}</span>
                <span>{fmtMoney(a.monto)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reprogramar fecha */}
      {saldo > 0 && (
        <div className="flex items-center gap-2 mb-3">
          <span style={{ fontFamily: fontSans, fontSize: 12, color: colors.inkMuted }}>
            Próximo cobro
          </span>
          <input
            type="date"
            value={cliente.fechaCobro}
            onChange={(e) => onUpdateFecha(cliente.id, e.target.value)}
            style={{ fontFamily: fontMono, fontSize: 12, color: colors.ink, background: colors.paperCard, border: `1px solid ${colors.rule}` }}
            className="rounded px-2 py-1"
          />
        </div>
      )}

      {/* Nuevo abono */}
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
        <div
          style={{ color: colors.stampBlue, fontFamily: fontSans, fontSize: 13 }}
          className="flex items-center gap-1.5 mb-3"
        >
          <CheckCircle2 size={15} /> Cuenta saldada
        </div>
      )}

      {/* Eliminar */}
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
  const [fechaVenta, setFechaVenta] = useState(todayISO());
  const [fechaCobro, setFechaCobro] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split("T")[0];
  });
  const [abonoInicial, setAbonoInicial] = useState("");

  const total = (Number(boletos) || 0) * (Number(precioUnitario) || 0);
  const valido = nombre.trim() && Number(boletos) > 0 && Number(precioUnitario) > 0 && fechaCobro;

  function submit(e) {
    e.preventDefault();
    if (!valido) return;
    onSave({ nombre, boletos, precioUnitario, fechaVenta, fechaCobro, abonoInicial });
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
        <div
          style={{ borderBottom: `1px solid ${colors.rule}` }}
          className="flex items-center justify-between px-5 py-4 sticky top-0"
        >
          <h2 style={{ fontFamily: fontDisplay, color: colors.ink, fontSize: 18 }}>
            Nueva venta
          </h2>
          <button onClick={onClose}>
            <X size={20} color={colors.inkMuted} />
          </button>
        </div>

        <form onSubmit={submit} className="px-5 py-4 flex flex-col gap-4">
          <Field label="Nombre del cliente">
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Carlos Restrepo"
              style={inputStyle}
              autoFocus
            />
          </Field>

          <div className="flex gap-3">
            <Field label="Boletos" className="flex-1">
              <input
                type="number"
                min="1"
                value={boletos}
                onChange={(e) => setBoletos(e.target.value)}
                placeholder="0"
                style={{ ...inputStyle, fontFamily: fontMono }}
              />
            </Field>
            <Field label="Precio unidad" className="flex-1">
              <input
                type="number"
                min="1"
                value={precioUnitario}
                onChange={(e) => setPrecioUnitario(e.target.value)}
                placeholder="0"
                style={{ ...inputStyle, fontFamily: fontMono }}
              />
            </Field>
          </div>

          <div
            style={{ backgroundColor: colors.paperCard, border: `1px solid ${colors.rule}` }}
            className="rounded-lg px-4 py-3 flex items-center justify-between"
          >
            <span style={{ fontFamily: fontSans, fontSize: 13, color: colors.inkMuted }}>
              Total
            </span>
            <span style={{ fontFamily: fontMono, fontWeight: 700, fontSize: 18, color: colors.ink }}>
              {fmtMoney(total)}
            </span>
          </div>

          <div className="flex gap-3">
            <Field label="Fecha de venta" className="flex-1">
              <input
                type="date"
                value={fechaVenta}
                onChange={(e) => setFechaVenta(e.target.value)}
                style={{ ...inputStyle, fontFamily: fontMono }}
              />
            </Field>
            <Field label="Fecha de cobro" className="flex-1">
              <input
                type="date"
                value={fechaCobro}
                onChange={(e) => setFechaCobro(e.target.value)}
                style={{ ...inputStyle, fontFamily: fontMono }}
              />
            </Field>
          </div>

          <Field label="Abono inicial (opcional)">
            <input
              type="number"
              min="0"
              value={abonoInicial}
              onChange={(e) => setAbonoInicial(e.target.value)}
              placeholder="0"
              style={{ ...inputStyle, fontFamily: fontMono }}
            />
          </Field>

          <button
            type="submit"
            disabled={!valido}
            style={{
              backgroundColor: valido ? colors.forest : colors.rule,
              color: colors.cream,
              fontFamily: fontSans,
            }}
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
