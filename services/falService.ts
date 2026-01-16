
/**
 * fal.ai Image-to-Video API 서비스
 * 다양한 모델 지원: PixVerse, LTX, WAN, Kling, Veo2
 */

import { CONFIG } from '../config';
import { VIDEO_MODEL_LIST, VideoModelType, getVideoModel } from './prompts';

interface VideoResponse {
  video: {
    url: string;
  };
  seed?: number;
}

/**
 * 로컬 스토리지에서 FAL API 키 가져오기
 */
export function getFalApiKey(): string | null {
  return localStorage.getItem(CONFIG.STORAGE_KEYS.FAL_API_KEY);
}

/**
 * FAL API 키 저장
 */
export function setFalApiKey(key: string): void {
  localStorage.setItem(CONFIG.STORAGE_KEYS.FAL_API_KEY, key);
}

/**
 * 로컬 스토리지에서 선택된 비디오 모델 가져오기
 */
export function getFalVideoModel(): VideoModelType {
  return (localStorage.getItem(CONFIG.STORAGE_KEYS.FAL_VIDEO_MODEL) as VideoModelType) || 'pixverse';
}

/**
 * 비디오 모델 저장
 */
export function setFalVideoModel(modelId: VideoModelType): void {
  localStorage.setItem(CONFIG.STORAGE_KEYS.FAL_VIDEO_MODEL, modelId);
}

/**
 * base64 이미지를 URL로 변환 (fal.ai는 URL 필요)
 * 임시로 data URL 사용 - fal.ai가 지원하는지 확인 필요
 */
function base64ToDataUrl(base64: string, mimeType: string = 'image/png'): string {
  return `data:${mimeType};base64,${base64}`;
}

/**
 * 모델별 요청 바디 생성
 */
function buildRequestBody(modelId: VideoModelType, imageUrl: string, motionPrompt: string) {
  const baseBody = {
    prompt: motionPrompt,
    image_url: imageUrl,
    negative_prompt: 'blurry, low quality, low resolution, pixelated, noisy, grainy, distorted, static'
  };

  switch (modelId) {
    case 'pixverse':
      return {
        ...baseBody,
        duration: 5,
        aspect_ratio: '16:9',
        resolution: '720p'
      };
    case 'ltx':
      return {
        ...baseBody,
        num_inference_steps: 30
      };
    case 'wan':
      return {
        ...baseBody,
        resolution: '720p',
        enable_safety_checker: false
      };
    case 'kling':
      return {
        ...baseBody,
        duration: '5',
        aspect_ratio: '16:9'
      };
    case 'veo2':
      return {
        ...baseBody,
        duration: '8s',
        aspect_ratio: '16:9'
      };
    default:
      return baseBody;
  }
}

/**
 * 이미지를 영상으로 변환 (선택된 모델 사용)
 *
 * @param imageBase64 - base64 인코딩된 이미지
 * @param motionPrompt - 움직임을 설명하는 프롬프트
 * @param apiKey - FAL API 키 (선택, 없으면 로컬스토리지에서 가져옴)
 * @param modelId - 비디오 모델 ID (선택, 없으면 로컬스토리지에서 가져옴)
 * @returns 생성된 영상 URL 또는 null
 */
export async function generateVideoFromImage(
  imageBase64: string,
  motionPrompt: string,
  apiKey?: string,
  modelId?: VideoModelType
): Promise<string | null> {
  const key = apiKey || getFalApiKey();
  const selectedModel = modelId || getFalVideoModel();
  const modelInfo = getVideoModel(selectedModel);

  if (!key) {
    console.warn('[FAL] API 키가 설정되지 않았습니다.');
    return null;
  }

  try {
    // base64를 Blob으로 변환 후 fal.ai에 업로드
    const imageUrl = await uploadImageToFal(imageBase64, key);

    if (!imageUrl) {
      console.error('[FAL] 이미지 업로드 실패');
      return null;
    }

    console.log(`[FAL] ${modelInfo.name} 영상 생성 시작: "${motionPrompt.slice(0, 50)}..."`);

    const requestBody = buildRequestBody(selectedModel, imageUrl, motionPrompt);
    const endpoint = `https://fal.run/${modelInfo.endpoint}`;

    console.log('[FAL] 사용 모델:', modelInfo.name);
    console.log('[FAL] 엔드포인트:', endpoint);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    console.log('[FAL] 응답 상태:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[FAL] API 오류 (${response.status}):`, errorText);
      throw new Error(`FAL API 오류: ${response.status} - ${errorText.slice(0, 200)}`);
    }

    const result: VideoResponse = await response.json();
    console.log(`[FAL] 영상 생성 완료: ${result.video.url}`);

    return result.video.url;

  } catch (error: any) {
    console.error('[FAL] 영상 생성 실패:', error.message);
    return null;
  }
}

/**
 * base64 이미지를 fal.ai 스토리지에 업로드
 */
async function uploadImageToFal(imageBase64: string, apiKey: string): Promise<string | null> {
  try {
    // base64를 Blob으로 변환
    const binaryString = atob(imageBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'image/png' });

    // fal.ai 파일 업로드 엔드포인트
    const formData = new FormData();
    formData.append('file', blob, 'image.png');

    const uploadResponse = await fetch('https://fal.run/fal-ai/storage/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${apiKey}`
      },
      body: formData
    });

    if (!uploadResponse.ok) {
      // 업로드 실패 시 data URL 폴백 시도
      console.warn('[FAL] 파일 업로드 실패, data URL 사용 시도');
      return base64ToDataUrl(imageBase64);
    }

    const uploadResult = await uploadResponse.json();
    return uploadResult.url;

  } catch (error) {
    console.warn('[FAL] 이미지 업로드 실패, data URL 사용');
    return base64ToDataUrl(imageBase64);
  }
}

/**
 * 영상 URL에서 base64 데이터로 변환 (로컬 저장용)
 */
export async function fetchVideoAsBase64(videoUrl: string): Promise<string | null> {
  try {
    const response = await fetch(videoUrl);
    if (!response.ok) return null;

    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * 여러 이미지를 순차적으로 영상 변환 (rate limit 고려)
 */
export async function batchGenerateVideos(
  assets: Array<{ imageData: string; visualPrompt: string }>,
  apiKey?: string,
  onProgress?: (index: number, total: number) => void
): Promise<(string | null)[]> {
  const results: (string | null)[] = [];
  const key = apiKey || getFalApiKey();

  for (let i = 0; i < assets.length; i++) {
    onProgress?.(i + 1, assets.length);

    const videoUrl = await generateVideoFromImage(
      assets[i].imageData,
      assets[i].visualPrompt,
      key
    );
    results.push(videoUrl);

    // API rate limit 방지 (1초 대기)
    if (i < assets.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return results;
}
