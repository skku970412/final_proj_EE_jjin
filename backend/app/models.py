from __future__ import annotations

from datetime import datetime
from enum import Enum
from uuid import uuid4

from sqlalchemy import (
    Column,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class ReservationStatus(str, Enum):
    CONFIRMED = "CONFIRMED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class ChargingSession(Base):
    __tablename__ = "charging_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False, unique=True)

    reservations = relationship("Reservation", back_populates="session", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"ChargingSession(id={self.id!r}, name={self.name!r})"


class Reservation(Base):
    __tablename__ = "reservations"
    __table_args__ = (
        UniqueConstraint("session_id", "start_time", name="uq_reservation_session_start"),
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    session_id = Column(Integer, ForeignKey("charging_sessions.id"), nullable=False, index=True)
    plate = Column(String(32), nullable=False, index=True)
    plate_normalized = Column(String(32), nullable=False, index=True)
    start_time = Column(DateTime(timezone=False), nullable=False, index=True)
    end_time = Column(DateTime(timezone=False), nullable=False, index=True)
    status = Column(SAEnum(ReservationStatus, name="reservation_status"), nullable=False, default=ReservationStatus.CONFIRMED)
    contact_email = Column(String(255), nullable=True, index=True)
    created_at = Column(DateTime(timezone=False), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=False), nullable=False, server_default=func.now(), onupdate=func.now())

    session = relationship("ChargingSession", back_populates="reservations")

    def __repr__(self) -> str:
        return (
            f"Reservation(id={self.id!r}, session_id={self.session_id!r}, plate={self.plate!r}, "
            f"start_time={self.start_time!r}, end_time={self.end_time!r}, status={self.status!r}, "
            f"contact_email={self.contact_email!r})"
        )

    @property
    def derived_status(self) -> ReservationStatus:
        now = datetime.now()
        if self.status == ReservationStatus.CANCELLED:
            return ReservationStatus.CANCELLED
        if now < self.start_time:
            return ReservationStatus.CONFIRMED
        if self.start_time <= now < self.end_time:
            return ReservationStatus.IN_PROGRESS
        return ReservationStatus.COMPLETED
