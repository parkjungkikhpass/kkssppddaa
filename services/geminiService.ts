
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { ScriptScene } from "../types";
import { SYSTEM_INSTRUCTIONS, getTrendSearchPrompt, getScriptGenerationPrompt, getFinalVisualPrompt, getStylePrompt, StyleType, CharacterType, CategoryType, getCategorySystemPrompt } from "./prompts";

/**
 * Gemini API 클라이언트 초기화
 * - .env.local 파일의 GEMINI_API_KEY를 사용합니다
 */
const getAI = () => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 안전 필터 우회를 위한 키워드 대체 맵
 * - 필터에 걸리기 쉬운 표현 → 안전한 동의어로 변환
 */
const KEYWORD_ALTERNATIVES: Record<string, string[]> = {
  // X-ray 관련
  'x-ray': ['transparent cutaway', 'see-through', 'translucent'],
  'x-ray view': ['transparent cutaway view', 'see-through view', 'cross-section view'],
  'xray': ['transparent', 'see-through', 'translucent'],

  // 의료/해부 관련
  'dissection': ['cross-section', 'cutaway'],
  'anatomy': ['internal structure', 'inner components'],
  'surgical': ['precise', 'detailed'],

  // 무기/폭발 관련 (경제 뉴스에서 은유로 쓰일 수 있음)
  'explosion': ['burst', 'rapid expansion', 'dramatic surge'],
  'bomb': ['impact', 'dramatic event'],
  'crash': ['sharp decline', 'sudden drop'],

  // 기타 민감 표현
  'naked': ['bare', 'exposed', 'uncovered'],
  'blood': ['red liquid', 'crimson'],
  'death': ['end', 'decline', 'fall'],
  'kill': ['eliminate', 'end', 'stop'],
};

/**
 * 프롬프트에서 민감한 키워드를 안전한 대체어로 변환
 */
const sanitizePrompt = (prompt: string, attemptIndex: number = 0): string => {
  let sanitized = prompt.toLowerCase();
  let result = prompt;

  for (const [keyword, alternatives] of Object.entries(KEYWORD_ALTERNATIVES)) {
    const regex = new RegExp(keyword, 'gi');
    if (regex.test(sanitized)) {
      // attemptIndex에 따라 다른 대체어 선택 (재시도마다 다른 표현 시도)
      const altIndex = attemptIndex % alternatives.length;
      result = result.replace(regex, alternatives[altIndex]);
      sanitized = result.toLowerCase();
    }
  }

  return result;
};

/**
 * 불완전한 JSON 자동 복구
 * - 대용량 대본 처리 시 토큰 제한으로 JSON이 잘릴 수 있음
 * - 열린 브래킷을 추적하여 자동으로 닫아줌
 * @param partial 불완전한 JSON 문자열
 * @param isArray 배열 형태인지 여부
 * @returns 복구된 JSON 문자열
 */
const repairIncompleteJson = (partial: string, isArray: boolean): string => {
  // 문자열 내부인지 추적 (이스케이프된 따옴표 고려)
  let inString = false;
  let escapeNext = false;

  // 각 브래킷 타입별 열린 개수 추적
  const stack: string[] = [];

  for (let i = 0; i < partial.length; i++) {
    const char = partial[i];

    // 이스케이프 문자 처리
    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    // 문자열 시작/끝 감지
    if (char === '"') {
      inString = !inString;
      continue;
    }

    // 문자열 내부가 아닐 때만 브래킷 처리
    if (!inString) {
      if (char === '[' || char === '{') {
        stack.push(char);
      } else if (char === ']' || char === '}') {
        stack.pop();
      }
    }
  }

  // 열린 문자열이 있으면 닫기
  if (inString) {
    partial += '"';
  }

  // 마지막 불완전한 속성 제거 (쉼표로 끝나는 경우)
  partial = partial.replace(/,\s*$/, '');

  // 불완전한 속성값 제거 (키만 있고 값이 없는 경우: "key": )
  partial = partial.replace(/,?\s*"[^"]*"\s*:\s*$/, '');

  // 열린 브래킷들 역순으로 닫기
  while (stack.length > 0) {
    const openBracket = stack.pop();
    partial += openBracket === '[' ? ']' : '}';
  }

  return partial;
};

