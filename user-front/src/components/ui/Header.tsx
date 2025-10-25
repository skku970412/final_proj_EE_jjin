import { History, Power } from "lucide-react";
import Button from "./Button";

interface HeaderProps {
  loggedIn: boolean;
  onMyReservations: () => void;
}

export default function Header({ loggedIn, onMyReservations }: HeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center shadow text-white">
          <Power className="w-5 h-5" />
        </div>
        <div>
          <div className="font-semibold text-lg">무선충전 예약</div>
          <div className="text-sm text-gray-500">차량번호 기반 스마트 예약 시스템</div>
        </div>
      </div>
      {loggedIn && (
        <div className="sm:self-end">
          <Button variant="ghost" onClick={onMyReservations}>
            <History className="w-4 h-4 mr-1" />
            내 예약
          </Button>
        </div>
      )}
    </div>
  );
}
