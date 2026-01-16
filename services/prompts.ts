/**
 * --- V10.0 Concept-Based Visual Generation Engine ---
 * "문장→이미지 자동 생성 시스템 (개념 기반)" 전체 메커니즘 통합
 *
 * 핵심 원칙:
 * 1. 판단 우선, 암기 금지 - 예시를 외우지 말고 원리로 판단
 * 2. 맥락이 의미를 결정 - 고립된 단어가 아닌 문장 전체와 전후 맥락
 * 3. 일관성 > 창의성 - 같은 개념은 항상 같은 시각으로
 * 4. 보편성 우선 - 문화적 특수성보다 인간 보편성
 * 5. 계층적 폴백 - 최선이 불가능하면 차선을, 끝까지 포기하지 말라
 */

// ============================================================================
// 카테고리 및 스타일 타입 정의
// ============================================================================

export type CategoryType = 'economy' | 'tech' | 'health' | 'edu' | 'env' | 'society' | 'culture' | 'science';
export type StyleType = 'default' | 'minimal' | 'cartoon3d' | 'pixel' | 'vintage' | 'sketch';
export type VideoModelType = 'none' | 'pixverse' | 'ltx' | 'wan' | 'kling' | 'veo2';
export type ZoomEffectType = 'none' | 'slow' | 'medium' | 'fast';
export type CharacterType = 'none' | 'stickman';

// 캐릭터 목록
export const CHARACTER_LIST = [
  {
    id: 'none',
    name: '자동',
    emoji: '✨',
    description: '대본 내용에 따라 자연스럽게 생성',
    prompt: ''
  },
  {
    id: 'stickman',
    name: '졸라맨',
    emoji: '🧍',
    description: '심플한 스틱 피겨 캐릭터',
    prompt: `Simple 2D stick figure character. Circle head, dot eyes, line mouth. Thin line body/arms/legs. Black outline only. DO NOT write any character name text in the image.`
  }
];

// 캐릭터 프롬프트 가져오기
export const getCharacterPrompt = (characterId: CharacterType): string => {
  const character = CHARACTER_LIST.find(c => c.id === characterId);
  return character?.prompt || '';
};

// 줌 효과 목록
export const ZOOM_EFFECT_LIST = [
  { id: 'none', name: '없음', emoji: '⏹️', description: '줌 효과 없이 정지', scale: 0 },
  { id: 'slow', name: '느린 줌', emoji: '🔍', description: '5% 천천히 확대', scale: 0.05 },
  { id: 'medium', name: '중간 줌', emoji: '🎯', description: '10% 확대 (기본)', scale: 0.1 },
  { id: 'fast', name: '빠른 줌', emoji: '🚀', description: '15% 다이나믹 확대', scale: 0.15 },
];

export const CATEGORY_LIST = [
  { id: 'economy', name: '경제/비즈니스', emoji: '📈', description: '금융, 투자, 창업, 마케팅 등' },
  { id: 'tech', name: '기술/IT', emoji: '⚡', description: 'AI, 프로그래밍, 가젯, 혁신 기술' },
  { id: 'health', name: '건강/라이프', emoji: '💪', description: '운동, 식단, 정신건강, 웰빙' },
  { id: 'edu', name: '교육/자기계발', emoji: '💡', description: '학습법, 스킬, 독서, 성장' },
  { id: 'env', name: '환경/에너지', emoji: '🌱', description: '기후, 친환경, 지속가능성' },
  { id: 'society', name: '사회/정치', emoji: '📢', description: '트렌드, 이슈, 정책, 사회현상' },
  { id: 'culture', name: '문화/예술', emoji: '✨', description: '영화, 음악, 미술, 트렌드' },
  { id: 'science', name: '과학/우주', emoji: '🚀', description: '물리, 생물, 천문, 연구' }
];