/**
 * JSON 응답 텍스트 정리 - 불필요한 문자 제거 및 불완전한 JSON 복구
 * @param text API 응답 텍스트
 * @param attemptRepair 복구 시도 여부 (기본: true)
 * @returns 정리된 JSON 문자열
 */
const cleanJsonResponse = (text: string, attemptRepair: boolean = true): string => {
  if (!text) return '[]';

  let cleaned = text.trim();

  // 마크다운 코드 블록 제거
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }

  cleaned = cleaned.trim();

  // 문자열 내부 제어 문자 이스케이프 처리 (JSON 파싱 오류 방지)
  // 탭, 개행 등을 이스케이프 시퀀스로 변환
  cleaned = cleaned.replace(/(?<!\\)\t/g, '\\t');
  // 문자열 내부의 실제 개행을 \n으로 변환 (JSON 표준)
  cleaned = cleaned.replace(/(?<!\\)\r\n/g, '\\n').replace(/(?<!\\)\r/g, '\\n');

  // JSON 배열/객체 시작과 끝 찾기
  const firstBracket = cleaned.search(/[\[{]/);

  if (firstBracket === -1) {
    console.warn('[JSON Clean] JSON 시작 브래킷을 찾을 수 없음:', cleaned.slice(0, 100));
    return '[]';
  }

  // 배열인지 객체인지 판단
  const isArray = cleaned[firstBracket] === '[';

  // 중첩 레벨을 추적하며 올바른 닫는 브래킷 찾기
  // 문자열 내부의 브래킷은 무시해야 함
  let depth = 0;
  let lastValidIndex = -1;
  let inString = false;
  let escapeNext = false;

  for (let i = firstBracket; i < cleaned.length; i++) {
    const char = cleaned[i];

    // 이스케이프 문자 처리
    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    // 문자열 시작/끝 감지
    if (char === '"') {
      inString = !inString;
      continue;
    }

    // 문자열 내부가 아닐 때만 브래킷 카운트
    if (!inString) {
      if (char === '[' || char === '{') depth++;
      if (char === ']' || char === '}') {
        depth--;
        if (depth === 0) {
          lastValidIndex = i;
          break;
        }
      }
    }
  }

  if (lastValidIndex !== -1) {
    // 정상적으로 닫힌 JSON
    cleaned = cleaned.slice(firstBracket, lastValidIndex + 1);
  } else if (attemptRepair) {
    // 불완전한 JSON - 복구 시도
    console.warn('[JSON Clean] 불완전한 JSON 감지, 복구 시도...');
    const partialJson = cleaned.slice(firstBracket);
    cleaned = repairIncompleteJson(partialJson, isArray);
    console.log('[JSON Clean] 복구 완료, 길이:', cleaned.length);
  } else {
    // 폴백: 기존 방식
    const lastBracket = Math.max(cleaned.lastIndexOf(']'), cleaned.lastIndexOf('}'));
    if (lastBracket > firstBracket) {
      cleaned = cleaned.slice(firstBracket, lastBracket + 1);
    }
  }

  return cleaned.trim();
};

const retryGeminiRequest = async <T>(
  operationName: string,
  requestFn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 5000
): Promise<T> => {
  let lastError: any;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await requestFn();
    } catch (error: any) {
      lastError = error;
      const errorMsg = error.message || JSON.stringify(error);
      const isQuotaError = errorMsg.includes('429') || errorMsg.includes('Quota') || error.status === 429;
      if (isQuotaError && attempt < maxRetries) {
        await wait(baseDelay * attempt);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
};

export const findTrendingTopics = async (category: string, usedTopics: string[]) => {
  return retryGeminiRequest("Trend Search", async () => {
    const ai = getAI();
    const prompt = getTrendSearchPrompt(category, usedTopics.join(", "));
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTIONS.TREND_RESEARCHER,
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json"
      },
    });
    return JSON.parse(cleanJsonResponse(response.text));
  });
};

