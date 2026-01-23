
import React, { useState, useCallback, useRef, useEffect, lazy, Suspense } from 'react';
import Header from './components/Header';
import InputSection from './components/InputSection';
import ResultTable from './components/ResultTable';
// 타입은 정적 import 유지
import type { AspectRatioType } from './components/ProjectWizard';
// upsertProject는 storageService에서 직접 가져오기 (lazy loading 최적화)
import { saveProject as upsertProject } from './services/storageService';

// 큰 컴포넌트들은 lazy loading으로 초기 번들 크기 감소
const Dashboard = lazy(() => import('./components/Dashboard'));
const AutopilotModal = lazy(() => import('./components/AutopilotModal'));
const ProjectWizard = lazy(() => import('./components/ProjectWizard'));
import { GeneratedAsset, GenerationStep, ScriptScene, Project } from './types';
import { generateScript, generateScriptChunked, generateImageForScene, findTrendingTopics, generateAudioForScene, generateMotionPrompt } from './services/geminiService';
import { generateAudioWithElevenLabs } from './services/elevenLabsService';
import { generateVideo, VideoGenerationResult } from './services/videoService';
import { downloadSrtFromRecorded } from './services/srtService';
import { generateVideoFromImage, getFalApiKey } from './services/falService';
import { saveProjectData, loadProjectData, saveProject, saveSceneData } from './services/storageService';
import { CONFIG, TtsEngineType, ENV_CONFIG, BATCH_CONFIG, TIMEOUT_CONFIG, LARGE_SCRIPT_CONFIG } from './config';
import { processIndexBatch, processIndexBatchWithRetry } from './utils/batchProcessor';
import { CategoryType, StyleType, VideoModelType, ZoomEffectType, CharacterType, getZoomMotionPrompt, getZoomScale } from './services/prompts';
import * as FileSaver from 'file-saver';

const saveAs = (FileSaver as any).saveAs || (FileSaver as any).default || FileSaver;
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Lazy loading 시 사용할 로딩 스피너
const LoadingSpinner = () => (
  <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
    <div className="flex flex-col items-center gap-4">
      <div className="w-12 h-12 border-4 border-[#f06050] border-t-transparent rounded-full animate-spin"></div>
      <p className="text-gray-400 text-sm font-medium">로딩 중...</p>
    </div>
  </div>
);

// 뷰 타입
type AppView = 'dashboard' | 'wizard' | 'editor';

