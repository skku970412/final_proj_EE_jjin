import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  Calendar,
  CheckCircle2,
  KeyRound,
  Lock,
  LogIn,
  PlugZap,
  Power,
  RefreshCcw,
  Search,
  ShieldCheck,
  TimerReset,
  Trash2,
} from "lucide-react";

type Reservation = {
  id: string;
  sessionId: number;
  plate: string;
  date: string;
  startTime: string;
  endTime: string;
  status: "CONFIRMED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  contactEmail?: string | null;
};

type SessionReservations = {
  sessionId: number;
  name: string;
  reservations: Reservation[];
};

const DEFAULT_API_BASE =
  import.meta.env.VITE_API_BASE ??
  (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : "http://localhost:8000");
const API_BASE = DEFAULT_API_BASE.replace(/\/$/, "");

async function extractError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data?.detail === "string") return data.detail;
    if (Array.isArray(data?.detail) && data.detail.length > 0) {
      const first = data.detail[0];
      if (typeof first?.msg === "string") return first.msg;
    }
    if (typeof data?.message === "string") return data.message;
  } catch {
    // ignore parse errors and fall through
  }
  const text = await res.text();
  return text || `요청이 실패했습니다. (status ${res.status})`;
}

const api = {
  loginAdmin: async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      throw new Error(await extractError(res));
    }
    return (await res.json()) as { token: string; admin: { email: string } };
  },
  listReservationsBySession: async (dateISO: string, token: string) => {
    const res = await fetch(
      `${API_BASE}/api/admin/reservations/by-session?date=${encodeURIComponent(dateISO)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    if (!res.ok) {
      throw new Error(await extractError(res));
    }
    return (await res.json()) as { sessions: SessionReservations[] };
  },
  deleteReservation: async (id: string, token: string) => {
    const res = await fetch(`${API_BASE}/api/admin/reservations/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) {
      throw new Error(await extractError(res));
    }
    return (await res.json()) as { ok: boolean };
  },
};

const START_HOUR = 9;
const END_HOUR = 22;

function pad(n: number) { return n.toString().padStart(2, "0"); }
function toMinutes(hhmm: string): number { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; }
function fromMinutes(mins: number): string { const h = Math.floor(mins / 60); const m = mins % 60; return `${pad(h)}:${pad(m)}`; }

function slotsOfDay(): string[] {
  const slots: string[] = [];
  for (let h = START_HOUR; h <= END_HOUR - 1; h++) {
    slots.push(`${pad(h)}:00`);
    slots.push(`${pad(h)}:30`);
  }
  return slots;
}

type Step = 1 | 2;