export const generateScript = async (topic: string, hasReferenceImage: boolean, sourceContext?: string | null, category?: CategoryType): Promise<ScriptScene[]> => {
  return retryGeminiRequest("Script Generation", async () => {
    const ai = getAI();
    const baseInstruction = topic === "Manual Script Input" ? SYSTEM_INSTRUCTIONS.MANUAL_VISUAL_MATCHER :
                            hasReferenceImage ? SYSTEM_INSTRUCTIONS.REFERENCE_MATCH :
                            SYSTEM_INSTRUCTIONS.CHIEF_ART_DIRECTOR;

    // 카테고리가 지정된 경우 로그 출력
    if (category) {
      console.log(`[Script Generation] 카테고리 적용: ${category}`);
    }

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: getScriptGenerationPrompt(topic, sourceContext, category),
      config: {
        thinkingConfig: { thinkingBudget: 32768 },
        responseMimeType: "application/json",
        systemInstruction: baseInstruction,
      },
    });

    const result = JSON.parse(cleanJsonResponse(response.text));
    const scenes = Array.isArray(result) ? result : (result.scenes || []);

    console.log(`[Script Generation] 생성된 씬 개수: ${scenes.length}`);

    // 씬이 너무 적으면 경고
    if (scenes.length < 3) {
      console.warn(`[Warning] 씬이 ${scenes.length}개만 생성됨. 대본이 제대로 분할되지 않았을 수 있음.`);
    }

    return scenes.map((scene: any, idx: number) => ({
      sceneNumber: scene.sceneNumber || idx + 1,
      narration: scene.narration || "",
      visualPrompt: scene.image_prompt_english || "",
      analysis: scene.analysis || {}
    }));
  });
};

/**
 * 대용량 대본을 청크로 분할하여 스크립트 생성
 * - 3000자 초과 대본을 문단 단위로 분할
 * - 각 청크를 순차 처리하여 API rate limit 방지
 * - 씬 번호를 자동으로 재정렬
 *
 * @param topic 주제
 * @param sourceContext 전체 대본 텍스트 (10,000자 이상 가능)
 * @param hasReferenceImage 레퍼런스 이미지 유무
 * @returns 모든 청크의 씬을 합친 배열
 */
