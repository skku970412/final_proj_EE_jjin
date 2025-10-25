import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion } from "framer-motion";
import { Car, CheckCircle2, Clock, History, User } from "lucide-react";

import Header from "./components/ui/Header";
import Stepper, { StepDefinition } from "./components/ui/Stepper";
import LoginPage from "./pages/Login";
import PlateVerificationPage from "./pages/PlateVerification";
import SchedulePage, { AvailabilityStrip } from "./pages/Schedule";
import ReservationResult from "./pages/ReservationResult";
import MyReservationsPage from "./pages/MyReservations";
import {
  daySlots,
  DAY_END_MINUTES,
  endTime,
  fromMinutes,
  toMinutes,
} from "./utils/time";
import { KR_PLATE_REGEX } from "./utils/validation";
import {
  createReservation,
  deleteReservation,
  listReservationsBySession,
  login,
  lookupPlate,
  myReservations,
  verifySlot,
} from "./api/client";
import type { Reservation, SessionReservations } from "./api/types";

type Step = 1 | 2 | 3 | 4 | 5;

const STEP_ITEMS: StepDefinition[] = [
  { id: 1, title: "로그인", icon: <User className="w-4 h-4" /> },
  { id: 2, title: "차량 번호", icon: <Car className="w-4 h-4" /> },
  { id: 3, title: "이용 시간", icon: <Clock className="w-4 h-4" /> },
  { id: 4, title: "완료", icon: <CheckCircle2 className="w-4 h-4" /> },
  { id: 5, title: "내 예약", icon: <History className="w-4 h-4" /> },
];

const SESSION_OPTIONS = [1, 2, 3, 4];
const DURATION_OPTIONS = [30, 60, 90, 120];
const SLOTS = daySlots();
const FAKE_PLATES = ["12가3456", "123나4567", "68다1234", "서울12마3456"];