// 고유 ID 생성
const generateId = () => `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const App: React.FC = () => {
  // 뷰 상태 (대시보드 / 편집기)
  const [currentView, setCurrentView] = useState<AppView>('dashboard');
  const [currentProject, setCurrentProject] = useState<Project | null>(null);

  const [step, setStep] = useState<GenerationStep>(GenerationStep.IDLE);
  const [generatedData, setGeneratedData] = useState<GeneratedAsset[]>([]);
  const [progressMessage, setProgressMessage] = useState('');
  const [isVideoGenerating, setIsVideoGenerating] = useState(false);
  const [currentReferenceImages, setCurrentReferenceImages] = useState<string[]>([]);
  const [needsKey, setNeedsKey] = useState(false);
  const [animatingIndices, setAnimatingIndices] = useState<Set<number>>(new Set());

  // 오토파일럿 상태
  const [isAutopilotModalOpen, setIsAutopilotModalOpen] = useState(false);
  const [isAutopilotRunning, setIsAutopilotRunning] = useState(false);
  const [autopilotProgress, setAutopilotProgress] = useState<{
    step: string;
    message: string;
    percent: number;
  }>({ step: '', message: '', percent: 0 });

  const usedTopicsRef = useRef<string[]>([]);
  const assetsRef = useRef<GeneratedAsset[]>([]);
  const isAbortedRef = useRef(false);
  const isProcessingRef = useRef(false);
  // 재렌더링 최적화를 위한 배치 업데이트 ref
  const pendingUpdatesRef = useRef<Map<number, Partial<GeneratedAsset>>>(new Map());
  const updateTimerRef = useRef<NodeJS.Timeout | null>(null);
  // 현재 생성 옵션 저장용 (다중 레퍼런스 이미지 지원)
  const currentGenOptionsRef = useRef<{ category?: string; style?: StyleType; ttsEngine?: 'gemini' | 'elevenlabs'; aspectRatio?: string; videoModel?: VideoModelType; zoomEffect?: ZoomEffectType; customStylePrompt?: string; characterType?: CharacterType; characterRefImages?: string[]; styleRefImages?: string[]; characterRefStrength?: number; styleRefStrength?: number }>({});

  // Undo/Redo 히스토리
  const [undoStack, setUndoStack] = useState<GeneratedAsset[][]>([]);
  const [redoStack, setRedoStack] = useState<GeneratedAsset[][]>([]);
  const MAX_HISTORY = 20; // 최대 히스토리 개수

  const checkApiKeyStatus = useCallback(async () => {
    if ((window as any).aistudio) {
      const hasKey = await (window as any).aistudio.hasSelectedApiKey();
      setNeedsKey(!hasKey);
      return hasKey;
    }
    return true;
  }, []);

  useEffect(() => {
    checkApiKeyStatus();
    return () => {
      isAbortedRef.current = true;
      // 배치 업데이트 타이머 정리 (메모리 누수 방지)
      if (updateTimerRef.current) {
        clearTimeout(updateTimerRef.current);
      }
    };
  }, [checkApiKeyStatus]);

  // 브라우저 뒤로가기 버튼 처리 및 초기 히스토리 설정
  useEffect(() => {
    // 초기 히스토리 상태 설정 (최초 1회)
    if (!window.history.state) {
      window.history.replaceState({ view: 'dashboard' }, '', window.location.pathname);
    }

    const handlePopState = (event: PopStateEvent) => {
      const state = event.state;

      // 대시보드로 돌아가기
      if (!state || state.view === 'dashboard') {
        // Wizard에서 돌아가는 경우 저장 필요 없음
        if (currentView === 'wizard') {
          setCurrentView('dashboard');
          setCurrentProject(null);
          return;
        }
        if (currentView === 'editor' && currentProject && assetsRef.current.length > 0) {
          // 프로젝트 저장은 동기적으로 처리
          const updatedProject: Project = {
            ...currentProject,
            status: step === GenerationStep.COMPLETED ? 'completed' :
                    step === GenerationStep.ERROR ? 'error' :
                    step !== GenerationStep.IDLE ? 'in_progress' : 'draft',
            step: step,
            updatedAt: Date.now(),
            thumbnail: assetsRef.current[0]?.imageData || undefined,
            scenesCount: assetsRef.current.length,
            category: currentGenOptionsRef.current.category || currentProject.category,
            style: currentGenOptionsRef.current.style || currentProject.style,
            ttsEngine: currentGenOptionsRef.current.ttsEngine || currentProject.ttsEngine,
          };
          upsertProject(updatedProject);
          // IndexedDB에 프로젝트 데이터 저장
          saveProjectData(currentProject.id, assetsRef.current).catch(console.error);
        }
        setCurrentView('dashboard');
        setCurrentProject(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [currentView, currentProject, step]);

  const handleOpenKeySelector = async () => {
    if ((window as any).aistudio) {
      await (window as any).aistudio.openSelectKey();
      setNeedsKey(false);
    }
  };

  // 새 프로젝트 시작 → Wizard로 이동
  const handleNewProject = () => {
    const newProject: Project = {
      id: generateId(),
      title: '새 프로젝트',
      status: 'draft',
      step: GenerationStep.IDLE,
      currentStepNumber: 0,
      totalSteps: 6,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      scenesCount: 0,
    };
    setCurrentProject(newProject);
    setGeneratedData([]);
    assetsRef.current = [];
    setStep(GenerationStep.IDLE);
    setCurrentView('wizard');  // Wizard로 이동
    // 브라우저 히스토리에 추가 (뒤로가기 지원)
    window.history.pushState({ view: 'wizard', projectId: newProject.id }, '', `#new-project`);
  };

  // 기존 프로젝트 열기
  const handleOpenProject = (project: Project) => {
    setCurrentProject(project);
    // IndexedDB에서 프로젝트 데이터 로드
    loadProjectData(project.id).then(assets => {
      if (assets && assets.length > 0) {
        assetsRef.current = assets;
        setGeneratedData(assets);
        setStep(project.step);
      } else {
        setGeneratedData([]);
        assetsRef.current = [];
        setStep(GenerationStep.IDLE);
      }
    }).catch(e => {
      console.error('프로젝트 데이터 로드 실패:', e);
      setGeneratedData([]);
      assetsRef.current = [];
    });
    setCurrentView('editor');
    // 브라우저 히스토리에 추가 (뒤로가기 지원)
    window.history.pushState({ view: 'editor', projectId: project.id }, '', `#project/${project.id}`);
  };

  // 대시보드로 돌아가기
  const handleBackToDashboard = () => {
    // 현재 프로젝트 저장
    if (currentProject && assetsRef.current.length > 0) {
      saveCurrentProject();
    }
    setCurrentView('dashboard');
    setCurrentProject(null);
    // URL 해시 제거
    window.history.pushState({ view: 'dashboard' }, '', window.location.pathname);
  };

  // Wizard(설정)로 돌아가기
  const handleBackToWizard = () => {
    // 현재 프로젝트 저장
    if (currentProject && assetsRef.current.length > 0) {
      saveCurrentProject();
    }
    setCurrentView('wizard');
    // 브라우저 히스토리 업데이트
    window.history.pushState({ view: 'wizard', projectId: currentProject?.id }, '', `#edit-settings/${currentProject?.id}`);
  };

  // 현재 프로젝트 저장
  const saveCurrentProject = () => {
    if (!currentProject) return;

    const updatedProject: Project = {
      ...currentProject,
      status: step === GenerationStep.COMPLETED ? 'completed' :
              step === GenerationStep.ERROR ? 'error' :
              step !== GenerationStep.IDLE ? 'in_progress' : 'draft',
      step: step,
      currentStepNumber: step === GenerationStep.SCRIPTING ? 1 :
                        step === GenerationStep.ASSETS ? 3 :
                        step === GenerationStep.COMPLETED ? 6 : 0,
      updatedAt: Date.now(),
      thumbnail: assetsRef.current[0]?.imageData || undefined,
      scenesCount: assetsRef.current.length,
      // 생성 옵션 저장
      category: currentGenOptionsRef.current.category || currentProject.category,
      style: currentGenOptionsRef.current.style || currentProject.style,
      ttsEngine: currentGenOptionsRef.current.ttsEngine || currentProject.ttsEngine,
    };

    // 프로젝트 메타데이터 저장
    upsertProject(updatedProject);
    setCurrentProject(updatedProject);

    // IndexedDB에 프로젝트 데이터 저장 (씬 데이터)
    if (assetsRef.current.length > 0) {
      saveProjectData(currentProject.id, assetsRef.current).catch(e => {
        console.error('프로젝트 데이터 저장 실패:', e);
      });
    }
  };

  // 오토파일럿 시작 핸들러
  const handleAutopilotStart = async (config: {
    keyword: string;
    category: CategoryType;
    style: StyleType;
    ttsEngine: TtsEngineType;
    geminiVoice?: string;
    elevenLabsVoiceId?: string;
    autoExport: boolean;
  }) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    isAbortedRef.current = false;
    setIsAutopilotRunning(true);

    // 새 프로젝트 생성
    const newProject: Project = {
      id: generateId(),
      title: config.keyword,
      status: 'in_progress',
      step: GenerationStep.SCRIPTING,
      currentStepNumber: 1,
      totalSteps: config.autoExport ? 5 : 4,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      scenesCount: 0,
      category: config.category,
      style: config.style,
      ttsEngine: config.ttsEngine,
    };
    setCurrentProject(newProject);
    currentGenOptionsRef.current = {
      category: config.category,
      style: config.style as StyleType,
      ttsEngine: config.ttsEngine,
      aspectRatio: '16:9',
    };

    // 전체 작업 타임아웃 설정 (30분)
    const autopilotTimeoutId = setTimeout(() => {
      if (!isAbortedRef.current && isProcessingRef.current) {
        console.warn('[Autopilot] 전체 작업 타임아웃 (30분)');
        isAbortedRef.current = true;
        setAutopilotProgress({ step: '타임아웃', message: '⏰ 작업 시간 초과 (30분)', percent: 0 });
        setStep(GenerationStep.ERROR);
      }
    }, TIMEOUT_CONFIG.TOTAL_GENERATION);

    try {
      // 1단계: 트렌드 분석 및 스크립트 생성 (0-25%)
      setAutopilotProgress({ step: '트렌드 분석', message: '글로벌 트렌드 탐색 중...', percent: 5 });

      const hasKey = await checkApiKeyStatus();
      if (!hasKey && (window as any).aistudio) {
        await (window as any).aistudio.openSelectKey();
      }

      setGeneratedData([]);
      assetsRef.current = [];

      const trends = await findTrendingTopics(config.keyword, usedTopicsRef.current);
      if (isAbortedRef.current) throw new Error('중단됨');

      const targetTopic = trends[0].topic;
      usedTopicsRef.current.push(targetTopic);
      setCurrentProject(prev => prev ? { ...prev, title: targetTopic } : null);

      setAutopilotProgress({ step: '스크립트 작성', message: '스토리보드 생성 중...', percent: 15 });
      const scriptScenes = await generateScript(targetTopic, false, null);
      if (isAbortedRef.current) throw new Error('중단됨');

      const initialAssets: GeneratedAsset[] = scriptScenes.map(scene => ({
        ...scene, imageData: null, audioData: null, audioDuration: null, subtitleData: null, videoData: null, videoDuration: null, status: 'pending' as const
      }));
      assetsRef.current = initialAssets;
      setGeneratedData(initialAssets);
      setStep(GenerationStep.ASSETS);

      // 2단계: 오디오 생성 (25-50%)
      setAutopilotProgress({ step: '음성 합성', message: '내레이션 생성 중...', percent: 25 });

      for (let i = 0; i < initialAssets.length; i++) {
        if (isAbortedRef.current) throw new Error('중단됨');
        setAutopilotProgress({
          step: '음성 합성',
          message: `씬 ${i + 1}/${initialAssets.length} 오디오 생성 중...`,
          percent: 25 + Math.round((i / initialAssets.length) * 25)
        });

        try {
          if (config.ttsEngine === 'elevenlabs' && ENV_CONFIG.ELEVENLABS_API_KEY) {
            const elResult = await generateAudioWithElevenLabs(
              assetsRef.current[i].narration,
              ENV_CONFIG.ELEVENLABS_API_KEY,
              config.elevenLabsVoiceId
            );
            if (elResult.audioData) {
              updateAssetAt(i, {
                audioData: elResult.audioData,
                subtitleData: elResult.subtitleData,
                audioDuration: elResult.estimatedDuration
              });
            }
          } else {
            const audioData = await generateAudioForScene(
              assetsRef.current[i].narration,
              config.geminiVoice || 'Kore'
            );
            updateAssetAt(i, { audioData });
          }
        } catch (e) { console.error('오디오 생성 실패:', e); }
      }

      // 3단계: 이미지 생성 (50-80%)
      setAutopilotProgress({ step: '이미지 생성', message: '시각 에셋 생성 중...', percent: 50 });

      for (let i = 0; i < initialAssets.length; i++) {
        if (isAbortedRef.current) throw new Error('중단됨');
        setAutopilotProgress({
          step: '이미지 생성',
          message: `씬 ${i + 1}/${initialAssets.length} 이미지 생성 중...`,
          percent: 50 + Math.round((i / initialAssets.length) * 30)
        });
        updateAssetAt(i, { status: 'generating' });

        try {
          const img = await generateImageForScene(assetsRef.current[i], [], '16:9', currentGenOptionsRef.current.style, currentGenOptionsRef.current.customStylePrompt, currentGenOptionsRef.current.characterType, currentGenOptionsRef.current.characterRefImages, currentGenOptionsRef.current.styleRefImages, currentGenOptionsRef.current.characterRefStrength, currentGenOptionsRef.current.styleRefStrength);
          if (img) {
            updateAssetAt(i, { imageData: img, status: 'completed' });
          } else {
            updateAssetAt(i, { status: 'error' });
          }
        } catch (e: any) {
          console.error(`씬 ${i + 1} 이미지 생성 실패:`, e.message);
          updateAssetAt(i, { status: 'error' });
        }
        await wait(100);
      }

      // 4단계: 완료 (80-100%)
      setAutopilotProgress({ step: '마무리', message: '프로젝트 저장 중...', percent: 85 });
      setStep(GenerationStep.COMPLETED);

      // 프로젝트 저장
      const completedProject: Project = {
        ...newProject,
        title: targetTopic,
        status: 'completed',
        step: GenerationStep.COMPLETED,
        currentStepNumber: config.autoExport ? 4 : 4,
        updatedAt: Date.now(),
        thumbnail: assetsRef.current[0]?.imageData || undefined,
        scenesCount: assetsRef.current.length,
      };
      upsertProject(completedProject);
      setCurrentProject(completedProject);

      // IndexedDB에 프로젝트 데이터 저장
      await saveProjectData(newProject.id, assetsRef.current);

      // 5단계: 자동 내보내기 (옵션)
      if (config.autoExport) {
        setAutopilotProgress({ step: '영상 내보내기', message: 'MP4 렌더링 중...', percent: 90 });
        try {
          const result = await generateVideo(
            assetsRef.current,
            (msg) => setAutopilotProgress(prev => ({ ...prev, message: msg })),
            isAbortedRef,
            { enableSubtitles: true }
          );
          if (result) {
            saveAs(result.videoBlob, `autopilot_${Date.now()}.mp4`);
          }
        } catch (e: any) {
          console.error('영상 내보내기 실패:', e);
        }
      }

      setAutopilotProgress({ step: '완료', message: '오토파일럿 완료!', percent: 100 });
      await wait(1500);

      // 에디터로 이동
      setCurrentView('editor');
      window.history.pushState({ view: 'editor', projectId: newProject.id }, '', `#project/${newProject.id}`);

    } catch (error: any) {
      if (error.message !== '중단됨') {
        console.error('오토파일럿 오류:', error);
        setAutopilotProgress({ step: '오류', message: error.message, percent: 0 });
      }
      setStep(GenerationStep.ERROR);
    } finally {
      // 타임아웃 정리
      clearTimeout(autopilotTimeoutId);
      setIsAutopilotRunning(false);
      setIsAutopilotModalOpen(false);
      isProcessingRef.current = false;
    }
  };

  // 히스토리에 현재 상태 저장
  const saveToHistory = useCallback(() => {
    if (assetsRef.current.length === 0) return;
    const snapshot = JSON.parse(JSON.stringify(assetsRef.current));
    setUndoStack(prev => {
      const newStack = [...prev, snapshot];
      // 최대 개수 제한
      if (newStack.length > MAX_HISTORY) {
        return newStack.slice(-MAX_HISTORY);
      }
      return newStack;
    });
    // 새로운 변경이 있으면 redo 스택 초기화
    setRedoStack([]);
  }, [MAX_HISTORY]);

  // Undo 실행
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;

    // 현재 상태를 redo 스택에 저장
    const currentSnapshot = JSON.parse(JSON.stringify(assetsRef.current));
    setRedoStack(prev => [...prev, currentSnapshot]);

    // undo 스택에서 이전 상태 복원
    const newUndoStack = [...undoStack];
    const previousState = newUndoStack.pop();
    setUndoStack(newUndoStack);

    if (previousState) {
      assetsRef.current = previousState;
      setGeneratedData([...previousState]);
      setProgressMessage('실행 취소됨');
    }
  }, [undoStack]);

  // Redo 실행
  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;

    // 현재 상태를 undo 스택에 저장
    const currentSnapshot = JSON.parse(JSON.stringify(assetsRef.current));
    setUndoStack(prev => [...prev, currentSnapshot]);

    // redo 스택에서 다음 상태 복원
    const newRedoStack = [...redoStack];
    const nextState = newRedoStack.pop();
    setRedoStack(newRedoStack);

    if (nextState) {
      assetsRef.current = nextState;
      setGeneratedData([...nextState]);
      setProgressMessage('다시 실행됨');
    }
  }, [redoStack]);

  // 키보드 단축키 (Ctrl+Z, Ctrl+Shift+Z)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (currentView !== 'editor') return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      }
      // Ctrl+Y도 Redo로 지원
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentView, handleUndo, handleRedo]);

  // 디바운스 배치 업데이트 - 50ms 내 여러 업데이트를 모아서 한 번에 반영
  const updateAssetAt = useCallback((index: number, updates: Partial<GeneratedAsset>, saveHistory: boolean = false) => {
    if (isAbortedRef.current) return;
    if (!assetsRef.current[index]) return;

    // 중요한 변경인 경우에만 히스토리 저장 (이미지 재생성 등)
    if (saveHistory && updates.imageData) {
      saveToHistory();
    }

    // ref에 즉시 반영 (다른 함수들이 최신 데이터를 읽을 수 있도록)
    assetsRef.current[index] = { ...assetsRef.current[index], ...updates };
    pendingUpdatesRef.current.set(index, updates);

    // 점진적 저장: 씬이 완료되면 즉시 IndexedDB에 저장 (메모리 최적화)
    if (updates.status === 'completed' && currentProject?.id) {
      saveSceneData(currentProject.id, index, assetsRef.current[index])
        .catch(e => console.error(`[App] 씬 ${index + 1} 점진적 저장 실패:`, e));
    }

    // 디바운스: 50ms 내 여러 업데이트를 모아서 한 번에 반영
    if (updateTimerRef.current) {
      clearTimeout(updateTimerRef.current);
    }
    updateTimerRef.current = setTimeout(() => {
      setGeneratedData([...assetsRef.current]);
      pendingUpdatesRef.current.clear();
    }, 50);
  }, [saveToHistory, currentProject?.id]);

  // 강제 플러시 - 즉시 UI 업데이트가 필요할 때 사용
  const flushUpdates = useCallback(() => {
    if (updateTimerRef.current) {
      clearTimeout(updateTimerRef.current);
      updateTimerRef.current = null;
    }
    if (pendingUpdatesRef.current.size > 0) {
      setGeneratedData([...assetsRef.current]);
      pendingUpdatesRef.current.clear();
    }
  }, []);

  const handleAbort = () => {
    isAbortedRef.current = true;
    isProcessingRef.current = false;
    setProgressMessage("🛑 작업 중단됨.");
    setStep(GenerationStep.COMPLETED);
  };

  const handleGenerate = useCallback(async (
    topic: string,
    refImgs: string[],
    sourceText: string | null,
    ttsConfig: { engine: TtsEngineType, geminiVoice?: string, elApiKey?: string, elVoiceId?: string },
    _genOptions?: { category?: string; style?: string; aspectRatio?: AspectRatioType; videoModel?: VideoModelType; zoomEffect?: ZoomEffectType; customStylePrompt?: string; characterType?: CharacterType; characterRefImages?: string[]; styleRefImages?: string[]; characterRefStrength?: number; styleRefStrength?: number }
  ) => {
    // Wizard에서 왔으면 editor로 전환
    if (currentView === 'wizard' && currentProject) {
      setCurrentView('editor');
      window.history.replaceState({ view: 'editor', projectId: currentProject.id }, '', `#project/${currentProject.id}`);
    }
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    isAbortedRef.current = false;

    // 생성 옵션 저장 (다중 레퍼런스 이미지 지원)
    currentGenOptionsRef.current = {
      category: _genOptions?.category,
      style: (_genOptions?.style as StyleType) || 'default',
      ttsEngine: ttsConfig.engine,
      aspectRatio: _genOptions?.aspectRatio || '16:9',
      videoModel: _genOptions?.videoModel,
      zoomEffect: (_genOptions?.zoomEffect as ZoomEffectType) || 'medium',
      customStylePrompt: _genOptions?.customStylePrompt || '',
      characterType: (_genOptions?.characterType as CharacterType) || 'none',
      characterRefImages: _genOptions?.characterRefImages || [],
      styleRefImages: _genOptions?.styleRefImages || [],
      characterRefStrength: _genOptions?.characterRefStrength ?? 100,  // 기본값 100%
      styleRefStrength: _genOptions?.styleRefStrength ?? 100,        // 기본값 100%
    };

    setStep(GenerationStep.SCRIPTING);
    setProgressMessage('V9.2 Ultra 엔진 부팅 중...');

    // 전체 작업 타임아웃 설정 (30분)
    const generationTimeoutId = setTimeout(() => {
      if (!isAbortedRef.current && isProcessingRef.current) {
        console.warn('[App] 전체 작업 타임아웃 (30분)');
        isAbortedRef.current = true;
        setProgressMessage('⏰ 작업 시간 초과 (30분). 생성된 씬까지 저장됩니다.');
        setStep(GenerationStep.ERROR);
      }
    }, TIMEOUT_CONFIG.TOTAL_GENERATION);

    try {
      const hasKey = await checkApiKeyStatus();
      if (!hasKey && (window as any).aistudio) {
        await (window as any).aistudio.openSelectKey();
      }

      setGeneratedData([]);
      assetsRef.current = [];
      setCurrentReferenceImages(refImgs);
      
      let targetTopic = topic;

      if (topic === "Manual Script Input" && sourceText) {
        setProgressMessage('대본 분석 및 시각화 설계 중...');
      } else if (sourceText) {
        setProgressMessage('외부 콘텐츠 분석 중...');
        targetTopic = "Custom Analysis Topic";
      } else {
        setProgressMessage(`글로벌 경제 트렌드 탐색 중...`);
        const trends = await findTrendingTopics(topic, usedTopicsRef.current);
        if (isAbortedRef.current) return;
        targetTopic = trends[0].topic;
        usedTopicsRef.current.push(targetTopic);
      }

      setProgressMessage(`스토리보드 및 메타포 생성 중...`);

      // 대용량 대본 처리: 3000자 초과 시 청크 분할
      let scriptScenes: ScriptScene[];
      if (sourceText && sourceText.length > LARGE_SCRIPT_CONFIG.CHUNK_THRESHOLD) {
        setProgressMessage(`대용량 대본 감지 (${sourceText.length}자), 청크 분할 처리 중...`);
        scriptScenes = await generateScriptChunked(targetTopic, sourceText, refImgs.length > 0);
      } else {
        scriptScenes = await generateScript(targetTopic, refImgs.length > 0, sourceText);
      }
      if (isAbortedRef.current) return;

      // 프로젝트 제목 업데이트
      if (currentProject) {
        setCurrentProject(prev => prev ? { ...prev, title: targetTopic } : null);
      }

      const initialAssets = scriptScenes.map(scene => ({
        ...scene, imageData: null, audioData: null, audioDuration: null, subtitleData: null, videoData: null, videoDuration: null, status: 'pending' as const
      }));
      assetsRef.current = initialAssets;
      setGeneratedData(initialAssets);
      setStep(GenerationStep.ASSETS);

      // 오디오 생성 - 배치 병렬 처리 적용
      const runAudio = async () => {
          // TTS 엔진에 따라 배치 설정 선택
          const batchConfig = ttsConfig.engine === 'elevenlabs' && ttsConfig.elApiKey
            ? BATCH_CONFIG.ELEVENLABS_TTS  // 5개씩, 500ms 딜레이
            : BATCH_CONFIG.GEMINI_TTS;      // 3개씩, 1000ms 딜레이

          await processIndexBatch({
            count: initialAssets.length,
            batchSize: batchConfig.batchSize,
            delay: batchConfig.delay,
            shouldAbort: () => isAbortedRef.current,
            processFn: async (i) => {
              // 선택한 TTS 엔진에 따라 오디오 생성
              if (ttsConfig.engine === 'elevenlabs' && ttsConfig.elApiKey) {
                // ElevenLabs 사용
                const elResult = await generateAudioWithElevenLabs(
                  assetsRef.current[i].narration,
                  ttsConfig.elApiKey,
                  ttsConfig.elVoiceId
                );
                if (elResult.audioData) {
                  updateAssetAt(i, {
                    audioData: elResult.audioData,
                    subtitleData: elResult.subtitleData,
                    audioDuration: elResult.estimatedDuration
                  });
                }
              } else {
                // Gemini TTS 사용
                const audioData = await generateAudioForScene(
                  assetsRef.current[i].narration,
                  ttsConfig.geminiVoice || 'Kore'
                );
                updateAssetAt(i, { audioData });
              }
            }
          });
      };

      // 이미지 생성 - 배치 병렬 처리 적용 (재시도 로직 유지)
      const runImages = async () => {
          const MAX_RETRIES = 2; // 최대 재시도 횟수

          await processIndexBatch({
            count: initialAssets.length,
            batchSize: BATCH_CONFIG.GEMINI_IMAGE.batchSize,  // 2개씩 병렬 처리
            delay: BATCH_CONFIG.GEMINI_IMAGE.delay,          // 2000ms 딜레이
            shouldAbort: () => isAbortedRef.current,
            processFn: async (i) => {
              updateAssetAt(i, { status: 'generating' });

              let success = false;
              let lastError: any = null;

              // 재시도 로직 (최초 시도 + 재시도)
              for (let attempt = 0; attempt <= MAX_RETRIES && !success; attempt++) {
                  if (isAbortedRef.current) return;

                  try {
                      if (attempt > 0) {
                          setProgressMessage(`씬 ${i + 1} 이미지 재생성 시도 중... (${attempt}/${MAX_RETRIES})`);
                          await wait(2000); // 재시도 전 대기
                      }

                      // Scene 객체 전체를 넘겨서 prompts.ts가 분석 정보를 활용하도록 함
                      const img = await generateImageForScene(assetsRef.current[i], refImgs, currentGenOptionsRef.current.aspectRatio, currentGenOptionsRef.current.style, currentGenOptionsRef.current.customStylePrompt, currentGenOptionsRef.current.characterType, currentGenOptionsRef.current.characterRefImages, currentGenOptionsRef.current.styleRefImages, currentGenOptionsRef.current.characterRefStrength, currentGenOptionsRef.current.styleRefStrength);
                      if (isAbortedRef.current) return;

                      if (img) {
                          updateAssetAt(i, { imageData: img, status: 'completed' });
                          success = true;
                      } else {
                          throw new Error('이미지 데이터가 비어있습니다');
                      }
                  } catch (e: any) {
                      lastError = e;
                      console.error(`씬 ${i + 1} 이미지 생성 실패 (시도 ${attempt + 1}/${MAX_RETRIES + 1}):`, e.message);

                      // API 키 오류는 재시도하지 않음
                      if (e.message?.includes("API key not valid") || e.status === 400) {
                          setNeedsKey(true);
                          return;
                      }
                  }
              }

              // 모든 시도 실패 시 에러 상태로 설정
              if (!success && !isAbortedRef.current) {
                  updateAssetAt(i, { status: 'error' });
                  console.error(`씬 ${i + 1} 이미지 생성 최종 실패:`, lastError?.message);
              }
            }
          });
      };

      // 앞 N개 씬을 애니메이션으로 변환하는 함수
      const runAnimations = async () => {
        const falApiKey = getFalApiKey();
        if (!falApiKey) {
          console.log('[Animation] FAL API 키 없음, 애니메이션 변환 건너뜀');
          return;
        }

        const animationCount = Math.min(CONFIG.ANIMATION.ENABLED_SCENES, initialAssets.length);
        setProgressMessage(`앞 ${animationCount}개 씬 애니메이션 변환 중...`);

        for (let i = 0; i < animationCount; i++) {
          if (isAbortedRef.current) break;

          // 이미지가 있어야 변환 가능
          if (!assetsRef.current[i]?.imageData) {
            console.log(`[Animation] 씬 ${i + 1} 이미지 없음, 건너뜀`);
            continue;
          }

          try {
            setProgressMessage(`씬 ${i + 1}/${animationCount} 애니메이션 생성 중...`);

            // 줌 효과 설정에 따른 모션 프롬프트 생성
            const zoomMotion = getZoomMotionPrompt(currentGenOptionsRef.current.zoomEffect || 'medium');
            const motionPrompt = `${zoomMotion} Gentle subtle motion: ${assetsRef.current[i].visualPrompt.slice(0, 200)}`;

            const videoUrl = await generateVideoFromImage(
              assetsRef.current[i].imageData!,
              motionPrompt,
              falApiKey,
              currentGenOptionsRef.current.videoModel
            );

            if (videoUrl && !isAbortedRef.current) {
              updateAssetAt(i, {
                videoData: videoUrl,
                videoDuration: CONFIG.ANIMATION.VIDEO_DURATION
              });
              console.log(`[Animation] 씬 ${i + 1} 영상 변환 완료`);
            }
          } catch (e: any) {
            console.error(`[Animation] 씬 ${i + 1} 변환 실패:`, e.message);
          }

          // API rate limit 방지
          if (i < animationCount - 1) {
            await wait(1500);
          }
        }
      };

      const ttsEngineName = ttsConfig.engine === 'elevenlabs' ? 'ElevenLabs' : 'Gemini TTS';
      setProgressMessage(`시각 에셋 및 오디오 합성 중... (${ttsEngineName})`);
      // 이미지와 오디오 먼저 병렬 생성
      await Promise.all([runAudio(), runImages()]);

      // 비디오 모델이 선택되어 있으면 자동으로 영상 생성
      const selectedVideoModel = _genOptions?.videoModel;
      if (selectedVideoModel && selectedVideoModel !== 'none') {
        const falApiKey = getFalApiKey();
        if (falApiKey) {
          await runAnimations();
        } else {
          console.log('[Animation] FAL API 키 없음, 영상 변환 건너뜀');
        }
      }

      if (isAbortedRef.current) return;
      setStep(GenerationStep.COMPLETED);
      setProgressMessage("V9.2 시스템 모든 에셋 생성 완료!");

      // 프로젝트 자동 저장
      setTimeout(() => saveCurrentProject(), 500);

    } catch (error: any) {
      if (!isAbortedRef.current) {
        setStep(GenerationStep.ERROR);
        setProgressMessage(`오류: ${error.message}`);
      }
    } finally {
      // 타임아웃 정리
      clearTimeout(generationTimeoutId);
      isProcessingRef.current = false;
    }
  }, [checkApiKeyStatus, currentView, currentProject]);

  const triggerVideoExport = async (enableSubtitles: boolean = true, enableAudio: boolean = true) => {
    if (isVideoGenerating) return;
    try {
      setIsVideoGenerating(true);
      const timestamp = Date.now();

      // 파일명 접미사 결정: 자막/무음 상태에 따라 다르게 지정
      const subtitleSuffix = enableSubtitles ? 'sub' : 'nosub';
      const audioSuffix = enableAudio ? 'audio' : 'muted';
      const suffix = `${subtitleSuffix}_${audioSuffix}`;

      // 줌 효과 스케일 가져오기
      const zoomScale = getZoomScale(currentGenOptionsRef.current.zoomEffect || 'medium');

      const result = await generateVideo(
        assetsRef.current,
        (msg) => setProgressMessage(`[Render] ${msg}`),
        isAbortedRef,
        { enableSubtitles, zoomScale, enableAudio }
      );

      if (result) {
        // 영상 저장 (자막은 영상에 하드코딩됨)
        saveAs(result.videoBlob, `tubegen_v92_${suffix}_${timestamp}.mp4`);
        const statusMsg = [
          enableSubtitles ? '자막 O' : '자막 X',
          enableAudio ? '오디오 O' : '무음'
        ].join(', ');
        setProgressMessage(`✨ MP4 렌더링 완료! (${statusMsg})`);
      }
    } catch (error: any) {
      setProgressMessage(`렌더링 실패: ${error.message}`);
    } finally {
      setIsVideoGenerating(false);
    }
  };

  // 대시보드 뷰 - Suspense로 lazy 컴포넌트 감싸기
  if (currentView === 'dashboard') {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <Dashboard
          onNewProject={handleNewProject}
          onOpenProject={handleOpenProject}
          onAutopilotClick={() => setIsAutopilotModalOpen(true)}
        />
        <AutopilotModal
          isOpen={isAutopilotModalOpen}
          onClose={() => !isAutopilotRunning && setIsAutopilotModalOpen(false)}
          onStart={handleAutopilotStart}
          isRunning={isAutopilotRunning}
          progress={autopilotProgress}
        />
      </Suspense>
    );
  }

  // 새 프로젝트 마법사 뷰 - Suspense로 lazy 컴포넌트 감싸기
  if (currentView === 'wizard') {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <ProjectWizard
          onGenerate={handleGenerate}
          onBack={handleBackToDashboard}
          step={step}
        />
      </Suspense>
    );
  }

  // 편집기 뷰
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* 에디터 헤더 (뒤로가기 버튼 포함) */}
      <header className="sticky top-0 z-50 bg-[#0a0a0f]/95 backdrop-blur-xl border-b border-gray-800/50">
        <div className="max-w-7xl mx-auto px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={handleBackToDashboard}
                className="p-2 rounded-xl bg-[#1a1a24] text-gray-400 hover:text-white hover:bg-[#252530] transition-all border border-gray-800/50"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
              <div>
                <h1 className="text-lg font-bold text-white truncate max-w-md">
                  {currentProject?.title || '새 프로젝트'}
                </h1>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest">
                  {currentProject?.status === 'completed' ? '완료됨' :
                   currentProject?.status === 'in_progress' ? '작성 중' : '임시저장'}
                </p>
              </div>
              {/* 설정 수정 버튼 */}
              <button
                onClick={handleBackToWizard}
                className="px-3 py-1.5 rounded-lg bg-[#1a1a24] text-gray-300 hover:bg-[#252530] hover:text-white transition-colors text-xs font-bold flex items-center gap-1.5 border border-gray-800/50"
                title="영상 설정 수정"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                설정 수정
              </button>
            </div>
            <div className="flex items-center gap-2">
              {/* Undo/Redo 버튼 */}
              <div className="flex items-center gap-1 mr-2">
                <button
                  onClick={handleUndo}
                  disabled={undoStack.length === 0}
                  className={`p-2 rounded-lg transition-colors ${
                    undoStack.length === 0
                      ? 'bg-[#12121a] text-gray-600 cursor-not-allowed'
                      : 'bg-[#1a1a24] text-gray-400 hover:bg-[#252530] hover:text-white border border-gray-800/50'
                  }`}
                  title="실행 취소 (Ctrl+Z)"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                </button>
                <button
                  onClick={handleRedo}
                  disabled={redoStack.length === 0}
                  className={`p-2 rounded-lg transition-colors ${
                    redoStack.length === 0
                      ? 'bg-[#12121a] text-gray-600 cursor-not-allowed'
                      : 'bg-[#1a1a24] text-gray-400 hover:bg-[#252530] hover:text-white border border-gray-800/50'
                  }`}
                  title="다시 실행 (Ctrl+Shift+Z)"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
                  </svg>
                </button>
              </div>
              {/* 저장 버튼 */}
              <button
                onClick={saveCurrentProject}
                className="px-4 py-2 rounded-xl bg-[#1a1a24] text-gray-300 hover:bg-[#252530] hover:text-white transition-colors text-sm font-bold flex items-center gap-2 border border-gray-800/50"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                저장
              </button>
            </div>
          </div>
        </div>
      </header>

      {needsKey && (
        <div className="bg-amber-900/30 border-b border-amber-700/50 py-2 px-4 flex items-center justify-center gap-4 animate-in fade-in slide-in-from-top-4">
          <span className="text-amber-400 text-xs font-bold">Gemini 3 Pro 엔진을 위해 API 키 설정이 필요합니다.</span>
          <button onClick={handleOpenKeySelector} className="px-3 py-1 bg-amber-500 text-white text-[10px] font-black rounded-lg hover:bg-amber-600 transition-colors uppercase">API 키 설정</button>
        </div>
      )}

      <main className="py-8">
        <InputSection onGenerate={handleGenerate} step={step} />

        {step !== GenerationStep.IDLE && (
          <div className="max-w-7xl mx-auto px-4 text-center mb-12">
             <div className="inline-flex items-center gap-4 px-6 py-3 rounded-2xl border bg-[#1a1a24] border-gray-800/50">
                {step === GenerationStep.SCRIPTING || step === GenerationStep.ASSETS ? (
                  <div className="w-4 h-4 border-2 border-[#f06050] border-t-transparent animate-spin rounded-full"></div>
                ) : <div className={`w-2 h-2 rounded-full ${step === GenerationStep.ERROR ? 'bg-red-500' : 'bg-emerald-500'}`}></div>}
                <span className="text-sm font-bold text-gray-300">{progressMessage}</span>
                {(step === GenerationStep.SCRIPTING || step === GenerationStep.ASSETS) && (
                  <button onClick={handleAbort} className="ml-2 px-3 py-1 rounded-lg bg-red-900/30 text-red-400 text-[10px] font-black uppercase tracking-widest border border-red-800/50 hover:bg-red-900/50">Stop</button>
                )}
             </div>
          </div>
        )}

        <ResultTable 
            data={generatedData} 
            onRegenerateImage={async (idx: number) => {
              if (isProcessingRef.current) return;

              // 이미지 재생성 전 현재 상태를 히스토리에 저장
              saveToHistory();

              const MAX_RETRIES = 2;
              updateAssetAt(idx, { status: 'generating' });
              setProgressMessage(`씬 ${idx + 1} 이미지 재생성 중...`);
              
              let success = false;
              
              for (let attempt = 0; attempt <= MAX_RETRIES && !success; attempt++) {
                if (isAbortedRef.current) break;
                
                try {
                  if (attempt > 0) {
                    setProgressMessage(`씬 ${idx + 1} 이미지 재생성 재시도 중... (${attempt}/${MAX_RETRIES})`);
                    await wait(2000);
                  }
                  
                  const img = await generateImageForScene(assetsRef.current[idx], currentReferenceImages, currentGenOptionsRef.current.aspectRatio, currentGenOptionsRef.current.style, currentGenOptionsRef.current.customStylePrompt, currentGenOptionsRef.current.characterType, currentGenOptionsRef.current.characterRefImages, currentGenOptionsRef.current.styleRefImages, currentGenOptionsRef.current.characterRefStrength, currentGenOptionsRef.current.styleRefStrength);
                  
                  if (img && !isAbortedRef.current) {
                    updateAssetAt(idx, { imageData: img, status: 'completed' });
                    setProgressMessage(`씬 ${idx + 1} 이미지 재생성 완료!`);
                    success = true;
                  } else if (!img) {
                    throw new Error('이미지 데이터가 비어있습니다');
                  }
                } catch (e: any) {
                  console.error(`씬 ${idx + 1} 재생성 실패 (시도 ${attempt + 1}/${MAX_RETRIES + 1}):`, e.message);
                  
                  if (e.message?.includes("API key not valid") || e.status === 400) {
                    setNeedsKey(true);
                    break;
                  }
                }
              }
              
              if (!success && !isAbortedRef.current) {
                updateAssetAt(idx, { status: 'error' });
                setProgressMessage(`씬 ${idx + 1} 이미지 생성 실패. 다시 시도해주세요.`);
              }
            }}
            onExportVideo={triggerVideoExport}
            isExporting={isVideoGenerating}
            animatingIndices={animatingIndices}
            onGenerateAnimation={async (idx: number) => {
              const falKey = getFalApiKey();
              if (!falKey) {
                alert('FAL API 키를 먼저 등록해주세요.\n설정 패널에서 "FAL.ai 애니메이션 엔진"을 열어 키를 입력하세요.');
                return;
              }
              if (animatingIndices.has(idx)) return; // 이 씬은 이미 변환 중
              if (!assetsRef.current[idx]?.imageData) {
                alert('이미지가 먼저 생성되어야 합니다.');
                return;
              }

              // 영상 변환 전 현재 상태를 히스토리에 저장
              saveToHistory();

              try {
                // Set에 현재 인덱스 추가
                setAnimatingIndices(prev => new Set(prev).add(idx));
                setProgressMessage(`씬 ${idx + 1} 움직임 분석 중... (${animatingIndices.size + 1}개 진행중)`);

                // AI가 대본과 이미지를 분석해서 움직임 프롬프트 생성
                const motionPrompt = await generateMotionPrompt(
                  assetsRef.current[idx].narration,
                  assetsRef.current[idx].visualPrompt
                );

                setProgressMessage(`씬 ${idx + 1} 영상 변환 중...`);
                const videoUrl = await generateVideoFromImage(
                  assetsRef.current[idx].imageData!,
                  motionPrompt,
                  falKey
                );

                if (videoUrl) {
                  updateAssetAt(idx, {
                    videoData: videoUrl,
                    videoDuration: CONFIG.ANIMATION.VIDEO_DURATION
                  });
                  setProgressMessage(`씬 ${idx + 1} 영상 변환 완료!`);
                } else {
                  setProgressMessage(`씬 ${idx + 1} 영상 변환 실패!`);
                }
              } catch (e: any) {
                console.error('영상 변환 실패:', e);
                setProgressMessage(`씬 ${idx + 1} 오류: ${e.message}`);
              } finally {
                // Set에서 현재 인덱스 제거
                setAnimatingIndices(prev => {
                  const next = new Set(prev);
                  next.delete(idx);
                  return next;
                });
              }
            }}
            aspectRatio={currentGenOptionsRef.current.aspectRatio || '16:9'}
        />
      </main>
    </div>
  );
};

export default App;