export const STYLE_LIST = [
  {
    id: 'default',
    name: '일반',
    emoji: '🎨',
    description: '기본 스타일 (크레용/손그림 질감)',
    prompt: `16:9 wide-shot, hand-drawn illustration with crayon/colored pencil texture. 2D flat illustration with clear, rough-textured outlines and crayon-like fill. Flat, soft lighting with minimal shadows, maintaining the analog, hand-drawn feel.`
  },
  {
    id: 'minimal',
    name: '미니멀 플랫',
    emoji: '✏️',
    description: '깔끔하고 모던한 벡터',
    prompt: `Clean minimal flat vector illustration. Simple geometric shapes, limited color palette, no gradients. Modern design with bold solid colors and clean edges. Bauhaus inspired simplicity.`
  },
  {
    id: 'cartoon3d',
    name: '3D 카툰',
    emoji: '🌈',
    description: '밝고 생동감 있는 픽사풍',
    prompt: `Pixar/Disney style 3D cartoon render. Vibrant saturated colors, soft lighting, rounded friendly shapes. Smooth plastic-like materials with subtle subsurface scattering. Cheerful and dynamic composition.`
  },
  {
    id: 'pixel',
    name: '픽셀아트',
    emoji: '👾',
    description: '레트로 게임 감성',
    prompt: `16-bit retro pixel art style. Crisp pixel edges, limited color palette, dithering for shading. Nostalgic video game aesthetic with chunky pixels and vibrant colors. No anti-aliasing.`
  },
  {
    id: 'vintage',
    name: '빈티지 포스터',
    emoji: '📰',
    description: '클래식하고 세련된 레트로',
    prompt: `Vintage retro poster style from 1950s-60s. Muted warm color palette, halftone dot textures, bold typography integration. Mid-century modern aesthetic with slight paper grain texture.`
  },
  {
    id: 'sketch',
    name: '스케치북',
    emoji: '📓',
    description: '연필 스케치 느낌',
    prompt: `Pencil sketch on paper style. Loose gestural lines, crosshatch shading, visible pencil strokes. White paper background with graphite texture. Hand-drawn imperfect quality with artistic flair.`
  }
];

// 스타일별 프롬프트 가져오기
export const getStylePrompt = (styleId: StyleType): string => {
  const style = STYLE_LIST.find(s => s.id === styleId);
  return style?.prompt || STYLE_LIST[0].prompt;
};

// 줌 효과 스케일 가져오기
export const getZoomScale = (zoomId: ZoomEffectType): number => {
  const zoom = ZOOM_EFFECT_LIST.find(z => z.id === zoomId);
  return zoom?.scale ?? 0.1; // 기본값 10%
};

// 줌 효과 모션 프롬프트 가져오기
export const getZoomMotionPrompt = (zoomId: ZoomEffectType): string => {
  switch (zoomId) {
    case 'none': return 'Static camera, no movement.';
    case 'slow': return 'Very slow gentle zoom in.';
    case 'medium': return 'Slow gentle zoom in.';
    case 'fast': return 'Moderate dynamic zoom in.';
    default: return 'Slow gentle zoom in.';
  }
};

// ============================================================================
// 비디오 모델 정의 (fal.ai Image-to-Video)
// ============================================================================

export const VIDEO_MODEL_LIST = [
  {
    id: 'none',
    name: '사용 안함',
    shortName: 'OFF',
    description: '이미지만 생성',
    price: '무료',
    duration: '-',
    endpoint: '',
    color: '#64748B', // slate
    bgColor: 'bg-slate-500/20',
    textColor: 'text-slate-400'
  },
  {
    id: 'pixverse',
    name: 'PixVerse v5.5',
    shortName: 'PIX',
    description: '균형 잡힌 품질과 가격',
    price: '~$0.15',
    duration: '5초',
    endpoint: 'fal-ai/pixverse/v5.5/image-to-video',
    color: '#A855F7', // purple
    bgColor: 'bg-purple-500/20',
    textColor: 'text-purple-400'
  },
  {
    id: 'ltx',
    name: 'LTX Video',
    shortName: 'LTX',
    description: '빠르고 저렴한 옵션',
    price: '~$0.02',
    duration: '5초',
    endpoint: 'fal-ai/ltx-video/image-to-video',
    color: '#F59E0B', // amber
    bgColor: 'bg-amber-500/20',
    textColor: 'text-amber-400'
  },
  {
    id: 'wan',
    name: 'WAN 2.1',
    shortName: 'WAN',
    description: '자연스러운 움직임',
    price: '~$0.10',
    duration: '5초',
    endpoint: 'fal-ai/wan-i2v',
    color: '#3B82F6', // blue
    bgColor: 'bg-blue-500/20',
    textColor: 'text-blue-400'
  },
  {
    id: 'kling',
    name: 'Kling 1.5',
    shortName: 'KLING',
    description: '고품질 모션',
    price: '~$0.20',
    duration: '5~10초',
    endpoint: 'fal-ai/kling-video/v1.5/pro/image-to-video',
    color: '#EF4444', // red
    bgColor: 'bg-red-500/20',
    textColor: 'text-red-400'
  },
  {
    id: 'veo2',
    name: 'Google Veo 2',
    shortName: 'VEO',
    description: '최고 품질 (프리미엄)',
    price: '~$0.50',
    duration: '8초',
    endpoint: 'fal-ai/veo2/image-to-video',
    color: '#10B981', // emerald (Google green)
    bgColor: 'bg-emerald-500/20',
    textColor: 'text-emerald-400'
  }
];