export default function App() {
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | null>(null);

  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [date, setDate] = useState<string>(todayISO);

  const [sessions, setSessions] = useState<SessionReservations[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [autoRefresh, setAutoRefresh] = useState(true);
  const intervalRef = useRef<number | null>(null);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const { sessions } = await api.listReservationsBySession(date, token);
      setSessions(sessions);
      setLastUpdatedAt(new Date());
    } catch (e: any) {
      setError(e.message || "예약 현황을 불러오지 못했습니다");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const { token } = await api.loginAdmin(email.trim(), password);
      setToken(token);
      setStep(2);
    } catch (e: any) {
      setError(e.message || "로그인 실패");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!token) return;
    const ok = window.confirm('이 예약을 삭제할까요?');
    if (!ok) return;
    setDeletingId(id);
    setError(null);
    try {
      await api.deleteReservation(id, token);
      setSessions((prev) => prev.map((s) => ({
        ...s,
        reservations: s.reservations.filter((r) => r.id !== id),
      })));
    } catch (e: any) {
      setError(e.message || '삭제에 실패했습니다.');
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    if (step === 2 && token) load();
  }, [date, step, token]);

  useEffect(() => {
    if (step !== 2) return;
    if (!token) return;
    if (autoRefresh) {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      intervalRef.current = window.setInterval(load, 15000);
      return () => {
        if (intervalRef.current) window.clearInterval(intervalRef.current);
      };
    } else {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [autoRefresh, step, token]);

  const kpi = useMemo(() => {
    const totalRes = sessions.reduce((acc, s) => acc + s.reservations.length, 0);
    const inProgress = sessions.reduce(
      (acc, s) => acc + s.reservations.filter((r) => r.status === "IN_PROGRESS").length,
      0
    );
    const daySlots = slotsOfDay();
    const totalPossible = daySlots.length * 4;
    const avgSlotsPerRes = 1.7;
    const occupied = sessions.reduce((acc, s) => acc + s.reservations.length * avgSlotsPerRes, 0);
    const utilization = Math.min(100, Math.round((occupied / totalPossible) * 100));
    return { totalRes, inProgress, utilization };
  }, [sessions]);

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-gray-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-6xl">
        <Header />

        <motion.div layout className="mt-4">
          {step === 1 && (
            <Card>
              <CardHeader
                icon={<Lock className="w-5 h-5" />}
                title="관리자 로그인"
                subtitle="관리자 계정으로 접속해 충전 세션 현황을 확인합니다. (데모 계정: admin@demo.dev / admin123)"
              />
              <div className="grid gap-3 p-6">
                <LabeledInput label="이메일" value={email} onChange={setEmail} placeholder="admin@demo.dev" />
                <LabeledInput label="비밀번호" value={password} onChange={setPassword} placeholder="••••••••" type="password" />
                {error && <ErrorBar msg={error} />}
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-500 flex items-center gap-1"><ShieldCheck className="w-4 h-4" /> 안전한 접근</div>
                  <Button onClick={handleLogin} disabled={loading || !email || !password}>
                    {loading ? "로그인 중..." : "로그인"}
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {step === 2 && (
            <div className="grid gap-4">
              <Card>
                <div className="p-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5" />
                    <input
                      className="rounded-xl border border-gray-200 px-4 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Toggle checked={autoRefresh} onChange={setAutoRefresh} label="15초 자동 새로고침" />
                    <Button onClick={load} disabled={loading}>
                      <RefreshCcw className="w-4 h-4 mr-1" /> {loading ? "새로고침..." : "새로고침"}
                    </Button>
                  </div>
                </div>
              </Card>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <MetricCard icon={<ListDot />} title="총 예약건수" value={`${kpi.totalRes.toLocaleString()} 건`} />
                <MetricCard icon={<Activity className="w-5 h-5" />} title="진행 중" value={`${kpi.inProgress} 건`} />
                <MetricCard icon={<PlugZap className="w-5 h-5" />} title="예상 점유율" value={`${kpi.utilization}%`} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sessions.map((s) => (
                  <SessionCard key={s.sessionId} data={s} onDelete={handleDelete} deletingId={deletingId} />
                ))}
              </div>

              <div className="text-xs text-gray-500 text-right">
                {lastUpdatedAt ? `업데이트: ${lastUpdatedAt.toLocaleString("ko-KR")}` : ""}
              </div>
            </div>
          )}
        </motion.div>

        <footer className="mt-6 text-center text-xs text-gray-500">
          © {new Date().getFullYear()} EV Wireless Charging · Admin Demo
        </footer>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center shadow text-white">
        <Power className="w-5 h-5" />
      </div>
      <div>
        <div className="font-semibold text-lg">관리자 대시보드</div>
        <div className="text-sm text-gray-500">세션 1~4 예약 현황 조회</div>
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">{children}</div>;
}

function CardHeader({ icon, title, subtitle }: { icon?: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="px-6 py-4 border-b bg-white/50">
      <div className="flex items-center gap-2">
        {icon && <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center">{icon}</div>}
        <div>
          <div className="font-semibold">{title}</div>
          {subtitle && <div className="text-sm text-gray-500">{subtitle}</div>}
        </div>
      </div>
    </div>
  );
}

function Button({ children, onClick, disabled, variant = "solid" }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; variant?: "solid" | "ghost" }) {
  const base = "inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm transition active:scale-[.99]";
  const solid = "bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50";
  const ghost = "bg-transparent text-gray-700 hover:bg-gray-100 disabled:opacity-50";
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${variant === "solid" ? solid : ghost}`}>
      {children}
    </button>
  );
}

function ErrorBar({ msg }: { msg: string }) {
  return (
    <div className="rounded-xl bg-red-50 text-red-700 border border-red-200 px-3 py-2 text-sm">
      {msg}
    </div>
  );
}

function LabeledInput({ label, value, onChange, placeholder, type = "text" }: { label: string; value: any; onChange: (v: any) => void; placeholder?: string; type?: string }) {
  return (
    <label className="grid gap-1">
      <span className="text-sm text-gray-700">{label}</span>
      <input
        className="rounded-xl border border-gray-200 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(type === "number" ? Number(e.target.value) : e.target.value)}
        type={type}
      />
    </label>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="inline-flex items-center gap-2 select-none">
      <span className="text-sm text-gray-700">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={`w-12 h-7 rounded-full border flex items-center px-1 transition ${checked ? "bg-indigo-600 border-indigo-600" : "bg-gray-200 border-gray-200"}`}
      >
        <span className={`w-5 h-5 bg-white rounded-full shadow transform transition ${checked ? "translate-x-5" : "translate-x-0"}`} />
      </button>
    </label>
  );
}

function MetricCard({ icon, title, value }: { icon: React.ReactNode; title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-gray-700">
        <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center">{icon}</div>
        <div className="text-sm">{title}</div>
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
      <div className="h-2 bg-indigo-600" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
    </div>
  );
}

function SessionCard({ data, onDelete, deletingId }: { data: SessionReservations; onDelete: (id: string) => void; deletingId: string | null }) {
  const slots = slotsOfDay();
  const totalSlots = slots.length;
  const utilization = Math.min(100, Math.round((data.reservations.length * 1.7 * 100) / totalSlots));
  const congestion = utilization >= 67 ? { label: '혼잡', cls: 'bg-rose-100 text-rose-700' } : utilization >= 34 ? { label: '보통', cls: 'bg-amber-100 text-amber-700' } : { label: '여유', cls: 'bg-emerald-100 text-emerald-700' };

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const active = data.reservations.filter((r) => {
    const s = toMinutes(r.startTime);
    const e = toMinutes(r.endTime);
    return nowMin >= s && nowMin < e;
  });
  const nextUp = [...data.reservations].filter((r) => toMinutes(r.startTime) >= nowMin).sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime))[0];

  const current = active[0];
  const totalMin = current ? toMinutes(current.endTime) - toMinutes(current.startTime) : 0;
  const elapsed = current ? nowMin - toMinutes(current.startTime) : 0;
  const remainMin = Math.max(0, totalMin - elapsed);
  const progressPct = current && totalMin > 0 ? Math.min(100, Math.max(0, Math.round((elapsed / totalMin) * 100))) : 0;

  return (
    <Card>
      <div className="p-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center">
            <PlugZap className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold">{data.name}</div>
            <div className="text-xs text-gray-500 flex items-center gap-2">점유율 {utilization}% • 진행중 {active.length}건
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${congestion.cls}`}>{congestion.label}</span>
            </div>
          </div>
        </div>
        <div className="w-40"><ProgressBar percent={utilization} /></div>
      </div>

      <div className="p-4">
        {current && (
          <div className="rounded-xl bg-indigo-50 p-3 text-sm mb-3">
            <div className="flex items-center justify-between">
              <div className="font-medium">진행중: {current.startTime}~{current.endTime} • {current.plate}</div>
              <div className="text-xs text-indigo-700">남은 약 {remainMin}분</div>
            </div>
            <div className="mt-2"><ProgressBar percent={progressPct} /></div>
          </div>
        )}

        <div className="rounded-xl bg-gray-50 p-3 text-sm mb-3">
          {nextUp ? (
            <div className="flex items-center justify-between">
              <div>
                <div className="text-gray-500">다음 예약</div>
                <div className="font-medium">{nextUp.startTime}~{nextUp.endTime} • {nextUp.plate}</div>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full ${badgeColor(nextUp.status)}`}>{nextUp.status}</span>
            </div>
          ) : (
            <div className="text-gray-500">예정된 예약이 없습니다.</div>
          )}
        </div>

        <div className="overflow-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left p-3 w-28">시간</th>
                <th className="text-left p-3">차량번호</th>
                <th className="text-left p-3 w-32">이메일</th>
                <th className="text-left p-3 w-28">상태</th>
                <th className="text-left p-3 w-32">예약ID</th>
                <th className="text-left p-3 w-20">삭제</th>
              </tr>
            </thead>
            <tbody>
              {data.reservations.length === 0 && (
                <tr>
                  <td className="p-3 text-gray-500" colSpan={5}>예약이 없습니다.</td>
                </tr>
              )}
              {data.reservations.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-3 whitespace-nowrap">{r.startTime}~{r.endTime}</td>
                  <td className="p-3 font-medium">{r.plate}</td>
                  <td className="p-3 text-gray-500">{r.contactEmail ?? "-"}</td>
                  <td className="p-3"><span className={`text-xs px-2 py-1 rounded-full ${badgeColor(r.status)}`}>{r.status}</span></td>
                  <td className="p-3 text-gray-500">{r.id}</td>
                  <td className="p-3">
                    <button
                      onClick={() => onDelete(r.id)}
                      disabled={deletingId === r.id}
                      className="rounded px-2 py-1 text-xs border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50 inline-flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />{deletingId === r.id ? '삭제중…' : '삭제'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}

function badgeColor(status: Reservation["status"]) {
  switch (status) {
    case "IN_PROGRESS":
      return "bg-emerald-100 text-emerald-700";
    case "COMPLETED":
      return "bg-gray-100 text-gray-700";
    case "CANCELLED":
      return "bg-red-100 text-red-700";
    default:
      return "bg-indigo-100 text-indigo-700";
  }
}

function ListDot() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="6" r="1.5" />
      <line x1="9" y1="6" x2="20" y2="6" />
      <circle cx="5" cy="12" r="1.5" />
      <line x1="9" y1="12" x2="20" y2="12" />
      <circle cx="5" cy="18" r="1.5" />
      <line x1="9" y1="18" x2="20" y2="18" />
    </svg>
  );
}
