"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Clock,
  KeyRound,
  LogOut,
  MapPin,
  RotateCcw,
  Search,
  Siren,
  User,
  Shield,
  Download,
  Copy,
  AlertTriangle,
} from "lucide-react";

import { stripUndefinedDeep } from "@/lib/firestoreSanitize";
import { auth, db } from "@/lib/firebase";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  User as FirebaseUser,
} from "firebase/auth";
import {
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

// ===================== Config =====================
const KEY_POINT = "Bodega / Almacén Central (Zona Moon)";
const SLA_MINUTES = 90; // 1.5 hrs
const RECALL_MINUTES = 15;

// Retorno default (operación real)
const RETURN_DEFAULT_ZONE = "Bodega principal - Expo Center";

// Firestore (simple: 1 documento para toda la operación)
const DISPATCH_COLLECTION = "dispatch";
const DISPATCH_DOC_ID = "zona-moon-v1";

// Admin UI gate (el bloqueo real lo hacen tus Firestore Rules por UID)
const ADMIN_EMAILS = new Set([
  "amanjarrez@quantumeventstechnology.com",
  "scohuo@quantumeventstechnology.com",
]);

// ===================== Data model =====================
type VehicleType = "Carga" | "2 plazas" | "4 plazas";
type VehicleStatus =
  | "Disponible"
  | "En uso"
  | "En espera"
  | "Recall"
  | "Mantenimiento";

type Vehicle = {
  id: string; // C01..C06, P02, P04
  type: VehicleType;
  status: VehicleStatus;
  lastZone?: string;
  lastUserLabel?: string; // "ID - Nombre" o "FREELANCE - Nombre (ID: ...)"
  lastPurpose?: string;
  lastNotes?: string;
  checkedOutAt?: number; // epoch ms
  recallAt?: number; // epoch ms
  recallBy?: string; // quien inicia el recall
};

type UserEntry = { id: string; name: string };

type TxType =
  | "CHECKOUT"
  | "CHECKIN"
  | "RECALL"
  | "ESCALATION"
  | "STATUS"
  | "SYSTEM";

type Transaction = {
  ts: number;
  type: TxType;
  vehicleId: string;
  summary: string;
  actor?: string; // email
};

// ===================== Fleet =====================
// 6 utilitarios + 2 plazas + 4 plazas
const INITIAL_VEHICLES: Vehicle[] = [
  { id: "C01", type: "Carga", status: "Disponible" },
  { id: "C02", type: "Carga", status: "Disponible" },
  { id: "C03", type: "Carga", status: "Disponible" },
  { id: "C04", type: "Carga", status: "Disponible" },
  { id: "C05", type: "Carga", status: "Disponible" },
  { id: "C06", type: "Carga", status: "Disponible" },
  { id: "P02", type: "2 plazas", status: "Disponible" },
  { id: "P04", type: "4 plazas", status: "Disponible" },
];

const ZONES = [
  RETURN_DEFAULT_ZONE,
  "Combo Capilla (terraza, jardín, playa)",
  "Combo Tucán (terraza, jardín, playa)",
  "Combo Buganvilias (terraza, jardín, playa)",
  "Playa Delfines",
  "Playa The Grand",
  "Terraza Caribeño",
  "Playa Fragata",
  "Lake Terrace",
  "Terraza Cusco",
  "Arena Ballroom",
  "Combo Galactic-Stars-Otros",
  "Expo Center",
  "The Grand Ballroom",
  "Tortugas-Nizuc",
  "Moonlight terrace",
  "Playa Dunes",
] as const;

const USERS: UserEntry[] = [
  { id: "006111", name: "CRUZ CRUZ, FELIPE" },
  { id: "069686", name: "GARCIA LOPEZ, GONZALO" },
  { id: "087561", name: "MANJARREZ ZAVALA, LUIS ARMANDO" },
  { id: "089509", name: "VILLEGAS DIAZ, ERIK FRANCISCO" },
  { id: "089701", name: "BONILLA SANCHEZ, JORGE" },
  { id: "089727", name: "MARTINEZ MONJARAZ, TOMAS DAVID" },
  { id: "090870", name: "BAUTISTA GUERRERO, MANUEL" },
  { id: "091258", name: "MAAS TUZ, ALFREDO EMANUEL" },
  { id: "091356", name: "POLANCO BALAM, HECTOR RODRIGO" },
  { id: "091918", name: "RUIZ VELAZQUEZ, CHRISTIAN GERMAN" },
  { id: "093766", name: "KOH PUC, GUSTAVO GASPAR" },
  { id: "094450", name: "CHAPA GARCIA, ALEJANDRO" },
  { id: "094869", name: "OLAN RODRIGUEZ, JUAN JOSE" },
  { id: "096950", name: "CIAU CAN, LEONARDO MANUEL" },
  { id: "101270", name: "REYES ROSAS, ELIUT JONATAN" },
  { id: "101358", name: "OSORIO RESENDIZ, MARIA LUISA" },
  { id: "101515", name: "CUTIZ UCAN, DANIEL SALVADOR" },
  { id: "103011", name: "RAMOS SANCHEZ, JUAN AGUSTIN" },
  { id: "103588", name: "MONTES DE OCA VARGAS, ARMANDO" },
  { id: "103978", name: "IZAZIGA RODRIGUEZ, KAREN AIDA" },
  { id: "103987", name: "CHAN SUNZA, RICHARD ENRIQUE" },
  { id: "105082", name: "CAMACHO ITURRALDE, LUIS ANTONIO" },
  { id: "105761", name: "UC SALAZAR, JOSE ANGEL" },
  { id: "106606", name: "VALADES GOMEZ, JESUS ANTONIO" },
  { id: "113299", name: "ALCOCER ABAN, FERNANDO JOSE" },
  { id: "113481", name: "TUN GRAJALES, ALFREDO MICHEL" },
  { id: "113681", name: "NOVELO PARDENILLA, WILMER ABDIEL" },
  { id: "114390", name: "ZEMPOALTECATL ACATECATL, MANUEL" },
  { id: "115239", name: "TUZ MOO, RICARDO" },
  { id: "115356", name: "DOMINGUEZ ARCE, ANDREA" },
  { id: "115931", name: "ORTIZ GONZALEZ, DIANA CECILIA" },
  { id: "117482", name: "ROSAS GARCIA, JORGE EMILIO" },
  { id: "117626", name: "AGUILAR SALAZAR, MARIA FERNANDA" },
  { id: "119683", name: "MONTORO DELGADO, CESAR" },
  { id: "119867", name: "SANCHEZ SANCHEZ, JARED BORGETTI" },
  { id: "119877", name: "CARREON TORRES, JOSE JORGE" },
  { id: "120036", name: "COHUO CEN, SARAI DE LOS ANGELES" },
  { id: "120896", name: "GOMEZ RANGEL, BRYAN URIEL" },
  { id: "000258", name: "VENTURA MARTINEZ, ARMANDO" },
  { id: "017653", name: "BALAM TORRES, JORGE ALBERTO" },
  { id: "087809", name: "ALMAGUER LOPEZ, DANIEL ALEJANDRO" },
  { id: "114740", name: "HUCHIN CEN, MELCHOR ANTONIO" },
];

// ===================== Helpers =====================
function fmtTime(ts?: number) {
  if (!ts) return "-";
  const d = new Date(ts);
  return d.toLocaleString();
}

function minutesSince(ts?: number) {
  if (!ts) return 0;
  return Math.floor((Date.now() - ts) / 60000);
}

function statusBadge(status: VehicleStatus) {
  const map: Record<VehicleStatus, "secondary" | "default" | "outline" | "destructive"> =
    {
      Disponible: "secondary",
      "En uso": "default",
      "En espera": "outline",
      Recall: "destructive",
      Mantenimiento: "secondary",
    };
  return map[status];
}

function semaforoSlaVariant(mins: number, sla: number) {
  // Verde/OK (secondary), Amarillo/riesgo (outline), Rojo/vencido (destructive)
  if (mins >= sla) return "destructive" as const;
  if (mins >= Math.floor(sla * 0.7)) return "outline" as const;
  return "secondary" as const;
}

function semaforoSlaLabel(mins: number, sla: number) {
  if (mins >= sla) return "SLA vencido";
  if (mins >= Math.floor(sla * 0.7)) return "SLA en riesgo";
  return "SLA OK";
}

function safeClipboardWrite(text: string) {
  try {
    navigator.clipboard?.writeText(text);
  } catch {
    // fallback: nada
  }
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ===================== Page =====================
export default function Page() {
  // Tick para refrescar timers
  const [tick, setTick] = useState(0);

  // Auth
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  // Firestore state
  const [vehicles, setVehicles] = useState<Vehicle[]>(INITIAL_VEHICLES);
  const [tx, setTx] = useState<Transaction[]>([]);
  const [dbError, setDbError] = useState<string | null>(null);
  const [docMissing, setDocMissing] = useState(false);

  // UI
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Checkout form
  const [checkoutUserId, setCheckoutUserId] = useState<string>("");
  const [checkoutZone, setCheckoutZone] = useState<string>("");
  const [checkoutPurpose, setCheckoutPurpose] = useState<string>("");
  const [checkoutNotes, setCheckoutNotes] = useState<string>("");

  const [isFreelance, setIsFreelance] = useState(false);
  const [freelanceName, setFreelanceName] = useState("");
  const [freelanceId, setFreelanceId] = useState("");

  // Return form
  const [returnZone, setReturnZone] = useState<string>(RETURN_DEFAULT_ZONE);
  const [returnNotes, setReturnNotes] = useState<string>("");

  // Recall
  const [recallBy, setRecallBy] = useState<string>(
    "120036 - COHUO CEN, SARAI DE LOS ANGELES"
  );

  const isAdmin = useMemo(() => {
    const em = (user?.email || "").toLowerCase();
    return !!em && ADMIN_EMAILS.has(em);
  }, [user]);

  const actorLabel = useMemo(() => user?.email || user?.uid || "unknown", [user]);

  // ===================== Auth init =====================
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
      setAuthError(null);
    });
    return () => unsub();
  }, []);

  // ===================== Firestore realtime =====================
  useEffect(() => {
    if (!user) return;

    setDbError(null);
    setDocMissing(false);

    const ref = doc(db, DISPATCH_COLLECTION, DISPATCH_DOC_ID);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setDocMissing(true);
          setVehicles(INITIAL_VEHICLES);
          setTx([]);
          return;
        }
        const data = snap.data() as any;
        setVehicles(Array.isArray(data.vehicles) ? (data.vehicles as Vehicle[]) : INITIAL_VEHICLES);
        setTx(Array.isArray(data.tx) ? (data.tx as Transaction[]) : []);
        setDocMissing(false);
      },
      (err) => {
        setDbError(err?.message || "Error leyendo Firestore");
      }
    );

    return () => unsub();
  }, [user]);

  // ===================== Timer tick =====================
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30000);
    return () => clearInterval(t);
  }, []);

  // ===================== Selected vehicle =====================
  const selectedVehicle = useMemo(
    () => vehicles.find((v) => v.id === selectedId) || null,
    [vehicles, selectedId]
  );

  // ===================== Filtering + Prioridad =====================
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const base = !s
      ? vehicles
      : vehicles.filter((v) => {
          return (
            v.id.toLowerCase().includes(s) ||
            (v.type || "").toLowerCase().includes(s) ||
            (v.status || "").toLowerCase().includes(s) ||
            (v.lastZone || "").toLowerCase().includes(s) ||
            (v.lastUserLabel || "").toLowerCase().includes(s)
          );
        });

    const priority: Record<VehicleStatus, number> = {
      Recall: 0,
      "En uso": 1,
      "En espera": 2,
      Disponible: 3,
      Mantenimiento: 4,
    };

    // Sort prioritaria: Recall vencido primero, luego Recall, luego SLA vencido, luego por status, luego ID
    return [...base].sort((a, b) => {
      const aRecallOver =
        a.status === "Recall" && !!a.recallAt && Date.now() - a.recallAt > RECALL_MINUTES * 60000;
      const bRecallOver =
        b.status === "Recall" && !!b.recallAt && Date.now() - b.recallAt > RECALL_MINUTES * 60000;

      if (aRecallOver !== bRecallOver) return aRecallOver ? -1 : 1;

      const aMins = a.checkedOutAt ? minutesSince(a.checkedOutAt) : 0;
      const bMins = b.checkedOutAt ? minutesSince(b.checkedOutAt) : 0;

      const aSlaOver = a.status !== "Disponible" && !!a.checkedOutAt && aMins >= SLA_MINUTES;
      const bSlaOver = b.status !== "Disponible" && !!b.checkedOutAt && bMins >= SLA_MINUTES;

      if (aSlaOver !== bSlaOver) return aSlaOver ? -1 : 1;

      if (priority[a.status] !== priority[b.status]) return priority[a.status] - priority[b.status];

      return a.id.localeCompare(b.id);
    });
  }, [vehicles, search, tick]);

  // ===================== Stats =====================
  const stats = useMemo(() => {
    const total = vehicles.length;
    const disponible = vehicles.filter((v) => v.status === "Disponible").length;
    const enUso = vehicles.filter((v) => v.status === "En uso").length;
    const espera = vehicles.filter((v) => v.status === "En espera").length;
    const recall = vehicles.filter((v) => v.status === "Recall").length;
    const mant = vehicles.filter((v) => v.status === "Mantenimiento").length;
    return { total, disponible, enUso, espera, recall, mant };
  }, [vehicles]);

  // ===================== Firestore write helper =====================
  async function writeState(nextVehicles: Vehicle[], nextTx: Transaction[]) {
    if (!user) return;
    setDbError(null);
    const ref = doc(db, DISPATCH_COLLECTION, DISPATCH_DOC_ID);

    try {
  await setDoc(
    ref,
    stripUndefinedDeep({
      vehicles: nextVehicles,
      tx: nextTx.slice(0, 200),
      updatedAt: serverTimestamp(),
      updatedBy: actorLabel ?? "unknown",
    }),
    { merge: true }
  );
} catch (e: any) {
  const msg = e?.message || "Error escribiendo en Firestore";
  setDbError(msg);
  // Si eres viewer, esto puede ser "Missing or insufficient permissions"
}

  }

  function makeTx(type: TxType, vehicleId: string, summary: string): Transaction {
    return { ts: Date.now(), type, vehicleId, summary, actor: actorLabel };
  }

  async function applyTx(type: TxType, vehicleId: string, summary: string, nextVehicles: Vehicle[]) {
    const entry = makeTx(type, vehicleId, summary);
    const nextTx = [entry, ...tx].slice(0, 200);
    setVehicles(nextVehicles);
    setTx(nextTx);
    await writeState(nextVehicles, nextTx);
  }

  // ===================== Forms reset =====================
  function resetCheckout() {
    setCheckoutUserId("");
    setCheckoutZone("");
    setCheckoutPurpose("");
    setCheckoutNotes("");
    setIsFreelance(false);
    setFreelanceName("");
    setFreelanceId("");
  }

  function resetReturn() {
    setReturnZone(RETURN_DEFAULT_ZONE);
    setReturnNotes("");
  }

  function getUserLabel() {
    if (isFreelance) return `FREELANCE - ${freelanceName.trim()} (ID: ${freelanceId.trim()})`;
    const u = USERS.find((x) => x.id === checkoutUserId);
    return u ? `${u.id} - ${u.name}` : checkoutUserId;
  }

  // ===================== Actions (admin) =====================
 async function initDocIfMissing() {
  if (!user) return;
  const ref = doc(db, DISPATCH_COLLECTION, DISPATCH_DOC_ID);
  try {
    await setDoc(
      ref,
      stripUndefinedDeep({
        vehicles: INITIAL_VEHICLES,
        tx: [],
        createdAt: serverTimestamp(),
        createdBy: actorLabel ?? "unknown",
      })
    );
    setDocMissing(false);
  } catch (e: any) {
    setDbError(e?.message || "Error inicializando documento en Firestore");
  }
}

  async function checkout() {
    if (!selectedVehicle) return;
    if (!checkoutZone || !checkoutPurpose) return;

    if (isFreelance) {
      if (!freelanceName.trim() || !freelanceId.trim()) return;
    } else {
      if (!checkoutUserId) return;
    }

    const label = getUserLabel();

    // IMPORTANT: typed map to avoid TS "status: string" widening
    const nextVehicles: Vehicle[] = vehicles.map((v): Vehicle => {
      if (v.id !== selectedVehicle.id) return v;
      return {
        ...v,
        status: "En uso",
        lastZone: checkoutZone,
        lastUserLabel: label,
        lastPurpose: checkoutPurpose,
        lastNotes: checkoutNotes ? checkoutNotes : undefined,
        checkedOutAt: Date.now(),
        recallAt: undefined,
        recallBy: undefined,
      };
    });

    await applyTx(
      "CHECKOUT",
      selectedVehicle.id,
      `Entrega en ${KEY_POINT} → ${label} | Destino: ${checkoutZone} | Motivo: ${checkoutPurpose}`,
      nextVehicles
    );

    resetCheckout();
  }

  async function checkin() {
    if (!selectedVehicle) return;
    if (!returnZone) return;

    const nextVehicles: Vehicle[] = vehicles.map((v): Vehicle => {
      if (v.id !== selectedVehicle.id) return v;
      return {
        ...v,
        status: "Disponible",
        lastZone: returnZone,
        lastPurpose: undefined,
        lastUserLabel: undefined,
        checkedOutAt: undefined,
        recallAt: undefined,
        recallBy: undefined,
        lastNotes: returnNotes ? returnNotes : undefined,
      };
    });

    await applyTx(
      "CHECKIN",
      selectedVehicle.id,
      `Retorno a ${KEY_POINT} | Estacionado en: ${returnZone}`,
      nextVehicles
    );

    resetReturn();
  }

  async function markWaiting() {
    if (!selectedVehicle) return;

    const nextVehicles: Vehicle[] = vehicles.map((v): Vehicle => {
      if (v.id !== selectedVehicle.id) return v;
      return { ...v, status: "En espera" };
    });

    await applyTx("STATUS", selectedVehicle.id, `Unidad marcada como EN ESPERA (tiempo muerto).`, nextVehicles);
  }

  async function startRecall() {
    if (!selectedVehicle) return;

    const nextVehicles: Vehicle[] = vehicles.map((v): Vehicle => {
      if (v.id !== selectedVehicle.id) return v;
      return {
        ...v,
        status: "Recall",
        recallAt: Date.now(),
        recallBy,
      };
    });

    await applyTx(
      "RECALL",
      selectedVehicle.id,
      `RECALL iniciado por ${recallBy}. Objetivo: regreso a ${KEY_POINT} en ${RECALL_MINUTES} min.`,
      nextVehicles
    );
  }

  function copyRecallMessage(v: Vehicle) {
    const deadline = v.recallAt
      ? new Date(v.recallAt + RECALL_MINUTES * 60000).toLocaleTimeString()
      : "-";
    const msg =
      `RECALL Flotilla EV | Unidad ${v.id} (${v.type})\n` +
      `Última zona: ${v.lastZone || "-"}\n` +
      `Responsable: ${v.lastUserLabel || "-"}\n` +
      `Favor regresar a ${KEY_POINT} antes de ${deadline}.\n` +
      `Gracias.`;
    safeClipboardWrite(msg);
  }

  async function escalateRecall(v: Vehicle) {
    const msg =
      `ESCALATION Recall vencido | Unidad ${v.id} (${v.type})\n` +
      `Última zona: ${v.lastZone || "-"}\n` +
      `Responsable: ${v.lastUserLabel || "-"}\n` +
      `Apoyo para recuperación y reasignación inmediata.\n` +
      `- Dispatcher: ${recallBy}`;
    safeClipboardWrite(msg);

    // Log tx (si eres viewer, rules lo van a bloquear; por UI lo escondemos en viewers)
    const entry = makeTx("ESCALATION", v.id, `Escalamiento generado (mensaje copiado).`);
    const nextTx = [entry, ...tx].slice(0, 200);
    setTx(nextTx);
    await writeState(vehicles, nextTx);
  }

  function copyWhatsAppSummary() {
    const active = vehicles
      .filter((v) => v.status !== "Disponible")
      .sort((a, b) => a.id.localeCompare(b.id));

    const lines = active.map((v) => {
      const mins = v.checkedOutAt ? minutesSince(v.checkedOutAt) : 0;
      const sla = v.checkedOutAt ? (mins >= SLA_MINUTES ? "SLA!" : "") : "";
      const rOver =
        v.status === "Recall" && v.recallAt && Date.now() - v.recallAt > RECALL_MINUTES * 60000
          ? "RECALL VENCIDO!"
          : "";
      const flags = [sla, rOver].filter(Boolean).join(" ");
      return `• ${v.id} (${v.type}) — ${v.status} ${flags}\n  Zona: ${v.lastZone || "-"}\n  Resp: ${
        v.lastUserLabel || "-"
      }\n  Tiempo: ${v.checkedOutAt ? `${mins} min` : "-"}`;
    });

    const msg =
      `Control Flotilla EV — Zona Moon\n` +
      `Punto llaves: ${KEY_POINT}\n` +
      `Disponibles: ${stats.disponible}/${stats.total} | En uso: ${stats.enUso} | Espera: ${stats.espera} | Recall: ${
        stats.recall
      }\n\n` +
      (lines.length ? lines.join("\n\n") : "No hay unidades en uso/espera/recall.");

    safeClipboardWrite(msg);
  }

  function exportSnapshotCsv() {
    const headers = [
      "timestamp",
      "vehicle_id",
      "vehicle_type",
      "status",
      "last_zone",
      "responsable",
      "purpose",
      "minutes_since_checkout",
      "checked_out_at",
      "recall_at",
      "recall_by",
      "notes",
    ];

    const rows = vehicles.map((v) => {
      const mins = v.checkedOutAt ? minutesSince(v.checkedOutAt) : 0;
      const row = [
        new Date().toISOString(),
        v.id,
        v.type,
        v.status,
        v.lastZone || "",
        v.lastUserLabel || "",
        v.lastPurpose || "",
        v.checkedOutAt ? String(mins) : "",
        v.checkedOutAt ? new Date(v.checkedOutAt).toISOString() : "",
        v.recallAt ? new Date(v.recallAt).toISOString() : "",
        v.recallBy || "",
        v.lastNotes || "",
      ];
      // CSV escaping simple
      return row.map((x) => `"${String(x).replaceAll('"', '""')}"`).join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");
    const fname = `flotilla_snapshot_${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.csv`;
    downloadTextFile(fname, csv);
  }

  async function resetShift() {
    if (!confirm("¿Seguro? Esto reinicia el turno: limpia bitácora y deja unidades como DISPONIBLE.")) return;

    const nextVehicles: Vehicle[] = vehicles.map((v): Vehicle => ({
      ...v,
      status: "Disponible",
      lastZone: v.lastZone || RETURN_DEFAULT_ZONE,
      lastUserLabel: undefined,
      lastPurpose: undefined,
      lastNotes: undefined,
      checkedOutAt: undefined,
      recallAt: undefined,
      recallBy: undefined,
    }));

    const nextTx: Transaction[] = [
      makeTx("SYSTEM", "ALL", "Reset de turno ejecutado. Bitácora reiniciada y unidades liberadas."),
    ];

    setVehicles(nextVehicles);
    setTx(nextTx);
    await writeState(nextVehicles, nextTx);
  }

  // ===================== Auth actions =====================
  async function doLogin() {
    setAuthError(null);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), pass);

      if (!cred.user.emailVerified) {
        await signOut(auth);
        setAuthError("Tu correo aún no está verificado. Revisa tu email y vuelve a intentar.");
        return;
      }
    } catch (e: any) {
      setAuthError(e?.message || "Error de login");
    }
  }

  async function doSignUp() {
    setAuthError(null);

    const e = email.trim().toLowerCase();
    if (!e.endsWith("@quantumeventstechnology.com")) {
      setAuthError("Solo se permite registro con correo @quantumeventstechnology.com");
      return;
    }

  try {
    const cred = await createUserWithEmailAndPassword(auth, e, pass);
    await sendEmailVerification(cred.user);
    await signOut(auth);
    setAuthError("Cuenta creada. Revisa tu correo para verificar y luego inicia sesión.");
  } catch (e: any) {
    setAuthError(e?.message || "Error al crear cuenta");
  }
}

  async function doLogout() {
    await signOut(auth);
  }

  // ===================== UI: Login =====================
  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-sm text-muted-foreground">Cargando autenticación…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-md p-6 pt-10">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Control Flotilla EV — Login
              </CardTitle>
              <div className="text-sm text-muted-foreground">
                Acceso con cuenta Firebase (Email/Password). <br />
                <span className="font-medium">Admins:</span> Sarai / Armando (escritura). <span className="font-medium">Viewers:</span> solo lectura.
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@empresa.com" />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input value={pass} onChange={(e) => setPass(e.target.value)} type="password" placeholder="••••••••" />
              </div>

              {authError ? (
                <div className="text-sm text-destructive flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5" />
                  <div>{authError}</div>
                </div>
              ) : null}

              <Button className="w-full" onClick={doLogin} disabled={!email.trim() || !pass}>
                Ingresar
              </Button>
              
              <Button
                className="w-full"
                variant="outline"
                onClick={doSignUp}
                disabled={!email.trim() || !pass}
              >
                Crear cuenta
              </Button>

            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ===================== Main UI =====================
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl p-4 md:p-8 space-y-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1">
            <div className="text-2xl font-semibold tracking-tight">Control Flotilla EV — Zona Moon</div>
            <div className="text-sm text-muted-foreground">
              Punto llaves: <span className="font-medium">{KEY_POINT}</span> · SLA estándar:{" "}
              <span className="font-medium">{SLA_MINUTES} min</span> · Recall:{" "}
              <span className="font-medium">{RECALL_MINUTES} min</span>
            </div>
            <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-2">
              <span className="font-medium">{user.email}</span>
              {isAdmin ? <Badge variant="default">Admin</Badge> : <Badge variant="secondary">Solo lectura</Badge>}
              <span className="text-muted-foreground">· Dispatcher: </span>
              <span className="font-medium">120036 - COHUO CEN, SARAI DE LOS ANGELES</span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative w-full md:w-80">
              <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por unidad, usuario, zona o estado…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <Button variant="outline" onClick={copyWhatsAppSummary}>
              <Copy className="h-4 w-4 mr-2" />
              Copiar resumen WhatsApp
            </Button>

            {isAdmin ? (
              <>
                <Button variant="outline" onClick={exportSnapshotCsv}>
                  <Download className="h-4 w-4 mr-2" />
                  Exportar CSV
                </Button>
                <Button variant="outline" onClick={resetShift}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset turno
                </Button>
              </>
            ) : null}

            <Button variant="ghost" onClick={doLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Salir
            </Button>
          </div>
        </header>

        {dbError ? (
          <Card className="border-destructive">
            <CardContent className="p-4 text-sm flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 text-destructive" />
              <div className="space-y-1">
                <div className="font-medium text-destructive">Error Firebase / Firestore</div>
                <div className="text-muted-foreground">{dbError}</div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {docMissing ? (
          <Card className="border">
            <CardContent className="p-4 text-sm flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5" />
              <div className="space-y-2">
                <div className="font-medium">No existe el documento de operación en Firestore.</div>
                <div className="text-muted-foreground">
                  Un admin debe inicializar el documento <span className="font-mono">{DISPATCH_COLLECTION}/{DISPATCH_DOC_ID}</span>.
                </div>
                {isAdmin ? (
                  <Button onClick={initDocIfMissing}>Inicializar ahora</Button>
                ) : (
                  <div className="text-muted-foreground">Pide a Sarai (admin) inicializar.</div>
                )}
              </div>
            </CardContent>
          </Card>
        ) : null}

        <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-sm text-muted-foreground">Unidades</CardTitle>
              <div className="text-2xl font-semibold">{stats.total}</div>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-sm text-muted-foreground">Disponibles</CardTitle>
              <div className="text-2xl font-semibold">{stats.disponible}</div>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-sm text-muted-foreground">En uso</CardTitle>
              <div className="text-2xl font-semibold">{stats.enUso}</div>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-sm text-muted-foreground">En espera</CardTitle>
              <div className="text-2xl font-semibold">{stats.espera}</div>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-sm text-muted-foreground">Recall</CardTitle>
              <div className="text-2xl font-semibold">{stats.recall}</div>
            </CardHeader>
          </Card>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Unidades (vista prioritaria)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {filtered.map((v) => {
                const mins = v.checkedOutAt ? minutesSince(v.checkedOutAt) : 0;
                const slaApplicable = v.status !== "Disponible" && !!v.checkedOutAt;
                const slaLabel = slaApplicable ? semaforoSlaLabel(mins, SLA_MINUTES) : null;
                const slaVariant = slaApplicable ? semaforoSlaVariant(mins, SLA_MINUTES) : "secondary";

                const recallOverdue =
                  v.status === "Recall" && !!v.recallAt && Date.now() - v.recallAt > RECALL_MINUTES * 60000;

                const recallDeadline =
                  v.recallAt ? new Date(v.recallAt + RECALL_MINUTES * 60000).toLocaleTimeString() : null;

                return (
                  <div key={v.id} className="rounded-xl border p-3 flex flex-col md:flex-row md:items-center gap-3">
                    <div className="flex items-center gap-3 min-w-[260px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="text-lg font-semibold">{v.id}</div>
                        <Badge variant={statusBadge(v.status)}>{v.status}</Badge>

                        {slaApplicable ? <Badge variant={slaVariant}>{slaLabel}</Badge> : null}
                        {recallOverdue ? <Badge variant="destructive">Recall vencido</Badge> : null}
                      </div>
                      <div className="text-sm text-muted-foreground">{v.type}</div>
                    </div>

                    <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
                        <div>
                          <div className="text-muted-foreground">Zona</div>
                          <div className="font-medium">{v.lastZone || "-"}</div>
                        </div>
                      </div>

                      <div className="flex items-start gap-2">
                        <User className="h-4 w-4 mt-0.5 text-muted-foreground" />
                        <div>
                          <div className="text-muted-foreground">Responsable</div>
                          <div className="font-medium">{v.lastUserLabel || "-"}</div>
                        </div>
                      </div>

                      <div className="flex items-start gap-2">
                        <Clock className="h-4 w-4 mt-0.5 text-muted-foreground" />
                        <div>
                          <div className="text-muted-foreground">Tiempo</div>
                          <div className="font-medium">
                            {v.checkedOutAt ? `${mins} min (desde ${new Date(v.checkedOutAt).toLocaleTimeString()})` : "-"}
                            {v.status === "Recall" && recallDeadline ? (
                              <div className="text-xs text-muted-foreground">Límite recall: {recallDeadline}</div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" onClick={() => setSelectedId(v.id)}>
                            Gestionar
                          </Button>
                        </DialogTrigger>

                        <DialogContent className="max-w-3xl">
                          <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                              <KeyRound className="h-5 w-5" />
                              Unidad {v.id} · {v.type} · <span className="text-muted-foreground">{KEY_POINT}</span>
                              {!isAdmin ? (
                                <Badge variant="secondary" className="ml-2">
                                  Solo lectura
                                </Badge>
                              ) : null}
                            </DialogTitle>
                          </DialogHeader>

                          <Tabs defaultValue="checkout" className="w-full">
                            <TabsList className="grid w-full grid-cols-4">
                              <TabsTrigger value="checkout">Entrega</TabsTrigger>
                              <TabsTrigger value="return">Retorno</TabsTrigger>
                              <TabsTrigger value="recall">Recall</TabsTrigger>
                              <TabsTrigger value="status">Estado</TabsTrigger>
                            </TabsList>

                            <TabsContent value="checkout" className="space-y-4 pt-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label>Tipo de usuario</Label>
                                  <Select
                                    value={isFreelance ? "FREELANCE" : "COLAB"}
                                    onValueChange={(val) => setIsFreelance(val === "FREELANCE")}
                                    disabled={!isAdmin}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Selecciona..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="COLAB">Colaborador (ID)</SelectItem>
                                      <SelectItem value="FREELANCE">Freelance (manual)</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>

                                {!isFreelance ? (
                                  <div className="space-y-2">
                                    <Label>ID Colaborador</Label>
                                    <Select value={checkoutUserId} onValueChange={setCheckoutUserId} disabled={!isAdmin}>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Selecciona ID..." />
                                      </SelectTrigger>
                                      <SelectContent className="max-h-72">
                                        {USERS.map((u) => (
                                          <SelectItem key={u.id} value={u.id}>
                                            {u.id} — {u.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    <Label>Freelance: Nombre</Label>
                                    <Input
                                      value={freelanceName}
                                      onChange={(e) => setFreelanceName(e.target.value)}
                                      disabled={!isAdmin}
                                    />
                                    <Label className="mt-2 block">Freelance: ID / INE / credencial</Label>
                                    <Input
                                      value={freelanceId}
                                      onChange={(e) => setFreelanceId(e.target.value)}
                                      disabled={!isAdmin}
                                    />
                                  </div>
                                )}

                                <div className="space-y-2">
                                  <Label>Zona destino</Label>
                                  <Select value={checkoutZone} onValueChange={setCheckoutZone} disabled={!isAdmin}>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Selecciona zona..." />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-72">
                                      {ZONES.map((z) => (
                                        <SelectItem key={z} value={z}>
                                          {z}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="space-y-2">
                                  <Label>Motivo / servicio</Label>
                                  <Input
                                    value={checkoutPurpose}
                                    onChange={(e) => setCheckoutPurpose(e.target.value)}
                                    placeholder="Ej. Traslado equipo, apoyo montaje, urgencia..."
                                    disabled={!isAdmin}
                                  />
                                </div>

                                <div className="md:col-span-2 space-y-2">
                                  <Label>Notas (opcional)</Label>
                                  <Textarea
                                    value={checkoutNotes}
                                    onChange={(e) => setCheckoutNotes(e.target.value)}
                                    placeholder="Ej. batería baja, unidades en espera, detalles..."
                                    disabled={!isAdmin}
                                  />
                                </div>
                              </div>

                              <Separator />

                              <div className="flex items-center justify-between flex-wrap gap-2">
                                <div className="text-sm text-muted-foreground">
                                  Reglas: no hay entrega sin ID (o Freelance + Nombre + ID) + Zona + Motivo.
                                </div>

                                {isAdmin ? (
                                  <Button
                                    onClick={checkout}
                                    disabled={
                                      !checkoutZone ||
                                      !checkoutPurpose ||
                                      (!isFreelance && !checkoutUserId) ||
                                      (isFreelance && (!freelanceName.trim() || !freelanceId.trim()))
                                    }
                                  >
                                    Confirmar entrega
                                  </Button>
                                ) : (
                                  <div className="text-sm text-muted-foreground">Solo lectura.</div>
                                )}
                              </div>
                            </TabsContent>

                            <TabsContent value="return" className="space-y-4 pt-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label>Zona donde se estaciona</Label>
                                  <Select value={returnZone} onValueChange={setReturnZone} disabled={!isAdmin}>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Selecciona zona..." />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-72">
                                      {ZONES.map((z) => (
                                        <SelectItem key={z} value={z}>
                                          {z}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <div className="text-xs text-muted-foreground">
                                    Default: <span className="font-medium">{RETURN_DEFAULT_ZONE}</span>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <Label>Notas (opcional)</Label>
                                  <Textarea
                                    value={returnNotes}
                                    onChange={(e) => setReturnNotes(e.target.value)}
                                    placeholder="Ej. Se deja cargando, daño, batería, incidente..."
                                    disabled={!isAdmin}
                                  />
                                </div>
                              </div>

                              <div className="flex items-center justify-end gap-2">
                                <Button variant="outline" onClick={resetReturn} disabled={!isAdmin}>
                                  Limpiar
                                </Button>
                                {isAdmin ? (
                                  <Button onClick={checkin} disabled={!returnZone}>
                                    Confirmar retorno
                                  </Button>
                                ) : null}
                              </div>
                            </TabsContent>

                            <TabsContent value="recall" className="space-y-4 pt-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label>Iniciado por</Label>
                                  <Input value={recallBy} onChange={(e) => setRecallBy(e.target.value)} disabled={!isAdmin} />
                                  <div className="text-xs text-muted-foreground">
                                    WhatsApp manual: la app genera mensajes para copiar.
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <Label>Tiempo límite</Label>
                                  <Input value={`${RECALL_MINUTES} min`} readOnly />
                                  <div className="text-xs text-muted-foreground">
                                    Política: 15 min para recall. Escalamiento si vence.
                                  </div>
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                {isAdmin ? (
                                  <Button variant="destructive" onClick={startRecall}>
                                    <Siren className="h-4 w-4 mr-2" />
                                    Iniciar Recall
                                  </Button>
                                ) : null}

                                <Button variant="outline" onClick={() => copyRecallMessage(v)}>
                                  Copiar mensaje Recall
                                </Button>

                                {isAdmin && v.status === "Recall" && v.recallAt && Date.now() - v.recallAt > RECALL_MINUTES * 60000 ? (
                                  <Button variant="outline" onClick={() => escalateRecall(v)}>
                                    <AlertTriangle className="h-4 w-4 mr-2" />
                                    Escalar (Recall vencido)
                                  </Button>
                                ) : null}
                              </div>

                              <div className="text-sm text-muted-foreground">
                                Consejo operativo: inicia recall cuando detectes tiempo muerto o urgencia, y reasigna apenas regrese a {KEY_POINT}.
                              </div>
                            </TabsContent>

                            <TabsContent value="status" className="space-y-4 pt-4">
                              <div className="flex flex-wrap gap-2">
                                {isAdmin ? (
                                  <Button variant="outline" onClick={markWaiting}>
                                    <RotateCcw className="h-4 w-4 mr-2" />
                                    Marcar En espera (tiempo muerto)
                                  </Button>
                                ) : null}
                              </div>

                              <div className="text-sm text-muted-foreground">
                                “En espera” = unidad tomada pero sin movimiento/uso real. Útil para recuperar rápido.
                              </div>

                              <Separator />

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                <div>
                                  <div className="text-muted-foreground">Última entrega</div>
                                  <div className="font-medium">{fmtTime(v.checkedOutAt)}</div>
                                </div>
                                <div>
                                  <div className="text-muted-foreground">Notas</div>
                                  <div className="font-medium">{v.lastNotes || "-"}</div>
                                </div>
                              </div>
                            </TabsContent>
                          </Tabs>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Bitácora (últimos movimientos)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm text-muted-foreground">
                Backend (Firestore realtime). Viewers solo lectura por reglas.
              </div>
              <Separator />
              <div className="space-y-3 max-h-[560px] overflow-auto pr-2">
                {tx.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Aún no hay movimientos registrados.</div>
                ) : (
                  tx.map((t) => (
                    <div key={`${t.ts}-${t.vehicleId}-${t.type}`} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium">
                          {t.type} · {t.vehicleId}
                        </div>
                        <div className="text-xs text-muted-foreground">{fmtTime(t.ts)}</div>
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">{t.summary}</div>
                      {t.actor ? <div className="text-xs text-muted-foreground mt-1">Actor: {t.actor}</div> : null}
                    </div>
                  ))
                )}
              </div>

              <Separator />
              <div className="text-xs text-muted-foreground">
                Zona operativa: Moon (Sunrise, Nizuc, The Grand). Punto único de llaves: {KEY_POINT}.
              </div>
            </CardContent>
          </Card>
        </section>

        <footer className="text-xs text-muted-foreground">
          Tip: en Vercel, asegúrate de tener cargadas tus variables <span className="font-mono">NEXT_PUBLIC_FIREBASE_*</span>.
        </footer>
      </div>
    </div>
  );
}
