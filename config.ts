
/**
 * TubeGen AI 전역 설정 파일
 */

// TTS 엔진 타입
export type TtsEngineType = 'gemini' | 'elevenlabs';

// 환경변수에서 ElevenLabs 설정 읽기
export const ENV_CONFIG = {
  ELEVENLABS_API_KEY: import.meta.env.VITE_ELEVENLABS_API_KEY || '',
  ELEVENLABS_VOICE_ID: import.meta.env.VITE_ELEVENLABS_VOICE_ID || '',
};

// 배치 처리 설정 - API rate limit 방지 및 병렬 처리 최적화
export const BATCH_CONFIG = {
  // Gemini TTS: 가벼운 작업이므로 3개씩 병렬 처리
  GEMINI_TTS: { batchSize: 3, delay: 1000 },
  // Gemini 이미지: 무거운 작업이므로 2개씩 병렬 처리
  GEMINI_IMAGE: { batchSize: 2, delay: 2000 },
  // ElevenLabs TTS: 빠른 응답이므로 5개씩 병렬 처리
  ELEVENLABS_TTS: { batchSize: 5, delay: 500 },
  // FAL 비디오: 가장 무거우므로 1개씩 순차 처리
  FAL_VIDEO: { batchSize: 1, delay: 1500 },
};

// 타임아웃 설정 - 대용량 대본 처리 및 무한 대기 방지
export const TIMEOUT_CONFIG = {
  // 전체 생성 작업 타임아웃: 30분
  TOTAL_GENERATION: 30 * 60 * 1000,
  // 스크립트 생성 타임아웃: 3분 (대용량 대본 대응)
  SCRIPT_GENERATION: 3 * 60 * 1000,
  // 이미지 생성 타임아웃: 1분/씬
  IMAGE_PER_SCENE: 60 * 1000,
  // 오디오 생성 타임아웃: 30초/씬
  AUDIO_PER_SCENE: 30 * 1000,
};

// 대용량 대본 처리 설정
export const LARGE_SCRIPT_CONFIG = {
  // 청크 분할 기준 (3000자 초과 시 분할)
  CHUNK_THRESHOLD: 3000,
  // 청크 크기 (분할 시 각 청크의 최대 크기)
  CHUNK_SIZE: 3000,
  // 청크 간 딜레이 (API rate limit 방지)
  CHUNK_DELAY: 2000,
};

export const CONFIG = {
  // 기본 설정값들
  DEFAULT_VOICE_ID: ENV_CONFIG.ELEVENLABS_VOICE_ID || "sSoVF9lUgTGJz0Xz3J9y", // Jina - 한국어 여성
  DEFAULT_GEMINI_VOICE: "kore",
  DEFAULT_TTS_ENGINE: (ENV_CONFIG.ELEVENLABS_API_KEY ? 'elevenlabs' : 'gemini') as TtsEngineType,
  VIDEO_WIDTH: 1280,
  VIDEO_HEIGHT: 720,

  // 로컬 스토리지 키 이름 (내부 관리용)
  STORAGE_KEYS: {
    ELEVENLABS_API_KEY: 'tubegen_el_key',
    ELEVENLABS_VOICE_ID: 'tubegen_el_voice',
    FAL_API_KEY: 'tubegen_fal_key',
    FAL_VIDEO_MODEL: 'tubegen_fal_model',
    GEMINI_VOICE: 'tubegen_gemini_voice',
    TTS_ENGINE: 'tubegen_tts_engine',
    ZOOM_EFFECT: 'tubegen_zoom_effect'
  },

  // 애니메이션 설정
  ANIMATION: {
    ENABLED_SCENES: 10,      // 앞 N개 씬을 애니메이션으로 변환
    VIDEO_DURATION: 5        // 생성 영상 길이 (초) - PixVerse v5.5
  }
};

// ElevenLabs API 키 가져오기 (환경변수 우선, 없으면 로컬스토리지)
export const getElevenLabsApiKey = (): string => {
  return ENV_CONFIG.ELEVENLABS_API_KEY || localStorage.getItem(CONFIG.STORAGE_KEYS.ELEVENLABS_API_KEY) || '';
};

// ElevenLabs Voice ID 가져오기
export const getElevenLabsVoiceId = (): string => {
  return ENV_CONFIG.ELEVENLABS_VOICE_ID || localStorage.getItem(CONFIG.STORAGE_KEYS.ELEVENLABS_VOICE_ID) || CONFIG.DEFAULT_VOICE_ID;
};

