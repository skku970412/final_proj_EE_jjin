# EV Wireless Charging – Demo (User + Admin)

두 개의 프론트를 **분리 폴더**로 구성했습니다.

```
ev-wireless-charging-demo/
├─ user-front/   # 유저 앱 (예약/번호판/가시화/내역)
└─ admin-front/  # 관리자 앱 (세션별 현황/혼잡도/삭제)
```

## 공통 개발 환경
- React + TypeScript + Vite
- TailwindCSS
- framer-motion, lucide-react

## 프론트엔드 API 구성
- `admin-front`는 백엔드 REST API(`POST /api/admin/login`, `GET/DELETE /api/admin/reservations/...`)와 연동합니다.
- 기본 API 주소는 `http://localhost:8000`이며, 필요 시 각 프론트 폴더에 `.env` 파일을 만들고 `VITE_API_BASE`를 원하는 URL로 지정하세요.

## 설치 & 실행

### 1) 유저 프론트
```bash
cd user-front
npm i
npm run dev
```
> 현재 `src/App.tsx`는 스텁입니다. 캔버스에 있는 “유저 프론트 (예약 가시화+내역)” 코드를 `src/App.tsx`에 붙여넣으면 그대로 동작합니다.

### 2) 관리자 프론트
```bash
cd ../admin-front
npm i
npm run dev
```

## 빌드
각 앱 폴더에서:
```bash
npm run build && npm run preview
```

## 스크립트 자동화
- `./setup.sh` : 루트에서 실행하면 Python 가상환경(`.venv`)을 만들고 두 프론트의 `npm install`을 자동으로 수행합니다.
- `./run.sh` : `.venv` 생성 및 의존성 설치까지 자동 처리한 뒤 `admin-front`, `user-front`, FastAPI 백엔드를 동시에 띄웁니다. 종료 시 모든 프로세스를 정리합니다.
- Windows PowerShell 환경이라면 `.\setup.ps1`, `.\run.ps1`를 동일한 용도로 사용할 수 있습니다. 필요 시 `powershell -ExecutionPolicy Bypass -File .\run.ps1` 처럼 실행하세요.

## 백엔드 (FastAPI)
- 경로: `backend/app`, SQLite 데이터베이스는 루트의 `ev_charging.db` 파일에 저장됩니다.
- 기본 엔드포인트
  - `POST /api/reservations` : 예약 생성
  - `GET /api/reservations/by-session?date=YYYY-MM-DD` : 날짜별 세션 현황
  - `POST /api/plates/verify` : 차량번호 중복 확인
  - `POST /api/user/login` : 사용자 로그인 토큰 발급 (데모용 단순 인증)
  - `GET /api/reservations/my?email=` : 사용자 예약 조회
  - `DELETE /api/reservations/{id}?email=` : 사용자 예약 삭제
  - `POST /api/admin/login` : 관리자 토큰 발급 (`admin@demo.dev` / `admin123`)
  - `DELETE /api/admin/reservations/{id}` : 관리자 예약 삭제 (Bearer 토큰 필요)
- 환경 변수
  - `DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_TOKEN`으로 인증/DB 설정을 조정할 수 있습니다.
  - `AUTO_SEED_SESSIONS=1`을 지정하면 서버 기동 시 기본 세션(1~4번)을 자동으로 생성합니다. 기본값은 `0`입니다.
  - 프론트엔드 개발 서버와 통신하려면 `CORS_ORIGINS`에 `http://localhost:5173` 등 허용 도메인을 콤마로 나열하세요.
- 기본 세션을 초기화하려면 (한 번만 실행)
  ```bash
  source .venv/bin/activate     # Windows: .venv\Scripts\activate
  python backend/seed_sessions.py --count 4
  ```
- 직접 실행하려면:
  ```bash
  source .venv/bin/activate     # Windows: .venv\Scripts\activate
  uvicorn backend.app:app --reload --host 0.0.0.0 --port 8000
  ```

## 백엔드 연동 포인트
- 유저: `api.createReservation`, `api.listReservationsBySession`, `api.verifyPlate`, `api.deleteReservation`
- 관리자: `api.listReservationsBySession`, `api.deleteReservation`
엔드포인트/인증 헤더만 교체하면 UI는 그대로 동작합니다.
