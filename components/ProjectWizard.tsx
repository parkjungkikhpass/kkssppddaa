import React, { useState, useRef, useEffect } from 'react';
import { GenerationStep } from '../types';
import { generateAudioWithElevenLabs, fetchElevenLabsVoices, ElevenLabsVoice } from '../services/elevenLabsService';
import { generateAudioForScene } from '../services/geminiService';
import {
  CONFIG,
  GEMINI_VOICE_LIST,
  GeminiVoiceType,
  TtsEngineType,
  getElevenLabsApiKey,
  getElevenLabsVoiceId,
  ENV_CONFIG,
  ELEVENLABS_KOREAN_VOICES_FEMALE,
  ELEVENLABS_KOREAN_VOICES_MALE,
  ELEVENLABS_KOREAN_VOICES
} from '../config';
import { CATEGORY_LIST, STYLE_LIST, VIDEO_MODEL_LIST, ZOOM_EFFECT_LIST, CHARACTER_LIST, CategoryType, StyleType, VideoModelType, ZoomEffectType, CharacterType } from '../services/prompts';

// 영상 비율 타입 정의
export type AspectRatioType = '16:9' | '1:1' | '3:4' | '9:16';

export interface AspectRatioConfig {
  id: AspectRatioType;
  name: string;
  description: string;
  icon: React.ReactNode;
  width: number;
  height: number;
}

// 영상 비율 목록
export const ASPECT_RATIO_LIST: AspectRatioConfig[] = [
  {
    id: '16:9',
    name: '16:9',
    description: '유튜브, 넷플릭스',
    icon: (
      <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M10 9l5 3-5 3V9z" fill="currentColor" />
      </svg>
    ),
    width: 1920,
    height: 1080
  },
  {
    id: '1:1',
    name: '1:1',
    description: '인스타그램, 쇼핑',
    icon: (
      <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <circle cx="12" cy="12" r="3" fill="currentColor" />
      </svg>
    ),
    width: 1080,
    height: 1080
  },
  {
    id: '3:4',
    name: '3:4',
    description: '타이틀 · 영상 · 사진',
    icon: (
      <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <circle cx="12" cy="12" r="2.5" fill="currentColor" />
      </svg>
    ),
    width: 1080,
    height: 1440
  },
  {
    id: '9:16',
    name: '9:16',
    description: '틱톡, 릴스, 쇼츠',
    icon: (
      <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <rect x="6" y="2" width="12" height="20" rx="2" />
        <path d="M10 10l4 2.5-4 2.5V10z" fill="currentColor" />
      </svg>
    ),
    width: 1080,
    height: 1920
  }
];

// 비주얼 스타일 확장 (썸네일 미리보기용)
export interface VisualStyleConfig {
  id: StyleType;
  name: string;
  description: string;
  emoji: string;
  gradient: string;
  prompt: string;
}

export const VISUAL_STYLE_LIST: VisualStyleConfig[] = [
  {
    id: 'default',
    name: '유튜브 플레이어',
    description: '크레용/손그림 질감',
    emoji: '🎨',
    gradient: 'from-amber-500 to-orange-600',
    prompt: STYLE_LIST.find(s => s.id === 'default')?.prompt || ''
  },
  {
    id: 'cartoon3d',
    name: '3D 애니메이션',
    description: '픽사풍 3D 카툰',
    emoji: '🌈',
    gradient: 'from-purple-500 to-pink-600',
    prompt: STYLE_LIST.find(s => s.id === 'cartoon3d')?.prompt || ''
  },
  {
    id: 'minimal',
    name: '미니멀 인포그래픽',
    description: '깔끔한 벡터 스타일',
    emoji: '✏️',
    gradient: 'from-slate-600 to-slate-800',
    prompt: STYLE_LIST.find(s => s.id === 'minimal')?.prompt || ''
  },
  {
    id: 'pixel',
    name: '레트로 픽셀 아트',
    description: '16비트 게임 감성',
    emoji: '👾',
    gradient: 'from-cyan-500 to-blue-600',
    prompt: STYLE_LIST.find(s => s.id === 'pixel')?.prompt || ''
  },
  {
    id: 'vintage',
    name: '빈티지 포스터',
    description: '50-60년대 레트로',
    emoji: '📰',
    gradient: 'from-yellow-600 to-red-700',
    prompt: STYLE_LIST.find(s => s.id === 'vintage')?.prompt || ''
  },
  {
    id: 'sketch',
    name: '스케치북',
    description: '연필 드로잉 느낌',
    emoji: '📓',
    gradient: 'from-gray-400 to-gray-600',
    prompt: STYLE_LIST.find(s => s.id === 'sketch')?.prompt || ''
  }
];

// 단계 정의
const WIZARD_STEPS = [
  { id: 1, name: '설정', description: '영상 비율 & 스타일' },
  { id: 2, name: '콘텐츠', description: '카테고리 & 주제' },
  { id: 3, name: '음성', description: 'TTS 설정' },
  { id: 4, name: '이미지', description: '씬별 이미지 생성' },
  { id: 5, name: '고급', description: '추가 옵션' }
];

// 씬(컷) 타입 정의
export interface SceneItem {
  id: number;
  script: string;
  prompt: string;
  imageUrl: string | null;
  startTime: number;
  endTime: number;
  isGenerating: boolean;
}

interface ProjectWizardProps {
  onGenerate: (
    topic: string,
    referenceImages: string[],
    sourceText: string | null,
    ttsConfig: { engine: TtsEngineType, geminiVoice?: string, elApiKey?: string, elVoiceId?: string },
    generationOptions?: {
      category: CategoryType,
      style: StyleType,
      aspectRatio?: AspectRatioType,
      videoModel?: VideoModelType,
      zoomEffect?: ZoomEffectType,
      customStylePrompt?: string,
      characterType?: CharacterType,
      characterRefImage?: string | null,
      styleRefImage?: string | null
    }
  ) => void;
  onBack: () => void;
  step: GenerationStep;
}