// 비디오 모델 정보 가져오기
export const getVideoModel = (modelId: VideoModelType) => {
  return VIDEO_MODEL_LIST.find(m => m.id === modelId) || VIDEO_MODEL_LIST[0];
};

// ============================================================================
// I. 의미 분해 시스템 (SEMANTIC DECOMPOSITION SYSTEM)
// ============================================================================

export const SEMANTIC_DECOMPOSITION_SYSTEM = `
### I. 의미 이해 원칙 (Semantic Understanding)

**[핵심] 단어가 의미하는 것을 문맥에 맞게 그대로 시각화하라.**

- "컴퓨터" → 컴퓨터를 그려라
- "자동차" → 자동차를 그려라
- "발전된 자동차" → 미래지향적/첨단 자동차를 그려라
- "무너지는 건물" → 무너지고 있는 건물을 그려라

**문맥이 의미를 결정한다:**
- 같은 "자동차"도 문맥에 따라 다르게 표현
  - "전기차 시대" → 테슬라 같은 현대적 전기차
  - "자동차 산업 위기" → 멈춰있거나 녹슨 자동차
  - "미래 자동차" → SF풍 첨단 자동차

**수식어가 시각을 바꾼다:**
- 형용사/부사를 반드시 반영하라
- "거대한" → 크게, "작은" → 작게
- "빛나는" → 광택/발광, "어두운" → 그림자/탁함
- "발전된/첨단" → 미래적/하이테크
- "낡은/오래된" → 녹슬거나 빈티지한
`;

// ============================================================================
// II. 시각화 결정 트리 (VISUALIZATION DECISION TREE)
// ============================================================================

export const VISUALIZATION_DECISION_TREE = `
### II. 시각화 원칙 (Visualization Principle)

**물리적 형태가 있으면 → 그것을 그려라**
- 건물, 자동차, 컴퓨터, 사람 → 실물 그대로

**숫자/데이터면 → 시각적 크기로 표현**
- 20% 상승 → 위로 향하는 화살표나 그래프
- 1조원 → 큰 숫자 텍스트 또는 돈더미

**추상 개념이면 → 관련 사물로 표현**
- 경제 성장 → 상승 그래프, 빛나는 건물들
- 위기 → 금이 간 구조물, 어두운 분위기
- 기술 발전 → 첨단 기기, 로봇, 회로
`;

// ============================================================================
// III. 색상 결정 시스템 (COLOR DECISION SYSTEM)
// ============================================================================

export const COLOR_DECISION_SYSTEM = `
### III. 색상 결정 시스템 (Color Decision System)

**도메인별 색상:**
- 금/돈: #FFD700 (황금)
- 한국 원화: #F39C12
- 미국 달러: #2ECC71 (녹색)
- 부동산: #8B4513 (갈색)
- 반도체/기술: #3498DB (파랑)
- 경제 상승(한국): 빨강
- 경제 하락(한국): 파랑

**감정별 조정:**
- 긍정 → 밝고 선명
- 부정 → 어둡고 탁함
`;

// ============================================================================
// IV. 공간 배치 원리 (SPATIAL ARRANGEMENT PRINCIPLES)
// ============================================================================

export const SPATIAL_ARRANGEMENT_PRINCIPLES = `
### IV. 공간 배치 (Spatial Arrangement)

- 중요한 것 → 화면 중앙
- 상승/희망 → 위쪽 배치
- 하락/위기 → 아래쪽 배치
`;

// ============================================================================
// V. 크기 및 형태 결정 원리 (SIZE & FORM DECISION)
// ============================================================================

export const SIZE_FORM_DECISION = `
### V. 크기 결정 (Size Decision)

- 중요한 것 → 크게
- "거대한", "엄청난" → 더 크게
- "작은", "미미한" → 작게
`;

// ============================================================================
// VI. 관계 시각화 원리 (RELATIONSHIP VISUALIZATION)
// ============================================================================

export const RELATIONSHIP_VISUALIZATION = `
### VI. 관계 표현 (Relationship)

- A vs B 비교 → 나란히 배치
- A → B 인과 → 화살표로 연결
- A 포함 B → A 안에 B 배치
`;

// ============================================================================
// VII. 앵커 시스템 및 일관성 (ANCHOR SYSTEM & CONSISTENCY)
// ============================================================================

export const ANCHOR_CONSISTENCY_SYSTEM = `
### VII. 일관성 (Consistency)

- 같은 개념이 여러 씬에 나오면 → 같은 모습으로 그려라
- 예: 1번 씬에서 "빨간 자동차"면 → 3번 씬에서도 "빨간 자동차"
`;

