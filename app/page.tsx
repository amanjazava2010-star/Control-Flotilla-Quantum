"use client";

import { useEffect, useMemo, useState } from "react";
import { auth, db } from "@/lib/firebase";

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User as FirebaseUser,
} from "firebase/auth";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";

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
  AlertTriangle,
  ClipboardCopy,
  Download,
} from "lucide-react";

// ====== Config ======
const KEY_POINT = "Bodega / Almacén Central (Zona Moon)";
const SLA_MINUTES = 90; // 1.5 hrs
const RECALL_MINUTES = 15;

// Retorno default (operación real)
const RETURN_DEFAULT_ZONE = "Bodega principal - Expo Center";

// 🔐 Admins (correo exacto Firebase Auth)
const ADMIN_EMAILS = [
  "amanjarrez@quantumeventstechnology.com",
  "scohuo@quantumeventstechnology.com",
].map((e) => e.toLowerCase());

// Firestore doc “central”
const FLEET_DOC = doc(db, "dispatch", "zona_moon");

// ====== Data model ======
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
  lastUserLabel?: string;
  lastPurpose?: string;
  lastNotes?: string;
  checkedOutAt?: number; // epoch ms
  recallAt?: number; // epoch ms
  recallBy?: string;
};

type TxType =
  | "CHECKOUT"
  | "CHECKIN"
  | "RECALL"
  | "ESCALATION"
  | "STATUS"
  | "RESET";

type Transaction = {
  ts: number;
  type: TxType;
  vehicleId: string;
  summary: string;
};

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
  RETURN_DEFAULT_ZONE,
] as const;

type UserEntry = { id: string; name: string };
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
  const map: Record<VehicleStatus, string> = {
    Disponible: "secondary",
    "En uso": "default",
    "En espera": "outline",
    Recall: "destructive",
    Mantenimiento: "secondary",
  };
  return map[status] as any;
}

function isRecallOverdue(v: Vehicle) {
  if (v.status !== "Recall" || !v.recallAt) return false;
  return Date.now() > v.recallAt + RECALL_MINUTES * 60000;
}

