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
import { CATEGORY_LIST, STYLE_LIST, VIDEO_MODEL_LIST, ZOOM_EFFECT_LIST, CategoryType, StyleType, VideoModelType, ZoomEffectType } from '../services/prompts';

interface InputSectionProps {
  onGenerate: (
    topic: string,
    referenceImages: string[],
    sourceText: string | null,
    ttsConfig: { engine: TtsEngineType, geminiVoice?: string, elApiKey?: string, elVoiceId?: string },
    generationOptions?: { category: CategoryType, style: StyleType, videoModel?: VideoModelType, zoomEffect?: ZoomEffectType }
  ) => void;
  step: GenerationStep;
}

const InputSection: React.FC<InputSectionProps> = ({ onGenerate, step }) => {
  const [activeTab, setActiveTab] = useState<'auto' | 'manual'>('auto');
  const [topic, setTopic] = useState('');
  const [manualScript, setManualScript] = useState('');
  const [referenceImages, setReferenceImages] = useState<string[]>([]);

  // 카테고리 & 스타일 상태
  const [selectedCategory, setSelectedCategory] = useState<CategoryType>('economy');
  const [selectedStyle, setSelectedStyle] = useState<StyleType>('default');

  // TTS 엔진 선택 상태
  const [ttsEngine, setTtsEngine] = useState<TtsEngineType>(
    (localStorage.getItem(CONFIG.STORAGE_KEYS.TTS_ENGINE) as TtsEngineType) || CONFIG.DEFAULT_TTS_ENGINE
  );

  // 로컬 저장소에서 키 로드
  const [showFalSettings, setShowFalSettings] = useState(false);

  const [elVoices, setElVoices] = useState<ElevenLabsVoice[]>(ELEVENLABS_KOREAN_VOICES as ElevenLabsVoice[]);
  const [elSelectedVoiceId, setElSelectedVoiceId] = useState(getElevenLabsVoiceId());
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const [falApiKey, setFalApiKey] = useState(localStorage.getItem(CONFIG.STORAGE_KEYS.FAL_API_KEY) || '');
  const [falVideoModel, setFalVideoModel] = useState<VideoModelType>((localStorage.getItem(CONFIG.STORAGE_KEYS.FAL_VIDEO_MODEL) as VideoModelType) || 'pixverse');
  const [zoomEffect, setZoomEffect] = useState<ZoomEffectType>((localStorage.getItem(CONFIG.STORAGE_KEYS.ZOOM_EFFECT) as ZoomEffectType) || 'medium');
  const [geminiVoice, setGeminiVoice] = useState<GeminiVoiceType>((localStorage.getItem(CONFIG.STORAGE_KEYS.GEMINI_VOICE) as GeminiVoiceType) || CONFIG.DEFAULT_GEMINI_VOICE);
  const [testingGeminiVoice, setTestingGeminiVoice] = useState<string | null>(null);
  const [isTestingVoice, setIsTestingVoice] = useState(false);
  const [showVideoModelDropdown, setShowVideoModelDropdown] = useState(false);

  // ElevenLabs 환경변수 여부 확인
  const hasElevenLabsEnv = !!ENV_CONFIG.ELEVENLABS_API_KEY;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoModelDropdownRef = useRef<HTMLDivElement>(null);

  // 비디오 모델 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (videoModelDropdownRef.current && !videoModelDropdownRef.current.contains(event.target as Node)) {
        setShowVideoModelDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 설정 변경 시 로컬 저장소에 보관
  useEffect(() => {
    if (falApiKey) localStorage.setItem(CONFIG.STORAGE_KEYS.FAL_API_KEY, falApiKey);
    if (falVideoModel) localStorage.setItem(CONFIG.STORAGE_KEYS.FAL_VIDEO_MODEL, falVideoModel);
    if (zoomEffect) localStorage.setItem(CONFIG.STORAGE_KEYS.ZOOM_EFFECT, zoomEffect);
    if (geminiVoice) localStorage.setItem(CONFIG.STORAGE_KEYS.GEMINI_VOICE, geminiVoice);
    if (ttsEngine) localStorage.setItem(CONFIG.STORAGE_KEYS.TTS_ENGINE, ttsEngine);
    if (elSelectedVoiceId) localStorage.setItem(CONFIG.STORAGE_KEYS.ELEVENLABS_VOICE_ID, elSelectedVoiceId);
  }, [falApiKey, falVideoModel, zoomEffect, geminiVoice, ttsEngine, elSelectedVoiceId]);

  // 한국어 음성인지 확인하는 헬퍼 함수
  const isKoreanVoice = (voice: ElevenLabsVoice): boolean => {
    const labels = voice.labels || {};
    const checkFields = [
      labels.accent,
      labels.language,
      labels.description,
      voice.name
    ].filter(Boolean).join(' ').toLowerCase();

    return checkFields.includes('korean') ||
           checkFields.includes('korea') ||
           checkFields.includes('한국') ||
           checkFields.includes('서울');
  };

  // 사용자가 만든 음성 (cloned, generated 등)
  const [userCustomVoices, setUserCustomVoices] = useState<ElevenLabsVoice[]>([]);

  // ElevenLabs 음성 목록 불러오기 (추천 + 사용자 음성)
  const loadElevenLabsVoices = async () => {
    const apiKey = getElevenLabsApiKey();
    if (!apiKey || apiKey.length < 10) {
      // API 키 없으면 추천 목록만 사용
      setElVoices(ELEVENLABS_KOREAN_VOICES);
      setUserCustomVoices([]);
      return;
    }
    setIsLoadingVoices(true);
    try {
      const allVoices = await fetchElevenLabsVoices(apiKey);

      // 사용자가 만든 음성 (cloned, generated, professional 카테고리)
      const customCategories = ['cloned', 'generated', 'professional', 'high_quality'];
      const customVoices = allVoices.filter(v =>
        customCategories.includes(v.category?.toLowerCase() || '') ||
        v.category === 'cloned' ||
        !['premade', 'professional'].includes(v.category?.toLowerCase() || '')
      );

      // premade 중 한국어 음성
      const koreanPremadeVoices = allVoices.filter(v =>
        v.category?.toLowerCase() === 'premade' && isKoreanVoice(v)
      );

      // 추천 목록에 없는 한국어 premade 음성
      const recommendedIds = new Set(ELEVENLABS_KOREAN_VOICES.map(v => v.voice_id));
      const additionalKoreanVoices = koreanPremadeVoices.filter(v => !recommendedIds.has(v.voice_id));

      // 전체 목록 = 추천 + 추가 한국어
      const mergedVoices = [...ELEVENLABS_KOREAN_VOICES, ...additionalKoreanVoices];

      console.log(`[ElevenLabs] 추천 ${ELEVENLABS_KOREAN_VOICES.length}개 + 추가 ${additionalKoreanVoices.length}개 + 내 음성 ${customVoices.length}개`);
      setElVoices(mergedVoices);
      setUserCustomVoices(customVoices);
    } catch (e) {
      console.error('음성 목록 로드 실패:', e);
      // 실패해도 추천 목록은 유지
      setElVoices(ELEVENLABS_KOREAN_VOICES);
      setUserCustomVoices([]);
    } finally {
      setIsLoadingVoices(false);
    }
  };

  // 환경변수에 ElevenLabs 키가 있으면 음성 목록 자동 로드
  useEffect(() => {
    if (hasElevenLabsEnv) {
      loadElevenLabsVoices();
    }
  }, [hasElevenLabsEnv]);

  // Raw PCM을 WAV로 변환 (Gemini TTS용)
  const pcmToWav = (pcmData: Uint8Array, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) => {
    const byteRate = sampleRate * numChannels * bitsPerSample / 8;
    const blockAlign = numChannels * bitsPerSample / 8;
    const dataSize = pcmData.length;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // WAV 헤더 작성
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

    // PCM 데이터 복사
    const wavBytes = new Uint8Array(buffer);
    wavBytes.set(pcmData, 44);
    return wavBytes;
  };

  // Gemini TTS 음성 미리듣기
  const handleTestGeminiVoice = async (voiceId: string) => {
    if (testingGeminiVoice) return;

    setTestingGeminiVoice(voiceId);
    setGeminiVoice(voiceId as GeminiVoiceType);

    try {
      const testText = "안녕하세요. 이 목소리는 테스트 음성입니다.";
      console.log('[Gemini TTS] 음성 생성 시작:', voiceId);
      const audioData = await generateAudioForScene(testText, voiceId);
      console.log('[Gemini TTS] 음성 데이터 수신:', audioData ? `${audioData.length}자` : 'null');

      if (audioData) {
        // 방법 1: 직접 재생 시도 (이미 인코딩된 오디오일 경우)
        const tryPlay = async (mimeType: string, data: string) => {
          return new Promise<boolean>((resolve) => {
            const audio = new Audio(`data:${mimeType};base64,${data}`);
            audio.oncanplaythrough = () => {
              audio.play().then(() => resolve(true)).catch(() => resolve(false));
            };
            audio.onerror = () => resolve(false);
            setTimeout(() => resolve(false), 1000);
          });
        };

        // 여러 포맷 시도
        const formats = ['audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/ogg'];
        let played = false;

        for (const fmt of formats) {
          if (await tryPlay(fmt, audioData)) {
            console.log('[Gemini TTS] 재생 성공:', fmt);
            played = true;
            break;
          }
        }

        // 방법 2: PCM → WAV 변환 후 재생
        if (!played) {
          console.log('[Gemini TTS] PCM → WAV 변환 시도');
          try {
            const binaryString = atob(audioData);
            const pcmBytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              pcmBytes[i] = binaryString.charCodeAt(i);
            }
            const wavBytes = pcmToWav(pcmBytes, 24000, 1, 16);
            const blob = new Blob([wavBytes], { type: 'audio/wav' });
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audio.onended = () => URL.revokeObjectURL(url);
            await audio.play();
            console.log('[Gemini TTS] WAV 변환 후 재생 성공');
          } catch (playError) {
            console.error('[Gemini TTS] WAV 재생 실패:', playError);
            alert(`음성 재생 실패: ${playError}`);
          }
        }
      } else {
        console.warn('[Gemini TTS] 오디오 데이터가 없습니다');
        alert('Gemini TTS 응답이 없습니다. API 키를 확인하세요.');
      }
    } catch (e: any) {
      console.error('[Gemini TTS] 음성 테스트 실패:', e);
      alert(`Gemini TTS 오류: ${e.message || e}`);
    } finally {
      setTestingGeminiVoice(null);
    }
  };

  const handleTestVoice = async () => {
    const apiKey = getElevenLabsApiKey();
    if (!apiKey) {
      alert("ElevenLabs API Key가 설정되지 않았습니다. .env.local 파일을 확인하세요.");
      return;
    }
    setIsTestingVoice(true);
    try {
      const result = await generateAudioWithElevenLabs(
        "반갑습니다. 이 목소리는 테스트 음성입니다.",
        apiKey,
        elSelectedVoiceId
      );
      if (result.audioData) {
        const audio = new Audio(`data:audio/mpeg;base64,${result.audioData}`);
        await audio.play();
      } else {
        alert("음성 생성 실패. API 키 권한을 확인하세요.");
      }
    } catch (e: any) {
      console.error('[ElevenLabs] 미리듣기 실패:', e);
      alert("오류 발생: " + (e.message || e));
    } finally {
      setIsTestingVoice(false);
    }
  };

  const isProcessing = step !== GenerationStep.IDLE && step !== GenerationStep.COMPLETED && step !== GenerationStep.ERROR;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isProcessing) return;

    // TTS 설정 구성
    const ttsConfig = {
      engine: ttsEngine,
      geminiVoice: geminiVoice,
      elApiKey: getElevenLabsApiKey(),
      elVoiceId: elSelectedVoiceId
    };

    // 생성 옵션 구성
    const genOptions = {
      category: selectedCategory,
      style: selectedStyle,
      videoModel: falVideoModel,
      zoomEffect: zoomEffect,
    };

    if (activeTab === 'auto') {
      if (topic.trim()) onGenerate(topic, referenceImages, null, ttsConfig, genOptions);
    } else {
      if (manualScript.trim()) onGenerate("Manual Script Input", referenceImages, manualScript, ttsConfig, genOptions);
    }
  };

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

  // 현재 선택된 카테고리/스타일 정보
  const currentCategory = CATEGORY_LIST.find(c => c.id === selectedCategory);
  const currentStyle = STYLE_LIST.find(s => s.id === selectedStyle);

  return (
    <div className="w-full max-w-4xl mx-auto my-8 px-4">
      <div className="text-center mb-10">
        <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-2 text-white">
          TubeGen <span className="text-brand-500">Studio</span>
        </h1>
        <p className="text-gray-400 text-sm font-medium uppercase tracking-widest">졸라맨 V10.0 Concept-Based Engine</p>
      </div>

      {/* 카테고리 & 스타일 & 비디오 모델 & 줌효과 선택 섹션 */}
      <div className="mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-4xl mx-auto">
          {/* 카테고리 드롭다운 */}
          <div>
            <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest mb-2 block text-center">
              카테고리
            </label>
            <div className="relative">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value as CategoryType)}
                className="w-full appearance-none bg-[#12121a] text-white border border-gray-700 rounded-2xl px-4 py-3.5 text-sm font-bold cursor-pointer hover:border-gray-600 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none transition-all"
              >
                {CATEGORY_LIST.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.emoji} {cat.name}
                  </option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
            {currentCategory && (
              <p className="text-center text-gray-400 text-[10px] mt-1.5 truncate">{currentCategory.description}</p>
            )}
          </div>

          {/* 스타일 드롭다운 */}
          <div>
            <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest mb-2 block text-center">
              비주얼 스타일
            </label>
            <div className="relative">
              <select
                value={selectedStyle}
                onChange={(e) => setSelectedStyle(e.target.value as StyleType)}
                className="w-full appearance-none bg-[#12121a] text-white border border-gray-700 rounded-2xl px-4 py-3.5 text-sm font-bold cursor-pointer hover:border-gray-600 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none transition-all"
              >
                {STYLE_LIST.map((style) => (
                  <option key={style.id} value={style.id}>
                    {style.emoji} {style.name}
                  </option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
            {currentStyle && (
              <p className="text-center text-gray-400 text-[10px] mt-1.5 truncate">{currentStyle.description}</p>
            )}
          </div>

          {/* 비디오 모델 커스텀 드롭다운 */}
          <div className="relative" ref={videoModelDropdownRef}>
            <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest mb-2 block text-center">
              비디오 모델
            </label>
            <button
              type="button"
              onClick={() => setShowVideoModelDropdown(!showVideoModelDropdown)}
              className="w-full bg-[#12121a] border-2 border-gray-300 rounded-2xl px-4 py-3 cursor-pointer hover:border-gray-600 focus:border-cyan-500 outline-none transition-all flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-black ${VIDEO_MODEL_LIST.find(m => m.id === falVideoModel)?.bgColor} ${VIDEO_MODEL_LIST.find(m => m.id === falVideoModel)?.textColor}`}
                >
                  {VIDEO_MODEL_LIST.find(m => m.id === falVideoModel)?.shortName}
                </span>
                <span className="text-white text-sm font-bold truncate">
                  {VIDEO_MODEL_LIST.find(m => m.id === falVideoModel)?.name}
                </span>
              </div>
              <svg className={`w-4 h-4 text-gray-400 transition-transform ${showVideoModelDropdown ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* 드롭다운 목록 */}
            {showVideoModelDropdown && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-[#1a1a24] border border-gray-800/50 rounded-2xl overflow-hidden shadow-xl z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                {VIDEO_MODEL_LIST.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => {
                      setFalVideoModel(model.id as VideoModelType);
                      setShowVideoModelDropdown(false);
                    }}
                    className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-[#1a1a24] transition-colors ${falVideoModel === model.id ? 'bg-[#12121a]' : ''}`}
                  >
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-black ${model.bgColor} ${model.textColor}`}
                    >
                      {model.shortName}
                    </span>
                    <div className="flex-1 text-left">
                      <div className="text-white text-sm font-bold">{model.name}</div>
                      <div className="text-gray-400 text-[10px]">{model.description}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-gray-500 text-xs font-bold">{model.price}</div>
                      <div className="text-gray-400 text-[10px]">{model.duration}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <p className="text-center text-gray-400 text-[10px] mt-1.5 truncate">
              {VIDEO_MODEL_LIST.find(m => m.id === falVideoModel)?.price} · {VIDEO_MODEL_LIST.find(m => m.id === falVideoModel)?.duration}
            </p>
          </div>

          {/* 줌 효과 드롭다운 */}
          <div>
            <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest mb-2 block text-center">
              줌 효과
            </label>
            <div className="relative">
              <select
                value={zoomEffect}
                onChange={(e) => setZoomEffect(e.target.value as ZoomEffectType)}
                className="w-full appearance-none bg-[#12121a] text-white border border-gray-700 rounded-2xl px-4 py-3.5 text-sm font-bold cursor-pointer hover:border-gray-600 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none transition-all"
              >
                {ZOOM_EFFECT_LIST.map((zoom) => (
                  <option key={zoom.id} value={zoom.id}>
                    {zoom.emoji} {zoom.name}
                  </option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
            <p className="text-center text-gray-400 text-[10px] mt-1.5 truncate">
              {ZOOM_EFFECT_LIST.find(z => z.id === zoomEffect)?.description}
            </p>
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-4">
        {/* TTS 엔진 선택 섹션 */}
        <div className="bg-[#1a1a24] border border-gray-800/50 rounded-3xl overflow-hidden shadow-md">
          <div className="px-6 py-5">
            {/* TTS 엔진 선택 탭 */}
            <div className="flex items-center justify-center gap-2 mb-5">
              <div className="bg-[#12121a] p-1 rounded-xl flex gap-1 border-2 border-gray-800/50">
                <button
                  type="button"
                  onClick={() => setTtsEngine('gemini')}
                  className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                    ttsEngine === 'gemini'
                      ? 'bg-blue-600 text-white shadow-lg'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <span>🎙️</span>
                  <span>Gemini TTS</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/30 text-blue-100">무료</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!hasElevenLabsEnv) {
                      alert('ElevenLabs를 사용하려면 .env.local 파일에 VITE_ELEVENLABS_API_KEY를 설정하세요.');
                      return;
                    }
                    setTtsEngine('elevenlabs');
                  }}
                  className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                    ttsEngine === 'elevenlabs'
                      ? 'bg-fuchsia-600 text-white shadow-lg'
                      : hasElevenLabsEnv
                        ? 'text-gray-500 hover:text-gray-700'
                        : 'text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <span>🔊</span>
                  <span>ElevenLabs</span>
                  {hasElevenLabsEnv ? (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/30 text-emerald-700">연결됨</span>
                  ) : (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-500">미설정</span>
                  )}
                </button>
              </div>
            </div>

            {/* Gemini TTS 음성 선택 - 드롭다운 */}
            {ttsEngine === 'gemini' && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex items-center gap-3 max-w-lg mx-auto">
                  <div className="flex-1 relative">
                    <select
                      value={geminiVoice}
                      onChange={(e) => setGeminiVoice(e.target.value as GeminiVoiceType)}
                      className="w-full appearance-none bg-[#12121a] text-white border border-gray-700 rounded-xl px-4 py-3.5 text-sm cursor-pointer hover:border-blue-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                    >
                      <optgroup label="👩 여성 음성">
                        {GEMINI_VOICE_LIST.filter(v => v.gender === '여성').map((voice) => (
                          <option key={voice.id} value={voice.id}>
                            {voice.name} - {voice.description}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="👨 남성 음성">
                        {GEMINI_VOICE_LIST.filter(v => v.gender === '남성').map((voice) => (
                          <option key={voice.id} value={voice.id}>
                            {voice.name} - {voice.description}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTestGeminiVoice(geminiVoice)}
                    disabled={testingGeminiVoice !== null}
                    className="px-5 py-3.5 rounded-xl bg-blue-600 text-white hover:bg-blue-500 transition-all text-xs font-bold flex items-center gap-2 disabled:opacity-30 shadow-lg"
                  >
                    {testingGeminiVoice ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent animate-spin rounded-full"></div>
                    ) : (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    )}
                    미리듣기
                  </button>
                </div>
                <p className="text-[10px] text-gray-500 mt-3 text-center">
                  🎙️ 무료 · 고품질 다국어 음성 · 자막 미지원
                </p>
              </div>
            )}

            {/* ElevenLabs 음성 선택 - 드롭다운 */}
            {ttsEngine === 'elevenlabs' && hasElevenLabsEnv && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex items-center gap-3 max-w-lg mx-auto">
                  <div className="flex-1 relative">
                    {elVoices.length > 0 ? (
                      <>
                        <select
                          value={elSelectedVoiceId}
                          onChange={(e) => setElSelectedVoiceId(e.target.value)}
                          className="w-full appearance-none bg-[#12121a] text-white border border-gray-700 rounded-xl px-4 py-3.5 text-sm cursor-pointer hover:border-fuchsia-500 focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20 outline-none transition-all"
                        >
                          {/* 내가 만든 음성 (최상단) */}
                          {userCustomVoices.length > 0 && (
                            <optgroup label="🎤 내가 만든 음성">
                              {userCustomVoices.map((voice) => (
                                <option key={voice.voice_id} value={voice.voice_id}>
                                  {voice.name} - {voice.labels?.description || voice.category}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          {/* 추천 여성 음성 */}
                          <optgroup label="👩 추천 여성 음성">
                            {ELEVENLABS_KOREAN_VOICES_FEMALE.map((voice) => (
                              <option key={voice.voice_id} value={voice.voice_id}>
                                {voice.name} - {voice.labels?.description || voice.category}
                              </option>
                            ))}
                          </optgroup>
                          {/* 추천 남성 음성 */}
                          <optgroup label="👨 추천 남성 음성">
                            {ELEVENLABS_KOREAN_VOICES_MALE.map((voice) => (
                              <option key={voice.voice_id} value={voice.voice_id}>
                                {voice.name} - {voice.labels?.description || voice.category}
                              </option>
                            ))}
                          </optgroup>
                          {/* 라이브러리에서 추가한 한국어 음성 */}
                          {elVoices.filter(v => !ELEVENLABS_KOREAN_VOICES.some(r => r.voice_id === v.voice_id)).length > 0 && (
                            <optgroup label="📚 라이브러리 한국어 음성">
                              {elVoices.filter(v => !ELEVENLABS_KOREAN_VOICES.some(r => r.voice_id === v.voice_id)).map((voice) => (
                                <option key={voice.voice_id} value={voice.voice_id}>
                                  {voice.name} - {voice.labels?.description || voice.category}
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-2 px-4 py-3.5 bg-[#1a1a24] rounded-xl border-2 border-gray-300">
                        {isLoadingVoices ? (
                          <>
                            <div className="w-4 h-4 border-2 border-fuchsia-400 border-t-transparent animate-spin rounded-full"></div>
                            <span className="text-gray-500 text-sm">음성 목록 불러오는 중...</span>
                          </>
                        ) : (
                          <>
                            <span className="text-gray-500 text-sm">한국어 음성 없음</span>
                            <button
                              type="button"
                              onClick={loadElevenLabsVoices}
                              className="text-fuchsia-600 hover:text-fuchsia-500 text-xs ml-2"
                            >
                              🔄 다시 시도
                            </button>
                            <a
                              href="https://elevenlabs.io/voice-library"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-fuchsia-600 hover:text-fuchsia-500 text-xs ml-2"
                            >
                              📚 Voice Library에서 추가
                            </a>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleTestVoice}
                    disabled={isTestingVoice || elVoices.length === 0}
                    className="px-5 py-3.5 rounded-xl bg-fuchsia-600 text-white hover:bg-fuchsia-500 transition-all text-xs font-bold flex items-center gap-2 disabled:opacity-30 shadow-lg"
                  >
                    {isTestingVoice ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent animate-spin rounded-full"></div>
                    ) : (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    )}
                    미리듣기
                  </button>
                </div>
                <p className="text-[10px] text-gray-500 mt-3 text-center">
                  🇰🇷 한국어 추천 음성 {ELEVENLABS_KOREAN_VOICES.length}개{userCustomVoices.length > 0 && ` + 내 음성 ${userCustomVoices.length}개`} · 자막 자동 생성
                </p>
              </div>
            )}
          </div>
        </div>

        {/* FAL.ai Animation Settings */}
        <div className="bg-[#1a1a24] border border-gray-800/50 rounded-3xl overflow-hidden shadow-md">
          <button type="button" onClick={() => setShowFalSettings(!showFalSettings)} className="w-full px-6 py-5 flex items-center justify-between hover:bg-[#1a1a24] transition-colors">
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${falApiKey ? 'bg-cyan-100 text-cyan-600' : 'bg-[#12121a] text-gray-400'}`}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div className="text-left">
                <span className="block text-sm font-bold text-white">FAL.ai 애니메이션 엔진</span>
                <span className="text-[10px] text-gray-500 uppercase tracking-widest font-black">
                  {falApiKey ? `✅ 앞 ${CONFIG.ANIMATION.ENABLED_SCENES}개 씬 영상화 활성` : '⏸️ 선택사항 - 정적 이미지만 사용'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
               {falApiKey && <span className="text-[10px] bg-cyan-100 px-2 py-1 rounded text-cyan-700 font-mono">****{falApiKey.slice(-4)}</span>}
               <svg className={`w-5 h-5 text-gray-400 transition-transform ${showFalSettings ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </div>
          </button>

          {showFalSettings && (
            <div className="p-8 border-t-2 border-gray-100 bg-[#1a1a24] space-y-4 animate-in slide-in-from-top-2 duration-200">
              <div className="space-y-2">
                <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                  FAL API Key
                  <a href="https://fal.ai/dashboard/keys" target="_blank" rel="noopener noreferrer" className="text-cyan-600 hover:text-cyan-500 transition-colors">(키 발급)</a>
                </label>
                <input type="password" value={falApiKey} onChange={(e) => setFalApiKey(e.target.value)} placeholder="fal_..." className="w-full bg-[#12121a] border-2 border-gray-300 rounded-2xl px-5 py-3.5 text-sm text-white focus:border-cyan-500 outline-none transition-all placeholder:text-gray-400 shadow-sm" />
              </div>
              <p className="text-[10px] text-gray-500">
                💡 비디오 모델은 상단 드롭다운에서 선택할 수 있습니다.
              </p>
            </div>
          )}
        </div>

        {/* Global Reference Images */}
        <div className="p-6 bg-[#1a1a24] border border-gray-800/50 rounded-3xl shadow-md">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
            <div className="flex-1 text-left">
              <h3 className="text-white font-bold text-lg mb-1">스타일 참조 이미지</h3>
              <p className="text-gray-500 text-xs">
                참조 이미지를 올리면 화풍과 색감을 자동으로 분석해 적용합니다.
                {referenceImages.length > 0 && (
                  <span className="text-brand-600 ml-1">✓ {referenceImages.length}개 이미지 스타일 적용</span>
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-3 items-center">
              {referenceImages.map((img, idx) => (
                <div key={idx} className="relative group">
                  <div className="w-24 h-16 rounded-xl overflow-hidden border-2 border-gray-800/50">
                    <img src={img} alt={`Ref ${idx}`} className="w-full h-full object-cover" />
                  </div>
                  <button onClick={() => removeImage(idx)} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                </div>
              ))}
              {referenceImages.length < 4 && (
                <button type="button" onClick={() => fileInputRef.current?.click()} className="w-24 h-16 border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center text-gray-400 hover:border-brand-500 hover:text-brand-500 transition-all"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg></button>
              )}
              <input type="file" ref={fileInputRef} onChange={handleImageChange} accept="image/*" className="hidden" multiple />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs and Submit */}
      <div className="flex justify-center mb-6">
        <div className="bg-[#12121a] p-1.5 rounded-2xl border-2 border-gray-800/50 flex gap-1">
          <button type="button" onClick={() => setActiveTab('auto')} className={`px-8 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'auto' ? 'bg-brand-600 text-white shadow-md' : 'text-gray-500 hover:text-gray-700'}`}>자동 트렌드</button>
          <button type="button" onClick={() => setActiveTab('manual')} className={`px-8 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'manual' ? 'bg-brand-600 text-white shadow-md' : 'text-gray-500 hover:text-gray-700'}`}>수동 대본</button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
        {activeTab === 'auto' ? (
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-brand-600 to-blue-600 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-500"></div>
            <div className="relative flex items-center bg-[#12121a] rounded-2xl border-2 border-gray-300 overflow-hidden pr-2 shadow-md">
              <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} disabled={isProcessing} placeholder={`${currentCategory?.name || '경제'} 트렌드 키워드 입력...`} className="block w-full bg-transparent text-white py-5 px-6 focus:ring-0 focus:outline-none placeholder-gray-400 text-lg disabled:opacity-50" />
              <button type="submit" disabled={isProcessing || !topic.trim()} className="bg-brand-600 hover:bg-brand-500 text-white font-black py-3 px-8 rounded-xl transition-all disabled:opacity-50 whitespace-nowrap shadow-lg">{isProcessing ? '생성 중' : '시작'}</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="bg-[#12121a] border-2 border-gray-300 rounded-3xl overflow-hidden shadow-md">
              <textarea value={manualScript} onChange={(e) => setManualScript(e.target.value)} placeholder="직접 작성한 대본을 입력하세요. AI가 시각적 연출안을 생성합니다." className="w-full h-80 bg-transparent text-white p-8 focus:ring-0 focus:outline-none placeholder-gray-400 resize-none" disabled={isProcessing} />
            </div>
            <button type="submit" disabled={isProcessing || !manualScript.trim()} className="w-full bg-brand-600 hover:bg-brand-500 text-white font-black py-5 rounded-2xl transition-all disabled:opacity-50 uppercase tracking-widest text-sm shadow-lg">스토리보드 생성</button>
          </div>
        )}
      </form>
    </div>
  );
};

export default InputSection;
