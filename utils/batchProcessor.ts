/**
 * 배치 병렬 처리 유틸리티
 * - Promise.allSettled 기반으로 안전한 에러 핸들링
 * - 진행률 콜백 지원으로 UI 업데이트 가능
 * - 배치 간 딜레이로 API rate limit 방지
 */

// 배치 처리 설정 타입
export interface BatchProcessOptions<T, R> {
  // 처리할 아이템 배열
  items: T[];
  // 한 번에 처리할 배치 크기
  batchSize: number;
  // 배치 간 딜레이 (ms) - API rate limit 방지
  delayBetweenBatches: number;
  // 각 아이템을 처리하는 함수 (index도 함께 전달)
  processFn: (item: T, index: number) => Promise<R>;
  // 진행률 콜백 (옵션)
  onProgress?: (completed: number, total: number) => void;
  // 중단 체크 함수 (옵션) - true 반환 시 중단
  shouldAbort?: () => boolean;
}

// 배치 처리 결과 타입
export interface BatchResult<R> {
  // 성공한 결과들
  successes: { index: number; value: R }[];
  // 실패한 결과들
  failures: { index: number; error: Error }[];
  // 중단 여부
  aborted: boolean;
}

/**
 * 배치 병렬 처리 함수
 *
 * 예시 사용법:
 * ```typescript
 * await processBatch({
 *   items: scenes,
 *   batchSize: 3,
 *   delayBetweenBatches: 1000,
 *   processFn: async (scene, index) => {
 *     const audio = await generateAudio(scene);
 *     updateAssetAt(index, { audioData: audio });
 *   },
 *   onProgress: (done, total) => {
 *     setProgress(`${done}/${total} 완료`);
 *   },
 *   shouldAbort: () => isAbortedRef.current
 * });
 * ```
 */
export async function processBatch<T, R>(
  options: BatchProcessOptions<T, R>
): Promise<BatchResult<R>> {
  const {
    items,
    batchSize,
    delayBetweenBatches,
    processFn,
    onProgress,
    shouldAbort
  } = options;

  const result: BatchResult<R> = {
    successes: [],
    failures: [],
    aborted: false
  };

  // 빈 배열 체크
  if (items.length === 0) {
    return result;
  }

  let completedCount = 0;
  const totalCount = items.length;

  // 배치 단위로 처리
  for (let batchStart = 0; batchStart < totalCount; batchStart += batchSize) {
    // 중단 체크
    if (shouldAbort?.()) {
      result.aborted = true;
      break;
    }

    // 현재 배치의 아이템들
    const batchEnd = Math.min(batchStart + batchSize, totalCount);
    const batchItems = items.slice(batchStart, batchEnd);
    const batchIndices = Array.from(
      { length: batchEnd - batchStart },
      (_, i) => batchStart + i
    );

    // 배치 내 아이템들을 병렬로 처리
    const batchPromises = batchItems.map((item, localIndex) => {
      const globalIndex = batchIndices[localIndex];
      return processFn(item, globalIndex)
        .then(value => ({ status: 'fulfilled' as const, value, index: globalIndex }))
        .catch(error => ({ status: 'rejected' as const, error, index: globalIndex }));
    });

    // 배치 완료 대기
    const batchResults = await Promise.all(batchPromises);

    // 결과 분류
    for (const batchResult of batchResults) {
      if (batchResult.status === 'fulfilled') {
        result.successes.push({
          index: batchResult.index,
          value: batchResult.value
        });
      } else {
        result.failures.push({
          index: batchResult.index,
          error: batchResult.error instanceof Error
            ? batchResult.error
            : new Error(String(batchResult.error))
        });
      }
      completedCount++;
    }

    // 진행률 콜백 호출
    onProgress?.(completedCount, totalCount);

    // 다음 배치 전 딜레이 (마지막 배치가 아닌 경우만)
    if (batchEnd < totalCount && delayBetweenBatches > 0) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
  }

  return result;
}

/**
 * 간단한 버전: 인덱스 기반 배치 처리
 * 인덱스만 전달하고 실제 데이터는 processFn 내부에서 참조
 *
 * 예시:
 * ```typescript
 * await processIndexBatch({
 *   count: scenes.length,
 *   batchSize: 2,
 *   delay: 2000,
 *   processFn: async (index) => {
 *     const img = await generateImage(assetsRef.current[index]);
 *     updateAssetAt(index, { imageData: img });
 *   }
 * });
 * ```
 */