function downloadText(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(val: any) {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes("\n") || s.includes('"')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export default function Page() {
  const [tick, setTick] = useState(0);

  // Auth
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [authErr, setAuthErr] = useState<string | null>(null);

  const emailLower = (user?.email ?? "").toLowerCase();
  const isAdmin = !!user?.email && ADMIN_EMAILS.includes(emailLower);

  // App state
  const [vehicles, setVehicles] = useState<Vehicle[]>(INITIAL_VEHICLES);
  const [tx, setTx] = useState<Transaction[]>([]);
  const [search, setSearch] = useState("");

  // Modal state
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

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // Realtime sync (Firestore)
  useEffect(() => {
    if (!user) return;

    const unsub = onSnapshot(
      FLEET_DOC,
      async (snap) => {
        if (!snap.exists()) {
          if (isAdmin) {
            await setDoc(
              FLEET_DOC,
              {
                vehicles: INITIAL_VEHICLES,
                tx: [],
                updatedAt: serverTimestamp(),
                updatedBy: user.email ?? "admin",
              },
              { merge: true }
            );
          }
          return;
        }

        const data = snap.data() as any;
        setVehicles(
          Array.isArray(data?.vehicles) ? (data.vehicles as Vehicle[]) : INITIAL_VEHICLES
        );
        setTx(Array.isArray(data?.tx) ? (data.tx as Transaction[]) : []);
      },
      (err) => console.error("Firestore snapshot error:", err)
    );

    return () => unsub();
  }, [user, isAdmin]);

  // Timer para refrescar “tiempos”
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const selectedVehicle = useMemo(
    () => vehicles.find((v) => v.id === selectedId) || null,
    [vehicles, selectedId]
  );

  const stats = useMemo(() => {
    const total = vehicles.length;
    const disponible = vehicles.filter((v) => v.status === "Disponible").length;
    const enUso = vehicles.filter((v) => v.status === "En uso").length;
    const espera = vehicles.filter((v) => v.status === "En espera").length;
    const recall = vehicles.filter((v) => v.status === "Recall").length;
    const mant = vehicles.filter((v) => v.status === "Mantenimiento").length;
    const sla = vehicles.filter(
      (v) => v.status !== "Disponible" && v.checkedOutAt && minutesSince(v.checkedOutAt) >= SLA_MINUTES
    ).length;
    const recallOverdue = vehicles.filter((v) => isRecallOverdue(v)).length;
    return { total, disponible, enUso, espera, recall, mant, sla, recallOverdue };
  }, [vehicles, tick]);

  const sortedVehicles = useMemo(() => {
    // Prioridad: Recall vencido > Recall > SLA > En espera > En uso > Disponible
    const score = (v: Vehicle) => {
      const mins = v.checkedOutAt ? minutesSince(v.checkedOutAt) : 0;
      const sla = v.status !== "Disponible" && v.checkedOutAt && mins >= SLA_MINUTES;

      if (isRecallOverdue(v)) return 0;
      if (v.status === "Recall") return 1;
      if (sla) return 2;
      if (v.status === "En espera") return 3;
      if (v.status === "En uso") return 4;
      if (v.status === "Disponible") return 5;
      return 6;
    };

    return [...vehicles].sort((a, b) => score(a) - score(b));
  }, [vehicles, tick]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return sortedVehicles;
    return sortedVehicles.filter((v) => {
      return (
        v.id.toLowerCase().includes(s) ||
        (v.type || "").toLowerCase().includes(s) ||
        (v.status || "").toLowerCase().includes(s) ||
        (v.lastZone || "").toLowerCase().includes(s) ||
        (v.lastUserLabel || "").toLowerCase().includes(s)
      );
    });
  }, [sortedVehicles, search]);

  async function saveState(nextVehicles: Vehicle[], nextTx: Transaction[]) {
    setVehicles(nextVehicles);
    setTx(nextTx);

    if (!user) return;
    if (!isAdmin) return;

    await setDoc(
      FLEET_DOC,
      {
        vehicles: nextVehicles,
        tx: nextTx,
        updatedAt: serverTimestamp(),
        updatedBy: user.email ?? "admin",
      },
      { merge: true }
    );
  }

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

  function pushTx(type: TxType, vehicleId: string, summary: string, nextVehicles?: Vehicle[]) {
    const v = nextVehicles ?? vehicles;
    const nextTx: Transaction[] = [{ ts: Date.now(), type, vehicleId, summary }, ...tx].slice(0, 250);
    saveState(v, nextTx).catch(console.error);
  }

  function checkout() {
    if (!selectedVehicle) return;
    if (!checkoutZone || !checkoutPurpose) return;

    if (isFreelance) {
      if (!freelanceName.trim() || !freelanceId.trim()) return;
    } else {
      if (!checkoutUserId) return;
    }

    const label = getUserLabel();

    const nextVehicles = vehicles.map((v) =>
      v.id !== selectedVehicle.id
        ? v
        : {
            ...v,
            status: "En uso",
            lastZone: checkoutZone,
            lastUserLabel: label,
            lastPurpose: checkoutPurpose,
            lastNotes: checkoutNotes ? checkoutNotes : undefined,
            checkedOutAt: Date.now(),
            recallAt: undefined,
            recallBy: undefined,
          }
    );

    pushTx(
      "CHECKOUT",
      selectedVehicle.id,
      `Entrega en ${KEY_POINT} → ${label} | Destino: ${checkoutZone} | Motivo: ${checkoutPurpose}`,
      nextVehicles
    );

    resetCheckout();
  }

  function checkin() {
    if (!selectedVehicle) return;
    if (!returnZone) return;

    const nextVehicles = vehicles.map((v) =>
      v.id !== selectedVehicle.id
        ? v
        : {
            ...v,
            status: "Disponible",
            lastZone: returnZone,
            lastPurpose: undefined,
            lastUserLabel: undefined,
            checkedOutAt: undefined,
            recallAt: undefined,
            recallBy: undefined,
            lastNotes: returnNotes ? returnNotes : undefined,
          }
    );

    pushTx("CHECKIN", selectedVehicle.id, `Retorno a ${KEY_POINT} | Estacionado en: ${returnZone}`, nextVehicles);
    resetReturn();
  }

  function markWaiting() {
    if (!selectedVehicle) return;

    const nextVehicles = vehicles.map((v) =>
      v.id !== selectedVehicle.id
        ? v
        : {
            ...v,
            status: "En espera",
          }
    );

    pushTx("STATUS", selectedVehicle.id, `Unidad marcada como EN ESPERA (tiempo muerto).`, nextVehicles);
  }

  function startRecall() {
    if (!selectedVehicle) return;

    const nextVehicles = vehicles.map((v) =>
      v.id !== selectedVehicle.id
        ? v
        : {
            ...v,
            status: "Recall",
            recallAt: Date.now(),
            recallBy,
          }
    );

    pushTx(
      "RECALL",
      selectedVehicle.id,
      `RECALL iniciado por ${recallBy}. Objetivo: regreso a ${KEY_POINT} en ${RECALL_MINUTES} min.`,
      nextVehicles
    );
  }

  function copyRecallMessage(v: Vehicle) {
    const deadline = v.recallAt ? new Date(v.recallAt + RECALL_MINUTES * 60000).toLocaleTimeString() : "-";
    const msg =
      `RECALL Flotilla EV | Unidad ${v.id} (${v.type})\n` +
      `Última zona: ${v.lastZone || "-"}\n` +
      `Responsable: ${v.lastUserLabel || "-"}\n` +
      `Favor regresar a ${KEY_POINT} antes de ${deadline}.\n` +
      `Gracias.`;
    navigator.clipboard?.writeText(msg);
  }

  function copyEscalationMessage(v: Vehicle) {
    const msg =
      `ESCALATION Recall vencido | Unidad ${v.id} (${v.type})\n` +
      `Última zona: ${v.lastZone || "-"}\n` +
      `Responsable: ${v.lastUserLabel || "-"}\n` +
      `Apoyo para recuperación y reasignación inmediata.\n` +
      `- Dispatcher: ${recallBy}`;
    navigator.clipboard?.writeText(msg);
    pushTx("ESCALATION", v.id, "Escalamiento generado (mensaje copiado).");
  }

  function copyWhatsAppSummary() {
    const lines: string[] = [];
    lines.push(`RESUMEN Flotilla EV | Zona Moon`);
    lines.push(`Punto llaves: ${KEY_POINT}`);
    lines.push(
      `Disponibles: ${stats.disponible}/${stats.total} | En uso: ${stats.enUso} | En espera: ${stats.espera} | Recall: ${stats.recall}`
    );
    if (stats.sla > 0) lines.push(`⚠️ SLA: ${stats.sla} unidad(es) excedidas (${SLA_MINUTES} min)`);
    if (stats.recallOverdue > 0) lines.push(`🚨 Recall vencido: ${stats.recallOverdue} unidad(es)`);

    lines.push("");
    vehicles.forEach((v) => {
      const mins = v.checkedOutAt ? minutesSince(v.checkedOutAt) : 0;
      const sla = v.status !== "Disponible" && v.checkedOutAt && mins >= SLA_MINUTES;
      const overdue = isRecallOverdue(v);
      const flags = [overdue ? "RECALL VENCIDO" : null, v.status === "Recall" ? "RECALL" : null, sla ? "SLA" : null]
        .filter(Boolean)
        .join(" / ");

      lines.push(
        `- ${v.id} (${v.type}) | ${v.status}${flags ? ` [${flags}]` : ""} | Zona: ${v.lastZone || "-"} | Resp: ${v.lastUserLabel || "-"}`
      );
    });

    navigator.clipboard?.writeText(lines.join("\n"));
  }

  function exportSnapshotCSV() {
    const ts = new Date();
    const stamp = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, "0")}${String(ts.getDate()).padStart(2, "0")}_${String(ts.getHours()).padStart(2, "0")}${String(ts.getMinutes()).padStart(2, "0")}`;

    const vehiclesHeader = [
      "vehicleId",
      "type",
      "status",
      "lastZone",
      "lastUserLabel",
      "lastPurpose",
      "checkedOutAt",
      "recallAt",
      "recallBy",
      "lastNotes",
    ].join(",");

    const vehiclesRows = vehicles.map((v) =>
      [
        v.id,
        v.type,
        v.status,
        v.lastZone ?? "",
        v.lastUserLabel ?? "",
        v.lastPurpose ?? "",
        v.checkedOutAt ? new Date(v.checkedOutAt).toISOString() : "",
        v.recallAt ? new Date(v.recallAt).toISOString() : "",
        v.recallBy ?? "",
        v.lastNotes ?? "",
      ]
        .map(csvEscape)
        .join(",")
    );

    const txHeader = ["ts", "type", "vehicleId", "summary"].join(",");
    const txRows = tx.map((t) => [new Date(t.ts).toISOString(), t.type, t.vehicleId, t.summary].map(csvEscape).join(","));

    const content =
      `# SNAPSHOT Flotilla EV - Zona Moon\n` +
      `# generatedAt,${new Date().toISOString()}\n\n` +
      `# VEHICLES\n` +
      vehiclesHeader +
      "\n" +
      vehiclesRows.join("\n") +
      "\n\n" +
      `# TX\n` +
      txHeader +
      "\n" +
      txRows.join("\n") +
      "\n";

    downloadText(`flotilla_snapshot_${stamp}.csv`, content, "text/csv");
  }

  function resetShift() {
    const nextTx: Transaction[] = [
      { ts: Date.now(), type: "RESET", vehicleId: "-", summary: "Reset de turno: bitácora reiniciada." },
    ];
    saveState(vehicles, nextTx).catch(console.error);
  }

  async function handleLogin() {
    setAuthErr(null);
    try {
      await signInWithEmailAndPassword(auth, loginEmail.trim(), loginPass);
    } catch (e: any) {
      setAuthErr(e?.message ?? "Error al iniciar sesión");
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Cargando…</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Inicializando sesión y conexión…</CardContent>
        </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Login — Control Flotilla EV</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-muted-foreground">Acceso por correo/contraseña (Firebase).</div>
            <div className="space-y-2">
              <Label>Correo</Label>
              <Input value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="tu@dominio.com" />
            </div>
            <div className="space-y-2">
              <Label>Contraseña</Label>
              <Input value={loginPass} onChange={(e) => setLoginPass(e.target.value)} type="password" placeholder="••••••••" />
            </div>
            {authErr ? <div className="text-sm text-red-500 break-words">{authErr}</div> : null}
            <Button className="w-full" onClick={handleLogin} disabled={!loginEmail.trim() || !loginPass}>
              Entrar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl p-4 md:p-8 space-y-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1">
            <div className="text-2xl font-semibold tracking-tight">Control Flotilla EV — Zona Moon</div>
            <div className="text-sm text-muted-foreground">
              Punto único de llaves: <span className="font-medium">{KEY_POINT}</span> · SLA:{" "}
              <span className="font-medium">{SLA_MINUTES} min</span> · Recall:{" "}
              <span className="font-medium">{RECALL_MINUTES} min</span>
            </div>

            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <span>Sesión:</span>
              <span className="font-medium">{user.email}</span>
              {isAdmin ? <Badge>ADMIN</Badge> : <Badge variant="outline">SOLO LECTURA</Badge>}
            </div>

            {!isAdmin ? (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Modo lectura: solo Admin registra movimientos (Sarai / Armando).
              </div>
            ) : null}
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
              <ClipboardCopy className="h-4 w-4 mr-2" />
              Copiar resumen WhatsApp
            </Button>

            <Button variant="outline" onClick={exportSnapshotCSV}>
              <Download className="h-4 w-4 mr-2" />
              Exportar Snapshot CSV
            </Button>

            {isAdmin ? (
              <Button variant="outline" onClick={resetShift}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset turno
              </Button>
            ) : null}

            <Button variant="outline" onClick={() => signOut(auth)}>
              <LogOut className="h-4 w-4 mr-2" />
              Salir
            </Button>
          </div>
        </header>

        <section className="grid grid-cols-2 md:grid-cols-6 gap-3">
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
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-sm text-muted-foreground">Alertas</CardTitle>
              <div className="text-sm">
                <div>⚠️ SLA: <span className="font-semibold">{stats.sla}</span></div>
                <div>🚨 Recall vencido: <span className="font-semibold">{stats.recallOverdue}</span></div>
              </div>
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
                const slaBreached = v.status !== "Disponible" && v.checkedOutAt && mins >= SLA_MINUTES;
                const recallOver = isRecallOverdue(v);
                const recallDeadline =
                  v.recallAt ? new Date(v.recallAt + RECALL_MINUTES * 60000).toLocaleTimeString() : null;

                return (
                  <div key={v.id} className="rounded-xl border p-3 flex flex-col md:flex-row md:items-center gap-3">
                    <div className="flex items-center gap-3 min-w-[260px]">
                      <div className="flex items-center gap-2">
                        <div className="text-lg font-semibold">{v.id}</div>
                        <Badge variant={statusBadge(v.status)}>{v.status}</Badge>
                        {slaBreached ? <Badge variant="destructive">SLA</Badge> : null}
                        {recallOver ? <Badge variant="destructive">RECALL VENCIDO</Badge> : null}
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

                    <div className="flex items-center gap-2 flex-wrap">
                      {v.status === "Recall" ? (
                        <>
                          <Button variant="outline" onClick={() => copyRecallMessage(v)}>
                            Copiar Recall
                          </Button>
                          {recallOver ? (
                            <Button variant="destructive" onClick={() => copyEscalationMessage(v)}>
                              Escalar
                            </Button>
                          ) : null}
                        </>
                      ) : null}

                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" onClick={() => { setSelectedId(v.id); resetReturn(); }}>
                            Gestionar
                          </Button>
                        </DialogTrigger>

                        <DialogContent className="max-w-3xl">
                          <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                              <KeyRound className="h-5 w-5" />
                              Unidad {v.id} · {v.type}
                            </DialogTitle>
                          </DialogHeader>

                          {!isAdmin ? (
                            <div className="space-y-3">
                              <Badge variant="outline">SOLO LECTURA</Badge>
                              <div className="text-sm text-muted-foreground">
                                Para registrar movimientos, solicita a Admin (Sarai / Armando).
                              </div>
                              <Separator />
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                <div>
                                  <div className="text-muted-foreground">Estado</div>
                                  <div className="font-medium">{v.status}</div>
                                </div>
                                <div>
                                  <div className="text-muted-foreground">Zona</div>
                                  <div className="font-medium">{v.lastZone || "-"}</div>
                                </div>
                                <div>
                                  <div className="text-muted-foreground">Responsable</div>
                                  <div className="font-medium">{v.lastUserLabel || "-"}</div>
                                </div>
                                <div>
                                  <div className="text-muted-foreground">Última entrega</div>
                                  <div className="font-medium">{fmtTime(v.checkedOutAt)}</div>
                                </div>
                                <div className="md:col-span-2">
                                  <div className="text-muted-foreground">Notas</div>
                                  <div className="font-medium">{v.lastNotes || "-"}</div>
                                </div>
                              </div>
                            </div>
                          ) : (
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
                                      <Select value={checkoutUserId} onValueChange={setCheckoutUserId}>
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
                                      <Input value={freelanceName} onChange={(e) => setFreelanceName(e.target.value)} />
                                      <Label className="mt-2 block">Freelance: ID / INE / credencial</Label>
                                      <Input value={freelanceId} onChange={(e) => setFreelanceId(e.target.value)} />
                                    </div>
                                  )}

                                  <div className="space-y-2">
                                    <Label>Zona destino</Label>
                                    <Select value={checkoutZone} onValueChange={setCheckoutZone}>
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
                                    />
                                  </div>

                                  <div className="md:col-span-2 space-y-2">
                                    <Label>Notas (opcional)</Label>
                                    <Textarea
                                      value={checkoutNotes}
                                      onChange={(e) => setCheckoutNotes(e.target.value)}
                                      placeholder="Ej. batería baja, unidades en espera, detalles..."
                                    />
                                  </div>
                                </div>

                                <Separator />

                                <div className="flex items-center justify-between flex-wrap gap-2">
                                  <div className="text-sm text-muted-foreground">
                                    Reglas: no hay entrega sin ID (o Freelance + Nombre + ID) + Zona + Motivo.
                                  </div>
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
                                </div>
                              </TabsContent>

                              <TabsContent value="return" className="space-y-4 pt-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <Label>Zona donde se estaciona</Label>
                                    <Select value={returnZone} onValueChange={setReturnZone}>
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
                                    <div className="text-xs text-muted-foreground">Default: {RETURN_DEFAULT_ZONE}</div>
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Notas (opcional)</Label>
                                    <Textarea
                                      value={returnNotes}
                                      onChange={(e) => setReturnNotes(e.target.value)}
                                      placeholder="Ej. Se deja cargando, daño, batería, incidente..."
                                    />
                                  </div>
                                </div>

                                <div className="flex items-center justify-end gap-2">
                                  <Button variant="outline" onClick={resetReturn}>
                                    Limpiar
                                  </Button>
                                  <Button onClick={checkin} disabled={!returnZone}>
                                    Confirmar retorno
                                  </Button>
                                </div>
                              </TabsContent>

                              <TabsContent value="recall" className="space-y-4 pt-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <Label>Iniciado por</Label>
                                    <Input value={recallBy} onChange={(e) => setRecallBy(e.target.value)} />
                                  </div>

                                  <div className="space-y-2">
                                    <Label>Tiempo límite</Label>
                                    <Input value={`${RECALL_MINUTES} min`} readOnly />
                                  </div>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  <Button variant="destructive" onClick={startRecall}>
                                    <Siren className="h-4 w-4 mr-2" />
                                    Iniciar Recall
                                  </Button>

                                  {selectedVehicle ? (
                                    <Button variant="outline" onClick={() => copyRecallMessage(selectedVehicle)}>
                                      Copiar mensaje Recall
                                    </Button>
                                  ) : null}

                                  {selectedVehicle && isRecallOverdue(selectedVehicle) ? (
                                    <Button variant="destructive" onClick={() => copyEscalationMessage(selectedVehicle)}>
                                      Escalar
                                    </Button>
                                  ) : null}
                                </div>
                              </TabsContent>

                              <TabsContent value="status" className="space-y-4 pt-4">
                                <div className="flex flex-wrap gap-2">
                                  <Button variant="outline" onClick={markWaiting}>
                                    <RotateCcw className="h-4 w-4 mr-2" />
                                    Marcar En espera (tiempo muerto)
                                  </Button>
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
                          )}
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
              <CardTitle className="text-base">Bitácora</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm text-muted-foreground">
                Realtime Firestore. {isAdmin ? "Admin escribe." : "Solo lectura."}
              </div>
              <Separator />
              <div className="space-y-3 max-h-[560px] overflow-auto pr-2">
                {tx.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Aún no hay movimientos registrados.</div>
                ) : (
                  tx.map((t) => (
                    <div key={`${t.ts}-${t.vehicleId}-${t.type}`} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium">{t.type} · {t.vehicleId}</div>
                        <div className="text-xs text-muted-foreground">{fmtTime(t.ts)}</div>
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">{t.summary}</div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </section>

        <footer className="text-xs text-muted-foreground">
          Estado central: Firestore <span className="font-medium">dispatch/zona_moon</span>. Zona Moon (Sunrise, Nizuc, The Grand).
        </footer>
      </div>
    </div>
  );
}
