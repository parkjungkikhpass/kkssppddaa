# TubeGen AI - 프로젝트 아키텍처 흐름도

> 이 문서는 프로젝트를 거의 복제할 수 있을 정도로 상세한 아키텍처와 흐름을 설명합니다.

---

## 📋 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [전체 시스템 아키텍처](#2-전체-시스템-아키텍처)
3. [상태 관리 구조](#3-상태-관리-구조)
4. [화면 흐름 (View Flow)](#4-화면-흐름-view-flow)
5. [콘텐츠 생성 파이프라인](#5-콘텐츠-생성-파이프라인)
6. [서비스 계층 상세](#6-서비스-계층-상세)
7. [데이터 흐름 상세](#7-데이터-흐름-상세)
8. [저장소 구조](#8-저장소-구조)
9. [핵심 타입 정의](#9-핵심-타입-정의)
10. [설정 시스템](#10-설정-시스템)
11. [에러 처리 및 재시도 전략](#11-에러-처리-및-재시도-전략)
12. [성능 최적화 기법](#12-성능-최적화-기법)

---

## 1. 프로젝트 개요

### 한 줄 요약
**TubeGen AI**는 AI 기반 영상 콘텐츠 자동 생성 플랫폼입니다. 텍스트 입력부터 최종 MP4 영상까지 전체 파이프라인을 자동화합니다.

### 핵심 기능
```
텍스트 입력 → 스크립트 생성 → 이미지 생성 → 오디오(TTS) 생성 → 비디오 합성 → MP4 내보내기
```

### 기술 스택
| 영역 | 기술 |
|------|------|
| 프론트엔드 | React 19, TypeScript, Vite 6 |
| AI (스크립트/이미지) | Google Gemini API (@google/genai) |
| AI (TTS) | Gemini TTS / ElevenLabs API |
| AI (영상 생성) | Fal.ai (PixVerse, Kling, Veo2 등) |
| 저장소 | IndexedDB (대용량), localStorage (설정) |
| 유틸리티 | jszip, file-saver |

---

## 2. 전체 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────────────┐
│                            App.tsx                                   │
│                     (메인 상태 관리 + 라우팅)                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │  Dashboard   │  │ProjectWizard │  │        Editor View        │   │
│  │  (프로젝트   │──│  (새 프로젝트│──│  ┌──────────────────────┐ │   │
│  │   목록)      │  │   설정)      │  │  │   InputSection       │ │   │
│  └──────────────┘  └──────────────┘  │  │   (입력 폼)          │ │   │
│                                       │  ├──────────────────────┤ │   │
│                                       │  │   ResultTable        │ │   │
│                                       │  │   (씬별 결과)        │ │   │
│                                       │  └──────────────────────┘ │   │
│                                       └──────────────────────────────┘│
├─────────────────────────────────────────────────────────────────────┤
│                         서비스 계층 (Services)                        │
│  ┌──────────┐ ┌───────────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │ gemini   │ │ elevenLabs    │ │  fal     │ │    video         │   │
│  │ Service  │ │ Service       │ │ Service  │ │   Service        │   │
│  │          │ │               │ │          │ │                  │   │
│  │•스크립트 │ │•고품질 TTS   │ │•이미지→  │ │•이미지+오디오   │   │
│  │•이미지   │ │•타임스탬프   │ │ 애니메이션│ │ →MP4            │   │
│  │•Gemini   │ │ 자막         │ │          │ │•자막 렌더링     │   │
│  │ TTS      │ │               │ │          │ │                  │   │
│  └──────────┘ └───────────────┘ └──────────┘ └──────────────────┘   │
│  ┌──────────┐ ┌───────────────┐ ┌────────────────────────────────┐  │
│  │ storage  │ │   prompts     │ │       srtService               │  │
│  │ Service  │ │               │ │                                │  │
│  │          │ │•프롬프트 템플릿│ │•SRT 자막 파일 생성            │  │
│  │•IndexedDB│ │•스타일 정의  │ │                                │  │
│  │•프로젝트 │ │•카테고리 정의│ │                                │  │
│  │ 저장/로드│ │               │ │                                │  │
│  └──────────┘ └───────────────┘ └────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────────┤
│                         유틸리티 (Utils)                             │
│  ┌──────────────────────┐  ┌────────────────────────────────────┐   │
│  │   batchProcessor     │  │         csvHelper                  │   │
│  │                      │  │                                    │   │
│  │•배치 병렬 처리       │  │•CSV 내보내기                      │   │
│  │•재시도 메커니즘      │  │                                    │   │
│  │•진행률 콜백          │  │                                    │   │
│  └──────────────────────┘  └────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────┤
│                         설정 (Config)                                │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ config.ts: BATCH_CONFIG, TIMEOUT_CONFIG, LARGE_SCRIPT_CONFIG  │ │
│  │            음성 목록, API 키 관리, 저장소 키                    │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. 상태 관리 구조

### App.tsx 핵심 상태

```typescript
// 뷰 상태
const [currentView, setCurrentView] = useState<AppView>('dashboard');  // 'dashboard' | 'wizard' | 'editor'
const [currentProject, setCurrentProject] = useState<Project | null>(null);

// 생성 상태
const [step, setStep] = useState<GenerationStep>(GenerationStep.IDLE);
const [generatedData, setGeneratedData] = useState<GeneratedAsset[]>([]);
const [progressMessage, setProgressMessage] = useState('');

// 오토파일럿 상태
const [isAutopilotRunning, setIsAutopilotRunning] = useState(false);
const [autopilotProgress, setAutopilotProgress] = useState<{
  step: string;
  message: string;
  percent: number;
}>({ step: '', message: '', percent: 0 });

// Refs (리렌더링 방지용)
const assetsRef = useRef<GeneratedAsset[]>([]);           // 실시간 에셋 데이터
const isAbortedRef = useRef(false);                        // 중단 플래그
const isProcessingRef = useRef(false);                     // 처리 중 플래그
const pendingUpdatesRef = useRef<Map<number, Partial<GeneratedAsset>>>(new Map());  // 배치 업데이트
const currentGenOptionsRef = useRef<GenerationOptions>({});  // 현재 생성 옵션

// Undo/Redo
const [undoStack, setUndoStack] = useState<GeneratedAsset[][]>([]);
const [redoStack, setRedoStack] = useState<GeneratedAsset[][]>([]);
```

### 상태 흐름 다이어그램

```
                    ┌────────────────────────────┐
                    │   GenerationStep.IDLE      │
                    │   (대기 상태)               │
                    └────────────┬───────────────┘
                                 │ handleGenerate() 호출
                                 ▼
                    ┌────────────────────────────┐
                    │  GenerationStep.SCRIPTING  │
                    │  (스크립트 생성 중)         │
                    │                            │
                    │  • findTrendingTopics()    │
                    │  • generateScript()        │
                    │  • generateScriptChunked() │
                    └────────────┬───────────────┘
                                 │ 스크립트 완료
                                 ▼
                    ┌────────────────────────────┐
                    │   GenerationStep.ASSETS    │
                    │   (에셋 생성 중)            │
                    │                            │
                    │  ┌─────────┐ ┌───────────┐ │
                    │  │오디오   │ │이미지     │ │
                    │  │생성    │ │생성      │ │
                    │  │(병렬)  │ │(병렬)    │ │
                    │  └────┬────┘ └─────┬─────┘ │
                    │       └──────┬──────┘      │
                    │              ▼             │
                    │       ┌───────────┐        │
                    │       │애니메이션│        │
                    │       │변환(선택)│        │
                    │       └───────────┘        │
                    └────────────┬───────────────┘
                                 │ 모든 에셋 완료
                                 ▼
                    ┌────────────────────────────┐
                    │  GenerationStep.COMPLETED  │
                    │  (완료)                     │
                    └────────────────────────────┘
```

---

## 4. 화면 흐름 (View Flow)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  ┌──────────────┐                                                       │
│  │  Dashboard   │◄──────────────────────────────────────────────────┐   │
│  │              │                                                    │   │
│  │ • 프로젝트   │                                                    │   │
│  │   목록 표시  │                                                    │   │
│  │ • 새 프로젝트│                                                    │   │
│  │   버튼       │                                                    │   │
│  │ • 오토파일럿│                                                    │   │
│  │   버튼       │                                                    │   │
│  └──────┬───────┘                                                    │   │
│         │                                                            │   │
│         │ 새 프로젝트 클릭                                           │   │
│         ▼                                                            │   │
│  ┌──────────────┐       handleGenerate() 호출       ┌──────────────┐│   │
│  │ProjectWizard │──────────────────────────────────►│   Editor     ││   │
│  │              │                                   │              ││   │
│  │ • 키워드 입력│                                   │ • 진행 상태  ││   │
│  │ • 대본 입력  │                                   │ • 결과 테이블││   │
│  │ • 카테고리   │                                   │ • 미리보기   ││   │
│  │ • 스타일     │                                   │ • 내보내기   ││   │
│  │ • TTS 설정   │                                   │              ││   │
│  │ • 비디오 모델│       handleBackToDashboard()     │              ││   │
│  │              │◄──────────────────────────────────│              ││   │
│  └──────────────┘                                   └──────────────┘│   │
│                                                                      │   │
│         │                                                            │   │
│         │ 기존 프로젝트 클릭                                         │   │
│         ▼                                                            │   │
│  ┌──────────────┐                                                    │   │
│  │   Editor     │────────────────────────────────────────────────────┘   │
│  │  (직접 이동) │                                                       │
│  └──────────────┘                                                       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### URL 해시 구조
```
#                          → Dashboard
#new-project               → ProjectWizard (새 프로젝트)
#project/{projectId}       → Editor (기존 프로젝트)
#edit-settings/{projectId} → ProjectWizard (설정 수정)
```

---

## 5. 콘텐츠 생성 파이프라인

### 전체 파이프라인 흐름

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              콘텐츠 생성 파이프라인                           │
└─────────────────────────────────────────────────────────────────────────────┘

[STEP 1] 입력 분석
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│   입력 유형 분석                                                             │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐            │
│   │ 키워드만 입력   │  │ 외부 텍스트     │  │ 수동 대본       │            │
│   │ (트렌드 검색)   │  │ (분석 모드)     │  │ (직접 입력)     │            │
│   └────────┬────────┘  └────────┬────────┘  └────────┬────────┘            │
│            │                    │                    │                      │
│            ▼                    ▼                    ▼                      │
│   findTrendingTopics()  주제 추출 분석       대본 직접 사용                  │
│            │                    │                    │                      │
│            └─────────────────┬──┴────────────────────┘                      │
│                              │                                              │
│                              ▼                                              │
│                       주제/대본 확정                                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
[STEP 2] 스크립트 생성
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│   대본 길이 확인                                                             │
│   ┌─────────────────────────┐  ┌─────────────────────────────────────────┐  │
│   │ 3000자 이하             │  │ 3000자 초과 (대용량)                    │  │
│   └────────────┬────────────┘  └────────────────┬────────────────────────┘  │
│                │                                 │                          │
│                ▼                                 ▼                          │
│       generateScript()               generateScriptChunked()                │
│       (단일 호출)                    (청크 분할 → 순차 처리)                │
│                │                                 │                          │
│                │                                 │ 청크별 2초 딜레이        │
│                │                     ┌───────────┴───────────┐              │
│                │                     │ 청크 1 → 청크 2 → ... │              │
│                │                     └───────────────────────┘              │
│                │                                 │                          │
│                └─────────────┬───────────────────┘                          │
│                              │                                              │
│                              ▼                                              │
│                     ScriptScene[] 배열                                       │
│                     (씬 번호, 나레이션, 비주얼 프롬프트)                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
[STEP 3] 에셋 생성 (병렬 처리)
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│           ┌────────────────────────┬────────────────────────┐               │
│           │                        │                        │               │
│           ▼                        ▼                        │               │
│   ┌───────────────┐      ┌───────────────┐                  │               │
│   │   오디오 생성  │      │   이미지 생성  │                  │               │
│   │               │      │               │                  │               │
│   │ 배치: 3~5개   │      │ 배치: 2개     │                  │               │
│   │ 딜레이: 0.5~1초│      │ 딜레이: 2초   │                  │               │
│   └───────┬───────┘      └───────┬───────┘                  │               │
│           │                      │                          │               │
│           ▼                      ▼                          │               │
│   ┌───────────────┐      ┌───────────────┐                  │               │
│   │ Gemini TTS    │      │ Gemini Pro    │                  │               │
│   │ 또는          │      │ Image         │                  │               │
│   │ ElevenLabs    │      │               │                  │               │
│   └───────────────┘      └───────────────┘                  │               │
│           │                      │                          │               │
│           │    ┌─────────────────┘                          │               │
│           │    │                                            │               │
│           ▼    ▼                                            │               │
│      완료된 씬마다 IndexedDB에 즉시 저장 (점진적 저장)        │               │
│                                                              │               │
│                        ┌──────────────────┐                 │               │
│                        │ 비디오 모델 선택됨│                 │               │
│                        │ (PixVerse 등)   │                 │               │
│                        └────────┬─────────┘                 │               │
│                                 │                           │               │
│                                 ▼                           │               │
│                        ┌───────────────┐                    │               │
│                        │ 애니메이션 변환│                    │               │
│                        │ (앞 N개 씬)   │                    │               │
│                        │               │                    │               │
│                        │ Fal.ai API    │                    │               │
│                        └───────────────┘                    │               │
│                                                              │               │
└─────────────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
[STEP 4] 비디오 합성 (내보내기 시)
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│   generateVideo() - videoService.ts                                         │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                                                                      │   │
│   │   1. 에셋 메모리 로딩                                                │   │
│   │      • 모든 이미지 → HTMLImageElement                               │   │
│   │      • 애니메이션 영상 → HTMLVideoElement                            │   │
│   │      • 오디오 → AudioBuffer (decodeAudio)                           │   │
│   │      • 자막 청크 계산                                                │   │
│   │                                                                      │   │
│   │   2. 타임라인 구축                                                   │   │
│   │      • 각 씬의 startTime, endTime 계산                               │   │
│   │      • 오디오 기준 (없으면 기본 3초)                                  │   │
│   │                                                                      │   │
│   │   3. 오디오 스케줄링 (Web Audio API)                                 │   │
│   │      • AudioContext.createBufferSource()                            │   │
│   │      • source.start(masterStartTime + scene.startTime)              │   │
│   │                                                                      │   │
│   │   4. 캔버스 렌더링 루프 (requestAnimationFrame)                       │   │
│   │      • 현재 오디오 시간에 맞는 씬 찾기                                │   │
│   │      • 이미지/영상 프레임 렌더링                                      │   │
│   │      • 줌 효과 적용 (Ken Burns)                                     │   │
│   │      • 자막 오버레이 렌더링                                          │   │
│   │                                                                      │   │
│   │   5. MediaRecorder로 MP4/WebM 녹화                                   │   │
│   │      • 12Mbps 비트레이트                                             │   │
│   │      • 1280x720 해상도                                               │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
[STEP 5] 결과물
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│   │    MP4     │  │    ZIP      │  │    SRT      │  │  IndexedDB  │       │
│   │   영상     │  │   (이미지+  │  │   자막      │  │   저장      │       │
│   │            │  │    오디오)  │  │            │  │            │       │
│   └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. 서비스 계층 상세

### 6.1 geminiService.ts

```typescript
// 주요 함수 및 역할

/**
 * 트렌드 검색
 * @param category - 카테고리 (경제, 기술 등)
 * @param usedTopics - 이미 사용한 주제 목록 (중복 방지)
 * @returns 4개의 트렌드 주제 배열
 */
findTrendingTopics(category, usedTopics)
  → Gemini 3 Flash + Google Search 도구
  → JSON 응답 파싱

/**
 * 스크립트 생성
 * @param topic - 주제
 * @param hasReferenceImage - 레퍼런스 이미지 유무
 * @param sourceContext - 원본 대본 텍스트
 * @param category - 카테고리
 * @returns ScriptScene[] 배열
 */
generateScript(topic, hasReferenceImage, sourceContext, category)
  → Gemini 3 Pro (thinkingBudget: 32768)
  → JSON 응답 → cleanJsonResponse() → 파싱

/**
 * 대용량 대본 청크 분할 처리
 * @param topic - 주제
 * @param sourceContext - 전체 대본 (3000자 초과)
 * @param hasReferenceImage - 레퍼런스 이미지 유무
 * @param category - 카테고리
 * @returns ScriptScene[] (모든 청크 합친 결과)
 */
generateScriptChunked(topic, sourceContext, hasReferenceImage, category)
  → 문단 → 문장 단위로 분할
  → 각 청크 generateScript() 호출
  → 씬 번호 재정렬

/**
 * 이미지 생성
 * @param scene - 씬 정보 (visualPrompt, analysis 포함)
 * @param referenceImages - 레퍼런스 이미지 배열
 * @param aspectRatio - 화면 비율 (16:9)
 * @param style - 스타일 타입
 * @param ... - 기타 옵션들
 * @returns Base64 이미지 데이터
 */
generateImageForScene(scene, referenceImages, aspectRatio, style, ...)
  → Gemini 3 Pro Image
  → sanitizePrompt() - 안전 필터 우회
  → 최대 3회 키워드 대체 시도

/**
 * TTS 생성
 * @param text - 나레이션 텍스트
 * @param voiceName - 음성 이름 (Kore, Aoede 등)
 * @returns Base64 오디오 데이터
 */
generateAudioForScene(text, voiceName)
  → Gemini 2.5 Flash TTS
  → PCM 24kHz 오디오

/**
 * 움직임 프롬프트 생성 (애니메이션용)
 */
generateMotionPrompt(narration, visualPrompt)
  → Gemini 2.0 Flash
  → 영문 움직임 설명 생성

/**
 * 자막 의미 단위 분리
 */
splitSubtitleByMeaning(narration, maxChars)
  → AI가 자연스러운 끊김점 분석
  → 22자 이하 청크로 분리
```

### 6.2 elevenLabsService.ts

```typescript
/**
 * ElevenLabs TTS + 타임스탬프
 * @param text - 나레이션 텍스트
 * @param apiKey - API 키
 * @param voiceId - 음성 ID
 * @returns { audioData, subtitleData, estimatedDuration }
 */
generateAudioWithElevenLabs(text, apiKey, voiceId)
  → /v1/text-to-speech/{voiceId}/with-timestamps
  → 문자 단위 타임스탬프 → 단어 단위로 변환
  → AI 의미 단위 분리 (splitSubtitleByMeaning)

// 반환 데이터 구조
interface ElevenLabsResult {
  audioData: string | null;        // Base64 MP3
  subtitleData: SubtitleData | null;  // 단어별 타이밍
  estimatedDuration: number | null;   // 오디오 길이 (초)
}
```

### 6.3 falService.ts

```typescript
/**
 * 이미지 → 영상 변환
 * @param imageBase64 - Base64 이미지
 * @param motionPrompt - 움직임 프롬프트
 * @param apiKey - Fal.ai API 키
 * @param modelId - 비디오 모델 (pixverse, kling, veo2 등)
 * @returns 영상 URL
 */
generateVideoFromImage(imageBase64, motionPrompt, apiKey, modelId)
  → 이미지 업로드 (Fal.ai Storage)
  → 모델별 엔드포인트 호출
  → 영상 URL 반환

// 지원 모델
VIDEO_MODEL_LIST = [
  { id: 'pixverse', endpoint: 'fal-ai/pixverse/v5.5/image-to-video', duration: '5초' },
  { id: 'ltx', endpoint: 'fal-ai/ltx-video/image-to-video', duration: '5초' },
  { id: 'wan', endpoint: 'fal-ai/wan-i2v', duration: '5초' },
  { id: 'kling', endpoint: 'fal-ai/kling-video/v1.5/pro/image-to-video', duration: '5~10초' },
  { id: 'veo2', endpoint: 'fal-ai/veo2/image-to-video', duration: '8초' },
]
```

### 6.4 videoService.ts

```typescript
/**
 * 최종 영상 생성
 * @param assets - GeneratedAsset[] 배열
 * @param onProgress - 진행률 콜백
 * @param abortRef - 중단 플래그
 * @param options - 옵션 (자막, 줌 효과, 오디오)
 * @returns { videoBlob, recordedSubtitles }
 */
generateVideo(assets, onProgress, abortRef, options)

// 내부 처리 흐름
1. 모든 에셋 메모리 로딩
   - 이미지 → HTMLImageElement
   - 영상 → HTMLVideoElement (loop: true)
   - 오디오 → AudioBuffer (decodeAudio)

2. 타임라인 계산
   - 각 씬의 startTime, endTime
   - 오디오 없으면 기본 3초

3. 자막 청크 생성
   - AI meaningChunks 우선 사용
   - 없으면 단어 수 기반 폴백

4. 캔버스 렌더링 (1280x720, 30fps)
   - 이미지/영상 프레임
   - Ken Burns 줌 효과
   - 자막 오버레이

5. MediaRecorder로 녹화
   - 12Mbps 비트레이트
   - MP4 또는 WebM
```

### 6.5 storageService.ts

```typescript
// IndexedDB 구조
DB_NAME: 'tubegen_db'
DB_VERSION: 2

스토어:
  - projects: 프로젝트 메타데이터 (id, title, status, step, ...)
  - project_data: 프로젝트 전체 에셋 데이터
  - scene_data: 씬 단위 개별 저장 (점진적 저장용)

// 주요 함수
loadProjects()           → 모든 프로젝트 목록
saveProject(project)     → 프로젝트 메타 저장
deleteProject(id)        → 프로젝트 삭제
saveProjectData(id, assets)  → 프로젝트 에셋 전체 저장
loadProjectData(id)      → 프로젝트 에셋 로드

// 점진적 저장 (V2)
saveSceneData(projectId, sceneIndex, sceneData)  → 개별 씬 즉시 저장
loadSceneDataByProject(projectId)  → 씬별 데이터 로드
saveSceneDataBatch(projectId, scenes)  → 여러 씬 일괄 저장

// 마이그레이션
migrateFromLocalStorage()  → localStorage → IndexedDB 이전
```

---

## 7. 데이터 흐름 상세

### 7.1 스크립트 생성 흐름

```
사용자 입력
    │
    ▼
┌────────────────────────────────────────────────────────────────┐
│  handleGenerate() in App.tsx                                   │
│                                                                │
│  1. isProcessingRef.current = true                            │
│  2. currentGenOptionsRef.current = { ... }                    │
│  3. setStep(GenerationStep.SCRIPTING)                         │
└────────────────────────────────────────────────────────────────┘
    │
    ▼
┌────────────────────────────────────────────────────────────────┐
│  주제 결정                                                      │
│                                                                │
│  if (topic === "Manual Script Input" && sourceText)           │
│      → 대본 분석 모드                                          │
│  else if (sourceText)                                          │
│      → 외부 텍스트 분석 모드                                    │
│  else                                                          │
│      → findTrendingTopics() 호출                               │
│      → 트렌드 주제 선택                                         │
└────────────────────────────────────────────────────────────────┘
    │
    ▼
┌────────────────────────────────────────────────────────────────┐
│  스크립트 생성                                                  │
│                                                                │
│  if (sourceText.length > 3000)                                 │
│      → generateScriptChunked()                                 │
│  else                                                          │
│      → generateScript()                                        │
│                                                                │
│  결과: ScriptScene[] 배열                                       │
│    ┌──────────────────────────────────────────────────────┐   │
│    │ {                                                    │   │
│    │   sceneNumber: 1,                                    │   │
│    │   narration: "나레이션 텍스트",                       │   │
│    │   visualPrompt: "영문 이미지 프롬프트",               │   │
│    │   analysis: {                                        │   │
│    │     sentiment: "POSITIVE" | "NEGATIVE" | "NEUTRAL",  │   │
│    │     composition_type: "MICRO" | "STANDARD" | ...     │   │
│    │   }                                                  │   │
│    │ }                                                    │   │
│    └──────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
    │
    ▼
┌────────────────────────────────────────────────────────────────┐
│  GeneratedAsset[] 초기화                                        │
│                                                                │
│  const initialAssets = scriptScenes.map(scene => ({           │
│    ...scene,                                                   │
│    imageData: null,                                            │
│    audioData: null,                                            │
│    audioDuration: null,                                        │
│    subtitleData: null,                                         │
│    videoData: null,                                            │
│    videoDuration: null,                                        │
│    status: 'pending'                                           │
│  }));                                                          │
│                                                                │
│  assetsRef.current = initialAssets;                            │
│  setGeneratedData(initialAssets);                              │
│  setStep(GenerationStep.ASSETS);                               │
└────────────────────────────────────────────────────────────────┘
```

### 7.2 에셋 생성 흐름

```
┌────────────────────────────────────────────────────────────────┐
│  에셋 생성 시작                                                  │
│                                                                │
│  Promise.all([runAudio(), runImages()])                        │
└────────────────────────────────────────────────────────────────┘
        │                              │
        ▼                              ▼
┌──────────────────────┐    ┌──────────────────────┐
│     runAudio()       │    │     runImages()      │
│                      │    │                      │
│  processIndexBatch({ │    │  processIndexBatch({ │
│    count: N,         │    │    count: N,         │
│    batchSize: 3~5,   │    │    batchSize: 2,     │
│    delay: 500~1000,  │    │    delay: 2000,      │
│    processFn: ...    │    │    processFn: ...    │
│  })                  │    │  })                  │
└──────────────────────┘    └──────────────────────┘
        │                              │
        ▼                              ▼
┌──────────────────────┐    ┌──────────────────────┐
│ TTS 엔진 선택        │    │ 이미지 생성          │
│                      │    │                      │
│ if (elevenlabs)      │    │ generateImageForScene│
│   → ElevenLabs API   │    │   ↓                  │
│   → 타임스탬프 자막  │    │ 재시도 로직 (2회)    │
│ else                 │    │   ↓                  │
│   → Gemini TTS       │    │ sanitizePrompt()     │
│                      │    │ (안전 필터 우회)     │
└──────────────────────┘    └──────────────────────┘
        │                              │
        ▼                              ▼
┌──────────────────────────────────────────────────┐
│            updateAssetAt(index, updates)          │
│                                                  │
│  1. assetsRef.current[index] = { ...updates }   │
│  2. pendingUpdatesRef.current.set(index, ...)   │
│  3. 점진적 저장: saveSceneData() (status=completed면)│
│  4. 디바운스 50ms 후 setGeneratedData()          │
└──────────────────────────────────────────────────┘
        │
        ▼ (비디오 모델 선택된 경우)
┌──────────────────────────────────────────────────┐
│            runAnimations()                        │
│                                                  │
│  for (i = 0; i < ANIMATION.ENABLED_SCENES; i++) │
│    1. generateMotionPrompt() - 움직임 분석       │
│    2. generateVideoFromImage() - Fal.ai 호출    │
│    3. updateAssetAt(i, { videoData, videoDuration }) │
│    4. 1.5초 딜레이                               │
└──────────────────────────────────────────────────┘
```

---

## 8. 저장소 구조

### IndexedDB 스키마

```
┌─────────────────────────────────────────────────────────────────────┐
│                       IndexedDB: tubegen_db                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  ObjectStore: projects                                       │    │
│  │  KeyPath: id                                                 │    │
│  │  Indexes: updatedAt, status                                  │    │
│  │                                                               │    │
│  │  레코드 구조:                                                  │    │
│  │  {                                                            │    │
│  │    id: "proj_1234567890_abc123",                             │    │
│  │    title: "프로젝트 제목",                                     │    │
│  │    status: "draft" | "in_progress" | "completed" | "error",  │    │
│  │    step: GenerationStep,                                      │    │
│  │    currentStepNumber: 0~6,                                    │    │
│  │    totalSteps: 6,                                             │    │
│  │    createdAt: timestamp,                                      │    │
│  │    updatedAt: timestamp,                                      │    │
│  │    thumbnail: "base64...",                                    │    │
│  │    category: "economy" | "tech" | ...,                       │    │
│  │    style: "default" | "minimal" | ...,                       │    │
│  │    ttsEngine: "gemini" | "elevenlabs",                       │    │
│  │    scenesCount: number                                        │    │
│  │  }                                                            │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  ObjectStore: project_data                                   │    │
│  │  KeyPath: projectId                                          │    │
│  │                                                               │    │
│  │  레코드 구조:                                                  │    │
│  │  {                                                            │    │
│  │    projectId: "proj_xxx",                                     │    │
│  │    data: GeneratedAsset[],  // 전체 씬 데이터                 │    │
│  │    savedAt: timestamp                                         │    │
│  │  }                                                            │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  ObjectStore: scene_data (V2 추가)                           │    │
│  │  KeyPath: [projectId, sceneIndex]  // 복합 키                │    │
│  │  Indexes: projectId                                          │    │
│  │                                                               │    │
│  │  레코드 구조:                                                  │    │
│  │  {                                                            │    │
│  │    projectId: "proj_xxx",                                     │    │
│  │    sceneIndex: 0,                                             │    │
│  │    data: GeneratedAsset,  // 개별 씬 데이터                   │    │
│  │    savedAt: timestamp                                         │    │
│  │  }                                                            │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### localStorage 구조

```
┌─────────────────────────────────────────────────────────────────────┐
│                           localStorage                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  API 키 및 설정:                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  tubegen_el_key      → ElevenLabs API 키                    │    │
│  │  tubegen_el_voice    → ElevenLabs 음성 ID                   │    │
│  │  tubegen_fal_key     → Fal.ai API 키                        │    │
│  │  tubegen_fal_model   → 선택된 비디오 모델                   │    │
│  │  tubegen_gemini_voice→ Gemini TTS 음성                      │    │
│  │  tubegen_tts_engine  → TTS 엔진 선택                        │    │
│  │  tubegen_zoom_effect → 줌 효과 설정                         │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 9. 핵심 타입 정의

```typescript
// types.ts

// 씬 분석 정보 (AI가 생성)
interface SceneAnalysis {
  composition_type: 'MICRO' | 'STANDARD' | 'MACRO';
  sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  camera: {
    view: string;
    distance: string;
    angle: string;
  };
  composition_setup: {
    main_element: string;
    character_positioning: string;
  };
  visual_metaphor: {
    concept: string;
    object: string;
    interaction: string;
  };
}

// 스크립트 씬 (스크립트 생성 결과)
interface ScriptScene {
  sceneNumber: number;
  narration: string;
  visualPrompt: string;
  analysis?: SceneAnalysis;
}

// 자막 단어
interface SubtitleWord {
  word: string;
  start: number;  // 초
  end: number;    // 초
}

// AI 의미 단위 청크
interface MeaningChunk {
  text: string;
  startTime: number;
  endTime: number;
}

// 자막 데이터
interface SubtitleData {
  words: SubtitleWord[];
  fullText: string;
  meaningChunks?: MeaningChunk[];
}

// 생성된 에셋 (실제 작업 데이터)
interface GeneratedAsset extends ScriptScene {
  imageData: string | null;       // Base64 이미지
  audioData: string | null;       // Base64 오디오
  audioDuration: number | null;   // 오디오 길이 (초)
  subtitleData: SubtitleData | null;
  videoData: string | null;       // 애니메이션 URL
  videoDuration: number | null;
  status: 'pending' | 'generating' | 'completed' | 'error';
}

// 생성 단계
enum GenerationStep {
  IDLE = 'IDLE',
  SCRIPTING = 'SCRIPTING',
  ASSETS = 'ASSETS',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

// 프로젝트
interface Project {
  id: string;
  title: string;
  description?: string;
  status: 'draft' | 'in_progress' | 'completed' | 'error';
  step: GenerationStep;
  currentStepNumber: number;
  totalSteps: number;
  createdAt: number;
  updatedAt: number;
  thumbnail?: string;
  category?: string;
  style?: string;
  ttsEngine?: 'gemini' | 'elevenlabs';
  scenesCount: number;
}
```

---

## 10. 설정 시스템

### config.ts 구조

```typescript
// TTS 엔진 타입
type TtsEngineType = 'gemini' | 'elevenlabs';

// 환경변수
const ENV_CONFIG = {
  ELEVENLABS_API_KEY: import.meta.env.VITE_ELEVENLABS_API_KEY || '',
  ELEVENLABS_VOICE_ID: import.meta.env.VITE_ELEVENLABS_VOICE_ID || '',
};

// 배치 처리 설정
const BATCH_CONFIG = {
  GEMINI_TTS:     { batchSize: 3, delay: 1000 },   // 3개씩, 1초 대기
  GEMINI_IMAGE:   { batchSize: 2, delay: 2000 },   // 2개씩, 2초 대기
  ELEVENLABS_TTS: { batchSize: 5, delay: 500 },    // 5개씩, 0.5초 대기
  FAL_VIDEO:      { batchSize: 1, delay: 1500 },   // 1개씩, 1.5초 대기
};

// 타임아웃 설정
const TIMEOUT_CONFIG = {
  TOTAL_GENERATION: 30 * 60 * 1000,  // 전체: 30분
  SCRIPT_GENERATION: 3 * 60 * 1000,  // 스크립트: 3분
  IMAGE_PER_SCENE: 60 * 1000,        // 이미지: 1분
  AUDIO_PER_SCENE: 30 * 1000,        // 오디오: 30초
};

// 대용량 대본 설정
const LARGE_SCRIPT_CONFIG = {
  CHUNK_THRESHOLD: 3000,  // 3000자 초과 시 분할
  CHUNK_SIZE: 3000,       // 청크 크기
  CHUNK_DELAY: 2000,      // 청크 간 딜레이 (2초)
};

// 기본 설정
const CONFIG = {
  DEFAULT_VOICE_ID: "sSoVF9lUgTGJz0Xz3J9y",  // ElevenLabs Jina
  DEFAULT_GEMINI_VOICE: "kore",
  VIDEO_WIDTH: 1280,
  VIDEO_HEIGHT: 720,
  ANIMATION: {
    ENABLED_SCENES: 10,   // 앞 10개 씬만 애니메이션
    VIDEO_DURATION: 5     // 5초 영상
  }
};
```

---

## 11. 에러 처리 및 재시도 전략

### 재시도 메커니즘 (batchProcessor.ts)

```typescript
// 기본 배치 처리
processBatch({
  items: T[],
  batchSize: number,
  delayBetweenBatches: number,
  processFn: (item, index) => Promise<R>,
  onProgress?: (completed, total) => void,
  shouldAbort?: () => boolean
}) → BatchResult<R>

// 재시도 포함 배치 처리
processBatchWithRetry({
  ...BatchProcessOptions,
  retryConfig: {
    maxRetries: 2,              // 최대 2회 재시도
    retryDelay: 3000,           // 3초 대기 후 재시도
    shouldRetry: (error) => boolean  // 재시도 가능 여부 판단
  }
}) → BatchResultWithRetry<R>
```

### 에러 처리 흐름

```
┌────────────────────────────────────────────────────────────────┐
│                        API 호출 실패                            │
└────────────────────────────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────────────────────────────┐
│  에러 유형 분석                                                  │
│                                                                │
│  if (429 Quota Error)                                          │
│      → retryGeminiRequest() - 지수 백오프 재시도               │
│                                                                │
│  if (Safety Filter / Content Policy)                           │
│      → sanitizePrompt() - 대체 키워드로 재시도 (최대 3회)      │
│                                                                │
│  if (API Key Invalid)                                          │
│      → 재시도 불가, 사용자에게 알림                             │
│                                                                │
│  else                                                          │
│      → processBatchWithRetry() - 자동 재시도                   │
└────────────────────────────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────────────────────────────┐
│  재시도 실패 시                                                  │
│                                                                │
│  • updateAssetAt(index, { status: 'error' })                  │
│  • 점진적 저장으로 이전 성공 데이터는 보존                       │
│  • 사용자가 개별 씬 재생성 가능                                  │
└────────────────────────────────────────────────────────────────┘
```

---

## 12. 성능 최적화 기법

### 12.1 디바운스 업데이트

```typescript
// App.tsx - updateAssetAt()

const pendingUpdatesRef = useRef<Map<number, Partial<GeneratedAsset>>>(new Map());
const updateTimerRef = useRef<NodeJS.Timeout | null>(null);

const updateAssetAt = (index, updates) => {
  // 1. Ref에 즉시 반영 (다른 함수가 최신 데이터 참조 가능)
  assetsRef.current[index] = { ...assetsRef.current[index], ...updates };

  // 2. 펜딩 업데이트에 추가
  pendingUpdatesRef.current.set(index, updates);

  // 3. 디바운스: 50ms 내 여러 업데이트를 모아서 한 번에 setState
  if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
  updateTimerRef.current = setTimeout(() => {
    setGeneratedData([...assetsRef.current]);
    pendingUpdatesRef.current.clear();
  }, 50);
};
```

### 12.2 Lazy Loading

```typescript
// App.tsx

// 큰 컴포넌트들은 lazy loading
const Dashboard = lazy(() => import('./components/Dashboard'));
const AutopilotModal = lazy(() => import('./components/AutopilotModal'));
const ProjectWizard = lazy(() => import('./components/ProjectWizard'));

// Suspense로 감싸기
<Suspense fallback={<LoadingSpinner />}>
  <Dashboard ... />
</Suspense>
```

### 12.3 React.memo 메모이제이션

```typescript
// ResultTable.tsx

const AudioPlayer = React.memo(({ audioData }) => {
  // 오디오 재생 컴포넌트
});

const SceneRow = React.memo(({ asset, index, ... }) => {
  // 개별 씬 행 컴포넌트
});
```

### 12.4 벤더 청크 분리

```typescript
// vite.config.ts

build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'vendor-react': ['react', 'react-dom'],
        'vendor-google': ['@google/genai'],
        'vendor-utils': ['jszip', 'file-saver'],
      }
    }
  }
}
```

### 12.5 HTTP 헤더 확장

```bash
# package.json scripts

"dev": "NODE_OPTIONS='--max-http-header-size=16777216' vite"
```

---

## 부록: 프로젝트 복제 체크리스트

### 필수 파일 구조
```
├── App.tsx                 # 메인 컴포넌트
├── types.ts                # 타입 정의
├── config.ts               # 설정
├── index.tsx               # 진입점
├── index.html              # HTML 템플릿
├── vite.config.ts          # Vite 설정
├── tsconfig.json           # TypeScript 설정
├── package.json            # 의존성
├── .env.local              # 환경변수 (API 키)
├── services/
│   ├── geminiService.ts    # Gemini API
│   ├── elevenLabsService.ts# ElevenLabs API
│   ├── falService.ts       # Fal.ai API
│   ├── videoService.ts     # 비디오 합성
│   ├── storageService.ts   # IndexedDB
│   ├── prompts.ts          # 프롬프트 템플릿
│   └── srtService.ts       # SRT 생성
├── components/
│   ├── Dashboard.tsx       # 대시보드
│   ├── ProjectWizard.tsx   # 프로젝트 설정
│   ├── InputSection.tsx    # 입력 폼
│   ├── ResultTable.tsx     # 결과 테이블
│   ├── ProjectCard.tsx     # 프로젝트 카드
│   ├── AutopilotModal.tsx  # 오토파일럿
│   └── Header.tsx          # 헤더
└── utils/
    ├── batchProcessor.ts   # 배치 처리
    └── csvHelper.ts        # CSV 유틸
```

### 환경변수 설정
```bash
# .env.local
GEMINI_API_KEY=your_gemini_api_key
VITE_ELEVENLABS_API_KEY=your_elevenlabs_key (선택)
VITE_ELEVENLABS_VOICE_ID=your_voice_id (선택)
```

### 주요 의존성
```json
{
  "dependencies": {
    "react": "^19.2.3",
    "react-dom": "^19.2.3",
    "@google/genai": "^1.33.0",
    "jszip": "3.10.1",
    "file-saver": "2.0.5"
  },
  "devDependencies": {
    "typescript": "~5.8.2",
    "vite": "^6.2.0",
    "@vitejs/plugin-react": "^5.0.0"
  }
}
```

---

*이 문서는 TubeGen AI 프로젝트의 전체 아키텍처를 설명합니다. 프로젝트 복제 또는 유사 시스템 개발 시 참고하세요.*
