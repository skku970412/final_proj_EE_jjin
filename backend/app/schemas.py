from __future__ import annotations

from datetime import date, datetime, time
from typing import Optional

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
    date: Optional[date] = None
    start_time: Optional[time] = Field(None, alias="startTime")
    end_time: Optional[time] = Field(None, alias="endTime")

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


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