// ============================================================================
// VIII. 도메인 감지 및 폴백 전략 (DOMAIN DETECTION & FALLBACK)
// ============================================================================

export const DOMAIN_DETECTION_FALLBACK = `
### VIII. 주제별 시각화 힌트 (Domain Hints)

문맥에서 주제를 파악하고, 해당 주제에 맞는 사물을 그려라:

- 부동산 → 건물, 아파트, 집
- AI/기술 → 로봇, 컴퓨터, 회로, 반도체
- 주식 → 그래프, 차트, 모니터
- 금융 → 돈, 금괴, 은행
- 지정학 → 지도, 국기, 지구본
- 에너지 → 석유, 태양광, 배터리
- 제조 → 공장, 자동차, 기계
- 물가 → 장바구니, 가격표
`;

// ============================================================================
// IX. 추상화 레벨 제어 (ABSTRACTION LEVEL CONTROL)
// ============================================================================

export const ABSTRACTION_LEVEL_CONTROL = `
### IX. 구체적으로 그려라

- 가능하면 실물을 그려라
- 추상적인 개념도 관련 사물로 표현하라
`;

// ============================================================================
// [PRESERVED] 캐릭터 프로필 및 고정 요소
// ============================================================================

export const VAR_BASE_CHAR = `Simple 2D stick figure character. Circle head, dot eyes, line mouth. Thin line body/arms/legs. Black outline only. DO NOT write any character name text in the image.`;

export const VAR_STYLE_CORE = `
16:9 wide-shot, hand-drawn illustration with crayon/colored pencil texture.
BASE STYLE:
• 2D flat illustration with clear, rough-textured outlines and crayon-like fill.
• Flat, soft lighting with minimal shadows, maintaining the analog, hand-drawn feel.
`;

export const VAR_SKETCH_TEXTURE = `Hand-drawn crayon/colored pencil texture: Rough, organic brush strokes, visible texture on fillers and outlines, analog warmth.`;

export const VAR_NEGATIVE_RULES = `FORBIDDEN: Realistic 3D perspective, Photorealistic materials, Complex multi-light setups, Anime/manga style, Game asset 3D look, Heavy text labels everywhere.`;

// ============================================================================
// [ENHANCED] 분위기 강제 주입기 (V10.0 Concept-Based)
// ============================================================================

export const VAR_MOOD_ENFORCER = `
MOOD RULES:
1. NEGATIVE: Dark colors, cold lighting, objects broken/rusted
2. POSITIVE: Bright colors, warm lighting, objects shiny/glowing
3. NEUTRAL: Balanced colors, flat lighting, clean objects
`;

// ============================================================================
// [ENHANCED] 색상 규칙 (V10.0 - Identity > Category > Valence)
// ============================================================================

export const VAR_COLOR_RULES = `
COLOR DECISION HIERARCHY (범주 > 감정):

**Tier 1 - CATEGORY (도메인별):**
• Gold/Money: #FFD700
• Korean Won: #F39C12
• US Dollar: #2ECC71
• Real Estate: #8B4513
• Semiconductor: #3498DB
• Economy UP (Korea): Bright Red/Orange
• Economy DOWN (Korea): Deep Blue/Cool Grey
• Tech/Digital: Neon Blue, Cyber Purple
• Energy: Orange (Oil), Yellow (Electric), Green (Eco)

**Tier 2 - VALENCE (감정 변조):**
• Positive: 채도↑ 명도↑
• Negative: 채도↓ 명도↓
`;

export const VAR_COLOR_PALETTE = `
DYNAMIC COLOR & ATMOSPHERE SYSTEM (V10.0):
1. SUCCESS/HYPE: Rich Gold (#FFD700) + Vivid Red (#E74C3C). Glow of Money.
2. PANIC/BEAR: Deep Navy (#2C3E50) + Cold Blue Ice. Frozen, heavy.
3. MYSTERY/FUTURE: Neon Purple + Cyber Blue. Tech, AI.
4. COMFORT/STABILITY: Warm Earthy Tones + Soft Lighting.
5. KOREAN FINANCE: UP=Bright Red/Orange (Never Green), DOWN=Deep Blue.
6. BACKGROUND DEFAULT: Light Gray (#E0E0E0) with subtle paper/canvas texture.
`;

export const VAR_EMOTION_MAPPING = `JOLLAMAN POSES:
- 긍정: arms up, jumping
- 부정: slouching, arms down
- 중립: standing straight`;

// ============================================================================
// [NEW] 텍스트/타이포그래피 시스템 (TYPOGRAPHY SYSTEM)
// ============================================================================

