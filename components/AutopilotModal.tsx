import React, { useState, useEffect } from 'react';
import { CATEGORY_LIST, STYLE_LIST, CategoryType, StyleType } from '../services/prompts';
import {
  TtsEngineType,
  ENV_CONFIG,
  GEMINI_VOICE_LIST,
  GeminiVoiceType,
  CONFIG,
  ELEVENLABS_KOREAN_VOICES_FEMALE,
  ELEVENLABS_KOREAN_VOICES_MALE,
  ELEVENLABS_KOREAN_VOICES
} from '../config';
import { fetchElevenLabsVoices, ElevenLabsVoice } from '../services/elevenLabsService';

interface AutopilotConfig {
  keyword: string;
  category: CategoryType;
  style: StyleType;
  ttsEngine: TtsEngineType;
  geminiVoice?: string;
  elevenLabsVoiceId?: string;
  autoExport: boolean;
}

interface AutopilotModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStart: (config: AutopilotConfig) => void;
  isRunning: boolean;
  progress?: {
    step: string;
    message: string;
    percent: number;
  };
}

const AutopilotModal: React.FC<AutopilotModalProps> = ({
  isOpen,
  onClose,
  onStart,
  isRunning,
  progress
}) => {
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState<CategoryType>('economy');
  const [style, setStyle] = useState<StyleType>('default');
  const [ttsEngine, setTtsEngine] = useState<TtsEngineType>(
    ENV_CONFIG.ELEVENLABS_API_KEY ? 'elevenlabs' : 'gemini'
  );
  const [geminiVoice, setGeminiVoice] = useState<GeminiVoiceType>(
    (localStorage.getItem(CONFIG.STORAGE_KEYS.GEMINI_VOICE) as GeminiVoiceType) || CONFIG.DEFAULT_GEMINI_VOICE
  );
  const [elevenLabsVoiceId, setElevenLabsVoiceId] = useState(
    ELEVENLABS_KOREAN_VOICES_FEMALE[0].voice_id
  );
  const [autoExport, setAutoExport] = useState(false);
  const [userCustomVoices, setUserCustomVoices] = useState<ElevenLabsVoice[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);

  const hasElevenLabsKey = !!ENV_CONFIG.ELEVENLABS_API_KEY;

  // 모달이 열릴 때 사용자 음성 목록 로드
  useEffect(() => {
    const loadCustomVoices = async () => {
      if (!isOpen || !hasElevenLabsKey) return;

      setIsLoadingVoices(true);
      try {
        const allVoices = await fetchElevenLabsVoices(ENV_CONFIG.ELEVENLABS_API_KEY);

        // 사용자가 만든 음성 (cloned, generated, professional 카테고리)
        const customCategories = ['cloned', 'generated', 'professional', 'high_quality'];
        const customVoices = allVoices.filter(v =>
          customCategories.includes(v.category?.toLowerCase() || '') ||
          v.category === 'cloned' ||
          !['premade', 'professional'].includes(v.category?.toLowerCase() || '')
        );

        setUserCustomVoices(customVoices);
      } catch (e) {
        console.error('커스텀 음성 로드 실패:', e);
        setUserCustomVoices([]);
      } finally {
        setIsLoadingVoices(false);
      }
    };

    loadCustomVoices();
  }, [isOpen, hasElevenLabsKey]);

  const handleStart = () => {
    if (!keyword.trim()) {
      alert('키워드를 입력해주세요.');
      return;
    }
    onStart({
      keyword: keyword.trim(),
      category,
      style,
      ttsEngine,
      geminiVoice,
      elevenLabsVoiceId,
      autoExport
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 배경 오버레이 */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={!isRunning ? onClose : undefined}
      />

      {/* 모달 */}
      <div className="relative bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-lg mx-4 shadow-2xl animate-in zoom-in-95 fade-in duration-200">
        {/* 헤더 */}
        <div className="px-6 py-5 border-b border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">오토파일럿</h2>
                <p className="text-[11px] text-slate-500">키워드 하나로 영상 자동 생성</p>
              </div>
            </div>
            {!isRunning && (
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-all"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* 본문 */}
        <div className="px-6 py-5 space-y-5">
          {!isRunning ? (
            <>
              {/* 키워드 입력 */}
              <div>
                <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">
                  트렌드 키워드
                </label>
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="예: 테슬라, AI 반도체, 비트코인..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
                  autoFocus
                />
              </div>

              {/* 카테고리 & 스타일 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">
                    카테고리
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as CategoryType)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm focus:border-emerald-500 outline-none transition-all"
                  >
                    {CATEGORY_LIST.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.emoji} {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">
                    비주얼 스타일
                  </label>
                  <select
                    value={style}
                    onChange={(e) => setStyle(e.target.value as StyleType)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm focus:border-emerald-500 outline-none transition-all"
                  >
                    {STYLE_LIST.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.emoji} {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* TTS 엔진 선택 */}
              <div>
                <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">
                  음성 엔진
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTtsEngine('gemini')}
                    className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                      ttsEngine === 'gemini'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>🎙️</span> Gemini
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/30 text-blue-200">무료</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => hasElevenLabsKey && setTtsEngine('elevenlabs')}
                    disabled={!hasElevenLabsKey}
                    className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                      ttsEngine === 'elevenlabs'
                        ? 'bg-fuchsia-600 text-white'
                        : hasElevenLabsKey
                          ? 'bg-slate-800 text-slate-400 hover:text-white'
                          : 'bg-slate-800/50 text-slate-600 cursor-not-allowed'
                    }`}
                  >
                    <span>🔊</span> ElevenLabs
                    {hasElevenLabsKey ? (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/30 text-emerald-200">연결됨</span>
                    ) : (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-500">미설정</span>
                    )}
                  </button>
                </div>
              </div>

              {/* 음성 선택 */}
              <div>
                <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">
                  {ttsEngine === 'gemini' ? 'Gemini 음성' : 'ElevenLabs 음성'}
                </label>
                {ttsEngine === 'gemini' ? (
                  <select
                    value={geminiVoice}
                    onChange={(e) => setGeminiVoice(e.target.value as GeminiVoiceType)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:border-blue-500 outline-none transition-all"
                  >
                    <optgroup label="👩 여성 음성">
                      {GEMINI_VOICE_LIST.filter(v => v.gender === '여성').map((voice) => (
                        <option key={voice.id} value={voice.id}>
                          {voice.emoji} {voice.name} - {voice.description}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="👨 남성 음성">
                      {GEMINI_VOICE_LIST.filter(v => v.gender === '남성').map((voice) => (
                        <option key={voice.id} value={voice.id}>
                          {voice.emoji} {voice.name} - {voice.description}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                ) : (
                  <div className="relative">
                    <select
                      value={elevenLabsVoiceId}
                      onChange={(e) => setElevenLabsVoiceId(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:border-fuchsia-500 outline-none transition-all"
                    >
                      {/* 내가 만든 음성 */}
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
                            {voice.name} - {voice.labels.description}
                          </option>
                        ))}
                      </optgroup>
                      {/* 추천 남성 음성 */}
                      <optgroup label="👨 추천 남성 음성">
                        {ELEVENLABS_KOREAN_VOICES_MALE.map((voice) => (
                          <option key={voice.voice_id} value={voice.voice_id}>
                            {voice.name} - {voice.labels.description}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                    {isLoadingVoices && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="w-4 h-4 border-2 border-fuchsia-500 border-t-transparent animate-spin rounded-full"></div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 자동 내보내기 옵션 */}
              <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl">
                <div>
                  <p className="text-sm font-bold text-white">자동 MP4 내보내기</p>
                  <p className="text-[11px] text-slate-500">완료 후 자동으로 영상 파일 생성</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoExport(!autoExport)}
                  className={`w-12 h-7 rounded-full transition-all ${
                    autoExport ? 'bg-emerald-500' : 'bg-slate-700'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${
                    autoExport ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>
            </>
          ) : (
            /* 진행 상태 표시 */
            <div className="py-8 text-center">
              <div className="w-20 h-20 mx-auto mb-6 relative">
                <div className="absolute inset-0 rounded-full border-4 border-slate-700"></div>
                <div
                  className="absolute inset-0 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin"
                ></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xl font-black text-emerald-400">
                    {progress?.percent || 0}%
                  </span>
                </div>
              </div>
              <h3 className="text-lg font-bold text-white mb-2">
                {progress?.step || '준비 중...'}
              </h3>
              <p className="text-sm text-slate-400">
                {progress?.message || '오토파일럿을 시작합니다...'}
              </p>

              {/* 진행 바 */}
              <div className="mt-6 h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all duration-500"
                  style={{ width: `${progress?.percent || 0}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* 푸터 */}
        {!isRunning && (
          <div className="px-6 py-4 border-t border-slate-800 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors font-bold text-sm"
            >
              취소
            </button>
            <button
              onClick={handleStart}
              disabled={!keyword.trim()}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-bold text-sm hover:from-emerald-400 hover:to-cyan-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-emerald-500/25"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              시작하기
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AutopilotModal;
