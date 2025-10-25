import { ChevronLeft, History, Power, QrCode } from "lucide-react";
import Button from "../components/ui/Button";
import { Card, CardHeader } from "../components/ui/Card";
import InfoRow from "../components/ui/InfoRow";

interface ReservationResultProps {
  reservationId: string;
  plate: string;
  sessionId: number;
  date: string;
  startTime: string;
  durationMin: number;
  estimatedPrice: number;
  onChangeSchedule: () => void;
  onGoMyReservations: () => void;
  onReset: () => void;
}

export default function ReservationResult({
  reservationId,
  plate,
  sessionId,
  date,
  startTime,
  durationMin,
  estimatedPrice,
  onChangeSchedule,
  onGoMyReservations,
  onReset,
}: ReservationResultProps) {
  return (
    <Card>
      <CardHeader
        icon={<Power className="w-5 h-5 text-emerald-600" />}
        title="예약이 완료되었습니다."
        subtitle="예약 정보는 아래 내용을 참고해 주세요."
      />
      <div className="p-6 grid gap-4">
        <div className="rounded-2xl border border-gray-200 p-4">
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <InfoRow label="예약 ID" value={reservationId} />
            <InfoRow label="차량 번호" value={plate} />
            <InfoRow label="세션" value={`세션 ${sessionId}`} />
            <InfoRow label="예약 일정" value={`${date} ${startTime} · ${durationMin}분`} />
            <InfoRow label="예상 요금" value={`${estimatedPrice.toLocaleString()}원`} />
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
        <div className="rounded-2xl bg-gray-50 p-4 flex items-center gap-3 text-sm text-gray-600">
          <QrCode className="w-8 h-8" />
          예약 QR 코드는 현장에서 차량 인식용으로 활용됩니다.
        </div>
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={onChangeSchedule}>
            <ChevronLeft className="w-4 h-4 mr-1" />
            시간 다시 선택
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onGoMyReservations}>
              <History className="w-4 h-4 mr-1" />
              내 예약 보기
            </Button>
            <Button onClick={onReset}>새 예약</Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
