# EV 무선충전 예약 데모

FastAPI 백엔드와 두 개의 React(Vite) 프런트엔드로 구성된 무선충전 예약 데모 프로젝트입니다. `user-front`는 사용자 예약 UI, `admin-front`는 관리자 모니터링/제어 화면을 제공합니다.

## 주요 기능

- 예약 슬롯을 30분 단위로 관리해 중복 예약을 예방
- 전체 시간 계산은 UTC 기반으로 처리하고, 프런트엔드에는 비즈니스 타임존(기본 Asia/Seoul)으로 변환
- 번호판 인식(주문형/Mock) 결과를 이용한 예약 상태 파악

## 디렉터리 구조

```
.
├── backend/          # FastAPI + SQLAlchemy + SQLite
├── user-front/       # 사용자용 프런트엔드 (React + Vite)
├── admin-front/      # 관리자용 프런트엔드 (React + Vite)
├── run.(sh|ps1)      # 백엔드/프런트 통합 dev 서버 실행 스크립트
└── setup.(sh|ps1)    # 공용 의존성 설치 및 초기 환경 구성 스크립트
```

## 사전 준비물

- Node.js 18 이상 (npm 포함)
- Python 3.10 이상
- PowerShell 또는 Bash(운영체제에 맞게 선택)

## 설치

### 전체 자동 설치
루트 디렉터리에서 아래 명령 중 하나를 실행하면 가상환경 생성, 백엔드 패키지 설치, 프런트엔드 `npm install`이 한 번에 진행됩니다.

- macOS / Linux
  ```bash
  ./setup.sh
  ```
- Windows (PowerShell)
  ```powershell
  .\setup.ps1
  ```

### 수동 설치(선택)

1. Python 가상환경 구성
   ```bash
   python -m venv .venv
   # Windows: .venv\Scripts\activate
   source .venv/bin/activate
   pip install -r backend/requirements.txt
   ```
2. 프런트엔드 의존성 설치
   ```bash
   cd user-front && npm install
   cd ../admin-front && npm install
   ```

## 실행

### 통합 실행 스크립트
FastAPI 백엔드(기본 8000포트)와 두 개의 Vite 개발 서버가 동시에 실행됩니다.

- macOS / Linux
  ```bash
  ./run.sh
  ```
- Windows (PowerShell)
  ```powershell
  .\run.ps1
  ```

> 기본적으로 Vite가 5173(user) / 5174(admin)을 사용합니다. 브라우저에서 `http://localhost:5173/` 및 `http://localhost:5174/`로 접속하세요.

### 개별 실행(선택)

1. 백엔드
   ```bash
   source .venv/bin/activate          # Windows: .venv\Scripts\activate
   uvicorn backend.app.main:create_app --factory --reload --host 0.0.0.0 --port 8000
   ```
2. 사용자 프런트엔드
   ```bash
   cd user-front
   npm run dev -- --host
   ```
3. 관리자 프런트엔드
   ```bash
   cd admin-front
   npm run dev -- --host --port 5174
   ```

## 기본 정보

- 백엔드 기본 URL: `http://localhost:8000`
- SQLite DB 파일: `data/ev_charging.db` (최초 실행 시 자동 생성)
- 관리자 기본 계정: `admin@demo.dev / admin123`
- CORS, 비즈니스 타임존 등은 `backend/app/config.py`에서 환경 변수로 설정

## 모듈 개요

### 사용자 프런트(`user-front/src`)
- `api/` : REST 호출 모듈 (`client.ts`, `types.ts`)
- `components/` : UI 컴포넌트와 폼 요소
- `pages/` : 로그인, 번호판 확인, 시간 선택, 결과, 예약 조회 페이지
- `utils/` : 시간 계산(`time.ts`), 번호판 유효성 검사(`validation.ts`)

### 관리자 프런트(`admin-front/src`)
- `api/` : 관리자 API 클라이언트
- `components/` : 공용 UI(카드, 버튼, 지표 등)
- `pages/` : 로그인, 통합 대시보드/세션별 예약 현황
- `utils/` : 시간/슬롯 계산 공통 함수

## 참고

- `npm run build`로 프런트엔드 프로덕션 번들을 생성할 수 있습니다.
- 백엔드 및 프런트 모두 UTF-8 인코딩을 사용합니다.
- 문제 발생 시 `uvicorn`, `npm run dev`를 개별로 실행해 로그를 확인하면 디버깅에 도움이 됩니다.

---

필요한 기능이나 문서가 추가되면 README를 업데이트해주세요. PR 또는 이슈를 통해 제안/반영합니다.

## 카메라 캡처 워커

Firebase 실시간 DB 신호(`/signals/car_on_parkinglot`)를 감지해 C270 HD 웹캠으로 차량 사진을 촬영하고 파일로 저장한 뒤, AI 번호판 인식 서비스 및 백엔드 매칭 API와 연동하는 스크립트가 `camera-capture/main.py`에 포함돼 있습니다.

```powershell
.\.venv\Scripts\activate
cd camera-capture
python main.py --credentials <서비스계정.json> --database-url https://<project>.firebaseio.com
```

- `--recognition-url` / `--recognition-timeout`: AI 서비스 엔드포인트 및 타임아웃
- `--timestamp-path` / `--match-path`: Firebase에서 타임스탬프/매칭 결과를 읽고 쓰는 경로(기본 `/signals/timestamp`, `/signals/car_plate_same`)
- `--match-url` / `--match-timeout`: 백엔드 `/api/plates/match` 호출 정보
- `--report-dir`: JSON 리포트 저장 디렉터리(기본 `camera-capture/reports`)
- `--continuous`, `--cycle-interval`: 서비스처럼 연속 실행할 때 사용
- `--skip-firebase`: Firebase 없이 로컬 테스트 수행

`run.ps1`과 함께 워커를 띄우려면 환경 변수 `RUN_CAMERA_WORKER=1`과 워커 인자를 담은 `CAMERA_WORKER_ARGS`(예: `--credentials ... --database-url ... --recognition-url ...`)를 설정한 뒤 `.un.ps1`을 실행하면 됩니다. CLI 인자를 주지 않으면 워커는 실행되지 않습니다.

필요 패키지(`firebase-admin`, `opencv-python`, `pygrabber`, `requests`)는 `backend/requirements.txt`에 포함되어 있어 `pip install -r backend/requirements.txt`로 한 번에 설치할 수 있습니다.
