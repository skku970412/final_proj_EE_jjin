from __future__ import annotations

import datetime as dt
from datetime import date, datetime, time
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .models import ReservationStatus


class ReservationCreate(BaseModel):
    session_id: int = Field(..., alias="sessionId")
    plate: str
    date: date
    start_time: time = Field(..., alias="startTime")
    end_time: time = Field(..., alias="endTime")
    contact_email: str | None = Field(None, alias="contactEmail")

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

    @field_validator("plate")
    @classmethod
    def validate_plate(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 5:
            raise ValueError("차량 번호가 너무 짧습니다.")
        return normalized

    @field_validator("contact_email")
    @classmethod
    def normalize_email(cls, value: str | None) -> str | None:
        if value is None:
            return None
        email = value.strip()
        if not email:
            return None
        return email.lower()

    @field_validator("date", mode="before")
    @classmethod
    def parse_date(cls, value: Any) -> date:
        if isinstance(value, date):
            return value
        if isinstance(value, str):
            return datetime.strptime(value, "%Y-%m-%d").date()
        raise ValueError("유효한 날짜 형식이 아닙니다.")

    @field_validator("start_time", "end_time", mode="before")
    @classmethod
    def parse_time(cls, value: Any) -> time:
        if isinstance(value, time):
            return value
        if isinstance(value, str):
            return datetime.strptime(value, "%H:%M").time()
        raise ValueError("유효한 시간 형식이 아닙니다.")


class ReservationPublic(BaseModel):
    id: str
    session_id: int = Field(..., alias="sessionId")
    plate: str
    date: date
    start_time: time = Field(..., alias="startTime")
    end_time: time = Field(..., alias="endTime")
    status: ReservationStatus
    contact_email: str | None = Field(None, alias="contactEmail")

    model_config = ConfigDict(
        populate_by_name=True,
        json_encoders={
            date: lambda value: value.isoformat(),
            time: lambda value: value.strftime("%H:%M"),
        },
    )


class SessionReservations(BaseModel):
    session_id: int = Field(..., alias="sessionId")
    name: str
    reservations: list[ReservationPublic]

    model_config = ConfigDict(populate_by_name=True)


class SessionsResponse(BaseModel):
    sessions: list[SessionReservations]


class ReservationDeleteResponse(BaseModel):
    ok: bool = True


class PlateVerificationRequest(BaseModel):
    plate: str
    session_id: Optional[int] = Field(None, alias="sessionId")
    date: Optional[dt.date] = None
    start_time: Optional[time] = Field(None, alias="startTime")
    end_time: Optional[time] = Field(None, alias="endTime")

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

    @field_validator("date", mode="before")
    @classmethod
    def parse_date(cls, value: Any) -> Optional[date]:
        if value in (None, ""):
            return None
        if isinstance(value, date):
            return value
        if isinstance(value, str):
            return datetime.strptime(value, "%Y-%m-%d").date()
        raise ValueError("유효한 날짜 형식이 아닙니다.")

    @field_validator("start_time", "end_time", mode="before")
    @classmethod
    def parse_time(cls, value: Any) -> Optional[time]:
        if value in (None, ""):
            return None
        if isinstance(value, time):
            return value
        if isinstance(value, str):
            return datetime.strptime(value, "%H:%M").time()
        raise ValueError("유효한 시간 형식이 아닙니다.")


class PlateVerificationResponse(BaseModel):
    valid: bool
    conflict: bool = False
    message: str
    conflictingReservation: Optional[ReservationPublic] = None


class AdminLoginRequest(BaseModel):
    email: str
    password: str

    model_config = ConfigDict(str_strip_whitespace=True)


class AdminLoginResponse(BaseModel):
    token: str
    admin: dict[str, str]


class UserLoginRequest(BaseModel):
    email: str
    password: str

    model_config = ConfigDict(str_strip_whitespace=True)


class UserLoginResponse(BaseModel):
    token: str
    user: dict[str, str]