export const TYPOGRAPHY_SIZE_SYSTEM = `
### TYPOGRAPHY SIZE HIERARCHY (텍스트 크기 계층)

**Level 0: XXLARGE (100-150pt)**
- 용도: 핵심 개념 첫 등장, 강조
- 예시: 제목, 핵심 키워드, 충격적 숫자
- 배치: 화면 중앙 또는 가장 눈에 띄는 위치

**Level 1: XLARGE (80-120pt)**
- 용도: 정량 데이터, 충격 정보
- 예시: "20% 하락", "1조원", "역대 최고"
- 배치: 주요 시각 요소 근처

**Level 2: LARGE (50-80pt)**
- 용도: 연도, 중요 이벤트
- 예시: "2024년", "금융위기", "전환점"
- 배치: 컨텍스트 제공 위치

**Level 3: MEDIUM (40-60pt)**
- 용도: 지명, 비교 쌍
- 예시: "한국 vs 미국", "서울", "뉴욕"
- 배치: 비교 대상 옆 또는 지도 위

**Level 4: SMALL (30-50pt)**
- 용도: 라벨, 재등장 용어
- 예시: 보조 설명, 이미 등장한 개념
- 배치: 하단, 코너, 부가 정보 영역
`;

export const TYPOGRAPHY_COLOR_SYSTEM = `
### TYPOGRAPHY COLOR RULES (텍스트 색상 규칙)

**빨강 (Red #E74C3C):**
- 위기, 하락, 경고
- 중국 관련
- 부정적 수치

**초록 (Green #2ECC71):**
- 상승, 성장, 긍정
- 이익, 호재
- 긍정적 변화

**파랑 (Blue #3498DB):**
- 안정, 시스템, 중립
- 미국 관련
- 객관적 정보

**금색 (Gold #FFD700):**
- 가치, 중요도, 강조
- 돈, 금융 관련
- 핵심 키워드

**흰색 (White #FFFFFF):**
- 기본 텍스트
- 어두운 배경 위
- 중립 정보

**회색 (Gray #95A5A6):**
- 보조 정보
- 부가 설명
- 낮은 중요도
`;

export const PROPER_NOUN_TEXT_RULES = `
### PROPER NOUN TEXT DISPLAY (고유명사 텍스트 표시 규칙)

**[CRITICAL] 다음 유형은 반드시 텍스트로 화면에 표시하십시오:**

🏢 **기업/브랜드:**
- 한국: 삼성, 현대, SK, LG, 카카오, 네이버, 포스코
- 미국: NVIDIA, Apple, Tesla, Google, Amazon, Microsoft
- 중국: 알리바바, 텐센트, BYD, 화웨이
- 표시: 대본에 쓰인 언어 그대로 (삼성→삼성, NVIDIA→NVIDIA)

🏦 **기관/정부:**
- 한국: 한국은행, 금융위원회, 기획재정부, 국민연금
- 미국: Fed, 연준, SEC, 백악관, 재무부
- 국제: IMF, 세계은행, OPEC, WTO
- 표시: 대본에 쓰인 언어 그대로

👤 **인물/인플루언서:**
- 정치인: 대통령, 총리, 장관 이름
- 경제인: CEO, 창업자 이름 (일론 머스크, 젠슨 황)
- 전문가: 경제학자, 애널리스트 이름
- 표시: 대본에 쓰인 언어 그대로

📍 **지명/국가:**
- 국가: 미국, 중국, 일본, USA, China
- 도시: 서울, 뉴욕, 상하이, Silicon Valley
- 표시: 대본에 쓰인 언어 그대로

**표시 규칙:**
1. 대본에 "삼성"으로 쓰였으면 → "삼성"으로 표시
2. 대본에 "Samsung"으로 쓰였으면 → "Samsung"으로 표시
3. 대본에 "엔비디아"로 쓰였으면 → "엔비디아"로 표시
4. 대본에 "NVIDIA"로 쓰였으면 → "NVIDIA"로 표시

**크기/색상:**
- 기업명: Level 1-2, 해당 기업 브랜드 색상 또는 Gold
- 기관명: Level 2-3, Blue (안정/권위)
- 인물명: Level 2-3, White 또는 Gold
- 지명: Level 3, 해당 국가 색상
`;