// Gemini TTS 음성 목록 (API에서 지원하는 소문자 이름 사용)
export type GeminiVoiceType =
  | 'kore' | 'aoede' | 'leda' | 'zephyr' | 'charon' | 'fenrir' | 'puck' | 'orus'
  | 'achernar' | 'gacrux' | 'iapetus' | 'umbriel' | 'algenib' | 'schedar';

export const GEMINI_VOICE_LIST = [
  // 여성 음성
  { id: 'kore', name: 'Kore', gender: '여성', description: '단단하고 자신감 있는 목소리', emoji: '🎀' },
  { id: 'aoede', name: 'Aoede', gender: '여성', description: '산들바람 같은 자연스러운 목소리', emoji: '🌸' },
  { id: 'leda', name: 'Leda', gender: '여성', description: '젊고 활기찬 목소리', emoji: '✨' },
  { id: 'zephyr', name: 'Zephyr', gender: '여성', description: '밝고 경쾌한 목소리', emoji: '🌊' },
  { id: 'achernar', name: 'Achernar', gender: '여성', description: '부드럽고 온화한 목소리', emoji: '💫' },
  { id: 'gacrux', name: 'Gacrux', gender: '여성', description: '성숙하고 경험 있는 목소리', emoji: '🌙' },
  // 남성 음성
  { id: 'charon', name: 'Charon', gender: '남성', description: '정보 전달에 명확한 목소리', emoji: '🎭' },
  { id: 'fenrir', name: 'Fenrir', gender: '남성', description: '흥분되고 역동적인 목소리', emoji: '🔥' },
  { id: 'puck', name: 'Puck', gender: '남성', description: '밝고 에너지 넘치는 목소리', emoji: '🎪' },
  { id: 'orus', name: 'Orus', gender: '남성', description: '단단하고 결단력 있는 목소리', emoji: '🏛️' },
];

// ElevenLabs 추천 한국어 음성 목록 (공통 사용)
export interface ElevenLabsVoiceConfig {
  voice_id: string;
  name: string;
  category: string;
  labels: {
    gender: string;
    accent: string;
    description: string;
  };
}

export const ELEVENLABS_KOREAN_VOICES_FEMALE: ElevenLabsVoiceConfig[] = [
  { voice_id: 'sSoVF9lUgTGJz0Xz3J9y', name: 'Jina', category: 'premade', labels: { gender: 'female', accent: 'korean', description: '뉴스 방송에 적합한 중년 여성' } },
  { voice_id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', category: 'premade', labels: { gender: 'female', accent: 'korean', description: '부드럽고 표현력 있는 여성' } },
  { voice_id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', category: 'premade', labels: { gender: 'female', accent: 'korean', description: '따뜻하고 친근한 여성' } },
  { voice_id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', category: 'premade', labels: { gender: 'female', accent: 'korean', description: '부드럽고 차분한 여성' } },
  { voice_id: 'jBpfuIE2acCO8z3wKNLl', name: 'Gigi', category: 'premade', labels: { gender: 'female', accent: 'korean', description: '애니메이션 스타일 여성' } },
];

export const ELEVENLABS_KOREAN_VOICES_MALE: ElevenLabsVoiceConfig[] = [
  { voice_id: 'w5eZjob1kXfLB9HjpFqU', name: 'ChulSu', category: 'premade', labels: { gender: 'male', accent: 'korean', description: '나레이션용 낮은 남성 목소리' } },
  { voice_id: 'TRO4gatqxbbwLXHLDLSk', name: '강수', category: 'premade', labels: { gender: 'male', accent: 'korean', description: '충청도 억양 젊은 남성' } },
  { voice_id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', category: 'premade', labels: { gender: 'male', accent: 'korean', description: '잘 다듬어진 남성' } },
  { voice_id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', category: 'premade', labels: { gender: 'male', accent: 'korean', description: '자신감 있는 남성' } },
  { voice_id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', category: 'premade', labels: { gender: 'male', accent: 'korean', description: '깊고 내레이션용 남성' } },
];

export const ELEVENLABS_KOREAN_VOICES: ElevenLabsVoiceConfig[] = [
  ...ELEVENLABS_KOREAN_VOICES_FEMALE,
  ...ELEVENLABS_KOREAN_VOICES_MALE
];