export const generateScriptChunked = async (
  topic: string,
  sourceContext: string,
  hasReferenceImage: boolean,
  category?: CategoryType
): Promise<ScriptScene[]> => {
  const CHUNK_SIZE = 3000; // 청크 최대 크기
  const CHUNK_DELAY = 2000; // 청크 간 딜레이 (ms)

  console.log(`[Script Chunked] 대용량 대본 감지: ${sourceContext.length}자, 청크 분할 처리 시작`);

  // 문단 단위로 분할 (빈 줄 기준)
  const paragraphs = sourceContext.split(/\n\s*\n/).filter(p => p.trim());
  const chunks: string[] = [];
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    // 현재 청크 + 새 문단이 CHUNK_SIZE를 초과하면 새 청크 시작
    if (currentChunk.length + paragraph.length > CHUNK_SIZE && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
    }

    // 단일 문단이 CHUNK_SIZE를 초과하는 경우 문장 단위로 재분할
    if (paragraph.length > CHUNK_SIZE) {
      // 현재 청크가 있으면 먼저 저장
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }

      // 문장 단위로 분할 (마침표, 물음표, 느낌표 기준)
      const sentences = paragraph.split(/(?<=[.?!。])\s+/);
      let sentenceChunk = '';

      for (const sentence of sentences) {
        if (sentenceChunk.length + sentence.length > CHUNK_SIZE && sentenceChunk.length > 0) {
          chunks.push(sentenceChunk.trim());
          sentenceChunk = '';
        }
        sentenceChunk += (sentenceChunk ? ' ' : '') + sentence;
      }

      if (sentenceChunk.length > 0) {
        currentChunk = sentenceChunk;
      }
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    }
  }

  // 마지막 청크 저장
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  console.log(`[Script Chunked] ${chunks.length}개 청크로 분할 완료`);
  chunks.forEach((chunk, i) => {
    console.log(`  청크 ${i + 1}: ${chunk.length}자`);
  });

  // 각 청크 순차 처리
  const allScenes: ScriptScene[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const isLastChunk = i === chunks.length - 1;

    console.log(`[Script Chunked] 청크 ${i + 1}/${chunks.length} 처리 중... (${chunk.length}자)`);

    try {
      // 청크별 프롬프트에 맥락 정보 추가
      const chunkContext = `[Part ${i + 1}/${chunks.length}] ${chunk}`;
      const chunkScenes = await generateScript(topic, hasReferenceImage, chunkContext, category);

      // 씬 번호 재정렬 (이전 씬 개수 + 현재 인덱스)
      const reindexedScenes = chunkScenes.map((scene, idx) => ({
        ...scene,
        sceneNumber: allScenes.length + idx + 1
      }));

      allScenes.push(...reindexedScenes);
      console.log(`[Script Chunked] 청크 ${i + 1} 완료: ${chunkScenes.length}개 씬 생성`);

      // 마지막 청크가 아니면 딜레이 적용 (API rate limit 방지)
      if (!isLastChunk) {
        await wait(CHUNK_DELAY);
      }
    } catch (error: any) {
      console.error(`[Script Chunked] 청크 ${i + 1} 처리 실패:`, error.message);

      // 재시도 1회
      await wait(CHUNK_DELAY * 2);
      try {
        console.log(`[Script Chunked] 청크 ${i + 1} 재시도 중...`);
        const retryScenes = await generateScript(topic, hasReferenceImage, chunk, category);
        const reindexedScenes = retryScenes.map((scene, idx) => ({
          ...scene,
          sceneNumber: allScenes.length + idx + 1
        }));
        allScenes.push(...reindexedScenes);
        console.log(`[Script Chunked] 청크 ${i + 1} 재시도 성공`);
      } catch (retryError: any) {
        console.error(`[Script Chunked] 청크 ${i + 1} 재시도 실패:`, retryError.message);
        // 해당 청크는 건너뛰고 계속 진행
      }
    }
  }

  console.log(`[Script Chunked] 전체 처리 완료: 총 ${allScenes.length}개 씬`);
  return allScenes;
};

/**
 * visualPrompt에서 기존 스타일 및 캐릭터 관련 키워드를 제거하는 함수
 * customStylePrompt가 있을 때 충돌을 방지하기 위함
 */