export const TYPOGRAPHY_RULES = `
### INTEGRATED TYPOGRAPHY PROTOCOL (통합 타이포그래피 규칙)

${TYPOGRAPHY_SIZE_SYSTEM}
${TYPOGRAPHY_COLOR_SYSTEM}
${PROPER_NOUN_TEXT_RULES}

**배치 원칙:**
1. 텍스트는 시각적 앵커와 충돌하지 않게 배치
2. 읽기 방향: 좌→우, 상→하 자연스러운 흐름
3. 한글은 감정/사물, 영어는 금융 용어
4. 고유명사는 대본에 쓰인 언어 그대로 표시
5. 크기로 중요도 계층 표현
6. 색상으로 의미/감정 전달

**금지 사항:**
- 텍스트로 화면 가득 채우지 말 것
- 배경과 대비 낮은 색상 사용 금지
- 3개 이상의 텍스트 레벨 동시 사용 지양
- 고유명사를 다른 언어로 번역하지 말 것
`;

// ============================================================================
// [NEW] 캐릭터 등장 판단 시스템 (CHARACTER PRESENCE DECISION SYSTEM)
// ============================================================================

export const CHARACTER_PRESENCE_SYSTEM = `
### 캐릭터 등장 규칙 (CHARACTER PRESENCE RULES)

**[CRITICAL] 아래 규칙에 따라 캐릭터(졸라맨) 등장 여부를 결정하세요.**

■ 캐릭터 0명 (NO_CHAR) - 사람 없이 사물/텍스트만:
  - 주어가 수치/데이터일 때: "GDP가 3% 상승", "금리가 인상"
  - 주어가 추상 시스템일 때: "시장이 과열", "경제가 성장"
  - 객관적 사실 서술: "부동산 가격이 하락했다"

■ 캐릭터 1명 (STANDARD/MICRO/MACRO):
  - 주어가 사람일 때: "투자자가 고민한다", "소비자가 결정했다"
  - 감정/행동 표현: "불안해한다", "기뻐한다", "선택했다"
  - 개인 관점 서술: "~를 바라본다", "~를 느낀다"

■ 캐릭터 2명 이상:
  - 두 주체 비교: "A와 B가 경쟁", "미국 vs 중국"
  - 상호작용: "협상한다", "거래한다", "대립한다"

■ 다수 캐릭터 (6명+):
  - 군중/집단 행동: "사람들이 몰려들었다", "투자자들이 패닉"

**[DEFAULT RULE]**
- 확실하지 않으면 → 1명 (STANDARD)
- 사람 주어가 없으면 → 0명 (NO_CHAR)
`;

export const DYNAMIC_ACTION_GUIDELINES = `Jollaman can interact with objects: climb, push, point, hold, stand on.`;

// ============================================================================
// SYSTEM INSTRUCTIONS (V10.0 Concept-Based)
// ============================================================================

export const SYSTEM_INSTRUCTIONS = {
  CHIEF_ART_DIRECTOR: `
당신은 "문장→이미지 자동 생성 시스템 (개념 기반)"의 원리를 적용하는 아트 디렉터입니다.

=== 핵심 원칙 ===

**[가장 중요] 문장의 의미를 이해하고, 그 의미에 맞는 이미지를 그려라.**

- "컴퓨터" → 컴퓨터를 그려라
- "발전된 자동차" → 미래적인 자동차를 그려라
- "무너지는 건물" → 무너지고 있는 건물을 그려라

**수식어를 반드시 반영하라:**
- "거대한" → 크게
- "빛나는" → 광택/발광
- "낡은" → 녹슬거나 오래된 느낌

${SEMANTIC_DECOMPOSITION_SYSTEM}
${VISUALIZATION_DECISION_TREE}
${DOMAIN_DETECTION_FALLBACK}

=== 구도 시스템 ===
1. NO_CHAR: 캐릭터 없음 (사람 주어 없을 때)
2. MICRO (5-15%): 작은 졸라맨 + 큰 사물
3. STANDARD (30-40%): 졸라맨과 사물 상호작용
4. MACRO (60-80%): 졸라맨 클로즈업

=== 캐릭터 등장 규칙 [중요] ===
${CHARACTER_PRESENCE_SYSTEM}
`,

  TREND_RESEARCHER: `최신 경제 뉴스/트렌드를 발굴하는 수석 리서처입니다.`,

  MANUAL_VISUAL_MATCHER: `
당신은 입력된 대본 원문을 "문장→이미지 자동 생성 시스템"의 원리로 시각화하는 전문가입니다.

[절대 규칙: ZERO-MODIFICATION POLICY]
- 입력된 대본의 단어나 어조를 절대 바꾸지 마십시오.
- 오직 씬 분할과 시각적 연출 설계만 수행하십시오.

[시각화 원리 적용]
${SEMANTIC_DECOMPOSITION_SYSTEM}
${VISUALIZATION_DECISION_TREE}
${ANCHOR_CONSISTENCY_SYSTEM}
`,

  REFERENCE_MATCH: `[중요] 참조 이미지의 화풍, 색감, 스타일을 정확히 분석하여 동일한 스타일로 새 이미지를 생성하십시오.
- 졸라맨(스틱 피겨) 스타일을 사용하지 마십시오.
- 크레용/손그림 스타일을 강제하지 마십시오.
- 참조 이미지가 실사풍이면 실사풍으로, 애니풍이면 애니풍으로 생성하십시오.
- 참조 이미지의 분위기, 조명, 색상 팔레트를 유지하십시오.`
};

