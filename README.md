# EV 무선충전 예약 데모

FastAPI 백엔드와 두 개의 React(Vite) 프런트엔드가 동작하는 무선충전 예약 시스템입니다.  
`user-front`는 사용자용 예약 플로우를, `admin-front`는 관리자용 모니터링/제어 화면을 제공합니다.

## 주요 기능

- 예약 슬롯을 30분 단위로 관리하여 중복 예약을 방지
- 전체 시간 계산을 UTC 기반으로 처리하고, 프런트에서는 비즈니스 타임존(기본 Asia/Seoul)으로 변환
- 사용자/관리자 UI를 페이지·컴포넌트·API 모듈로 분리하여 유지보수가 용이
- 사진/QR 기반 번호판 스캔(데모용 Mock) 및 예약 현황 시각화

## 디렉터리 구조

```
.
├── backend/          # FastAPI + SQLAlchemy + SQLite
├── user-front/       # 사용자용 프런트엔드 (React + Vite)
├── admin-front/      # 관리자용 프런트엔드 (React + Vite)
├── run.(sh|ps1)      # 백엔드/프런트 dev 서버 동시 실행 스크립트
└── setup.(sh|ps1)    # 의존성 설치 및 초기 환경 구성 스크립트
```

## 사전 준비물

- Node.js 18 이상 (npm 포함)
- Python 3.10 이상
- PowerShell 또는 Bash (운영체제에 맞게 선택)

## 설치

### 전체 자동 설치
루트 디렉터리에서 아래 명령 중 하나를 실행하면 가상환경 생성, 백엔드 패키지 설치, 두 프런트엔드의 `npm install`이 한 번에 진행됩니다.

- macOS / Linux
  ```bash
  ./setup.sh
  ```
- Windows (PowerShell)
  ```powershell
  .\setup.ps1
  ```

### 수동 설치 (선택 사항)

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
FastAPI 백엔드(기본 8000번 포트)와 두 개의 Vite 개발 서버를 동시에 실행합니다.

- macOS / Linux
  ```bash
  ./run.sh
  ```
- Windows (PowerShell)
  ```powershell
  .\run.ps1
  ```

> 이미 포트를 사용 중이면 Vite가 5173, 5174 등 인접 포트를 자동 선택합니다.  
> 브라우저에서 `http://localhost:5173/`(사용자)와 `http://localhost:5174/`(관리자)로 접속하세요.

### 개별 실행 (선택)

1. 백엔드
   ```bash
   source .venv/bin/activate          # Windows: .venv\Scripts\activate
   uvicorn backend.app.main:create_app --factory --reload --host 0.0.0.0 --port 8000
   ```
2. 사용자 프런트
   ```bash
   cd user-front
   npm run dev -- --host
   ```
3. 관리자 프런트
   ```bash
   cd admin-front
   npm run dev -- --host --port 5174
   ```

## 기본 정보

- 백엔드 기본 URL: `http://localhost:8000`
- SQLite DB 파일: `data/ev_charging.db` (최초 실행 시 자동 생성)
- 관리자 기본 계정: `admin@demo.dev / admin123`
- CORS, 타임존 등 런타임 설정은 `backend/app/config.py`에서 환경 변수로 관리합니다.

## 모듈 구조 요약

### 사용자 프런트 (`user-front/src`)

- `api/` : REST 호출 모듈 (`client.ts`, `types.ts`)
- `components/` : UI 컴포넌트와 폼 요소
- `pages/` : 로그인, 번호판 확인, 이용 시간 선택, 결과, 내 예약 페이지
- `utils/` : 시간 계산(`time.ts`), 번호판 정규식(`validation.ts`)

### 관리자 프런트 (`admin-front/src`)

- `api/` : 관리자 API 클라이언트
- `components/` : 공용 카드, 버튼, 토글, 메트릭 카드 등
- `pages/` : 로그인 페이지와 대시보드(세션·예약 현황)
- `utils/` : 시간/슬롯 계산 공통 함수

## 기타 참고

- `npm run build`(각 프런트)로 타입 검사와 프로덕션 번들을 확인할 수 있습니다.
- 백엔드와 프런트 모두 UTF-8 인코딩을 사용하며, 한글 UI가 깨지는 경우 IDE 저장 인코딩을 확인하세요.
- 문제 발생 시 `uvicorn`, `npm run dev`를 개별로 실행해 로그를 확인하면 디버깅에 도움이 됩니다.

---

필요한 기능이나 문서가 추가되면 README를 업데이트해 주세요. PR 또는 이슈를 통해 제안도 환영합니다!
