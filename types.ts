
export interface SceneAnalysis {
  composition_type: 'MICRO' | 'STANDARD' | 'MACRO';
  composition_explanation: string; // 구도_설명
  camera: {
    view: string;    // 시점
    distance: string; // 거리
    angle: string;    // 각도
  };
  composition_setup: {
    main_element: string; // 주요_요소
    sub_element: string;  // 보조_요소
    character_positioning: string; // 캐릭터_포지셔닝 (위치, 크기%, 역할)
  };
  visual_metaphor: {
    concept: string;     // 핵심개념
    object: string;      // 메타포_오브젝트
    interaction: string; // 캐릭터_상호작용
  };
  metaphor_category: string; // 8대 카테고리
  color_plan: {
    anchor_colors: Record<string, string>; // 캐릭터 고정색
    background_colors: {
      primary: string;   // 주조색
      sub: string;       // 보조톤
      accent: string;    // 강조색
      metaphor: string;  // 메타포색
      bg: string;        // 배경색
    };
    emotion_match: string; // 감정매칭
  };
  detail_level: 'Minimal(1)' | 'Enhanced(2)' | 'Detailed(3)';
  emotional_amplification_technique: string; // 감정_증폭_기법
  differentiation_point: string; // 차별화포인트
  motion_type: '정적' | '동적';
  motion_detail: string; // 동작디테일
}

export interface ScriptScene {
  sceneNumber: number;
  narration: string;
  visualPrompt: string;
  analysis?: SceneAnalysis;
}

// ElevenLabs 타임스탬프 자막 데이터
export interface SubtitleWord {
  word: string;
  start: number;  // 시작 시간 (초)
  end: number;    // 끝 시간 (초)
}

// AI가 분리한 의미 단위 청크 (타이밍 매핑용)
export interface MeaningChunk {
  text: string;       // 청크 텍스트
  startTime: number;  // 시작 시간 (초)
  endTime: number;    // 끝 시간 (초)
}

export interface SubtitleData {
  words: SubtitleWord[];
  fullText: string;
  meaningChunks?: MeaningChunk[];  // AI가 분리한 의미 단위 청크 (타이밍 포함)
}

// 자막 설정 옵션
export interface SubtitleConfig {
  wordsPerLine: number;      // 한 줄당 단어 수 (기본: 5)
  maxLines: number;          // 최대 줄 수 (기본: 2)
  fontSize: number;          // 폰트 크기 (기본: 32)
  fontFamily: string;        // 폰트 (기본: Noto Sans KR)
  bottomMargin: number;      // 하단 여백 (기본: 60)
  backgroundColor: string;   // 배경색 (기본: rgba(0,0,0,0.75))
  textColor: string;         // 텍스트 색상 (기본: #FFFFFF)
}

// 기본 자막 설정
export const DEFAULT_SUBTITLE_CONFIG: SubtitleConfig = {
  wordsPerLine: 5,
  maxLines: 1,
  fontSize: 40,
  fontFamily: '"Noto Sans KR", "Malgun Gothic", sans-serif',
  bottomMargin: 80,
  backgroundColor: 'rgba(0, 0, 0, 0.75)',
  textColor: '#FFFFFF'
};

export interface GeneratedAsset extends ScriptScene {
  imageData: string | null;
  audioData: string | null;
  audioDuration: number | null;  // 실제 오디오 길이 (초) - SRT 싱크용
  subtitleData: SubtitleData | null;  // 자막 타임스탬프 데이터
  videoData: string | null;      // 애니메이션 영상 URL (앞 N개 씬만)
  videoDuration: number | null;  // 영상 길이 (초) - 보통 4~5초 고정
  status: 'pending' | 'generating' | 'completed' | 'error';
}

export enum GenerationStep {
  IDLE = 'IDLE',
  SCRIPTING = 'SCRIPTING',
  ASSETS = 'ASSETS',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

// 프로젝트 상태
export type ProjectStatus = 'draft' | 'in_progress' | 'completed' | 'error';

// 프로젝트 타입
export interface Project {
  id: string;
  title: string;
  description?: string;
  status: ProjectStatus;
  step: GenerationStep;
  currentStepNumber: number;  // 현재 진행 단계 (1~6)
  totalSteps: number;         // 전체 단계 수
  createdAt: number;          // 생성 시간 (timestamp)
  updatedAt: number;          // 수정 시간 (timestamp)
  thumbnail?: string;         // 첫 번째 이미지 썸네일
  category?: string;
  style?: string;
  ttsEngine?: 'gemini' | 'elevenlabs';
  scenesCount: number;        // 씬 개수
  // 실제 데이터는 별도 저장 (용량 문제)
}