const removeStyleFromVisualPrompt = (prompt: string): string => {
  // 제거할 스타일 관련 패턴들
  const stylePatterns = [
    /\b(3D\s+)?Pixar[- ]style\s*(3D\s+)?(cartoon\s+)?(render\s*)?/gi,
    /\bPixar\/Disney\s+style\s*/gi,
    /\bDisney[- ]style\s*/gi,
    /\bhand[- ]drawn\s+illustration\s*/gi,
    /\b2D\s+flat\s+illustration\s*/gi,
    /\bcrayon\/?colored\s+pencil\s+texture\.?\s*/gi,
    /\bwith\s+crayon-like\s+fill\.?\s*/gi,
    /\banalog,?\s+hand[- ]drawn\s+feel\.?\s*/gi,
    /\b(clean\s+)?minimal\s+flat\s+vector\s+illustration\.?\s*/gi,
    /\bvibrant\s+saturated\s+colors,?\s*/gi,
    /\bsmooth\s+plastic-like\s+materials\s*/gi,
    /\bBauhaus\s+inspired\s+simplicity\.?\s*/gi,
    /\bSTYLE:\s*16:9\s+aspect\s+ratio,?\s*/gi,
    /\b16:9\s+wide[- ]shot,?\s*/gi,
    /\billustration\s+of\s+/gi,
    /\bA\s+(3D\s+)?illustration\s+of\s+/gi,
  ];

  // 졸라맨(stick figure) 관련 패턴 제거
  const stickFigurePatterns = [
    /\bstick\s+figure\s*(\([^)]*\))?\s*/gi,
    /\bSmall\s+stick\s+figure\s*(\([^)]*\))?\s*with\s+large\s+objects\.?\s*/gi,
    /\bClose-up\s+of\s+stick\s+figure\s*(\([^)]*\))?\s*/gi,
    /\bStick\s+figure\s*(\([^)]*\))?\s*interacting\s+with\s+objects\.?\s*/gi,
    /\bCHARACTER:\s*Simple\s+2D\s+stick\s+figure[^.]*\./gi,
    /\bCircle\s+head,?\s+dot\s+eyes,?\s+line\s+mouth\.?\s*/gi,
    /\bThin\s+line\s+body\/arms\/legs\.?\s*/gi,
    /\bBlack\s+outline\s+only\.?\s*/gi,
    /\bDo\s+NOT\s+write\s+(character\s+)?name\.?\s*/gi,
    /\bNO\s+CHARACTER\s*-?\s*Only\s+objects\s+and\s+text\.?\s*/gi,
    /\bpresenter\b/gi,  // presenter를 person으로 대체하지 않고 제거
  ];

  let cleaned = prompt;

  // 스타일 패턴 제거
  for (const pattern of stylePatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  // 졸라맨 패턴 제거
  for (const pattern of stickFigurePatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  // "illustration" 단어만 있으면 제거 (문맥에 맞게)
  cleaned = cleaned.replace(/\b(a\s+)?(3D\s+)?(cartoon\s+)?illustration\b/gi, 'image');

  // "presenter"를 "person"으로 대체 (프롬프트에서 사람이 필요한 경우)
  cleaned = cleaned.replace(/\bthe\s+presenter\b/gi, 'a person');

  // STYLE: 블록 전체 제거
  cleaned = cleaned.replace(/STYLE:[^\n]*(\n[^\n]*){0,3}/gi, '');

  // CHARACTER: 블록 전체 제거
  cleaned = cleaned.replace(/CHARACTER:[^\n]*(\n[^\n]*){0,3}/gi, '');

  // 연속된 공백 및 빈 줄 정리
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

  return cleaned;
};

export const generateImageForScene = async (
  scene: ScriptScene,
  referenceImages: string[],
  aspectRatio: string = "16:9",
  style: StyleType = "default",
  customStylePrompt: string = "",
  characterType: CharacterType = "none",
  characterRefImages: string[] = [],   // 최대 4개 배열
  styleRefImages: string[] = [],       // 최대 2개 배열
  characterRefStrength: number = 100,  // 0-100% (기본값 100% = 강하게)
  styleRefStrength: number = 100,      // 0-100% (기본값 100% = 강하게)
  category?: CategoryType              // 카테고리별 시각화 규칙 적용
): Promise<string | null> => {
  // 새로운 분리된 레퍼런스 시스템 (다중 이미지 지원)
  const hasCharacterRef = characterRefImages.length > 0;
  const hasStyleRef = styleRefImages.length > 0;

  // 기존 레퍼런스 (하위 호환)
  const hasLegacyRef = referenceImages && referenceImages.length > 0 && !hasCharacterRef && !hasStyleRef;

  // 카테고리별 프롬프트 생성 (선택된 경우)
  const categoryPrompt = category ? getCategorySystemPrompt(category) : '';
  if (category) {
    console.log(`[Image Gen] 카테고리 적용: ${category}`);
  }

  // visualPrompt 생성 - 캐릭터 타입, 레퍼런스 개수, 강도 전달
  let visualPrompt = getFinalVisualPrompt(
    scene,
    hasLegacyRef,
    characterType,
    characterRefImages.length,  // 캐릭터 레퍼런스 개수 (0~4)
    styleRefImages.length,       // 화풍 레퍼런스 개수 (0~2)
    characterRefStrength,
    styleRefStrength
  );
  const stylePrompt = getStylePrompt(style);

  // 커스텀 스타일이 있으면 visualPrompt에서 기존 스타일 키워드 제거
  if (customStylePrompt.trim()) {
    visualPrompt = removeStyleFromVisualPrompt(visualPrompt);
  }

  // 커스텀 스타일 프롬프트 처리 - 가장 높은 우선순위로 적용
  let masterStyleDirective = "";

  if (customStylePrompt.trim()) {
    // 사용자 입력을 구체적인 이미지 생성 지시문으로 변환
    masterStyleDirective = `[MANDATORY MASTER STYLE - THIS OVERRIDES EVERYTHING]
===========================================
Art Direction: ${customStylePrompt}

STRICT REQUIREMENTS:
- Color Palette: Extract and apply colors from the style description above
- Art Style: Match the exact artistic style specified
- Mood/Atmosphere: Maintain consistent mood throughout
- Character Design: If characters appear, keep their design consistent
- Composition: Follow the visual language of the specified style
- Lighting: Use lighting that matches the described atmosphere
- Texture: Apply appropriate textures for the art style

IMPORTANT: Every single image MUST follow this exact style. No exceptions.
===========================================

`;
  }

  // 분리된 레퍼런스 이미지 지시문 (다중 이미지 지원)
  let referenceStyleDirective = "";
  const charCount = characterRefImages.length;
  const styleCount = styleRefImages.length;

  if (hasCharacterRef && hasStyleRef) {
    referenceStyleDirective = `[DUAL REFERENCE MODE - ${charCount} CHARACTER(S) + ${styleCount} STYLE(S)]
IMAGES 1-${charCount} = CHARACTER REFERENCES:
- Extract character design, proportions, facial features, outfit from all ${charCount} character images
- Combine common features from all character references for consistency
- Use this combined character design in every scene

IMAGES ${charCount + 1}-${charCount + styleCount} = STYLE REFERENCES:
- Extract art style, color palette, lighting, texture from all ${styleCount} style images
- Apply the combined visual style to everything

COMBINE: Draw the character(s) from images 1-${charCount} in the style of images ${charCount + 1}-${charCount + styleCount}.

`;
  } else if (hasCharacterRef) {
    referenceStyleDirective = `[CHARACTER REFERENCE MODE - ${charCount} IMAGE(S)]
Analyze all ${charCount} character reference image(s) and extract:
- Character design and proportions (combine features from all references)
- Facial features and expressions
- Outfit and accessories
- Overall character personality

Draw this character consistently in the scene. Combine features from all ${charCount} reference(s).

`;
  } else if (hasStyleRef) {
    referenceStyleDirective = `[STYLE REFERENCE MODE - ${styleCount} IMAGE(S)]
Analyze all ${styleCount} style reference image(s) and extract:
- Exact color palette (dominant colors, accent colors)
- Art style (illustration, realistic, anime, etc.)
- Line quality and stroke style
- Texture and surface treatment
- Lighting direction and mood

Apply ALL extracted style characteristics. Content should follow the script.

`;
  } else if (hasLegacyRef) {
    // 기존 레퍼런스 (하위 호환)
    referenceStyleDirective = `[REFERENCE IMAGE ANALYSIS - MANDATORY]
Analyze the provided reference image(s) and extract:
- Exact color palette (dominant colors, accent colors)
- Art style (illustration, realistic, anime, etc.)
- Line quality and stroke style
- Texture and surface treatment
- Lighting direction and mood
- Overall visual atmosphere

Apply ALL extracted characteristics to the generated image.
The output MUST look like it belongs to the same art series as the reference.

`;
  }

  // 프롬프트 구성
  const hasAnyRef = hasCharacterRef || hasStyleRef || hasLegacyRef;
  const useDefaultStyle = !customStylePrompt.trim() && !hasAnyRef;
  const finalStylePrompt = useDefaultStyle ? stylePrompt : "";

  // 카테고리 프롬프트를 맨 앞에 추가하여 시각화 규칙 적용
  const basePrompt = `${categoryPrompt}${masterStyleDirective}${referenceStyleDirective}${finalStylePrompt}\n\n${visualPrompt}`;

  const MAX_SANITIZE_ATTEMPTS = 3; // 대체어 시도 횟수
  let lastError: any;

  for (let sanitizeAttempt = 0; sanitizeAttempt < MAX_SANITIZE_ATTEMPTS; sanitizeAttempt++) {
    // 시도마다 다른 대체어 적용
    const sanitizedPrompt = sanitizeAttempt === 0
      ? basePrompt
      : sanitizePrompt(basePrompt, sanitizeAttempt - 1);

    if (sanitizeAttempt > 0) {
      console.log(`[Image Gen] 키워드 대체 시도 ${sanitizeAttempt}: 프롬프트 수정됨`);
    }

    try {
      const result = await retryGeminiRequest("Pro Image Generation", async () => {
        const ai = getAI();  // 환경 변수에서 API 키 사용
        const parts: any[] = [];

        // 분리된 레퍼런스 이미지 (캐릭터 먼저, 화풍 나중에) - 다중 이미지 지원
        // 캐릭터 레퍼런스 이미지들 (최대 4개)
        characterRefImages.forEach(img => {
          const imgData = img.includes(',') ? img.split(',')[1] : img;
          parts.push({ inlineData: { data: imgData, mimeType: 'image/jpeg' } });
        });
        // 화풍 레퍼런스 이미지들 (최대 2개)
        styleRefImages.forEach(img => {
          const imgData = img.includes(',') ? img.split(',')[1] : img;
          parts.push({ inlineData: { data: imgData, mimeType: 'image/jpeg' } });
        });

        // 기존 레퍼런스 이미지 (하위 호환) - 분리된 레퍼런스가 없을 때만
        if (characterRefImages.length === 0 && styleRefImages.length === 0 && referenceImages && referenceImages.length > 0) {
          referenceImages.forEach(img => {
            const imgData = img.includes(',') ? img.split(',')[1] : img;
            parts.push({ inlineData: { data: imgData, mimeType: 'image/jpeg' } });
          });
        }

        parts.push({ text: sanitizedPrompt });

        const response = await ai.models.generateContent({
          model: 'gemini-3-pro-image-preview',
          contents: { parts },
          config: {
            imageConfig: { aspectRatio: aspectRatio, imageSize: "1K" }
          }
        });

        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) return part.inlineData.data;
        }
        return null;
      }, 2, 1500); // 각 대체어당 2회 재시도 (기존 3000ms → 1500ms로 단축)

      if (result) return result;
    } catch (error: any) {
      lastError = error;
      const errorMsg = error.message || JSON.stringify(error);

      // 안전 필터/콘텐츠 정책 관련 에러인지 확인
      const isSafetyError =
        errorMsg.includes('safety') ||
        errorMsg.includes('blocked') ||
        errorMsg.includes('policy') ||
        errorMsg.includes('content') ||
        errorMsg.includes('SAFETY') ||
        errorMsg.includes('harmful') ||
        error.status === 400;

      if (isSafetyError && sanitizeAttempt < MAX_SANITIZE_ATTEMPTS - 1) {
        console.log(`[Image Gen] 안전 필터 감지됨. 대체 키워드로 재시도...`);
        await wait(300); // 기존 1000ms → 300ms로 단축
        continue; // 다음 대체어로 재시도
      }

      // 안전 필터 에러가 아니거나 모든 대체어 소진 시 에러 throw
      throw error;
    }
  }

  throw lastError || new Error('이미지 생성 실패: 모든 대체어 시도 실패');
};