const ProjectWizard: React.FC<ProjectWizardProps> = ({ onGenerate, onBack, step }) => {
  // 현재 단계
  const [currentStep, setCurrentStep] = useState(1);

  // Step 1: 영상 설정
  const [aspectRatio, setAspectRatio] = useState<AspectRatioType>('16:9');
  const [selectedStyle, setSelectedStyle] = useState<StyleType | ''>('');
  const [customStylePrompt, setCustomStylePrompt] = useState('');
  const [referenceImages, setReferenceImages] = useState<string[]>([]);

  // 캐릭터 설정
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterType>('none');

  // 분리된 레퍼런스 이미지 (미드저니 스타일)
  const [characterRefImage, setCharacterRefImage] = useState<string | null>(null);
  const [styleRefImage, setStyleRefImage] = useState<string | null>(null);

  // Step 2: 콘텐츠
  const [activeTab, setActiveTab] = useState<'auto' | 'manual'>('auto');
  const [topic, setTopic] = useState('');
  const [manualScript, setManualScript] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryType>('economy');

  // Step 3: TTS 설정
  const [ttsEngine, setTtsEngine] = useState<TtsEngineType>(
    (localStorage.getItem(CONFIG.STORAGE_KEYS.TTS_ENGINE) as TtsEngineType) || CONFIG.DEFAULT_TTS_ENGINE
  );
  const [geminiVoice, setGeminiVoice] = useState<GeminiVoiceType>(
    (localStorage.getItem(CONFIG.STORAGE_KEYS.GEMINI_VOICE) as GeminiVoiceType) || CONFIG.DEFAULT_GEMINI_VOICE
  );
  const [elSelectedVoiceId, setElSelectedVoiceId] = useState(getElevenLabsVoiceId());
  const [elVoices, setElVoices] = useState<ElevenLabsVoice[]>(ELEVENLABS_KOREAN_VOICES as ElevenLabsVoice[]);
  const [userCustomVoices, setUserCustomVoices] = useState<ElevenLabsVoice[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const [testingGeminiVoice, setTestingGeminiVoice] = useState<string | null>(null);
  const [isTestingVoice, setIsTestingVoice] = useState(false);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  // 사용자가 선택한 즐겨찾기 목소리 목록 (기본값 없음 - 반드시 추가해야 함)
  const [favoriteGeminiVoices, setFavoriteGeminiVoices] = useState<string[]>(() => {
    const saved = localStorage.getItem('tubegen_favorite_gemini_voices');
    return saved ? JSON.parse(saved) : [];
  });
  const [favoriteElevenVoices, setFavoriteElevenVoices] = useState<string[]>(() => {
    const saved = localStorage.getItem('tubegen_favorite_eleven_voices');
    return saved ? JSON.parse(saved) : [];
  });

  // 음성 생성 관련 state
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);
  const [generatedAudioData, setGeneratedAudioData] = useState<string | null>(null);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [isPlayingGenerated, setIsPlayingGenerated] = useState(false);
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const generatedAudioRef = useRef<HTMLAudioElement | null>(null);

  // 음성 미리듣기 관련 state
  const [testAudioUrl, setTestAudioUrl] = useState<string | null>(null);
  const [testWaveformData, setTestWaveformData] = useState<number[]>([]);
  const [testAudioCurrentTime, setTestAudioCurrentTime] = useState(0);
  const [testAudioDuration, setTestAudioDuration] = useState(0);
  const [isPlayingTest, setIsPlayingTest] = useState(false);
  const testAudioRef = useRef<HTMLAudioElement | null>(null);

  // Step 4: 이미지 생성 (씬 편집)
  const [scenes, setScenes] = useState<SceneItem[]>([]);
  const [selectedSceneId, setSelectedSceneId] = useState<number | null>(null);
  const [isGeneratingAllImages, setIsGeneratingAllImages] = useState(false);

  // Step 5: 고급 설정
  const [falApiKey, setFalApiKey] = useState(localStorage.getItem(CONFIG.STORAGE_KEYS.FAL_API_KEY) || '');
  const [falVideoModel, setFalVideoModel] = useState<VideoModelType>(
    (localStorage.getItem(CONFIG.STORAGE_KEYS.FAL_VIDEO_MODEL) as VideoModelType) || 'none'
  );
  const [zoomEffect, setZoomEffect] = useState<ZoomEffectType>(
    (localStorage.getItem(CONFIG.STORAGE_KEYS.ZOOM_EFFECT) as ZoomEffectType) || 'medium'
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasElevenLabsEnv = !!ENV_CONFIG.ELEVENLABS_API_KEY;

  // 설정 저장
  useEffect(() => {
    if (falApiKey) localStorage.setItem(CONFIG.STORAGE_KEYS.FAL_API_KEY, falApiKey);
    if (falVideoModel) localStorage.setItem(CONFIG.STORAGE_KEYS.FAL_VIDEO_MODEL, falVideoModel);
    if (zoomEffect) localStorage.setItem(CONFIG.STORAGE_KEYS.ZOOM_EFFECT, zoomEffect);
    if (geminiVoice) localStorage.setItem(CONFIG.STORAGE_KEYS.GEMINI_VOICE, geminiVoice);
    if (ttsEngine) localStorage.setItem(CONFIG.STORAGE_KEYS.TTS_ENGINE, ttsEngine);
    if (elSelectedVoiceId) localStorage.setItem(CONFIG.STORAGE_KEYS.ELEVENLABS_VOICE_ID, elSelectedVoiceId);
  }, [falApiKey, falVideoModel, zoomEffect, geminiVoice, ttsEngine, elSelectedVoiceId]);

  // 즐겨찾기 목소리 저장
  useEffect(() => {
    localStorage.setItem('tubegen_favorite_gemini_voices', JSON.stringify(favoriteGeminiVoices));
  }, [favoriteGeminiVoices]);

  useEffect(() => {
    localStorage.setItem('tubegen_favorite_eleven_voices', JSON.stringify(favoriteElevenVoices));
  }, [favoriteElevenVoices]);

  // 목소리 추가/제거 함수
  const addGeminiVoice = (voiceId: string) => {
    if (!favoriteGeminiVoices.includes(voiceId)) {
      const newVoices = [...favoriteGeminiVoices, voiceId];
      setFavoriteGeminiVoices(newVoices);
      // 첫 번째 목소리 추가 시 자동 선택
      if (favoriteGeminiVoices.length === 0) {
        setGeminiVoice(voiceId as GeminiVoiceType);
      }
    }
    setShowVoiceModal(false);
  };

  const removeGeminiVoice = (voiceId: string) => {
    const remaining = favoriteGeminiVoices.filter(v => v !== voiceId);
    setFavoriteGeminiVoices(remaining);
    // 삭제된 목소리가 현재 선택된 목소리라면 다른 목소리로 변경
    if (geminiVoice === voiceId && remaining.length > 0) {
      setGeminiVoice(remaining[0] as GeminiVoiceType);
    }
  };

  const addElevenVoice = (voiceId: string) => {
    if (!favoriteElevenVoices.includes(voiceId)) {
      const newVoices = [...favoriteElevenVoices, voiceId];
      setFavoriteElevenVoices(newVoices);
      // 첫 번째 목소리 추가 시 자동 선택
      if (favoriteElevenVoices.length === 0) {
        setElSelectedVoiceId(voiceId);
      }
    }
    setShowVoiceModal(false);
  };

  const removeElevenVoice = (voiceId: string) => {
    const remaining = favoriteElevenVoices.filter(v => v !== voiceId);
    setFavoriteElevenVoices(remaining);
    if (elSelectedVoiceId === voiceId && remaining.length > 0) {
      setElSelectedVoiceId(remaining[0]);
    }
  };

  // ElevenLabs 음성 로드
  const isKoreanVoice = (voice: ElevenLabsVoice): boolean => {
    const labels = voice.labels || {};
    const checkFields = [labels.accent, labels.language, labels.description, voice.name]
      .filter(Boolean).join(' ').toLowerCase();
    return checkFields.includes('korean') || checkFields.includes('korea') ||
           checkFields.includes('한국') || checkFields.includes('서울');
  };

  const loadElevenLabsVoices = async () => {
    const apiKey = getElevenLabsApiKey();
    if (!apiKey || apiKey.length < 10) {
      setElVoices(ELEVENLABS_KOREAN_VOICES);
      setUserCustomVoices([]);
      return;
    }
    setIsLoadingVoices(true);
    try {
      const allVoices = await fetchElevenLabsVoices(apiKey);
      const customCategories = ['cloned', 'generated', 'professional', 'high_quality'];
      const customVoices = allVoices.filter(v =>
        customCategories.includes(v.category?.toLowerCase() || '') ||
        v.category === 'cloned' ||
        !['premade', 'professional'].includes(v.category?.toLowerCase() || '')
      );
      const koreanPremadeVoices = allVoices.filter(v =>
        v.category?.toLowerCase() === 'premade' && isKoreanVoice(v)
      );
      const recommendedIds = new Set(ELEVENLABS_KOREAN_VOICES.map(v => v.voice_id));
      const additionalKoreanVoices = koreanPremadeVoices.filter(v => !recommendedIds.has(v.voice_id));
      const mergedVoices = [...ELEVENLABS_KOREAN_VOICES, ...additionalKoreanVoices];
      setElVoices(mergedVoices);
      setUserCustomVoices(customVoices);
    } catch (e) {
      console.error('음성 목록 로드 실패:', e);
      setElVoices(ELEVENLABS_KOREAN_VOICES);
      setUserCustomVoices([]);
    } finally {
      setIsLoadingVoices(false);
    }
  };

  useEffect(() => {
    if (hasElevenLabsEnv) loadElevenLabsVoices();
  }, [hasElevenLabsEnv]);

  // PCM to WAV
  const pcmToWav = (pcmData: Uint8Array, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) => {
    const byteRate = sampleRate * numChannels * bitsPerSample / 8;
    const blockAlign = numChannels * bitsPerSample / 8;
    const dataSize = pcmData.length;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);
    const wavBytes = new Uint8Array(buffer);
    wavBytes.set(pcmData, 44);
    return wavBytes;
  };

  // Gemini TTS 테스트 (파형 포함)
  const handleTestGeminiVoice = async (voiceId: string) => {
    if (testingGeminiVoice) return;
    setTestingGeminiVoice(voiceId);
    setGeminiVoice(voiceId as GeminiVoiceType);
    setTestAudioUrl(null);
    setTestWaveformData([]);
    try {
      const testText = "안녕하세요. 이 목소리는 테스트 음성입니다.";
      const audioData = await generateAudioForScene(testText, voiceId);
      if (audioData) {
        // WAV로 변환
        const binaryString = atob(audioData);
        const pcmBytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) pcmBytes[i] = binaryString.charCodeAt(i);
        const wavBytes = pcmToWav(pcmBytes, 24000, 1, 16);
        const blob = new Blob([wavBytes], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);

        // 파형 데이터 생성 및 상태 저장
        setTestAudioUrl(url);
        setTestWaveformData(generateWaveformData(audioData));
      } else {
        alert('Gemini TTS 응답이 없습니다.');
      }
    } catch (e: any) {
      alert(`Gemini TTS 오류: ${e.message || e}`);
    } finally {
      setTestingGeminiVoice(null);
    }
  };

  // ElevenLabs TTS 테스트 (파형 포함)
  const handleTestVoice = async () => {
    const apiKey = getElevenLabsApiKey();
    if (!apiKey) {
      alert("ElevenLabs API Key가 설정되지 않았습니다.");
      return;
    }
    setIsTestingVoice(true);
    setTestAudioUrl(null);
    setTestWaveformData([]);
    try {
      const result = await generateAudioWithElevenLabs(
        "반갑습니다. 이 목소리는 테스트 음성입니다.",
        apiKey,
        elSelectedVoiceId
      );
      if (result.audioData) {
        const url = `data:audio/mpeg;base64,${result.audioData}`;
        setTestAudioUrl(url);
        setTestWaveformData(generateWaveformData(result.audioData));
      } else {
        alert("음성 생성 실패.");
      }
    } catch (e: any) {
      alert("오류 발생: " + (e.message || e));
    } finally {
      setIsTestingVoice(false);
    }
  };

  // 테스트 오디오 재생/일시정지
  const playTestAudio = () => {
    if (testAudioRef.current) {
      if (isPlayingTest) {
        testAudioRef.current.pause();
        setIsPlayingTest(false);
      } else {
        testAudioRef.current.play();
        setIsPlayingTest(true);
      }
    }
  };

  // 파형 데이터 생성 (오디오 데이터에서 시각화용 데이터 추출)
  const generateWaveformData = (audioData: string): number[] => {
    // Base64 디코딩하여 바이트 배열로 변환
    const binaryString = atob(audioData);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // 50개의 바(막대)로 파형 생성
    const barCount = 50;
    const chunkSize = Math.floor(bytes.length / barCount);
    const waveform: number[] = [];

    for (let i = 0; i < barCount; i++) {
      const start = i * chunkSize;
      const end = start + chunkSize;
      let sum = 0;
      for (let j = start; j < end && j < bytes.length; j++) {
        sum += Math.abs(bytes[j] - 128); // 중간값 기준으로 편차 계산
      }
      const avg = sum / chunkSize;
      // 0~1 사이 값으로 정규화 (더 다이나믹하게)
      waveform.push(Math.min(1, (avg / 64) * 1.5));
    }

    return waveform;
  };

  // 오디오 플레이어 제어
  const playGeneratedAudio = () => {
    if (generatedAudioRef.current) {
      if (isPlayingGenerated) {
        generatedAudioRef.current.pause();
        setIsPlayingGenerated(false);
      } else {
        generatedAudioRef.current.play();
        setIsPlayingGenerated(true);
      }
    }
  };

  // 음성 생성 (스크립트 전체에 대한 TTS)
  const handleGenerateFullAudio = async () => {
    const scriptText = activeTab === 'auto'
      ? `${topic}에 대한 스크립트입니다. AI가 자동으로 생성합니다.`
      : manualScript;

    if (!scriptText.trim()) {
      alert('스크립트를 먼저 입력해주세요.');
      return;
    }

    setIsGeneratingAudio(true);
    setGeneratedAudioUrl(null);
    setGeneratedAudioData(null);
    setWaveformData([]);

    try {
      if (ttsEngine === 'gemini') {
        const audioData = await generateAudioForScene(scriptText, geminiVoice);
        if (audioData) {
          // WAV로 변환
          const binaryString = atob(audioData);
          const pcmBytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            pcmBytes[i] = binaryString.charCodeAt(i);
          }
          const wavBytes = pcmToWav(pcmBytes, 24000, 1, 16);
          const blob = new Blob([wavBytes], { type: 'audio/wav' });
          const url = URL.createObjectURL(blob);

          setGeneratedAudioUrl(url);
          setGeneratedAudioData(audioData);
          setWaveformData(generateWaveformData(audioData));
        } else {
          throw new Error('Gemini TTS 응답이 없습니다.');
        }
      } else {
        const apiKey = getElevenLabsApiKey();
        if (!apiKey) {
          throw new Error('ElevenLabs API Key가 설정되지 않았습니다.');
        }
        const result = await generateAudioWithElevenLabs(scriptText, apiKey, elSelectedVoiceId);
        if (result.audioData) {
          const url = `data:audio/mpeg;base64,${result.audioData}`;
          setGeneratedAudioUrl(url);
          setGeneratedAudioData(result.audioData);
          setWaveformData(generateWaveformData(result.audioData));
        } else {
          throw new Error('ElevenLabs 음성 생성 실패');
        }
      }
    } catch (e: any) {
      alert(`음성 생성 오류: ${e.message || e}`);
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  // 생성된 오디오 시간 포맷
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // ========== 씬(컷) 관리 함수 ==========

  // 샘플 씬 데이터 생성 (Step 4 진입 시)
  const initializeScenes = () => {
    const scriptText = activeTab === 'auto' ? topic : manualScript;

    // 스크립트를 문장 단위로 분리하여 씬 생성
    const sentences = scriptText.split(/[.!?。]\s*/).filter(s => s.trim().length > 0);

    // 최소 3개, 최대 8개 씬
    const sceneCount = Math.min(Math.max(sentences.length, 3), 8);
    const avgDuration = 4; // 평균 4초

    const newScenes: SceneItem[] = [];
    for (let i = 0; i < sceneCount; i++) {
      const script = sentences[i] || `씬 ${i + 1} 스크립트`;
      newScenes.push({
        id: i + 1,
        script: script.trim(),
        prompt: `A cinematic scene depicting: ${script.trim().substring(0, 100)}...`,
        imageUrl: null,
        startTime: i * avgDuration,
        endTime: (i + 1) * avgDuration,
        isGenerating: false
      });
    }

    setScenes(newScenes);
    if (newScenes.length > 0) {
      setSelectedSceneId(newScenes[0].id);
    }
  };

  // 선택된 씬 가져오기
  const getSelectedScene = (): SceneItem | undefined => {
    return scenes.find(s => s.id === selectedSceneId);
  };

  // 씬 프롬프트 수정
  const updateScenePrompt = (sceneId: number, newPrompt: string) => {
    setScenes(prev => prev.map(scene =>
      scene.id === sceneId ? { ...scene, prompt: newPrompt } : scene
    ));
  };

  // 씬 스크립트 수정
  const updateSceneScript = (sceneId: number, newScript: string) => {
    setScenes(prev => prev.map(scene =>
      scene.id === sceneId ? { ...scene, script: newScript } : scene
    ));
  };

  // 개별 씬 이미지 생성 (모의 - 실제 구현 시 API 연동 필요)
  const generateSceneImage = async (sceneId: number) => {
    setScenes(prev => prev.map(scene =>
      scene.id === sceneId ? { ...scene, isGenerating: true } : scene
    ));

    try {
      // 실제 구현 시 여기서 이미지 생성 API 호출
      await new Promise(resolve => setTimeout(resolve, 2000)); // 모의 딜레이

      // 모의 이미지 URL (실제 구현 시 생성된 이미지 URL로 교체)
      const placeholderImage = `https://picsum.photos/seed/${sceneId}/800/450`;

      setScenes(prev => prev.map(scene =>
        scene.id === sceneId ? { ...scene, imageUrl: placeholderImage, isGenerating: false } : scene
      ));
    } catch (error) {
      console.error('이미지 생성 오류:', error);
      setScenes(prev => prev.map(scene =>
        scene.id === sceneId ? { ...scene, isGenerating: false } : scene
      ));
    }
  };

  // 전체 씬 이미지 생성
  const generateAllSceneImages = async () => {
    setIsGeneratingAllImages(true);

    for (const scene of scenes) {
      if (!scene.imageUrl) {
        await generateSceneImage(scene.id);
      }
    }

    setIsGeneratingAllImages(false);
  };

  // 씬 이미지 업로드
  const handleSceneImageUpload = (sceneId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setScenes(prev => prev.map(scene =>
          scene.id === sceneId ? { ...scene, imageUrl: reader.result as string } : scene
        ));
      };
      reader.readAsDataURL(file);
    }
  };

  // 프롬프트 자동 생성
  const autoGeneratePrompt = (sceneId: number) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (scene) {
      const stylePrompt = selectedStyle ? VISUAL_STYLE_LIST.find(s => s.id === selectedStyle)?.prompt || '' : '';
      const customPrompt = customStylePrompt ? `, ${customStylePrompt}` : '';
      const newPrompt = `${scene.script}. ${stylePrompt}${customPrompt}. Cinematic composition, professional lighting, high quality render.`;
      updateScenePrompt(sceneId, newPrompt);
    }
  };

  // 생성된 이미지 개수
  const generatedImageCount = scenes.filter(s => s.imageUrl).length;

  // ========== 씬(컷) 관리 함수 끝 ==========

  // 이미지 처리
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const remainingSlots = 4 - referenceImages.length;
      const filesToProcess = (Array.from(files) as File[]).slice(0, remainingSlots);
      filesToProcess.forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => setReferenceImages(prev => [...prev, reader.result as string].slice(0, 4));
        reader.readAsDataURL(file);
      });
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (index: number) => setReferenceImages(prev => prev.filter((_, i) => i !== index));

  // 생성 시작
  const isProcessing = step !== GenerationStep.IDLE && step !== GenerationStep.COMPLETED && step !== GenerationStep.ERROR;

  const handleSubmit = () => {
    if (isProcessing) return;
    const ttsConfig = {
      engine: ttsEngine,
      geminiVoice: geminiVoice,
      elApiKey: getElevenLabsApiKey(),
      elVoiceId: elSelectedVoiceId
    };
    const genOptions = {
      category: selectedCategory,
      style: selectedStyle || 'default',  // 빈 문자열이면 기본값 사용
      aspectRatio: aspectRatio,
      videoModel: falVideoModel,
      zoomEffect: zoomEffect,
      customStylePrompt: customStylePrompt,
      characterType: selectedCharacter,
      characterRefImage: characterRefImage,
      styleRefImage: styleRefImage
    };
    if (activeTab === 'auto') {
      if (topic.trim()) onGenerate(topic, referenceImages, null, ttsConfig, genOptions);
    } else {
      if (manualScript.trim()) onGenerate("Manual Script Input", referenceImages, manualScript, ttsConfig, genOptions);
    }
  };

  // 다음 단계 가능 여부
  const canProceed = () => {
    if (currentStep === 1) {
      // 스타일을 선택해야 다음 단계로 진행 가능
      // 단, 커스텀 스타일 프롬프트나 레퍼런스 이미지가 있으면 스타일 선택 없이도 진행 가능
      const hasCustomStyle = customStylePrompt.trim().length > 0 || referenceImages.length > 0;
      const hasNewRefs = !!characterRefImage || !!styleRefImage;
      return selectedStyle !== '' || hasCustomStyle || hasNewRefs;
    }
    if (currentStep === 2) return activeTab === 'auto' ? topic.trim().length > 0 : manualScript.trim().length > 0;
    if (currentStep === 3) {
      // 선택한 TTS 엔진에 따라 목소리가 추가되어 있어야 함
      if (ttsEngine === 'gemini') {
        return favoriteGeminiVoices.length > 0;
      } else {
        return favoriteElevenVoices.length > 0;
      }
    }
    if (currentStep === 4) {
      // 이미지 생성 단계 - 씬이 있으면 진행 가능
      return scenes.length > 0;
    }
    return true;
  };

  const nextStep = () => {
    if (currentStep < 5 && canProceed()) {
      // Step 3 → Step 4 진입 시 씬 초기화
      if (currentStep === 3 && scenes.length === 0) {
        initializeScenes();
      }
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const currentCategory = CATEGORY_LIST.find(c => c.id === selectedCategory);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-xl border-b-2 border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={currentStep === 1 ? onBack : prevStep}
              className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span className="font-medium">{currentStep === 1 ? '대시보드로' : '이전 단계'}</span>
            </button>
            <div className="text-center">
              <h1 className="text-lg font-bold text-gray-900">새 프로젝트</h1>
            </div>
            <div className="w-24"></div>
          </div>
        </div>
      </header>

      {/* 스텝 인디케이터 */}
      <div className="max-w-4xl mx-auto px-6 pt-8">
        <div className="flex items-center justify-center gap-0">
          {WIZARD_STEPS.map((s, idx) => (
            <React.Fragment key={s.id}>
              {/* 스텝 아이콘 */}
              <div className="flex flex-col items-center">
                <button
                  onClick={() => s.id <= currentStep && setCurrentStep(s.id)}
                  disabled={s.id > currentStep}
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                    s.id === currentStep
                      ? 'bg-brand-500 text-white ring-4 ring-brand-500/30'
                      : s.id < currentStep
                      ? 'bg-emerald-500 text-white cursor-pointer hover:bg-emerald-400'
                      : 'bg-gray-200 text-gray-400'
                  }`}
                >
                  {s.id < currentStep ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    s.id
                  )}
                </button>
                <span className={`text-xs font-bold mt-2 ${
                  s.id === currentStep ? 'text-gray-900' : 'text-gray-400'
                }`}>
                  {s.name}
                </span>
              </div>

              {/* 연결선 */}
              {idx < WIZARD_STEPS.length - 1 && (
                <div className={`w-20 h-0.5 mx-2 mb-6 transition-colors ${
                  s.id < currentStep ? 'bg-emerald-500' : 'bg-gray-200'
                }`} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* 메인 콘텐츠 */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="bg-white border-2 border-gray-200 rounded-3xl p-8 shadow-md">
          {/* Step 1: 영상 설정 */}
          {currentStep === 1 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">영상 설정</h2>
                <p className="text-gray-500">스타일과 비율을 선택하고 시작하세요.</p>
              </div>

              {/* 영상 비율 선택 */}
              <div className="mb-10">
                <h3 className="text-sm font-bold text-gray-600 mb-4 text-center">영상 비율 선택</h3>
                <div className="flex justify-center gap-4">
                  {ASPECT_RATIO_LIST.map((ratio) => (
                    <button
                      key={ratio.id}
                      onClick={() => setAspectRatio(ratio.id)}
                      className={`relative w-28 p-4 rounded-2xl border-2 transition-all shadow-sm ${
                        aspectRatio === ratio.id
                          ? 'border-brand-500 bg-brand-50 shadow-md'
                          : 'border-gray-300 bg-gray-50 hover:border-gray-400'
                      }`}
                    >
                      {aspectRatio === ratio.id && (
                        <div className="absolute -top-2 -right-2 w-5 h-5 bg-brand-500 rounded-full flex items-center justify-center">
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                      <div className={`flex justify-center mb-2 ${
                        aspectRatio === ratio.id ? 'text-brand-500' : 'text-gray-400'
                      }`}>
                        {ratio.icon}
                      </div>
                      <div className="text-center">
                        <div className={`text-lg font-bold ${
                          aspectRatio === ratio.id ? 'text-gray-900' : 'text-gray-600'
                        }`}>
                          {ratio.name}
                        </div>
                        <div className="text-[10px] text-gray-400">{ratio.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 캐릭터 선택 */}
              <div className="mb-10">
                <h3 className="text-sm font-bold text-gray-600 mb-2 text-center">
                  캐릭터 설정
                </h3>
                <p className="text-xs text-gray-400 text-center mb-4">
                  대본에 따라 자동 생성하거나, 졸라맨 캐릭터를 사용할 수 있어요
                </p>
                <div className="flex justify-center gap-4">
                  {CHARACTER_LIST.map((char) => (
                    <button
                      key={char.id}
                      onClick={() => setSelectedCharacter(char.id as CharacterType)}
                      className={`relative px-6 py-4 rounded-2xl border-2 transition-all ${
                        selectedCharacter === char.id
                          ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500/30'
                          : 'border-gray-300 bg-white hover:border-gray-400'
                      }`}
                    >
                      {selectedCharacter === char.id && (
                        <div className="absolute -top-1 -right-1 w-5 h-5 bg-brand-500 rounded-full flex items-center justify-center">
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                      <div className="text-2xl mb-1">{char.emoji}</div>
                      <div className={`text-sm font-bold ${selectedCharacter === char.id ? 'text-gray-900' : 'text-gray-600'}`}>
                        {char.name}
                      </div>
                      <div className="text-[10px] text-gray-400">{char.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 스타일 선택 */}
              <div>
                <h3 className="text-sm font-bold text-gray-600 mb-2 text-center">
                  스타일 선택 <span className="text-red-500">*</span>
                </h3>
                {selectedStyle === '' && customStylePrompt.trim() === '' && referenceImages.length === 0 && !characterRefImage && !styleRefImage && (
                  <p className="text-xs text-amber-600 text-center mb-4">
                    ⚠️ 스타일을 선택하거나, 아래에서 커스텀 프롬프트/레퍼런스 이미지를 입력해주세요
                  </p>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {VISUAL_STYLE_LIST.map((style) => (
                    <button
                      key={style.id}
                      onClick={() => setSelectedStyle(style.id)}
                      className={`relative group overflow-hidden rounded-2xl border-2 transition-all shadow-sm ${
                        selectedStyle === style.id
                          ? 'border-brand-500 ring-2 ring-brand-500/30 shadow-md'
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      {selectedStyle === style.id && (
                        <div className="absolute top-2 right-2 z-10 w-5 h-5 bg-brand-500 rounded-full flex items-center justify-center">
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                      {/* 그라데이션 프리뷰 */}
                      <div className={`h-24 bg-gradient-to-br ${style.gradient} flex items-center justify-center`}>
                        <span className="text-4xl">{style.emoji}</span>
                      </div>
                      {/* 텍스트 */}
                      <div className={`p-3 ${
                        selectedStyle === style.id ? 'bg-gray-50' : 'bg-white'
                      }`}>
                        <div className={`text-sm font-bold ${
                          selectedStyle === style.id ? 'text-gray-900' : 'text-gray-600'
                        }`}>
                          {style.name}
                        </div>
                        <div className="text-[10px] text-gray-400">{style.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 이미지 스타일 프롬프트 */}
              <div className="mt-10">
                <h3 className="text-sm font-bold text-gray-600 mb-4 text-center">✨ 이미지 스타일 프롬프트 (선택)</h3>
                <div className="max-w-2xl mx-auto">
                  <textarea
                    value={customStylePrompt}
                    onChange={(e) => setCustomStylePrompt(e.target.value)}
                    placeholder="예: 지브리 스타일의 따뜻한 수채화, 파스텔 톤 배경, 귀여운 캐릭터 디자인 / 사이버펑크 네온 조명, 어두운 도시 배경, 미래적 분위기 / 미니멀 플랫 일러스트, 밝은 원색, 깔끔한 선..."
                    rows={3}
                    className="w-full bg-gray-50 text-gray-900 border-2 border-gray-300 rounded-2xl px-5 py-4 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:bg-white outline-none transition-all placeholder:text-gray-400 resize-none"
                  />
                  <p className="text-[10px] text-gray-400 mt-2 text-center">
                    💡 입력한 스타일이 모든 이미지의 색감, 분위기, 캐릭터 디자인에 일관되게 적용됩니다
                  </p>
                </div>
              </div>

              {/* 레퍼런스 이미지 (캐릭터/화풍 분리) */}
              <div className="mt-8">
                <h3 className="text-sm font-bold text-gray-600 mb-2 text-center">🎨 레퍼런스 이미지 (선택)</h3>
                <p className="text-xs text-gray-400 text-center mb-4">
                  미드저니처럼 캐릭터와 화풍을 각각 참조할 수 있어요
                </p>
                <div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* 캐릭터 레퍼런스 */}
                  <div className="bg-gray-50 rounded-2xl p-4 border-2 border-gray-200">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-lg">🧍</span>
                      <span className="text-sm font-bold text-gray-600">캐릭터 레퍼런스</span>
                    </div>
                    <p className="text-[10px] text-gray-400 mb-3">
                      캐릭터 디자인, 외형, 복장을 참조합니다
                    </p>
                    <div className="flex justify-center">
                      {characterRefImage ? (
                        <div className="relative group">
                          <div className="w-28 h-28 rounded-xl overflow-hidden border-2 border-purple-300">
                            <img src={characterRefImage} alt="Character Ref" className="w-full h-full object-cover" />
                          </div>
                          <button
                            onClick={() => setCharacterRefImage(null)}
                            className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <label className="w-28 h-28 border-2 border-dashed border-purple-300 rounded-xl flex flex-col items-center justify-center text-purple-400 hover:border-purple-500 hover:text-purple-500 transition-all cursor-pointer">
                          <svg className="w-6 h-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          <span className="text-[10px]">캐릭터 추가</span>
                          <input
                            type="file"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onload = (ev) => setCharacterRefImage(ev.target?.result as string);
                                reader.readAsDataURL(file);
                              }
                            }}
                            accept="image/*"
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>
                  </div>

                  {/* 화풍 레퍼런스 */}
                  <div className="bg-gray-50 rounded-2xl p-4 border-2 border-gray-200">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-lg">🖼️</span>
                      <span className="text-sm font-bold text-gray-600">화풍 레퍼런스</span>
                    </div>
                    <p className="text-[10px] text-gray-400 mb-3">
                      색감, 분위기, 그림체를 참조합니다
                    </p>
                    <div className="flex justify-center">
                      {styleRefImage ? (
                        <div className="relative group">
                          <div className="w-28 h-28 rounded-xl overflow-hidden border-2 border-cyan-300">
                            <img src={styleRefImage} alt="Style Ref" className="w-full h-full object-cover" />
                          </div>
                          <button
                            onClick={() => setStyleRefImage(null)}
                            className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <label className="w-28 h-28 border-2 border-dashed border-cyan-300 rounded-xl flex flex-col items-center justify-center text-cyan-400 hover:border-cyan-500 hover:text-cyan-500 transition-all cursor-pointer">
                          <svg className="w-6 h-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          <span className="text-[10px]">화풍 추가</span>
                          <input
                            type="file"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onload = (ev) => setStyleRefImage(ev.target?.result as string);
                                reader.readAsDataURL(file);
                              }
                            }}
                            accept="image/*"
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-gray-400 mt-3 text-center">
                  💡 캐릭터 + 화풍을 함께 넣으면: 해당 캐릭터를 해당 화풍으로 그립니다
                </p>
              </div>

              {/* 기존 레퍼런스 이미지 (하위 호환) */}
              <div className="mt-6">
                <details className="max-w-2xl mx-auto">
                  <summary className="text-xs text-gray-400 text-center cursor-pointer hover:text-gray-600">
                    📎 기존 방식으로 레퍼런스 추가 (통합)
                  </summary>
                  <div className="mt-3 bg-gray-50 rounded-2xl p-4 border-2 border-gray-200">
                    <div className="flex flex-wrap gap-3 items-center justify-center">
                      {referenceImages.map((img: string, idx: number) => (
                        <div key={idx} className="relative group">
                          <div className="w-20 h-14 rounded-xl overflow-hidden border-2 border-gray-300">
                            <img src={img} alt={`Ref ${idx}`} className="w-full h-full object-cover" />
                          </div>
                          <button
                            onClick={() => removeImage(idx)}
                            className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                      {referenceImages.length < 4 && (
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="w-20 h-14 border-2 border-dashed border-gray-400 rounded-xl flex items-center justify-center text-gray-400 hover:border-brand-500 hover:text-brand-500 transition-all"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                      )}
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleImageChange}
                        accept="image/*"
                        className="hidden"
                        multiple
                      />
                    </div>
                  </div>
                </details>
              </div>
            </div>
          )}

          {/* Step 2: 콘텐츠 */}
          {currentStep === 2 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">콘텐츠 입력</h2>
                <p className="text-gray-500">영상 주제를 입력하거나 대본을 직접 작성하세요.</p>
              </div>

              {/* 카테고리 선택 */}
              <div className="mb-6">
                <h3 className="text-sm font-bold text-gray-600 mb-3 text-center">카테고리</h3>
                <div className="flex flex-wrap justify-center gap-2">
                  {CATEGORY_LIST.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id as CategoryType)}
                      className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                        selectedCategory === cat.id
                          ? 'bg-brand-500 text-white'
                          : 'bg-gray-100 text-gray-500 hover:text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {cat.emoji} {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* 탭 선택 */}
              <div className="flex justify-center mb-6">
                <div className="bg-gray-100 p-1 rounded-xl flex gap-1 border-2 border-gray-200">
                  <button
                    onClick={() => setActiveTab('auto')}
                    className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                      activeTab === 'auto' ? 'bg-brand-500 text-white' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    자동 트렌드
                  </button>
                  <button
                    onClick={() => setActiveTab('manual')}
                    className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                      activeTab === 'manual' ? 'bg-brand-500 text-white' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    수동 대본
                  </button>
                </div>
              </div>

              {/* 입력 필드 */}
              {activeTab === 'auto' ? (
                <div className="max-w-xl mx-auto">
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder={`${currentCategory?.name || '경제'} 관련 키워드 입력...`}
                    className="w-full bg-gray-50 text-gray-900 border-2 border-gray-300 rounded-2xl px-6 py-4 text-lg focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:bg-white outline-none transition-all placeholder:text-gray-400"
                  />
                  <p className="text-center text-gray-400 text-xs mt-3">
                    💡 키워드를 입력하면 AI가 트렌드 대본을 자동 생성합니다
                  </p>
                </div>
              ) : (
                <div className="max-w-2xl mx-auto">
                  <textarea
                    value={manualScript}
                    onChange={(e) => setManualScript(e.target.value)}
                    placeholder="직접 작성한 대본을 입력하세요..."
                    className="w-full h-48 bg-gray-50 text-gray-900 border-2 border-gray-300 rounded-2xl px-6 py-4 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:bg-white outline-none transition-all placeholder:text-gray-400 resize-none"
                  />
                </div>
              )}
            </div>
          )}

          {/* Step 3: 스크립트 & AI 보이스 */}
          {currentStep === 3 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">스크립트 & AI 보이스</h2>
                <p className="text-gray-500">스크립트를 확인하고 AI 음성을 선택하세요.</p>
              </div>

              {/* 2열 레이아웃 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 좌측: 스크립트 편집 */}
                <div className="bg-gray-50 rounded-2xl border-2 border-gray-200 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-gray-700">📝 스크립트 편집</h3>
                    <span className="text-[10px] text-gray-400 bg-gray-200 px-2 py-1 rounded-full">
                      {activeTab === 'auto' ? '자동 생성 예정' : '수동 입력'}
                    </span>
                  </div>
                  <div className="relative">
                    <textarea
                      value={activeTab === 'auto' ? `주제: ${topic}\n\n(AI가 자동으로 스크립트를 생성합니다)` : manualScript}
                      onChange={(e) => activeTab === 'manual' && setManualScript(e.target.value)}
                      readOnly={activeTab === 'auto'}
                      placeholder="스크립트 내용이 여기에 표시됩니다..."
                      className={`w-full h-48 bg-white text-gray-900 border-2 border-gray-200 rounded-xl px-4 py-3 text-sm leading-relaxed resize-none outline-none transition-all ${
                        activeTab === 'auto'
                          ? 'cursor-not-allowed text-gray-500'
                          : 'focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20'
                      }`}
                    />
                    {activeTab === 'manual' && (
                      <div className="absolute bottom-3 right-3 text-[10px] text-gray-400">
                        {manualScript.length} / 5,000자
                      </div>
                    )}
                  </div>
                </div>

                {/* 우측: AI 보이스 선택 */}
                <div className="bg-gray-50 rounded-2xl border-2 border-gray-200 p-5">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-gray-700">
                      🎙️ AI 보이스오버 <span className="text-red-500">*</span>
                    </h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setTtsEngine('gemini')}
                        className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all ${
                          ttsEngine === 'gemini'
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                        }`}
                      >
                        Gemini
                      </button>
                      <button
                        onClick={() => hasElevenLabsEnv && setTtsEngine('elevenlabs')}
                        className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all ${
                          ttsEngine === 'elevenlabs'
                            ? 'bg-fuchsia-500 text-white'
                            : hasElevenLabsEnv
                            ? 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                            : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                        }`}
                      >
                        ElevenLabs {!hasElevenLabsEnv && '🔒'}
                      </button>
                      {/* 음성 생성 버튼 */}
                      <button
                        onClick={handleGenerateFullAudio}
                        disabled={isGeneratingAudio || (ttsEngine === 'gemini' ? favoriteGeminiVoices.length === 0 : favoriteElevenVoices.length === 0)}
                        className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all flex items-center gap-1 whitespace-nowrap shrink-0 ${
                          generatedAudioUrl
                            ? 'bg-emerald-500 text-white'
                            : 'bg-brand-500 text-white hover:bg-brand-600 disabled:bg-gray-300 disabled:cursor-not-allowed'
                        }`}
                      >
                        {isGeneratingAudio ? (
                          <>
                            <div className="w-3 h-3 border-2 border-white border-t-transparent animate-spin rounded-full shrink-0" />
                            <span>생성중</span>
                          </>
                        ) : generatedAudioUrl ? (
                          <>
                            <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span>완료</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                            </svg>
                            <span>생성</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* 목소리 미추가 경고 */}
                  {((ttsEngine === 'gemini' && favoriteGeminiVoices.length === 0) ||
                    (ttsEngine === 'elevenlabs' && favoriteElevenVoices.length === 0)) && (
                    <p className="text-xs text-amber-600 mb-3">
                      ⚠️ 목소리를 추가해야 다음 단계로 진행할 수 있습니다
                    </p>
                  )}

                  {/* 목소리 추가 버튼 */}
                  <button
                    onClick={() => setShowVoiceModal(true)}
                    className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 hover:border-brand-500 hover:text-brand-500 transition-all mb-3"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="text-sm font-bold">목소리 추가</span>
                  </button>

                  {/* 목소리 카드 리스트 (즐겨찾기) */}
                  <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                    {ttsEngine === 'gemini' ? (
                      favoriteGeminiVoices.length > 0 ? (
                        GEMINI_VOICE_LIST.filter(v => favoriteGeminiVoices.includes(v.id)).map((voice) => (
                          <div
                            key={voice.id}
                            className={`relative group flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                              geminiVoice === voice.id
                                ? 'border-blue-500 bg-blue-50 shadow-sm'
                                : 'border-gray-200 bg-white hover:border-gray-300'
                            }`}
                          >
                            <button
                              onClick={() => setGeminiVoice(voice.id)}
                              className="flex items-center gap-3 flex-1 text-left"
                            >
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0 ${
                                geminiVoice === voice.id ? 'bg-blue-500' : 'bg-gray-200'
                              }`}>
                                {geminiVoice === voice.id ? (
                                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                ) : (
                                  <span>{voice.gender === '여성' ? '👩' : '👨'}</span>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className={`text-sm font-bold truncate ${geminiVoice === voice.id ? 'text-gray-900' : 'text-gray-700'}`}>
                                  {voice.name}
                                </div>
                                <div className="text-[10px] text-gray-400 truncate">
                                  {voice.gender} · {voice.description}
                                </div>
                              </div>
                              {geminiVoice === voice.id && (
                                <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center shrink-0">
                                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                              )}
                            </button>
                            {/* 삭제 버튼 */}
                            <button
                              onClick={(e) => { e.stopPropagation(); removeGeminiVoice(voice.id); }}
                              className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
                            >
                              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-6 text-gray-400 text-sm">
                          목소리 추가 버튼을 눌러 목소리를 추가하세요
                        </div>
                      )
                    ) : (
                      // ElevenLabs 목소리 (즐겨찾기에 추가된 목소리만 표시)
                      (() => {
                        const allElevenVoices = [...userCustomVoices, ...ELEVENLABS_KOREAN_VOICES_FEMALE, ...ELEVENLABS_KOREAN_VOICES_MALE];
                        const displayVoices = allElevenVoices.filter(v => favoriteElevenVoices.includes(v.voice_id));

                        return displayVoices.length > 0 ? (
                          displayVoices.map((voice) => (
                            <div
                              key={voice.voice_id}
                              className={`relative group flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                                elSelectedVoiceId === voice.voice_id
                                  ? 'border-fuchsia-500 bg-fuchsia-50 shadow-sm'
                                  : 'border-gray-200 bg-white hover:border-gray-300'
                              }`}
                            >
                              <button
                                onClick={() => setElSelectedVoiceId(voice.voice_id)}
                                className="flex items-center gap-3 flex-1 text-left"
                              >
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0 ${
                                  elSelectedVoiceId === voice.voice_id ? 'bg-fuchsia-500' : 'bg-gray-200'
                                }`}>
                                  {elSelectedVoiceId === voice.voice_id ? (
                                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                  ) : (
                                    <span>{voice.labels?.gender === 'female' ? '👩' : '👨'}</span>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className={`text-sm font-bold truncate ${elSelectedVoiceId === voice.voice_id ? 'text-gray-900' : 'text-gray-700'}`}>
                                    {voice.name}
                                  </div>
                                  <div className="text-[10px] text-gray-400 truncate">
                                    {voice.labels?.gender === 'female' ? '여성' : '남성'} · {voice.labels?.description || voice.category}
                                  </div>
                                </div>
                                {elSelectedVoiceId === voice.voice_id && (
                                  <div className="w-5 h-5 bg-fuchsia-500 rounded-full flex items-center justify-center shrink-0">
                                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                  </div>
                                )}
                              </button>
                              {/* 삭제 버튼 */}
                              <button
                                onClick={(e) => { e.stopPropagation(); removeElevenVoice(voice.voice_id); }}
                                className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
                              >
                                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-6 text-gray-400 text-sm">
                            목소리 추가 버튼을 눌러 목소리를 추가하세요
                          </div>
                        );
                      })()
                    )}
                  </div>
                </div>
              </div>

              {/* 목소리 추가 모달 */}
              {showVoiceModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowVoiceModal(false)}>
                  <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[80vh] overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold text-gray-900">🎤 목소리 추가</h3>
                      <button
                        onClick={() => setShowVoiceModal(false)}
                        className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-all"
                      >
                        <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    <p className="text-sm text-gray-500 mb-4">
                      추가할 목소리를 선택하세요. ({ttsEngine === 'gemini' ? 'Gemini' : 'ElevenLabs'})
                    </p>

                    <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-2">
                      {ttsEngine === 'gemini' ? (
                        GEMINI_VOICE_LIST.filter(v => !favoriteGeminiVoices.includes(v.id)).map((voice) => (
                          <button
                            key={voice.id}
                            onClick={() => addGeminiVoice(voice.id)}
                            className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-gray-200 bg-white hover:border-blue-500 hover:bg-blue-50 transition-all text-left"
                          >
                            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-lg shrink-0">
                              <span>{voice.gender === '여성' ? '👩' : '👨'}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-bold text-gray-700 truncate">{voice.name}</div>
                              <div className="text-[10px] text-gray-400 truncate">{voice.gender} · {voice.description}</div>
                            </div>
                            <div className="w-6 h-6 rounded-full border-2 border-gray-300 flex items-center justify-center shrink-0">
                              <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                            </div>
                          </button>
                        ))
                      ) : (
                        [...userCustomVoices, ...ELEVENLABS_KOREAN_VOICES_FEMALE, ...ELEVENLABS_KOREAN_VOICES_MALE]
                          .filter(v => !favoriteElevenVoices.includes(v.voice_id))
                          .map((voice) => (
                            <button
                              key={voice.voice_id}
                              onClick={() => addElevenVoice(voice.voice_id)}
                              className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-gray-200 bg-white hover:border-fuchsia-500 hover:bg-fuchsia-50 transition-all text-left"
                            >
                              <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-lg shrink-0">
                                <span>{voice.labels?.gender === 'female' ? '👩' : '👨'}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold text-gray-700 truncate">{voice.name}</div>
                                <div className="text-[10px] text-gray-400 truncate">
                                  {voice.labels?.gender === 'female' ? '여성' : '남성'} · {voice.labels?.description || voice.category}
                                </div>
                              </div>
                              <div className="w-6 h-6 rounded-full border-2 border-gray-300 flex items-center justify-center shrink-0">
                                <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                              </div>
                            </button>
                          ))
                      )}

                      {((ttsEngine === 'gemini' && GEMINI_VOICE_LIST.filter(v => !favoriteGeminiVoices.includes(v.id)).length === 0) ||
                        (ttsEngine === 'elevenlabs' && [...userCustomVoices, ...ELEVENLABS_KOREAN_VOICES_FEMALE, ...ELEVENLABS_KOREAN_VOICES_MALE].filter(v => !favoriteElevenVoices.includes(v.voice_id)).length === 0)) && (
                        <div className="text-center py-8 text-gray-400 text-sm">
                          모든 목소리가 이미 추가되었습니다
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 하단: Generated Audio 섹션 (파형 포함) */}
              {generatedAudioUrl ? (
                <div className="mt-6 bg-white rounded-2xl border-2 border-gray-200 p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-sm font-bold text-emerald-600">Generated Audio</span>
                    </div>
                    <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
                      {ttsEngine === 'gemini' ? 'GEMINI TTS' : 'ELEVENLABS TTS'}
                    </span>
                  </div>

                  <div className="flex items-center gap-4">
                    {/* 재생 버튼 */}
                    <button
                      onClick={playGeneratedAudio}
                      className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shrink-0 ${
                        isPlayingGenerated
                          ? 'bg-brand-500 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-brand-500 hover:text-white'
                      }`}
                    >
                      {isPlayingGenerated ? (
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      )}
                    </button>

                    {/* 파형 시각화 */}
                    <div className="flex-1 h-12 flex items-center gap-[2px]">
                      {waveformData.map((value, index) => {
                        const progress = audioDuration > 0 ? (audioCurrentTime / audioDuration) : 0;
                        const barProgress = index / waveformData.length;
                        const isPlayed = barProgress <= progress;

                        return (
                          <div
                            key={index}
                            className={`flex-1 rounded-full transition-all ${
                              isPlayed ? 'bg-brand-500' : 'bg-gray-300'
                            }`}
                            style={{
                              height: `${Math.max(8, value * 100)}%`,
                              minHeight: '4px'
                            }}
                          />
                        );
                      })}
                    </div>

                    {/* 시간 표시 */}
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-gray-900">{formatTime(audioCurrentTime)}</div>
                      <div className="text-[10px] text-gray-400">/ {formatTime(audioDuration)}</div>
                    </div>
                  </div>

                  {/* 숨겨진 오디오 요소 */}
                  <audio
                    ref={generatedAudioRef}
                    src={generatedAudioUrl}
                    onTimeUpdate={(e) => setAudioCurrentTime(e.currentTarget.currentTime)}
                    onLoadedMetadata={(e) => setAudioDuration(e.currentTarget.duration)}
                    onEnded={() => setIsPlayingGenerated(false)}
                    className="hidden"
                  />
                </div>
              ) : (
                /* 음성 생성 전: 미리듣기 섹션 */
                ((ttsEngine === 'gemini' && favoriteGeminiVoices.length > 0) ||
                  (ttsEngine === 'elevenlabs' && favoriteElevenVoices.length > 0)) && (
                  <div className="mt-6 bg-white rounded-2xl border-2 border-gray-200 p-5 shadow-sm">
                    {/* 테스트 오디오 파형이 있으면 표시 */}
                    {testAudioUrl && testWaveformData.length > 0 ? (
                      <>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${isPlayingTest ? 'bg-blue-500 animate-pulse' : 'bg-gray-400'}`} />
                            <span className="text-sm font-bold text-gray-700">음성 미리듣기</span>
                          </div>
                          <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
                            {ttsEngine === 'gemini' ? 'GEMINI TTS' : 'ELEVENLABS TTS'}
                          </span>
                        </div>

                        <div className="flex items-center gap-4">
                          {/* 재생 버튼 */}
                          <button
                            onClick={playTestAudio}
                            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shrink-0 ${
                              isPlayingTest
                                ? 'bg-blue-500 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-blue-500 hover:text-white'
                            }`}
                          >
                            {isPlayingTest ? (
                              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                              </svg>
                            ) : (
                              <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            )}
                          </button>

                          {/* 파형 시각화 */}
                          <div className="flex-1 h-12 flex items-center gap-[2px]">
                            {testWaveformData.map((value, index) => {
                              const progress = testAudioDuration > 0 ? (testAudioCurrentTime / testAudioDuration) : 0;
                              const barProgress = index / testWaveformData.length;
                              const isPlayed = barProgress <= progress;

                              return (
                                <div
                                  key={index}
                                  className={`flex-1 rounded-full transition-all ${
                                    isPlayed ? 'bg-blue-500' : 'bg-gray-300'
                                  }`}
                                  style={{
                                    height: `${Math.max(8, value * 100)}%`,
                                    minHeight: '4px'
                                  }}
                                />
                              );
                            })}
                          </div>

                          {/* 시간 표시 */}
                          <div className="text-right shrink-0">
                            <div className="text-sm font-bold text-gray-900">{formatTime(testAudioCurrentTime)}</div>
                            <div className="text-[10px] text-gray-400">/ {formatTime(testAudioDuration)}</div>
                          </div>

                          {/* 다시 생성 버튼 */}
                          <button
                            onClick={() => ttsEngine === 'gemini' ? handleTestGeminiVoice(geminiVoice) : handleTestVoice()}
                            disabled={testingGeminiVoice !== null || isTestingVoice}
                            className="p-2 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 transition-all disabled:opacity-50"
                            title="다시 생성"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          </button>
                        </div>

                        {/* 숨겨진 오디오 요소 */}
                        <audio
                          ref={testAudioRef}
                          src={testAudioUrl}
                          onTimeUpdate={(e) => setTestAudioCurrentTime(e.currentTarget.currentTime)}
                          onLoadedMetadata={(e) => setTestAudioDuration(e.currentTarget.duration)}
                          onEnded={() => setIsPlayingTest(false)}
                          className="hidden"
                        />
                      </>
                    ) : (
                      /* 미리듣기 버튼 (파형 없을 때) */
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                            ttsEngine === 'gemini' ? 'bg-blue-500' : 'bg-fuchsia-500'
                          }`}>
                            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                            </svg>
                          </div>
                          <div>
                            <div className="text-sm font-bold text-gray-900">
                              {ttsEngine === 'gemini'
                                ? GEMINI_VOICE_LIST.find(v => v.id === geminiVoice)?.name || '목소리를 선택하세요'
                                : [...userCustomVoices, ...ELEVENLABS_KOREAN_VOICES_FEMALE, ...ELEVENLABS_KOREAN_VOICES_MALE].find(v => v.voice_id === elSelectedVoiceId)?.name || '목소리를 선택하세요'
                              }
                            </div>
                            <div className="text-[10px] text-gray-400">
                              {ttsEngine === 'gemini' ? 'Gemini TTS · 무료' : 'ElevenLabs TTS · 프리미엄'}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => ttsEngine === 'gemini' ? handleTestGeminiVoice(geminiVoice) : handleTestVoice()}
                          disabled={testingGeminiVoice !== null || isTestingVoice}
                          className={`px-6 py-3 rounded-xl text-white text-sm font-bold flex items-center gap-2 transition-all disabled:opacity-50 ${
                            ttsEngine === 'gemini'
                              ? 'bg-blue-500 hover:bg-blue-600'
                              : 'bg-fuchsia-500 hover:bg-fuchsia-600'
                          }`}
                        >
                          {(testingGeminiVoice !== null || isTestingVoice) ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent animate-spin rounded-full" />
                              생성 중...
                            </>
                          ) : (
                            <>
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                              음성 미리듣기
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          )}

          {/* Step 4: 이미지 생성 (씬별 편집) */}
          {currentStep === 4 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              {/* 상단 헤더 */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 bg-gray-100 px-3 py-2 rounded-xl">
                    <svg className="w-4 h-4 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-sm font-bold text-gray-700">Gemini Imagen</span>
                  </div>
                  <div className="flex items-center gap-2 bg-gray-100 px-3 py-2 rounded-xl">
                    <span className="text-sm text-gray-600">{selectedStyle ? VISUAL_STYLE_LIST.find(s => s.id === selectedStyle)?.name : '커스텀'}</span>
                  </div>
                  <div className="flex items-center gap-2 bg-gray-100 px-3 py-2 rounded-xl">
                    <span className="text-sm text-gray-600">{aspectRatio}</span>
                  </div>
                </div>
                <button
                  onClick={generateAllSceneImages}
                  disabled={isGeneratingAllImages || scenes.every(s => s.imageUrl)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-brand-500 text-white rounded-xl font-bold text-sm hover:bg-brand-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGeneratingAllImages ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent animate-spin rounded-full" />
                      생성 중...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                      전체 생성
                      <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs">
                        {scenes.length - generatedImageCount}
                      </span>
                    </>
                  )}
                </button>
              </div>

              {/* 진행 상태 */}
              <div className="flex items-center gap-4 mb-6 text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  {generatedImageCount}/{scenes.length} Cut
                </span>
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  {scenes.length} Prompts
                </span>
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {formatTime(scenes[scenes.length - 1]?.endTime || 0)}
                </span>
              </div>

              {/* 2열 레이아웃: 좌측 씬 목록 + 우측 편집 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 좌측: 씬 목록 */}
                <div className="bg-gray-50 rounded-2xl border-2 border-gray-200 p-4 max-h-[500px] overflow-y-auto">
                  <div className="space-y-3">
                    {scenes.map((scene) => (
                      <div
                        key={scene.id}
                        onClick={() => setSelectedSceneId(scene.id)}
                        className={`relative p-4 rounded-xl border-2 cursor-pointer transition-all ${
                          selectedSceneId === scene.id
                            ? 'border-brand-500 bg-white shadow-md'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                      >
                        {/* 씬 헤더 */}
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-gray-500">Cut {scene.id}</span>
                          <div className="flex items-center gap-2 text-[10px] text-gray-400">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                            {formatTime(scene.startTime)} - {formatTime(scene.endTime)}
                          </div>
                        </div>

                        {/* 스크립트 */}
                        <p className="text-sm text-gray-800 font-medium mb-2 line-clamp-2">
                          {scene.script}
                        </p>

                        {/* 프롬프트 미리보기 */}
                        <div className="flex items-start gap-2 text-[10px] text-gray-400">
                          <svg className="w-3 h-3 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className="line-clamp-1">{scene.prompt.substring(0, 50)}...</span>
                        </div>

                        {/* 이미지 생성 상태 */}
                        {scene.isGenerating && (
                          <div className="absolute inset-0 bg-white/80 rounded-xl flex items-center justify-center">
                            <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent animate-spin rounded-full" />
                          </div>
                        )}
                        {scene.imageUrl && (
                          <div className="absolute top-2 right-2 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 우측: 씬 편집 패널 */}
                <div className="space-y-4">
                  {getSelectedScene() ? (
                    <>
                      {/* 이미지 미리보기 */}
                      <div className="bg-gray-100 rounded-2xl border-2 border-gray-200 aspect-video flex items-center justify-center overflow-hidden">
                        {getSelectedScene()?.imageUrl ? (
                          <img
                            src={getSelectedScene()?.imageUrl || ''}
                            alt={`Scene ${selectedSceneId}`}
                            className="w-full h-full object-cover"
                          />
                        ) : getSelectedScene()?.isGenerating ? (
                          <div className="text-center">
                            <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent animate-spin rounded-full mx-auto mb-3" />
                            <p className="text-sm text-gray-500">이미지 생성 중...</p>
                          </div>
                        ) : (
                          <div className="text-center p-8">
                            <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <p className="text-sm text-gray-500 mb-4">이미지를 업로드 하거나 새로 생성해 보세요</p>
                            <div className="flex justify-center gap-3">
                              <button className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-gray-200 rounded-xl text-sm text-gray-600 hover:border-gray-300 transition-all">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                </svg>
                                라이브러리
                              </button>
                              <label className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-gray-200 rounded-xl text-sm text-gray-600 hover:border-gray-300 transition-all cursor-pointer">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                </svg>
                                업로드
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => selectedSceneId && handleSceneImageUpload(selectedSceneId, e)}
                                />
                              </label>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 이미지 프롬프트 */}
                      <div className="bg-white rounded-2xl border-2 border-gray-200 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span className="text-sm font-bold text-gray-700">이미지 프롬프트</span>
                          </div>
                          <button
                            onClick={() => selectedSceneId && autoGeneratePrompt(selectedSceneId)}
                            className="flex items-center gap-1 px-3 py-1 bg-gray-100 rounded-lg text-xs text-gray-600 hover:bg-gray-200 transition-all"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            자동 생성
                          </button>
                        </div>
                        <textarea
                          value={getSelectedScene()?.prompt || ''}
                          onChange={(e) => selectedSceneId && updateScenePrompt(selectedSceneId, e.target.value)}
                          placeholder="이미지 생성을 위한 프롬프트를 입력하세요..."
                          rows={4}
                          className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 focus:border-brand-500 focus:bg-white outline-none transition-all resize-none"
                        />
                      </div>

                      {/* 이미지 생성 버튼 */}
                      <button
                        onClick={() => selectedSceneId && generateSceneImage(selectedSceneId)}
                        disabled={getSelectedScene()?.isGenerating}
                        className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-brand-500 text-white rounded-xl font-bold text-sm hover:bg-brand-600 transition-all disabled:opacity-50"
                      >
                        {getSelectedScene()?.isGenerating ? (
                          <>
                            <div className="w-5 h-5 border-2 border-white border-t-transparent animate-spin rounded-full" />
                            이미지 생성 중...
                          </>
                        ) : (
                          <>
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            이미지 생성
                          </>
                        )}
                      </button>
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-64 text-gray-400">
                      좌측에서 씬을 선택하세요
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 5: 고급 설정 */}
          {currentStep === 5 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">고급 설정</h2>
                <p className="text-gray-500">추가 옵션을 설정하세요. (선택사항)</p>
              </div>

              {/* FAL.ai 설정 */}
              <div className="mb-8">
                <h3 className="text-sm font-bold text-gray-600 mb-4">🎬 FAL.ai 영상 애니메이션</h3>
                <div className="bg-gray-50 rounded-2xl p-5 border-2 border-gray-200">
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-bold text-gray-500 mb-2 block">FAL API Key</label>
                      <input
                        type="password"
                        value={falApiKey}
                        onChange={(e) => setFalApiKey(e.target.value)}
                        placeholder="fal_..."
                        className="w-full bg-white border-2 border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 focus:border-cyan-500 outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-gray-500 mb-2 block">비디오 모델</label>
                        <select
                          value={falVideoModel}
                          onChange={(e) => setFalVideoModel(e.target.value as VideoModelType)}
                          className="w-full bg-white border-2 border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 cursor-pointer hover:border-cyan-500 focus:border-cyan-500 outline-none"
                        >
                          {VIDEO_MODEL_LIST.map((model) => (
                            <option key={model.id} value={model.id}>
                              {model.name} - {model.price}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-500 mb-2 block">줌 효과</label>
                        <select
                          value={zoomEffect}
                          onChange={(e) => setZoomEffect(e.target.value as ZoomEffectType)}
                          className="w-full bg-white border-2 border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 cursor-pointer hover:border-brand-500 focus:border-brand-500 outline-none"
                        >
                          {ZOOM_EFFECT_LIST.map((zoom) => (
                            <option key={zoom.id} value={zoom.id}>
                              {zoom.emoji} {zoom.name} - {zoom.description}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <p className="text-[10px] text-gray-400">
                      💡 FAL API 키를 입력하면 앞 {CONFIG.ANIMATION.ENABLED_SCENES}개 씬에 영상 애니메이션이 적용됩니다
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 네비게이션 버튼 */}
        <div className="flex items-center justify-between mt-8">
          <button
            onClick={currentStep === 1 ? onBack : prevStep}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors font-bold"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {currentStep === 1 ? '대시보드로' : '이전'}
          </button>

          {currentStep < 5 ? (
            <button
              onClick={nextStep}
              disabled={!canProceed()}
              className="flex items-center gap-2 px-8 py-3 rounded-xl bg-brand-500 text-white hover:bg-brand-600 transition-colors font-bold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              다음 단계
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={isProcessing || !canProceed()}
              className="flex items-center gap-2 px-8 py-3 rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 transition-colors font-bold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent animate-spin rounded-full" />
                  생성 중...
                </>
              ) : (
                <>
                  🚀 영상 생성 시작
                </>
              )}
            </button>
          )}
        </div>
      </main>
    </div>
  );
};

export default ProjectWizard;
