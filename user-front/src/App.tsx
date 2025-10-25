import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Camera,
  Car,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  History,
  LogIn,
  Power,
  QrCode,
  ShieldCheck,
  User,
  Trash2,
} from "lucide-react";

type ReservationStatus = "CONFIRMED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

type Reservation = {
  id: string;
  sessionId: number;
  plate: string;
  date: string;
  startTime: string;
  endTime: string;
  status: ReservationStatus;
  contactEmail?: string | null;
};

type SessionReservations = {
  sessionId: number;
  name: string;
  reservations: Reservation[];
};

type Step = 1 | 2 | 3 | 4 | 5;

const DEFAULT_API_BASE =
  import.meta.env.VITE_API_BASE ??
  (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : "http://localhost:8000");
const API_BASE = DEFAULT_API_BASE.replace(/\/$/, "");
const START_HOUR = 9;
const END_HOUR = 22;
const DAY_END_MINUTES = END_HOUR * 60;

const KR_PLATE_REGEX =
  /^(?:[가-힣]{2}\d{2}[가-힣]\d{4}|\d{2,3}[가-힣]\d{4}|[가-힣]{2}\d{2}\s?\d{4})$/;

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function fromMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${pad(h)}:${pad(m)}`;
}

function daySlots(): string[] {
  const arr: string[] = [];
  for (let h = START_HOUR; h <= END_HOUR - 1; h++) {
    arr.push(`${pad(h)}:00`);
    arr.push(`${pad(h)}:30`);
  }
  return arr;
}

function endTime(start: string, durationMin: number) {
  return fromMinutes(toMinutes(start) + durationMin);
}

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
    // ignore JSON parse errors
  }
  const text = await res.text();
  return text || `요청이 실패했습니다. (status ${res.status})`;
}

const api = {
  login: async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/api/user/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error(await extractError(res));
    return (await res.json()) as { token: string; user: { email: string } };
  },
  listReservationsBySession: async (dateISO: string) => {
    const res = await fetch(
      `${API_BASE}/api/reservations/by-session?date=${encodeURIComponent(dateISO)}`
    );
    if (!res.ok) throw new Error(await extractError(res));
    return (await res.json()) as { sessions: SessionReservations[] };
  },
  verifySlot: async (payload: {
    plate: string;
    date: string;
    startTime: string;
    endTime: string;
    sessionId: number;
  }) => {
    const res = await fetch(`${API_BASE}/api/plates/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await extractError(res));
    return (await res.json()) as {
      valid: boolean;
      conflict: boolean;
      message: string;
    };
  },
  lookupPlate: async (plate: string) => {
    const res = await fetch(
      `${API_BASE}/api/reservations/my?plate=${encodeURIComponent(plate)}`
    );
    if (!res.ok) throw new Error(await extractError(res));
    return (await res.json()) as Reservation[];
  },
  createReservation: async (payload: {
    sessionId: number;
    plate: string;
    date: string;
    startTime: string;
    endTime: string;
    contactEmail: string;
  }) => {
    const res = await fetch(`${API_BASE}/api/reservations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await extractError(res));
    return (await res.json()) as Reservation;
  },
  myReservations: async (email: string) => {
    const res = await fetch(
      `${API_BASE}/api/reservations/my?email=${encodeURIComponent(email)}`
    );
    if (!res.ok) throw new Error(await extractError(res));
    return (await res.json()) as Reservation[];
  },
  deleteReservation: async (id: string, email: string) => {
    const res = await fetch(
      `${API_BASE}/api/reservations/${id}?email=${encodeURIComponent(email)}`,
      { method: "DELETE" }
    );
    if (!res.ok) throw new Error(await extractError(res));
  },
};

const slots = daySlots();

export default function EVUserFrontV2() {
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | null>(null);

  const [plate, setPlate] = useState("");
  const [plateValid, setPlateValid] = useState<boolean | null>(null);
  const [plateRegistered, setPlateRegistered] = useState<boolean | null>(null);
  const [plateHistory, setPlateHistory] = useState<Reservation[]>([]);
  const [plateVerified, setPlateVerified] = useState(false);

  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [date, setDate] = useState<string>(todayISO);
  const [sessionId, setSessionId] = useState<number>(1);
  const [startTime, setStartTime] = useState<string>("09:00");
  const [durationMin, setDurationMin] = useState<number>(60);
  const [occupiedSet, setOccupiedSet] = useState<Set<string>>(new Set());
  const [stripData, setStripData] = useState<
    { dateISO: string; label: string; color: string; freePct: number }[]
  >([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  const [reservationId, setReservationId] = useState<string | null>(null);
  const [myList, setMyList] = useState<Reservation[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [scanOpen, setScanOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!plate) {
      setPlateValid(null);
      return;
    }
    setPlateValid(KR_PLATE_REGEX.test(plate.replace(/\s/g, "")));
  }, [plate]);

  useEffect(() => {
    if (!token) return;
    const load = async () => {
      try {
        const list = await api.myReservations(email.toLowerCase());
        setMyList(list);
      } catch (e: any) {
        setError(e?.message ?? "내 예약을 불러오지 못했습니다.");
      }
    };
    load();
  }, [token, email]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setAvailabilityLoading(true);
      setError(null);
      try {
        const range: string[] = [];
        const base = new Date(date);
        for (let offset = -3; offset <= 10; offset += 1) {
          const d = new Date(base);
          d.setDate(base.getDate() + offset);
          range.push(d.toISOString().slice(0, 10));
        }
        const responses = await Promise.all(
          range.map(async (iso) => ({
            iso,
            sessions: await api.listReservationsBySession(iso),
          }))
        );
        if (cancelled) return;

        const nextStrip: { dateISO: string; label: string; color: string; freePct: number }[] =
          [];
        let currentSession: SessionReservations | undefined;
        for (const { iso, sessions } of responses) {
          const session = sessions.sessions.find((s) => s.sessionId === sessionId);
          if (iso === date) currentSession = session;
          const occupied = new Set<string>();
          session?.reservations.forEach((r) => {
            let cur = toMinutes(r.startTime);
            const until = toMinutes(r.endTime);
            while (cur < until) {
              occupied.add(fromMinutes(cur));
              cur += 30;
            }
          });
          const free = Math.max(0, slots.length - occupied.size);
          const freePct = Math.round((free / slots.length) * 100);
          const color =
            freePct > 66 ? "bg-emerald-500" : freePct > 33 ? "bg-amber-500" : "bg-rose-500";
          const d = new Date(iso);
          nextStrip.push({
            dateISO: iso,
            label: `${d.getMonth() + 1}/${d.getDate()}`,
            color,
            freePct,
          });
        }
        setStripData(nextStrip);

        const occupied = new Set<string>();
        currentSession?.reservations.forEach((r) => {
          let cur = toMinutes(r.startTime);
          const until = toMinutes(r.endTime);
          while (cur < until) {
            occupied.add(fromMinutes(cur));
            cur += 30;
          }
        });
        setOccupiedSet(occupied);
        if (!slots.includes(startTime)) {
          setStartTime(slots[0]);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? "가용성을 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) {
          setAvailabilityLoading(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [date, sessionId]);

  const canNextFromLogin = !!email && !!password;
  const canNextFromPlate = plateValid === true;
  const estimatedPrice = useMemo(() => durationMin * 100, [durationMin]);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const { token } = await api.login(email.trim(), password);
      setToken(token);
      setPlateHistory([]);
      setPlateRegistered(null);
      setPlateVerified(false);
      setStep(2);
    } catch (e: any) {
      setError(e?.message ?? "로그인 실패");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPlate = async () => {
    if (!token) return;
    if (!plateValid) {
      setError("번호판 형식을 확인하세요.");
      setPlateVerified(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const history = await api.lookupPlate(plate.trim());
      setPlateHistory(history);
      setPlateRegistered(history.length > 0);
      setPlateVerified(true);
      setStep(3);
    } catch (e: any) {
      setPlateVerified(false);
      setError(e?.message ?? "번호판 확인 실패");
    } finally {
      setLoading(false);
    }
  };

  const refreshReservations = async () => {
    if (!email) return;
    const list = await api.myReservations(email.toLowerCase());
    setMyList(list);
  };

  const handleReserve = async () => {
    if (!token) return;
    if (!plateVerified) {
      setError("차량번호 검증을 먼저 완료하세요.");
      setStep(2);
      return;
    }
    if (toMinutes(startTime) + durationMin > DAY_END_MINUTES) {
      setError("종료 가능 시간을 초과했습니다. 다른 시작 시간을 선택하세요.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const verification = await api.verifySlot({
        plate: plate.trim(),
        date,
        startTime,
        endTime: endTime(startTime, durationMin),
        sessionId,
      });
      if (verification.conflict) {
        setPlateRegistered(true);
        setError(verification.message);
        return;
      }
      const reservation = await api.createReservation({
        sessionId,
        plate: plate.trim(),
        date,
        startTime,
        endTime: endTime(startTime, durationMin),
        contactEmail: email.trim().toLowerCase(),
      });
      setReservationId(reservation.id);
      await refreshReservations();
      setStep(4);
    } catch (e: any) {
      setError(e?.message ?? "예약 실패");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("이 예약을 삭제할까요?")) return;
    setDeletingId(id);
    setError(null);
    try {
      await api.deleteReservation(id, email.toLowerCase());
      await refreshReservations();
    } catch (e: any) {
      setError(e?.message ?? "삭제에 실패했습니다.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteAll = async () => {
    if (!window.confirm("모든 예약을 삭제할까요?")) return;
    setLoading(true);
    setError(null);
    try {
      for (const r of myList) {
        await api.deleteReservation(r.id, email.toLowerCase());
      }
      await refreshReservations();
    } catch (e: any) {
      setError(e?.message ?? "내역 삭제에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handlePlateChange = useCallback((value: string) => {
    setPlate(value);
    setPlateVerified(false);
    setPlateRegistered(null);
    setPlateHistory([]);
    setError(null);
  }, []);

  const openScanner = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanOpen(true);
    } catch {
      setError("카메라 접근이 거부되었거나 지원되지 않습니다.");
    }
  };

  const closeScanner = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setScanOpen(false);
  }, []);

  const snapAndRecognize = async () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    const vw = videoRef.current.videoWidth;
    const vh = videoRef.current.videoHeight;
    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0, vw, vh);
    await new Promise((res) => setTimeout(res, 600));
    const fake = ["12가3456", "123나4567", "68다1234", "서울12가3456"];
    handlePlateChange(fake[Math.floor(Math.random() * fake.length)]);
    closeScanner();
  };

  const sortedMyList = useMemo(
    () =>
      [...myList].sort((a, b) =>
        (a.date + a.startTime).localeCompare(b.date + b.startTime)
      ),
    [myList]
  );

  useEffect(() => {
    if (toMinutes(startTime) + durationMin <= DAY_END_MINUTES) {
      return;
    }
    const preferred = [...slots]
      .reverse()
      .find(
        (s) =>
          toMinutes(s) + durationMin <= DAY_END_MINUTES &&
          !occupiedSet.has(s)
      );
    if (preferred && preferred !== startTime) {
      setStartTime(preferred);
      return;
    }
    const fallback = [...slots].find(
      (s) => toMinutes(s) + durationMin <= DAY_END_MINUTES
    );
    if (fallback && fallback !== startTime) {
      setStartTime(fallback);
    }
  }, [durationMin, occupiedSet, startTime]);

  useEffect(() => {
    if (scanOpen && step !== 2) {
      closeScanner();
    }
  }, [scanOpen, step, closeScanner]);

  useEffect(() => {
    return () => {
      closeScanner();
    };
  }, [closeScanner]);

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-gray-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <Header loggedIn={!!token} onMy={() => (token ? setStep(5) : null)} />
        <Stepper step={step} />

        <motion.div layout className="mt-4">
          {step === 1 && (
            <Card>
              <CardHeader
                icon={<LogIn className="w-5 h-5" />}
                title="로그인"
                subtitle="이메일과 비밀번호로 로그인하세요."
              />
              <div className="grid gap-3 p-6">
                <LabeledInput
                  label="이메일"
                  placeholder="you@example.com"
                  value={email}
                  onChange={setEmail}
                  type="email"
                />
                <LabeledInput
                  label="비밀번호"
                  placeholder="••••••••"
                  value={password}
                  onChange={setPassword}
                  type="password"
                />
                {error && <ErrorBar msg={error} />}
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-500 flex items-center gap-1">
                    <ShieldCheck className="w-4 h-4" /> 안전한 로그인
                  </div>
                  <Button disabled={!canNextFromLogin || loading} onClick={handleLogin}>
                    {loading ? "로그인 중..." : "다음"}
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {step === 2 && (
            <Card>
              <CardHeader
                icon={<Car className="w-5 h-5" />}
                title="차량번호 입력"
                subtitle="등록 차량 번호판을 입력하거나 카메라로 스캔하세요."
              />
              <div className="grid gap-3 p-6">
                <div className="flex gap-2">
                  <input
                    className={`flex-1 rounded-xl border px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-indigo-500 ${
                      plateValid === false ? "border-red-400" : "border-gray-200"
                    }`}
                    placeholder="예) 12가3456 / 123나4567"
                    value={plate}
                    onChange={(e) => handlePlateChange(e.target.value)}
                  />
                  <button
                    onClick={openScanner}
                    className="rounded-xl border border-gray-200 px-3 py-2 hover:bg-gray-50 active:scale-[.99]"
                  >
                    <Camera className="w-5 h-5" />
                  </button>
                </div>
                {plateValid === false && (
                  <p className="text-sm text-red-500">번호판 형식이 올바르지 않습니다.</p>
                )}
                {plateRegistered !== null && (
                  <p
                    className={`text-sm ${
                      plateRegistered ? "text-emerald-600" : "text-amber-600"
                    }`}
                  >
                    {plateRegistered
                      ? "등록 차량 확인 완료"
                      : "미등록 차량입니다. 결제 시 신규 등록 처리됩니다."}
                  </p>
                )}
                {plateHistory.length > 0 && (
                  <div className="rounded-xl border border-gray-200 p-3 text-sm">
                    <div className="font-semibold text-gray-700 mb-2">기존 예약</div>
                    <ul className="space-y-1 text-gray-600">
                      {plateHistory.map((r) => (
                        <li key={r.id}>
                          {r.date} {r.startTime}~{r.endTime} • 세션 {r.sessionId} • {r.status}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {error && <ErrorBar msg={error} />}
                <div className="flex items-center justify-between">
                  <Button variant="ghost" onClick={() => setStep(1)}>
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    이전
                  </Button>
                  <Button disabled={!canNextFromPlate || loading} onClick={handleVerifyPlate}>
                    {loading ? "확인 중..." : "다음"}
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>

              {scanOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                    <div className="p-4 border-b flex items-center justify-between">
                      <div className="font-semibold flex items-center gap-2">
                        <Camera className="w-4 h-4" /> 번호판 스캔
                      </div>
                      <button onClick={closeScanner} className="text-gray-500 hover:text-gray-800">
                        닫기
                      </button>
                    </div>
                    <div className="p-4">
                      <video ref={videoRef} className="w-full rounded-xl bg-black" playsInline muted />
                      <div className="flex gap-2 mt-3">
                        <Button className="flex-1" onClick={snapAndRecognize}>
                          스냅샷 → 인식
                        </Button>
                        <Button variant="ghost" onClick={closeScanner}>
                          중지
                        </Button>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        데모: 실제 환경에서는 서버로 업로드 → YOLO/CRNN + OCR로 인식합니다.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          )}

          {step === 3 && (
            <Card>
              <CardHeader
                icon={<Clock className="w-5 h-5" />}
                title="시간 예약"
                subtitle="세션 선택 → 날짜 스트립에서 날짜 선택 → 초록 슬롯을 눌러 시작시간 지정"
              />
              <div className="grid gap-4 p-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <LabeledSelect
                    label="세션"
                    value={sessionId}
                    onChange={(v) => setSessionId(Number(v))}
                    options={[1, 2, 3, 4].map((n) => ({ label: `세션 ${n}`, value: n }))}
                  />
                  <LabeledSelect
                    label="이용 시간(분)"
                    value={durationMin}
                    onChange={(v) => setDurationMin(Number(v))}
                    options={[30, 60, 90, 120].map((n) => ({ label: `${n}분`, value: n }))}
                  />
                  <LabeledInput label="선택 날짜" value={date} onChange={setDate} type="date" />
                </div>

                <div className="rounded-2xl border border-gray-200 p-3">
                  <div className="text-sm text-gray-600 mb-2 flex items-center justify-between">
                    <span>
                      날짜별 가용률 색상:{" "}
                      <span className="inline-block w-3 h-3 rounded bg-emerald-500 mr-1" />
                      여유 <span className="inline-block w-3 h-3 rounded bg-amber-500 mx-1" />
                      보통 <span className="inline-block w-3 h-3 rounded bg-rose-500 mx-1" />
                      혼잡
                    </span>
                    {availabilityLoading && (
                      <span className="text-xs text-indigo-600">불러오는 중...</span>
                    )}
                  </div>
                  <div className="grid grid-cols-7 gap-2">
                    {stripData.map((d) => (
                      <button
                        key={d.dateISO}
                        onClick={() => setDate(d.dateISO)}
                        className={`rounded-xl p-2 border text-sm text-left hover:shadow active:scale-[.99] ${
                          date === d.dateISO ? "border-indigo-500" : "border-gray-200"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span>{d.label}</span>
                          <span className={`w-3 h-3 rounded-full ${d.color}`} />
                        </div>
                        <div className="text-[10px] text-gray-500 mt-1">가용 {d.freePct}%</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 p-3">
                  <div className="text-sm text-gray-600 mb-2">
                    {date} • 세션 {sessionId} • 초록=예약가능
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                    {slots.map((s) => {
                      const busy = occupiedSet.has(s);
                      const beyond = toMinutes(s) + durationMin > DAY_END_MINUTES;
                      const disabled = busy || beyond;
                      const selected = startTime === s;
                      return (
                        <button
                          key={s}
                          disabled={disabled}
                          onClick={() => setStartTime(s)}
                          className={`rounded-lg px-2 py-2 text-sm border transition ${
                            busy || beyond
                              ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                          } ${selected ? "ring-2 ring-indigo-500" : ""}`}
                        >
                          {s}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-xl bg-gray-50 p-4 text-sm flex items-center justify-between">
                  <div className="space-y-1">
                    <div>
                      차량번호: <span className="font-semibold">{plate}</span>
                    </div>
                    <div>
                      예약: {date} {startTime} • {durationMin}분 • 세션 {sessionId}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-500">예상 결제금액</div>
                    <div className="text-xl font-bold">{estimatedPrice.toLocaleString()}원</div>
                  </div>
                </div>

                {error && <ErrorBar msg={error} />}
                <div className="flex items-center justify-between">
                  <Button variant="ghost" onClick={() => setStep(2)}>
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    이전
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => setStep(5)}>
                      <History className="w-4 h-4 mr-1" />
                      내 예약
                    </Button>
                    <Button disabled={loading} onClick={handleReserve}>
                      {loading ? "예약 처리 중..." : "예약 확정"}
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {step === 4 && reservationId && (
            <Card>
              <CardHeader
                icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
                title="예약 완료"
                subtitle="현장 도착 시, 번호판 자동 인식으로 무선충전이 시작됩니다."
              />
              <div className="p-6 grid gap-4">
                <div className="rounded-2xl border border-gray-200 p-4">
                  <div className="grid sm:grid-cols-2 gap-3 text-sm">
                    <InfoRow label="예약 ID" value={reservationId} />
                    <InfoRow label="차량번호" value={plate} />
                    <InfoRow label="세션" value={`세션 ${sessionId}`} />
                    <InfoRow label="일시" value={`${date} ${startTime} • ${durationMin}분`} />
                    <InfoRow label="예상 금액" value={`${estimatedPrice.toLocaleString()}원`} />
                    <InfoRow
                      label="상태"
                      value={
                        <span className="inline-flex items-center gap-1 text-emerald-600">
                          <Power className="w-4 h-4" />
                          CONFIRMED
                        </span>
                      }
                    />
                  </div>
                </div>
                <div className="rounded-2xl bg-gray-50 p-4 flex items-center gap-3">
                  <QrCode className="w-8 h-8" />
                  <div className="text-sm text-gray-600">
                    예약 ID로 현장 단말 조회/결제 연동 가능 (데모: 결제 미포함)
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Button variant="ghost" onClick={() => setStep(3)}>
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    수정
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => setStep(5)}>
                      <History className="w-4 h-4 mr-1" />
                      내 예약 보기
                    </Button>
                    <Button
                      onClick={() => {
                        setReservationId(null);
                        handlePlateChange("");
                        setEmail("");
                        setPassword("");
                        setToken(null);
                        setStartTime("09:00");
                        setDurationMin(60);
                        setSessionId(1);
                        setDate(todayISO);
                        setStep(1);
                      }}
                    >
                      새 예약
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {step === 5 && (
            <Card>
              <CardHeader
                icon={<History className="w-5 h-5" />}
                title="내 예약"
                subtitle="로그인 계정으로 저장된 예약 목록입니다."
              />
              <div className="p-6">
                {sortedMyList.length === 0 ? (
                  <div className="text-gray-500">예약 내역이 없습니다.</div>
                ) : (
                  <div className="overflow-auto rounded-xl border border-gray-200">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="text-left p-3">예약ID</th>
                          <th className="text-left p-3">일시</th>
                          <th className="text-left p-3">세션</th>
                          <th className="text-left p-3">차량번호</th>
                          <th className="text-left p-3">상태</th>
                          <th className="text-left p-3 w-20">삭제</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedMyList.map((r) => (
                          <tr key={r.id} className="border-t">
                            <td className="p-3">{r.id}</td>
                            <td className="p-3 whitespace-nowrap">
                              {r.date} {r.startTime}~{r.endTime}
                            </td>
                            <td className="p-3">세션 {r.sessionId}</td>
                            <td className="p-3">{r.plate}</td>
                            <td className="p-3">
                              <span className="text-xs px-2 py-1 rounded-full bg-indigo-100 text-indigo-700">
                                {r.status}
                              </span>
                            </td>
                            <td className="p-3">
                              <button
                                onClick={() => handleDelete(r.id)}
                                disabled={deletingId === r.id}
                                className="rounded px-2 py-1 text-xs border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50 inline-flex items-center gap-1"
                              >
                                <Trash2 className="w-3 h-3" />
                                {deletingId === r.id ? "삭제중..." : "삭제"}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="flex items-center justify-between mt-4">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      if (plateVerified) {
                        setStep(3);
                      } else {
                        setError("차량번호 검증을 먼저 완료하세요.");
                        setStep(2);
                      }
                    }}
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    예약으로 돌아가기
                  </Button>
                  <Button onClick={handleDeleteAll} disabled={loading || sortedMyList.length === 0}>
                    내역 전체 삭제
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </motion.div>

        <footer className="mt-6 text-center text-xs text-gray-500">
          © {new Date().getFullYear()} EV Wireless Charging · Demo UI v2
        </footer>
      </div>
    </div>
  );
}

function Header({ loggedIn, onMy }: { loggedIn: boolean; onMy: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center shadow text-white">
          <Power className="w-5 h-5" />
        </div>
        <div>
          <div className="font-semibold text-lg">무선충전 예약</div>
          <div className="text-sm text-gray-500">번호판 등록 → 가시화 → 예약</div>
        </div>
      </div>
      {loggedIn && (
        <Button variant="ghost" onClick={onMy}>
          <History className="w-4 h-4 mr-1" />
          내 예약
        </Button>
      )}
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const steps = [
    { id: 1, title: "로그인", icon: <User className="w-4 h-4" /> },
    { id: 2, title: "차량번호", icon: <Car className="w-4 h-4" /> },
    { id: 3, title: "시간예약", icon: <Clock className="w-4 h-4" /> },
    { id: 4, title: "완료", icon: <CheckCircle2 className="w-4 h-4" /> },
    { id: 5, title: "내 예약", icon: <History className="w-4 h-4" /> },
  ];
  return (
    <div className="mt-4 grid grid-cols-5 gap-2">
      {steps.map((s) => {
        const active = s.id === step;
        const passed = s.id < step;
        return (
          <div
            key={s.id}
            className={`rounded-2xl border p-3 flex items-center gap-2 ${
              active
                ? "border-indigo-500 bg-indigo-50"
                : passed
                ? "border-emerald-400 bg-emerald-50"
                : "border-gray-200 bg-white"
            }`}
          >
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                active
                  ? "bg-indigo-600 text-white"
                  : passed
                  ? "bg-emerald-500 text-white"
                  : "bg-gray-200 text-gray-700"
              }`}
            >
              {s.id}
            </div>
            <div className="flex items-center gap-1 text-sm">
              <span>{s.icon}</span>
              <span className={active ? "text-indigo-700" : "text-gray-700"}>{s.title}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">{children}</div>;
}

function CardHeader({
  icon,
  title,
  subtitle,
}: {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
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

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: any;
  onChange: (v: any) => void;
  placeholder?: string;
  type?: string;
}) {
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

function LabeledSelect<T extends string | number>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { label: string; value: T }[];
}) {
  return (
    <label className="grid gap-1">
      <span className="text-sm text-gray-700">{label}</span>
      <select
        className="rounded-xl border border-gray-200 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
        value={value as any}
        onChange={(e) =>
          onChange(
            Number.isNaN(Number(e.target.value))
              ? ((e.target.value as unknown) as T)
              : ((Number(e.target.value) as unknown) as T),
          )
        }
      >
        {options.map((o, i) => (
          <option key={i} value={o.value as any}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Button({
  children,
  onClick,
  disabled,
  variant = "solid",
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "solid" | "ghost";
  className?: string;
}) {
  const base =
    "inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm transition active:scale-[.99]";
  const solid = "bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50";
  const ghost = "bg-transparent text-gray-700 hover:bg-gray-100 disabled:opacity-50";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variant === "solid" ? solid : ghost} ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

function ErrorBar({ msg }: { msg: string }) {
  return <div className="rounded-xl bg-red-50 text-red-700 border border-red-200 px-3 py-2 text-sm">{msg}</div>;
}

function InfoRow({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div className="text-gray-500">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