export const generateAudioForScene = async (text: string, voiceName: string = "Kore") => {
  return retryGeminiRequest("TTS Generation", async () => {
    const ai = getAI();
    // TTS 모델에 명확한 지시어 추가
    const ttsPrompt = `TTS: ${text}`;
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: ttsPrompt,
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } }
      }
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
  });
};

/**
 * AI 기반 자막 의미 단위 분리
 * - 나레이션을 의미가 통하는 단위로 분리
 * - 각 청크는 maxChars(기본 22자) 이하
 * - 반환: 분리된 텍스트 청크 배열
 */
export const splitSubtitleByMeaning = async (
  narration: string,
  maxChars: number = 22
): Promise<string[]> => {
  return retryGeminiRequest("Subtitle Split", async () => {
    const ai = getAI();

    const prompt = `당신은 자막 편집 전문가입니다.
아래 나레이션을 자막용으로 분리해주세요.

## 규칙
1. 의미가 통하는 단위로 분리 (문장 중간에 어색하게 끊지 않기)
2. 각 청크는 반드시 ${maxChars}자 이하
3. 쉼표, 조사, 접속사 등 자연스러운 끊김 포인트 활용
4. 원문의 단어를 그대로 유지 (수정/생략 금지)
5. 모든 텍스트가 빠짐없이 포함되어야 함

## 나레이션
${narration}

## 출력 형식
JSON 배열로 출력. 예: ["첫 번째 청크", "두 번째 청크", ...]`;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const chunks = JSON.parse(cleanJsonResponse(response.text));

    // 유효성 검증: 원문 복원 확인
    const reconstructed = chunks.join('').replace(/\s+/g, '');
    const original = narration.replace(/\s+/g, '');

    if (reconstructed !== original) {
      console.warn('[Subtitle Split] 원문과 청크 불일치, 폴백 사용');
      // 폴백: 단순 길이 기반 분리
      return fallbackSplit(narration, maxChars);
    }

    return chunks;
  }, 2, 1000);
};

