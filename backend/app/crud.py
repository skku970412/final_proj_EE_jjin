from __future__ import annotations

from datetime import date, datetime
from typing import Iterable, Optional

from sqlalchemy import and_, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .models import ChargingSession, Reservation, ReservationStatus


def _lock_session(session: Session, *, session_id: int) -> None:
    """
    Acquire a row-level lock for the target charging session so that concurrent
    reservations on the same session serialize properly.
    """
    stmt = (
        select(ChargingSession.id)
        .where(ChargingSession.id == session_id)
        .with_for_update()
    )
    session.scalars(stmt).first()


def normalize_plate(plate: str) -> str:
    return "".join(plate.split()).upper()


def ensure_base_sessions(session: Session, *, names: Iterable[str]) -> None:
    names_tuple = tuple(names)
    existing_count = session.scalar(select(func.count()).select_from(ChargingSession))
    if existing_count and existing_count >= len(names_tuple):
        return

    for idx, name in enumerate(names_tuple, start=1):
        if session.get(ChargingSession, idx) is None:
            session.add(ChargingSession(id=idx, name=name))
    session.commit()


def list_sessions(session: Session) -> list[ChargingSession]:
    return session.scalars(select(ChargingSession).order_by(ChargingSession.id)).all()


def reservations_by_date(session: Session, *, date_value: date) -> list[Reservation]:
    start = datetime.combine(date_value, datetime.min.time())
    end = datetime.combine(date_value, datetime.max.time())
    stmt = (
        select(Reservation)
        .where(and_(Reservation.start_time >= start, Reservation.start_time <= end))
        .order_by(Reservation.start_time)
    )
    return session.scalars(stmt).all()


def reservations_by_session_and_date(
    session: Session, *, session_id: int, date_value: date
) -> list[Reservation]:
    start = datetime.combine(date_value, datetime.min.time())
    end = datetime.combine(date_value, datetime.max.time())
    stmt = (
        select(Reservation)
        .where(
            and_(
                Reservation.session_id == session_id,
                Reservation.start_time >= start,
                Reservation.start_time <= end,
            )
        )
        .order_by(Reservation.start_time)
    )
    return session.scalars(stmt).all()


def create_reservation(
    session: Session,
    *,
    session_id: int,
    plate: str,
    start_time: datetime,
    end_time: datetime,
    contact_email: str | None = None,
) -> Reservation:
    # Prevent concurrent reservation creation on the same session.
    _lock_session(session, session_id=session_id)

    normalized_plate = normalize_plate(plate)
    ensure_no_overlap(session, session_id=session_id, start=start_time, end=end_time)
    ensure_no_conflict_for_plate(session, plate=normalized_plate, start=start_time, end=end_time)

    reservation = Reservation(
        session_id=session_id,
        plate=plate.strip(),
        plate_normalized=normalized_plate,
        start_time=start_time,
        end_time=end_time,
        status=ReservationStatus.CONFIRMED,
        contact_email=(contact_email.strip().lower() if contact_email else None),
    )
    session.add(reservation)
    try:
        session.flush()
    except IntegrityError as exc:
        session.rollback()
        raise ValueError("예약을 생성할 수 없습니다. 동일 시간대에 예약이 존재합니다.") from exc
    return reservation


def ensure_no_overlap(
    session: Session,
    *,
    session_id: int,
    start: datetime,
    end: datetime,
) -> None:
    overlap_stmt = (
        select(Reservation)
        .where(
            and_(
                Reservation.session_id == session_id,
                Reservation.status != ReservationStatus.CANCELLED,
                Reservation.start_time < end,
                Reservation.end_time > start,
            )
        )
        .with_for_update()
    )
    conflict = session.scalars(overlap_stmt).first()
    if conflict:
        raise ValueError("해당 세션과 시간에 이미 예약이 존재합니다.")


def ensure_no_conflict_for_plate(
    session: Session,
    *,
    plate: str,
    start: datetime,
    end: datetime,
) -> None:
    stmt = (
        select(Reservation)
        .where(
            and_(
                Reservation.plate_normalized == plate,
                Reservation.status != ReservationStatus.CANCELLED,
                Reservation.start_time < end,
                Reservation.end_time > start,
            )
        )
        .with_for_update()
    )
    conflict = session.scalars(stmt).first()
    if conflict:
        raise ValueError("해당 차량은 다른 시간대에 이미 예약되어 있습니다.")


def find_conflicting_plate_reservation(
    session: Session,
    *,
    plate: str,
    start: Optional[datetime],
    end: Optional[datetime],
) -> Optional[Reservation]:
    normalized_plate = normalize_plate(plate)
    stmt = select(Reservation).where(Reservation.plate_normalized == normalized_plate)
    if start and end:
        stmt = stmt.where(
            and_(
                Reservation.status != ReservationStatus.CANCELLED,
                Reservation.start_time < end,
                Reservation.end_time > start,
            )
        )
    stmt = stmt.order_by(Reservation.start_time.desc())
    return session.scalars(stmt).first()


def delete_reservation(session: Session, reservation_id: str) -> bool:
    reservation = session.get(Reservation, reservation_id)
    if not reservation:
        return False
    session.delete(reservation)
    return True


def reservations_for_user(
    session: Session,
    *,
    email: str | None = None,
    plate: str | None = None,
) -> list[Reservation]:
    if not email and not plate:
        raise ValueError("email 또는 plate 중 하나는 반드시 제공해야 합니다.")

    stmt = select(Reservation).order_by(Reservation.start_time.desc())
    conditions = []
    if email:
        conditions.append(func.lower(Reservation.contact_email) == email.lower())
    if plate:
        conditions.append(Reservation.plate_normalized == normalize_plate(plate))
    if conditions:
        stmt = stmt.where(and_(*conditions))
    return session.scalars(stmt).all()


def delete_reservation_for_user(
    session: Session,
    *,
    reservation_id: str,
    email: str | None = None,
    plate: str | None = None,
) -> bool:
    if not email and not plate:
        raise ValueError("email 또는 plate 중 하나는 반드시 제공해야 합니다.")

    stmt = select(Reservation).where(Reservation.id == reservation_id)
    if email:
        stmt = stmt.where(func.lower(Reservation.contact_email) == email.lower())
    if plate:
        stmt = stmt.where(Reservation.plate_normalized == normalize_plate(plate))

    reservation = session.scalars(stmt).first()
    if reservation is None:
        return False
    session.delete(reservation)
    return True
