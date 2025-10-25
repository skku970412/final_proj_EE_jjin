import { Activity, Calendar, PlugZap, RefreshCcw, Trash2 } from "lucide-react";
import Button from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import ErrorBar from "../components/ui/ErrorBar";
import MetricCard from "../components/ui/MetricCard";
import ProgressBar from "../components/ui/ProgressBar";
import Toggle from "../components/ui/Toggle";
import type { Reservation, SessionReservations } from "../api/types";
import { fromMinutes, slotsOfDay, toMinutes } from "../utils/time";

interface DashboardPageProps {
  date: string;
  onDateChange: (value: string) => void;
  autoRefresh: boolean;
  onToggleAutoRefresh: (value: boolean) => void;
  onRefresh: () => void;
  loading: boolean;
  sessions: SessionReservations[];
  deletingId: string | null;
  onDeleteReservation: (id: string) => void;
  lastUpdatedAt: Date | null;
  kpi: { totalRes: number; inProgress: number; utilization: number };
  error: string | null;
}

export default function DashboardPage({
  date,
  onDateChange,
  autoRefresh,
  onToggleAutoRefresh,
  onRefresh,
  loading,
  sessions,
  deletingId,
  onDeleteReservation,
  lastUpdatedAt,
  kpi,
  error,
}: DashboardPageProps) {
  return (
    <div className="grid gap-4">
      <Card>
        <div className="p-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-indigo-600" />
            <input
              className="rounded-xl border border-gray-200 px-4 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
              type="date"
              value={date}
              onChange={(event) => onDateChange(event.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Toggle
              checked={autoRefresh}
              onChange={onToggleAutoRefresh}
              label="15초마다 자동 새로고침"
            />
            <Button onClick={onRefresh} disabled={loading}>
              <RefreshCcw className="w-4 h-4 mr-1" />
              {loading ? "새로고침 중..." : "새로고침"}
            </Button>
          </div>
        </div>
      </Card>

      {error && <ErrorBar msg={error} />}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard icon={<ListDot />} title="일일 예약 건수" value={`${kpi.totalRes.toLocaleString()} 건`} />
        <MetricCard
          icon={<Activity className="w-5 h-5" />}
          title="진행 중인 예약"
          value={`${kpi.inProgress} 건`}
        />
        <MetricCard
          icon={<PlugZap className="w-5 h-5" />}
          title="평균 이용률"
          value={`${kpi.utilization}%`}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sessions.map((session) => (
          <SessionCard
            key={session.sessionId}
            data={session}
            onDelete={onDeleteReservation}
            deletingId={deletingId}
          />
        ))}
        {sessions.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-300 p-6 text-center text-gray-500">
            조회된 예약이 없습니다.
          </div>
        )}
      </div>

      <div className="text-xs text-gray-500 text-right">
        {lastUpdatedAt ? `업데이트: ${lastUpdatedAt.toLocaleString("ko-KR")}` : "업데이트 기록 없음"}
      </div>
    </div>
  );
}

interface SessionCardProps {
  data: SessionReservations;
  onDelete: (id: string) => void;
  deletingId: string | null;
}

function SessionCard({ data, onDelete, deletingId }: SessionCardProps) {
  const timeSlots = slotsOfDay();
  const avgSlotsPerReservation = 1.7;
  const occupiedSlots = data.reservations.length * avgSlotsPerReservation;
  const utilization = Math.min(
    100,
    Math.round((occupiedSlots / (timeSlots.length * 1)) * 100)
  );
  const congestion =
    utilization >= 67
      ? { label: "혼잡", cls: "bg-rose-100 text-rose-700" }
      : utilization >= 34
      ? { label: "보통", cls: "bg-amber-100 text-amber-700" }
      : { label: "여유", cls: "bg-emerald-100 text-emerald-700" };

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const active = data.reservations.filter((reservation) => {
    const start = toMinutes(reservation.startTime);
    const end = toMinutes(reservation.endTime);
    return nowMin >= start && nowMin < end;
  });
  const nextUp = [...data.reservations]
    .filter((reservation) => toMinutes(reservation.startTime) >= nowMin)
    .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime))[0];

  const current = active[0];
  const totalMin = current ? toMinutes(current.endTime) - toMinutes(current.startTime) : 0;
  const elapsed = current ? nowMin - toMinutes(current.startTime) : 0;
  const remainMin = Math.max(0, totalMin - elapsed);
  const progressPct =
    current && totalMin > 0 ? Math.min(100, Math.max(0, Math.round((elapsed / totalMin) * 100))) : 0;

  return (
    <Card>
      <div className="p-4 border-b flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center">
            <PlugZap className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold">{data.name}</div>
            <div className="text-xs text-gray-500 flex items-center gap-2">
              이용률 {utilization}% · 진행 중 {active.length}건
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${congestion.cls}`}>
                {congestion.label}
              </span>
            </div>
          </div>
        </div>
        <div className="w-40">
          <ProgressBar percent={utilization} />
        </div>
      </div>

      <div className="p-4 space-y-3 text-sm">
        {current && (
          <div className="rounded-xl bg-indigo-50 p-3">
            <div className="flex items-center justify-between">
              <div className="font-medium">
                진행 중 {current.startTime}~{current.endTime} · {current.plate}
              </div>
              <div className="text-xs text-indigo-700">잔여 {remainMin}분</div>
            </div>
            <div className="mt-2">
              <ProgressBar percent={progressPct} />
            </div>
          </div>
        )}

        <div className="rounded-xl bg-gray-50 p-3">
          {nextUp ? (
            <div className="flex items-center justify-between">
              <div>
                <div className="text-gray-500">다음 예약</div>
                <div className="font-medium">
                  {nextUp.startTime}~{nextUp.endTime} · {nextUp.plate}
                </div>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full ${badgeColor(nextUp.status)}`}>
                {nextUp.status}
              </span>
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
                <th className="text-left p-3">차량 번호</th>
                <th className="text-left p-3 w-32">이메일</th>
                <th className="text-left p-3 w-28">상태</th>
                <th className="text-left p-3 w-32">예약 ID</th>
                <th className="text-left p-3 w-20">관리</th>
              </tr>
            </thead>
            <tbody>
              {data.reservations.length === 0 && (
                <tr>
                  <td className="p-3 text-gray-500" colSpan={6}>
                    예약이 없습니다.
                  </td>
                </tr>
              )}
              {data.reservations.map((reservation) => (
                <tr key={reservation.id} className="border-t">
                  <td className="p-3 whitespace-nowrap">
                    {reservation.startTime}~{reservation.endTime}
                  </td>
                  <td className="p-3 font-medium">{reservation.plate}</td>
                  <td className="p-3 text-gray-500">{reservation.contactEmail ?? "-"}</td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${badgeColor(reservation.status)}`}>
                      {reservation.status}
                    </span>
                  </td>
                  <td className="p-3 text-gray-500">{reservation.id}</td>
                  <td className="p-3">
                    <button
                      onClick={() => onDelete(reservation.id)}
                      disabled={deletingId === reservation.id}
                      className="rounded px-2 py-1 text-xs border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50 inline-flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      {deletingId === reservation.id ? "삭제 중..." : "삭제"}
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
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="5" cy="6" r="1.5" />
      <line x1="9" y1="6" x2="20" y2="6" />
      <circle cx="5" cy="12" r="1.5" />
      <line x1="9" y1="12" x2="20" y2="12" />
      <circle cx="5" cy="18" r="1.5" />
      <line x1="9" y1="18" x2="20" y2="18" />
    </svg>
  );
}