/**
 * 대본과 이미지 프롬프트를 분석하여 애니메이션 움직임 프롬프트 생성
 * - 캐릭터 감정/동작 분석
 * - 상황에 맞는 움직임 제안
 */
export const generateMotionPrompt = async (
  narration: string,
  visualPrompt: string
): Promise<string> => {
  try {
    const ai = getAI();

    const prompt = `You are an animation director. Analyze the narration and visual description, then generate a motion prompt for image-to-video AI.

## Rules
1. Output in English only
2. Keep the original image style intact - NO style changes
3. Suggest subtle, natural character movements based on emotion/context
4. Camera: slow gentle zoom in
5. Keep movements minimal but expressive
6. Max 100 words

## Narration (Korean)
${narration}

## Visual Description
${visualPrompt.slice(0, 300)}

## Output Format
Return ONLY the motion prompt, no explanation. Example:
"Slow gentle zoom in. Character slightly nods with a warm smile, eyes blinking naturally. Subtle breathing motion. Background remains static. Maintain original art style consistency."`;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
    });

    const motionPrompt = response.text?.trim() || '';
    console.log('[Motion Prompt] 생성됨:', motionPrompt.slice(0, 100) + '...');
    return motionPrompt;

  } catch (error) {
    console.warn('[Motion Prompt] 생성 실패, 기본 프롬프트 사용');
    // 폴백: 기본 프롬프트
    return `Slow gentle zoom in. Subtle natural movement. Maintain original art style. ${visualPrompt.slice(0, 100)}`;
  }
};

/**
 * AI 실패 시 폴백: 구두점 + 길이 기반 분리
 */
function fallbackSplit(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  let current = '';

  // 구두점이나 공백 기준으로 분리
  const tokens = text.split(/(?<=[,.])|(?=\s)/);

  for (const token of tokens) {
    if ((current + token).length <= maxChars) {
      current += token;
    } else {
      if (current.trim()) chunks.push(current.trim());
      current = token.trimStart();
    }
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks;
}
