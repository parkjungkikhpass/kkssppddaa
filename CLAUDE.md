# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

**TubeGen AI** - AI 기반 영상 콘텐츠 자동 생성 플랫폼. 스크립트 생성부터 이미지, 오디오, 비디오 생성 및 자막까지 전체 파이프라인을 제공합니다.

## 주요 명령어

```bash
npm run dev      # 개발 서버 시작 (기본 포트 3000)
npm run build    # 프로덕션 빌드
npm run preview  # 빌드 결과 미리보기
```

## 기술 스택

- **프론트엔드**: React 19, TypeScript, Vite 6
- **AI API**: Google Gemini (@google/genai), ElevenLabs TTS, Fal.ai 비디오
- **저장소**: IndexedDB (대용량 데이터), localStorage (설정)
- **유틸리티**: jszip (ZIP 생성), file-saver (다운로드)

## 아키텍처

### 디렉토리 구조

```
├── App.tsx                 # 메인 앱 컴포넌트 (전체 상태 관리)
├── types.ts                # 핵심 타입 정의
├── config.ts               # 전역 설정 (배치/타임아웃/음성)
├── services/               # API 연동 서비스 계층
│   ├── geminiService.ts    # Gemini API (스크립트/이미지/TTS)
│   ├── elevenLabsService.ts# ElevenLabs TTS + 타임스탬프
│   ├── falService.ts       # Fal.ai 이미지→애니메이션
│   ├── videoService.ts     # 비디오 합성 (이미지+오디오→MP4)
│   ├── storageService.ts   # IndexedDB 저장소
│   ├── srtService.ts       # SRT 자막 생성
│   └── prompts.ts          # 프롬프트 템플릿
├── components/             # UI 컴포넌트
│   ├── Dashboard.tsx       # 프로젝트 목록 (Lazy)
│   ├── ProjectWizard.tsx   # 새 프로젝트 생성 (Lazy)
│   ├── AutopilotModal.tsx  # 자동 생성 모달 (Lazy)
│   ├── InputSection.tsx    # 입력 폼
│   ├── ResultTable.tsx     # 씬별 결과 테이블 (메모이제이션)
│   ├── ProjectCard.tsx     # 프로젝트 카드
│   └── Header.tsx          # 헤더
└── utils/                  # 유틸리티
    ├── batchProcessor.ts   # 배치 병렬 처리 + 재시도
    └── csvHelper.ts        # CSV 내보내기
```

### 데이터 흐름

```
1. 스크립트 생성
   ├─ 3000자 이하 → generateScript()
   └─ 3000자 초과 → generateScriptChunked() (청크 분할)
2. 배치 병렬 처리 (batchProcessor.ts)
   ├─ 이미지 생성 (2개씩) → generateImageForScene()
   └─ 오디오 생성 (3~5개씩) → generateAudioForScene() or ElevenLabs
3. 비디오 합성 → videoService.generateVideo()
4. 내보내기 → ZIP 또는 MP4
```

## 핵심 타입 (`types.ts`)

```typescript
interface GeneratedAsset {
  sceneNumber: number
  narration: string
  visualPrompt: string
  imageData: string | null      // Base64
  audioData: string | null      // Base64
  subtitleData: SubtitleData | null
  videoData: string | null      // 애니메이션 URL
  status: 'pending' | 'generating' | 'completed' | 'error'
}

interface Project {
  id: string
  title: string
  status: 'draft' | 'in_progress' | 'completed' | 'error'
  step: GenerationStep
}
```

## 설정 (`config.ts`)

### 배치 처리 설정
API Rate Limit 방지를 위한 배치 처리:
```typescript
BATCH_CONFIG = {
  GEMINI_TTS: { batchSize: 3, delay: 1000 },
  GEMINI_IMAGE: { batchSize: 2, delay: 2000 },
  ELEVENLABS_TTS: { batchSize: 5, delay: 500 },
  FAL_VIDEO: { batchSize: 1, delay: 1500 }
}
```

### 타임아웃 설정
```typescript
TIMEOUT_CONFIG = {
  TOTAL_GENERATION: 30 * 60 * 1000,  // 전체: 30분
  SCRIPT_GENERATION: 3 * 60 * 1000,  // 스크립트: 3분
  IMAGE_PER_SCENE: 60 * 1000,        // 이미지: 1분/씬
  AUDIO_PER_SCENE: 30 * 1000         // 오디오: 30초/씬
}
```

### 대용량 대본 설정
```typescript
LARGE_SCRIPT_CONFIG = {
  CHUNK_THRESHOLD: 3000,  // 3000자 초과 시 분할
  CHUNK_SIZE: 3000,       // 청크 크기
  CHUNK_DELAY: 2000       // 청크 간 딜레이
}
```

## 환경변수

`.env.local` 파일에 API 키 설정:
```bash
GEMINI_API_KEY=xxx           # Google Gemini API (필수)
VITE_ELEVENLABS_API_KEY=xxx  # ElevenLabs TTS (선택)
VITE_ELEVENLABS_VOICE_ID=xxx # ElevenLabs 음성 ID (선택)
```
※ Fal.ai 키는 UI에서 설정

## 주요 패턴

### 대용량 대본 처리 (geminiService.ts)
- `generateScriptChunked()`: 3000자 초과 대본을 문단→문장 단위로 분할
- `repairIncompleteJson()`: 토큰 제한으로 잘린 JSON 자동 복구
- `sanitizePrompt()`: 안전 필터 우회를 위한 키워드 대체

### 배치 처리 재시도 (utils/batchProcessor.ts)
- `processBatch()`: Promise.allSettled 기반 안전한 병렬 처리
- `processBatchWithRetry()`: 실패 항목 자동 2회 재시도
- 재시도 시 배치 크기 감소 + 딜레이 증가
- `shouldRetry` 함수로 재시도 불가 에러 구분

### 점진적 저장 (storageService.ts)
- `saveSceneData()`: 씬 완료 시 즉시 IndexedDB 저장
- 중간 오류 발생해도 이전 씬 보존
- IndexedDB 버전 2: 씬 단위 저장소 (`scene_data`) 추가

### 성능 최적화
- **디바운스 업데이트**: App.tsx의 `updateAssetAt()` - 50ms 배치로 리렌더링 감소
- **React.memo**: ResultTable.tsx의 AudioPlayer, SceneRow 메모이제이션
- **Lazy Loading**: Dashboard, ProjectWizard, AutopilotModal 지연 로딩
- **벤더 청크 분리**: vite.config.ts의 manualChunks 설정
- **HTTP 헤더 확장**: 대용량 Base64 전송을 위해 `--max-http-header-size` 설정

## 코딩 컨벤션

- 변수/함수: camelCase
- 컴포넌트: PascalCase
- 들여쓰기: 2칸
- `any` 타입 사용 금지
- 주석: 한국어 (비즈니스 로직만)