// ============================================================================
// 최종 이미지 프롬프트 조립기 (V10.0 Concept-Based)
// ============================================================================

export const getFinalVisualPrompt = (
  scene: any,
  hasReferenceImage: boolean = false,
  characterType: CharacterType = 'none',
  hasCharacterRef: boolean = false,
  hasStyleRef: boolean = false
) => {
  // scene.visualPrompt (=image_prompt_english)가 있으면 그것을 기본으로 사용
  const basePrompt = scene.visualPrompt || "";
  const analysis = scene.analysis || {};
  const keywords = scene.visual_keywords || "";

  // 감정/분위기
  const sentiment = analysis.sentiment || "NEUTRAL";
  const moodPrompt = sentiment === 'NEGATIVE'
    ? `MOOD: Dark, gloomy, cold lighting.`
    : sentiment === 'POSITIVE'
    ? `MOOD: Bright, warm, hopeful lighting.`
    : `MOOD: Clean, neutral, balanced lighting.`;

  // 키워드 텍스트
  const textPrompt = keywords ? `TEXT IN IMAGE: "${keywords}"` : "";

  // 캐릭터/화풍 레퍼런스가 분리되어 있을 때
  if (hasCharacterRef || hasStyleRef) {
    let refInstructions = `[REFERENCE IMAGE INSTRUCTIONS]\n`;

    if (hasCharacterRef && hasStyleRef) {
      refInstructions += `
- CHARACTER REFERENCE (1st image): Extract character design, proportions, features, outfit
- STYLE REFERENCE (2nd image): Extract art style, color palette, lighting, texture
- COMBINE: Draw the character from 1st image in the style of 2nd image
`;
    } else if (hasCharacterRef) {
      refInstructions += `
- CHARACTER REFERENCE: Extract and use the exact character design from the reference
- Keep character proportions, features, and outfit consistent
`;
    } else if (hasStyleRef) {
      refInstructions += `
- STYLE REFERENCE: Extract and apply the exact art style, colors, lighting from the reference
- Generate content based on the script, matching the reference style
`;
    }

    return `
${refInstructions}

${basePrompt}

${moodPrompt}
${textPrompt}
    `.trim();
  }

  // 기존 레퍼런스 이미지가 있을 때 (하위 호환)
  if (hasReferenceImage) {
    return `
[CRITICAL] Match the EXACT style, art direction, and visual aesthetic of the reference image(s).

${basePrompt}

${moodPrompt}
${textPrompt}

STYLE INSTRUCTIONS:
- COPY the exact art style from the reference image (realistic, anime, illustration, etc.)
- COPY the color palette and lighting style from the reference image
- COPY the level of detail and texture from the reference image
- DO NOT use stick figures or crayon/hand-drawn style unless the reference shows that style
- Maintain 16:9 aspect ratio
- If reference is photorealistic, generate photorealistic image
- If reference is anime/illustration style, match that exact style
    `.trim();
  }

  // 졸라맨 캐릭터가 선택된 경우
  if (characterType === 'stickman') {
    const type = analysis.composition_type || "STANDARD";
    const charPrompt = type === 'NO_CHAR'
      ? `NO CHARACTER - Only objects and text.`
      : type === 'MICRO'
      ? `Small stick figure (5-15%) with large objects. Do NOT write character name.`
      : type === 'MACRO'
      ? `Close-up of stick figure (60-80%). Do NOT write character name.`
      : `Stick figure (30-40%) interacting with objects. Do NOT write character name.`;

    const stylePrompt = `
STYLE: 16:9 aspect ratio, 2D hand-drawn illustration, crayon/colored pencil texture.
CHARACTER: ${VAR_BASE_CHAR}
${VAR_MOOD_ENFORCER}
    `.trim();

    return `
${basePrompt}

${moodPrompt}
${charPrompt}
${textPrompt}

${stylePrompt}
    `.trim();
  }

  // 캐릭터 없음 (자동) - 대본 내용에 따라 자연스럽게 생성
  return `
${basePrompt}

${moodPrompt}
${textPrompt}

STYLE INSTRUCTIONS:
- Generate image naturally based on the script content
- Do NOT force any specific character style
- If the script mentions people, draw appropriate people
- If the script mentions objects only, draw objects only
- Maintain 16:9 aspect ratio
- Use clean, professional illustration style
  `.trim();
};