export async function processIndexBatch(options: {
  count: number;
  batchSize: number;
  delay: number;
  processFn: (index: number) => Promise<void>;
  onProgress?: (completed: number, total: number) => void;
  shouldAbort?: () => boolean;
}): Promise<{ completed: number; aborted: boolean }> {
  const indices = Array.from({ length: options.count }, (_, i) => i);

  const result = await processBatch({
    items: indices,
    batchSize: options.batchSize,
    delayBetweenBatches: options.delay,
    processFn: async (index) => {
      await options.processFn(index);
    },
    onProgress: options.onProgress,
    shouldAbort: options.shouldAbort
  });

  return {
    completed: result.successes.length,
    aborted: result.aborted
  };
}

// 재시도 설정 타입
export interface RetryConfig {
  // 최대 재시도 횟수 (기본: 2)
  maxRetries: number;
  // 재시도 간 딜레이 (기본: 3000ms)
  retryDelay: number;
  // 재시도 가능한 에러인지 판단하는 함수 (옵션)
  shouldRetry?: (error: Error) => boolean;
}

// 재시도 결과 타입
export interface BatchResultWithRetry<R> extends BatchResult<R> {
  // 재시도된 항목 인덱스들
  retriedItems: number[];
  // 재시도 후에도 실패한 항목들
  finalFailures: { index: number; error: Error; attempts: number }[];
}

/**
 * 재시도 메커니즘이 포함된 배치 처리 함수
 * - 1차 처리 후 실패 항목 수집
 * - 실패 항목 재시도 (maxRetries까지)
 * - 각 재시도 간 딜레이 적용
 *
 * 예시:
 * ```typescript
 * const result = await processBatchWithRetry({
 *   items: scenes,
 *   batchSize: 2,
 *   delayBetweenBatches: 2000,
 *   processFn: async (scene, index) => {
 *     return await generateImage(scene);
 *   },
 *   retryConfig: {
 *     maxRetries: 2,
 *     retryDelay: 3000,
 *     shouldRetry: (error) => !error.message.includes('API key')
 *   }
 * });
 * console.log(`재시도된 항목: ${result.retriedItems.join(', ')}`);
 * ```
 */
