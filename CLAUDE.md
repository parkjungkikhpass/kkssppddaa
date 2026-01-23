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

### 서비스 계층 (`services/`)

| 서비스 | 역할 |
|--------|------|
| `geminiService.ts` | Gemini API - 스크립트, 이미지, TTS, 트렌드 검색 |
| `elevenLabsService.ts` | ElevenLabs API - 고품질 TTS + 타임스탬프 자막 |
| `videoService.ts` | 비디오 합성 - 이미지+오디오 → MP4, 자막 렌더링 |
| `falService.ts` | Fal.ai API - 이미지→애니메이션 변환 (PixVerse, Kling 등) |
| `storageService.ts` | IndexedDB 저장 - 프로젝트 데이터 관리 |
| `prompts.ts` | 프롬프트 템플릿 - 카테고리, 스타일, 비주얼 생성 |
| `srtService.ts` | SRT 자막 파일 생성 |

### 컴포넌트 (`components/`)

| 컴포넌트 | 역할 |
|----------|------|
| `ProjectWizard.tsx` | 프로젝트 생성/편집 마법사 (가장 큰 컴포넌트) |
| `Dashboard.tsx` | 프로젝트 목록 관리 |
| `InputSection.tsx` | 설정 입력 (스크립트, 카테고리, TTS 선택) |
| `ResultTable.tsx` | 생성 결과 테이블 (React.memo 적용) |
| `AutopilotModal.tsx` | 자동 생성 모드 모달 |

### 데이터 흐름

```
1. 스크립트 생성 → geminiService.generateScript()
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

## 배치 처리 설정 (`config.ts`)

API Rate Limit 방지를 위한 배치 처리:

```typescript
BATCH_CONFIG = {
  GEMINI_TTS: { batchSize: 3, delay: 1000 },
  GEMINI_IMAGE: { batchSize: 2, delay: 2000 },
  ELEVENLABS_TTS: { batchSize: 5, delay: 500 },
  FAL_VIDEO: { batchSize: 1, delay: 1500 }
}
```

## 환경변수

`.env.local` 파일에 API 키 설정:
- `GEMINI_API_KEY` - Google Gemini API
- `VITE_ELEVENLABS_API_KEY` - ElevenLabs TTS (선택)
- `FAL_KEY` - Fal.ai 비디오 (선택)

## 성능 최적화 패턴

1. **배치 병렬 처리**: `utils/batchProcessor.ts` - Promise.allSettled 기반
2. **디바운스 업데이트**: `updateAssetAt()` - 50ms 배치로 리렌더링 감소
3. **React.memo**: `ResultTable.tsx`의 AudioPlayer, SceneRow 메모이제이션
4. **Lazy Loading**: Dashboard, ProjectWizard, AutopilotModal 지연 로딩
5. **벤더 청크 분리**: vite.config.ts의 manualChunks 설정

## 코딩 컨벤션

- 변수/함수: camelCase
- 컴포넌트: PascalCase
- 들여쓰기: 2칸
- `any` 타입 사용 금지
- 주석: 한국어 (비즈니스 로직만)