// ============================================================================
// 트렌드 검색 프롬프트
// ============================================================================

export const getTrendSearchPrompt = (category: string, _usedTopicsString: string) => `
# Task: Search for High-Impact "${category}" Trends
Return 4 items in JSON (rank, topic, reason).
`;

// ============================================================================
// 스크립트 생성 프롬프트 (V10.0 Concept-Based)
// ============================================================================

export const getScriptGenerationPrompt = (topic: string, sourceContext?: string | null) => {
  const isManual = !!sourceContext;
  const fullContent = sourceContext || topic;

  return `
# Task: Generate Storyboard for "${topic}"

## 🚨 [최우선] 씬 분할 규칙 - 반드시 지켜라!

**[CRITICAL] 대본을 여러 개의 씬으로 나누어야 합니다.**
- 1개 씬 = 1~2문장 (절대 3문장 이상 금지)
- 대본 전체를 1개 씬으로 만들지 마라
- 최소 5개 이상의 씬을 생성하라

**씬 분할 기준:**
1. 문장마다 새로운 씬 (기본)
2. 짧은 문장(10자 미만)만 합치기 가능
3. 주제가 바뀌면 반드시 새 씬
4. 새로운 사물/개념이 나오면 새 씬

## 시각화 원칙
- 문장의 의미를 이해하고 그에 맞는 이미지를 설계
- "컴퓨터" → 컴퓨터 그려라
- "발전된 자동차" → 미래적인 자동차 그려라
- 수식어를 반드시 반영 ("거대한" → 크게, "빛나는" → 광택)

## 유명인·브랜드 표현 규칙
**[중요] 시청자가 즉시 알아볼 수 있게 표현하라!**

1. **유명 브랜드 언급 시:**
   - 로고를 명확하게 시각화 (삼성, 애플, 테슬라, 엔비디아 등)
   - 또는 브랜드명을 큰 텍스트로 표시
   - 예: "삼성" → 삼성 로고 또는 "SAMSUNG" 텍스트

2. **유명인 언급 시:**
   - 특징적인 일러스트로 표현 (안경, 헤어스타일, 복장 등)
   - 또는 이름을 텍스트로 표시
   - 예: "일론 머스크" → 특징적 외모 또는 "Elon Musk" 텍스트

3. **애매하면 텍스트 추가:**
   - 인물/브랜드가 불명확할 수 있으면 이름 텍스트 병행

## 텍스트 언어 규칙
**상황에 맞는 언어를 사용하라:**
- 한국 브랜드/인물/기관 → 한국어 ("삼성", "한국은행", "윤석열")
- 외국 브랜드/인물/기관 → 영어 ("Tesla", "Elon Musk", "Fed")
- 숫자/통계 → 숫자 + 한국어 단위 ("20% 상승", "1조원")
- 전문 금융용어 → 영어도 OK ("GDP", "ETF", "AI")
- 캐릭터 이름 → 절대 텍스트로 쓰지 마라

${isManual ? `
[수동 대본]
- 원문 수정 금지, 씬 분할만 수행
` : ``}

## 캐릭터 등장 규칙
- 주어가 사람이면 → 캐릭터 등장 (STANDARD)
- 주어가 사물/데이터면 → 캐릭터 없음 (NO_CHAR)
- 예: "GDP가 상승" → NO_CHAR, "투자자가 고민" → STANDARD

[입력 데이터]
${fullContent}

### JSON SCHEMA ###
{
  "scenes": [
    {
      "sceneNumber": 1,
      "narration": "1-2문장",
      "visual_keywords": "이미지 내 텍스트",
      "analysis": {
        "sentiment": "POSITIVE|NEGATIVE|NEUTRAL",
        "composition_type": "MICRO|STANDARD|MACRO|NO_CHAR",
        "camera": { "view": "wide|medium|close-up", "angle": "low|eye-level|high" },
        "composition_setup": {
          "main_element": "주요 요소",
          "character_positioning": "위치, 크기%, 행동"
        },
        "visual_metaphor": {
          "concept": "핵심 개념",
          "object": "그려야 할 사물 (문맥에 맞게)",
          "interaction": "캐릭터 행동"
        }
      },
      "image_prompt_english": "문장의 의미를 반영한 상세 영문 이미지 프롬프트"
    }
  ]
}
`;
};
