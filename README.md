# EV Wireless Charging Demo

React 기반의 사용자/관리자 웹 프런트와 FastAPI 백엔드로 구성된 무선 충전 예약 데모 프로젝트입니다.  
백엔드에서 기본 예약 세션과 예약 데이터를 관리하며, 두 개의 Vite 프런트엔드(`user-front`, `admin-front`)가 REST API를 통해 동작합니다.

## 디렉터리 구조

```
.
├─ backend/        # FastAPI + SQLAlchemy + SQLite
├─ user-front/     # 이용자 예약 화면 (React + Vite)
├─ admin-front/    # 관리자 대시보드 (React + Vite)
├─ setup.(sh|ps1)  # 의존성 설치 자동화 스크립트
└─ run.(sh|ps1)    # 백엔드 · 프런트 개발 서버 실행 스크립트
```

## 사전 준비물

- Node.js 18 이상 (npm 포함)
- Python 3.10 이상
- PowerShell 또는 Bash (운영체제에 맞게 선택)

## 설치

### 자동 설치

프로젝트 루트에서 아래 명령을 실행하면 가상환경 생성, 백엔드 패키지 설치, 두 프런트엔드 `npm install`이 한 번에 진행됩니다.

- macOS/Linux:
  ```bash
  ./setup.sh
  ```
- Windows (PowerShell):
  ```powershell
  .\setup.ps1
  ```

### 수동 설치 (선택)

1. Python 가상환경 생성 및 활성화
   ```bash
   python -m venv .venv
   source .venv/bin/activate          # Windows: .venv\Scripts\activate
   pip install -r backend/requirements.txt
   ```
2. 프런트엔드 의존성 설치
   ```bash
   cd user-front && npm install
   cd ../admin-front && npm install
   ```

## 실행

### 자동 실행 스크립트

프로젝트 루트에서 다음 명령을 실행하면 FastAPI 백엔드(포트 8000)와 두 개의 Vite 개발 서버가 동시에 뜹니다.

- macOS/Linux:
  ```bash
  ./run.sh
  ```
- Windows (PowerShell):
  ```powershell
  .\run.ps1
  ```

첫 실행 시 포트가 중복되면 Vite가 자동으로 5173, 5174 등의 빈 포트를 선택합니다.  
웹 브라우저에서 `http://localhost:5173/`(사용자)와 자동 할당된 관리자 포트를 확인하세요.

### 수동 실행 (선택)

1. 백엔드
   ```bash
   source .venv/bin/activate                     # Windows: .venv\Scripts\activate
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
- SQLite 파일: `ev_charging.db` (최초 실행 시 자동 생성)
- 관리자 로그인 기본 계정: `admin@demo.dev` / `admin123`
- CORS 허용 도메인, 세션 자동 생성 등은 `backend/app/config.py` 환경 변수로 조정할 수 있습니다.

필요 시 `run.sh`/`run.ps1` 종료 전에 열린 프로세스를 종료해 주십시오. 문제가 생기면 가상환경을 다시 활성화하고 `uvicorn`, `npm run dev`를 개별로 실행하여 로그를 확인하세요.