export async function processBatchWithRetry<T, R>(
  options: BatchProcessOptions<T, R> & {
    retryConfig?: Partial<RetryConfig>;
  }
): Promise<BatchResultWithRetry<R>> {
  const {
    items,
    batchSize,
    delayBetweenBatches,
    processFn,
    onProgress,
    shouldAbort,
    retryConfig
  } = options;

  // 기본 재시도 설정
  const finalRetryConfig: RetryConfig = {
    maxRetries: retryConfig?.maxRetries ?? 2,
    retryDelay: retryConfig?.retryDelay ?? 3000,
    shouldRetry: retryConfig?.shouldRetry ?? (() => true)
  };

  // 결과 초기화
  const result: BatchResultWithRetry<R> = {
    successes: [],
    failures: [],
    aborted: false,
    retriedItems: [],
    finalFailures: []
  };

  // 빈 배열 체크
  if (items.length === 0) {
    return result;
  }

  // 각 아이템의 시도 횟수 추적
  const attemptCounts = new Map<number, number>();

  // 1차 배치 처리
  console.log(`[Batch Retry] 1차 처리 시작: ${items.length}개 아이템`);
  const firstPassResult = await processBatch({
    items,
    batchSize,
    delayBetweenBatches,
    processFn,
    onProgress,
    shouldAbort
  });

  // 1차 결과 기록
  result.successes.push(...firstPassResult.successes);
  result.aborted = firstPassResult.aborted;

  // 1차 실패 항목 수집
  let failedItems = firstPassResult.failures.map(f => ({
    index: f.index,
    item: items[f.index],
    error: f.error
  }));

  // 시도 횟수 초기화
  failedItems.forEach(f => attemptCounts.set(f.index, 1));

  // 중단되었거나 실패 항목이 없으면 바로 반환
  if (result.aborted || failedItems.length === 0) {
    console.log(`[Batch Retry] 1차 처리 완료: 성공 ${result.successes.length}, 실패 ${failedItems.length}`);
    // 최종 실패 항목 기록
    failedItems.forEach(f => {
      result.finalFailures.push({
        index: f.index,
        error: f.error,
        attempts: attemptCounts.get(f.index) || 1
      });
    });
    result.failures = failedItems.map(f => ({ index: f.index, error: f.error }));
    return result;
  }

  // 재시도 루프
  for (let retryAttempt = 1; retryAttempt <= finalRetryConfig.maxRetries; retryAttempt++) {
    // 중단 체크
    if (shouldAbort?.()) {
      result.aborted = true;
      break;
    }

    // 재시도 가능한 실패 항목만 필터링
    const retryableItems = failedItems.filter(f =>
      finalRetryConfig.shouldRetry!(f.error)
    );

    if (retryableItems.length === 0) {
      console.log(`[Batch Retry] 재시도 가능한 항목 없음, 종료`);
      break;
    }

    console.log(`[Batch Retry] 재시도 ${retryAttempt}/${finalRetryConfig.maxRetries}: ${retryableItems.length}개 항목`);

    // 재시도 전 딜레이
    await new Promise(resolve => setTimeout(resolve, finalRetryConfig.retryDelay));

    // 재시도할 인덱스 기록
    retryableItems.forEach(f => {
      if (!result.retriedItems.includes(f.index)) {
        result.retriedItems.push(f.index);
      }
      attemptCounts.set(f.index, (attemptCounts.get(f.index) || 1) + 1);
    });

    // 재시도 배치 처리
    const retryResult = await processBatch({
      items: retryableItems.map(f => f.item),
      batchSize: Math.max(1, Math.floor(batchSize / 2)), // 재시도 시 배치 크기 줄임
      delayBetweenBatches: delayBetweenBatches * 1.5,    // 딜레이 늘림
      processFn: async (item, localIndex) => {
        const originalIndex = retryableItems[localIndex].index;
        return processFn(item, originalIndex);
      },
      shouldAbort
    });

    // 재시도 중단 체크
    if (retryResult.aborted) {
      result.aborted = true;
      break;
    }

    // 재시도 성공 항목 기록
    retryResult.successes.forEach(s => {
      const originalIndex = retryableItems[s.index].index;
      result.successes.push({
        index: originalIndex,
        value: s.value
      });
    });

    // 여전히 실패한 항목 업데이트
    failedItems = retryResult.failures.map(f => {
      const originalIndex = retryableItems[f.index].index;
      return {
        index: originalIndex,
        item: items[originalIndex],
        error: f.error
      };
    });

    console.log(`[Batch Retry] 재시도 ${retryAttempt} 완료: 성공 ${retryResult.successes.length}, 실패 ${failedItems.length}`);

    // 모두 성공하면 루프 종료
    if (failedItems.length === 0) {
      break;
    }
  }

  // 최종 실패 항목 기록
  failedItems.forEach(f => {
    result.finalFailures.push({
      index: f.index,
      error: f.error,
      attempts: attemptCounts.get(f.index) || 1
    });
  });

  result.failures = failedItems.map(f => ({ index: f.index, error: f.error }));

  console.log(`[Batch Retry] 전체 완료: 성공 ${result.successes.length}, 최종 실패 ${result.finalFailures.length}, 재시도됨 ${result.retriedItems.length}`);

  return result;
}

/**
 * 재시도가 포함된 인덱스 기반 배치 처리
 */
export async function processIndexBatchWithRetry(options: {
  count: number;
  batchSize: number;
  delay: number;
  processFn: (index: number) => Promise<void>;
  onProgress?: (completed: number, total: number) => void;
  shouldAbort?: () => boolean;
  retryConfig?: Partial<RetryConfig>;
}): Promise<{
  completed: number;
  aborted: boolean;
  retriedItems: number[];
  finalFailures: { index: number; attempts: number }[];
}> {
  const indices = Array.from({ length: options.count }, (_, i) => i);

  const result = await processBatchWithRetry({
    items: indices,
    batchSize: options.batchSize,
    delayBetweenBatches: options.delay,
    processFn: async (index) => {
      await options.processFn(index);
    },
    onProgress: options.onProgress,
    shouldAbort: options.shouldAbort,
    retryConfig: options.retryConfig
  });

  return {
    completed: result.successes.length,
    aborted: result.aborted,
    retriedItems: result.retriedItems,
    finalFailures: result.finalFailures.map(f => ({
      index: f.index,
      attempts: f.attempts
    }))
  };
}