export default function App() {
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
  const [startTime, setStartTime] = useState<string>(SLOTS[0]);
  const [durationMin, setDurationMin] = useState<number>(60);

  const [occupiedSet, setOccupiedSet] = useState<Set<string>>(new Set());
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [stripData, setStripData] = useState<AvailabilityStrip[]>([]);

  const [reservationId, setReservationId] = useState<string | null>(null);
  const [myList, setMyList] = useState<Reservation[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [scanOpen, setScanOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const goToStep = useCallback((next: Step) => {
    setError(null);
    setStep(next);
  }, []);

  useEffect(() => {
    if (!plate) {
      setPlateValid(null);
      return;
    }
    setPlateValid(KR_PLATE_REGEX.test(plate.replace(/\s/g, "")));
  }, [plate]);

  const refreshReservations = useCallback(async () => {
    if (!email) return;
    const list = await myReservations(email);
    setMyList(list);
  }, [email]);

  useEffect(() => {
    if (!token) return;
    const load = async () => {
      try {
        await refreshReservations();
      } catch (err: any) {
        setError(err?.message ?? "예약 정보를 불러오지 못했습니다.");
      }
    };
    load();
  }, [token, refreshReservations]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setAvailabilityLoading(true);
      setError(null);
      try {
        const range: string[] = [];
        const base = new Date(date);
        for (let offset = -3; offset <= 10; offset += 1) {
          const next = new Date(base);
          next.setDate(base.getDate() + offset);
          range.push(next.toISOString().slice(0, 10));
        }

        const responses = await Promise.all(
          range.map(async (iso) => {
            const { sessions } = await listReservationsBySession(iso);
            return { iso, sessions };
          })
        );

        if (cancelled) return;

        const strips: AvailabilityStrip[] = [];
        let selectedSession: SessionReservations | undefined;

        responses.forEach(({ iso, sessions }) => {
          const session = sessions.find((item) => item.sessionId === sessionId);
          if (iso === date) {
            selectedSession = session;
          }

          const occupied = new Set<string>();
          session?.reservations.forEach((reservation) => {
            let current = toMinutes(reservation.startTime);
            const end = toMinutes(reservation.endTime);
            while (current < end) {
              occupied.add(fromMinutes(current));
              current += 30;
            }
          });

          const free = Math.max(0, SLOTS.length - occupied.size);
          const freePct = Math.round((free / SLOTS.length) * 100);
          const color =
            freePct > 66 ? "bg-emerald-500" : freePct > 33 ? "bg-amber-500" : "bg-rose-500";

          const day = new Date(iso);
          strips.push({
            dateISO: iso,
            label: `${day.getMonth() + 1}/${day.getDate()}`,
            color,
            freePct,
          });
        });

        setStripData(strips);

        const nextOccupied = new Set<string>();
        selectedSession?.reservations.forEach((reservation) => {
          let current = toMinutes(reservation.startTime);
          const end = toMinutes(reservation.endTime);
          while (current < end) {
            nextOccupied.add(fromMinutes(current));
            current += 30;
          }
        });
        setOccupiedSet(nextOccupied);

        if (!SLOTS.includes(startTime)) {
          setStartTime(SLOTS[0]);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message ?? "이용 가능 정보를 불러오지 못했습니다.");
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
  }, [date, sessionId, startTime]);

  useEffect(() => {
    if (toMinutes(startTime) + durationMin <= DAY_END_MINUTES) {
      return;
    }

    const preferred = [...SLOTS]
      .reverse()
      .find((slot) => toMinutes(slot) + durationMin <= DAY_END_MINUTES && !occupiedSet.has(slot));
    if (preferred && preferred !== startTime) {
      setStartTime(preferred);
      return;
    }
    const fallback = [...SLOTS].find((slot) => toMinutes(slot) + durationMin <= DAY_END_MINUTES);
    if (fallback && fallback !== startTime) {
      setStartTime(fallback);
    }
  }, [durationMin, occupiedSet, startTime]);

  const closeScanner = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setScanOpen(false);
  }, []);

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

  const canNextFromLogin = !!email && !!password;
  const canNextFromPlate = plateValid === true;
  const estimatedPrice = useMemo(() => durationMin * 100, [durationMin]);
  const sortedMyList = useMemo(
    () => [...myList].sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)),
    [myList]
  );

  const handlePlateChange = useCallback((value: string) => {
    setPlate(value);
    setPlateVerified(false);
    setPlateRegistered(null);
    setPlateHistory([]);
    setError(null);
  }, []);

  const openScanner = useCallback(async () => {
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
      setError("카메라 접근이 차단되었거나 지원되지 않습니다.");
    }
  }, []);

  const snapAndRecognize = useCallback(async () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    const vw = videoRef.current.videoWidth;
    const vh = videoRef.current.videoHeight;
    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0, vw, vh);
    await new Promise((resolve) => setTimeout(resolve, 600));
    handlePlateChange(FAKE_PLATES[Math.floor(Math.random() * FAKE_PLATES.length)]);
    closeScanner();
  }, [closeScanner, handlePlateChange]);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const { token: issuedToken } = await login(email.trim(), password);
      setToken(issuedToken);
      setPlateHistory([]);
      setPlateRegistered(null);
      setPlateVerified(false);
      goToStep(2);
    } catch (err: any) {
      setError(err?.message ?? "로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPlate = async () => {
    if (!token) return;
    if (!plateValid) {
      setError("번호판 형식을 다시 확인해 주세요.");
      setPlateVerified(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const history = await lookupPlate(plate.trim());
      setPlateHistory(history);
      setPlateRegistered(history.length > 0);
      setPlateVerified(true);
      goToStep(3);
    } catch (err: any) {
      setPlateVerified(false);
      setError(err?.message ?? "번호판 확인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleReserve = async () => {
    if (!token) return;
    if (!plateVerified) {
      setError("차량 번호 확인을 먼저 진행해 주세요.");
      goToStep(2);
      return;
    }
    if (toMinutes(startTime) + durationMin > DAY_END_MINUTES) {
      setError("이용 종료 시간이 운영 시간(22:00)을 초과합니다.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const verification = await verifySlot({
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
      const reservation = await createReservation({
        sessionId,
        plate: plate.trim(),
        date,
        startTime,
        endTime: endTime(startTime, durationMin),
        contactEmail: email.trim().toLowerCase(),
      });
      setReservationId(reservation.id);
      await refreshReservations();
      goToStep(4);
    } catch (err: any) {
      setError(err?.message ?? "예약에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("이 예약을 삭제하시겠습니까?")) return;
    setDeletingId(id);
    setError(null);
    try {
      await deleteReservation(id, email);
      await refreshReservations();
    } catch (err: any) {
      setError(err?.message ?? "예약 삭제에 실패했습니다.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteAll = async () => {
    if (!window.confirm("모든 예약을 삭제하시겠습니까?")) return;
    setLoading(true);
    setError(null);
    try {
      for (const reservation of myList) {
        await deleteReservation(reservation.id, email);
      }
      await refreshReservations();
    } catch (err: any) {
      setError(err?.message ?? "예약 삭제에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleReturnFromHistory = () => {
    if (plateVerified) {
      goToStep(3);
    } else {
      setError("차량 번호 확인을 먼저 진행해 주세요.");
      goToStep(2);
    }
  };

  const resetFlow = () => {
    setReservationId(null);
    handlePlateChange("");
    setEmail("");
    setPassword("");
    setToken(null);
    setStartTime(SLOTS[0]);
    setDurationMin(60);
    setSessionId(1);
    setDate(todayISO);
    setMyList([]);
    setPlateHistory([]);
    setPlateRegistered(null);
    setPlateVerified(false);
    setOccupiedSet(new Set());
    setStripData([]);
    closeScanner();
    goToStep(1);
  };

  const handleGoMyReservations = () => {
    goToStep(5);
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-gray-50 to-white flex justify-center items-start md:items-center p-4 md:py-8 overflow-y-auto">
      <div className="w-full max-w-4xl space-y-4">
        <Header loggedIn={!!token} onMyReservations={() => token && goToStep(5)} />
        <Stepper current={step} steps={STEP_ITEMS} />

        <motion.div layout className="space-y-4">
          {step === 1 && (
            <LoginPage
              email={email}
              password={password}
              onEmailChange={setEmail}
              onPasswordChange={setPassword}
              canSubmit={canNextFromLogin}
              loading={loading}
              error={error}
              onSubmit={handleLogin}
            />
          )}

          {step === 2 && (
            <PlateVerificationPage
              plate={plate}
              plateValid={plateValid}
              plateRegistered={plateRegistered}
              plateHistory={plateHistory}
              error={error}
              loading={loading}
              onPlateChange={handlePlateChange}
              onBack={() => goToStep(1)}
              onVerify={handleVerifyPlate}
              onOpenScanner={openScanner}
              onCloseScanner={closeScanner}
              onSnap={snapAndRecognize}
              scanOpen={scanOpen}
              videoRef={videoRef}
            />
          )}

          {step === 3 && (
            <SchedulePage
              sessionId={sessionId}
              onSessionChange={setSessionId}
              durationMin={durationMin}
              onDurationChange={setDurationMin}
              durationOptions={DURATION_OPTIONS}
              date={date}
              onDateChange={setDate}
              sessionOptions={SESSION_OPTIONS}
              occupiedSet={occupiedSet}
              slots={SLOTS}
              startTime={startTime}
              onStartTimeChange={setStartTime}
              estimatedPrice={estimatedPrice}
              plate={plate}
              error={error}
              loading={loading}
              onBack={() => goToStep(2)}
              onSubmit={handleReserve}
              onOpenHistory={handleGoMyReservations}
              availabilityLoading={availabilityLoading}
              availabilityStripe={stripData}
              dayEndMinutes={DAY_END_MINUTES}
            />
          )}

          {step === 4 && reservationId && (
            <ReservationResult
              reservationId={reservationId}
              plate={plate}
              sessionId={sessionId}
              date={date}
              startTime={startTime}
              durationMin={durationMin}
              estimatedPrice={estimatedPrice}
              onChangeSchedule={() => goToStep(3)}
              onGoMyReservations={handleGoMyReservations}
              onReset={resetFlow}
            />
          )}

          {step === 5 && (
            <MyReservationsPage
              reservations={sortedMyList}
              deletingId={deletingId}
              loading={loading}
              onBack={handleReturnFromHistory}
              onDelete={handleDelete}
              onDeleteAll={handleDeleteAll}
              error={error}
            />
          )}
        </motion.div>

        <footer className="text-center text-xs text-gray-500">
          © {new Date().getFullYear()} EV Wireless Charging · Demo UI v2
        </footer>
      </div>
    </div>
  );
}
