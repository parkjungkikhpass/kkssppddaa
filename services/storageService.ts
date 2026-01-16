/**
 * IndexedDB 기반 프로젝트 저장소 서비스
 * localStorage 용량 제한 문제 해결
 */

import { Project, GeneratedAsset } from '../types';

const DB_NAME = 'tubegen_db';
const DB_VERSION = 1;
const PROJECTS_STORE = 'projects';
const PROJECT_DATA_STORE = 'project_data';

// DB 인스턴스 캐시
let dbInstance: IDBDatabase | null = null;

/**
 * IndexedDB 연결
 */
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    // 이미 연결된 인스턴스가 있으면 재사용
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[Storage] DB 열기 실패:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      console.log('[Storage] DB 연결 성공');
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      console.log('[Storage] DB 스키마 업그레이드');

      // 프로젝트 메타데이터 저장소
      if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
        const projectStore = db.createObjectStore(PROJECTS_STORE, { keyPath: 'id' });
        projectStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        projectStore.createIndex('status', 'status', { unique: false });
      }

      // 프로젝트 데이터 (씬, 이미지, 오디오) 저장소
      if (!db.objectStoreNames.contains(PROJECT_DATA_STORE)) {
        db.createObjectStore(PROJECT_DATA_STORE, { keyPath: 'projectId' });
      }
    };
  });
};

/**
 * 모든 프로젝트 목록 불러오기
 */
export const loadProjects = async (): Promise<Project[]> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(PROJECTS_STORE, 'readonly');
      const store = transaction.objectStore(PROJECTS_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        // updatedAt 기준 내림차순 정렬
        const projects = (request.result as Project[]).sort(
          (a, b) => b.updatedAt - a.updatedAt
        );
        resolve(projects);
      };

      request.onerror = () => {
        console.error('[Storage] 프로젝트 목록 로드 실패:', request.error);
        reject(request.error);
      };
    });
  } catch (e) {
    console.error('[Storage] loadProjects 오류:', e);
    // 폴백: localStorage에서 시도
    return loadProjectsFromLocalStorage();
  }
};

/**
 * 프로젝트 저장/업데이트
 */
export const saveProject = async (project: Project): Promise<void> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(PROJECTS_STORE, 'readwrite');
      const store = transaction.objectStore(PROJECTS_STORE);
      const request = store.put(project);

      request.onsuccess = () => {
        console.log('[Storage] 프로젝트 저장 완료:', project.id);
        resolve();
      };

      request.onerror = () => {
        console.error('[Storage] 프로젝트 저장 실패:', request.error);
        reject(request.error);
      };
    });
  } catch (e) {
    console.error('[Storage] saveProject 오류:', e);
    throw e;
  }
};

/**
 * 프로젝트 삭제
 */
export const deleteProject = async (projectId: string): Promise<void> => {
  try {
    const db = await openDB();

    // 프로젝트 메타데이터 삭제
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(PROJECTS_STORE, 'readwrite');
      const store = transaction.objectStore(PROJECTS_STORE);
      const request = store.delete(projectId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    // 프로젝트 데이터 삭제
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(PROJECT_DATA_STORE, 'readwrite');
      const store = transaction.objectStore(PROJECT_DATA_STORE);
      const request = store.delete(projectId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    console.log('[Storage] 프로젝트 삭제 완료:', projectId);
  } catch (e) {
    console.error('[Storage] deleteProject 오류:', e);
    throw e;
  }
};

/**
 * 프로젝트 데이터 (씬, 이미지, 오디오) 저장
 */
export const saveProjectData = async (
  projectId: string,
  data: GeneratedAsset[]
): Promise<void> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(PROJECT_DATA_STORE, 'readwrite');
      const store = transaction.objectStore(PROJECT_DATA_STORE);
      const request = store.put({ projectId, data, savedAt: Date.now() });

      request.onsuccess = () => {
        console.log('[Storage] 프로젝트 데이터 저장 완료:', projectId, `(${data.length}개 씬)`);
        resolve();
      };

      request.onerror = () => {
        console.error('[Storage] 프로젝트 데이터 저장 실패:', request.error);
        reject(request.error);
      };
    });
  } catch (e) {
    console.error('[Storage] saveProjectData 오류:', e);
    throw e;
  }
};

/**
 * 프로젝트 데이터 불러오기
 */
export const loadProjectData = async (
  projectId: string
): Promise<GeneratedAsset[] | null> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(PROJECT_DATA_STORE, 'readonly');
      const store = transaction.objectStore(PROJECT_DATA_STORE);
      const request = store.get(projectId);

      request.onsuccess = () => {
        const result = request.result;
        if (result && result.data) {
          console.log('[Storage] 프로젝트 데이터 로드 완료:', projectId);
          resolve(result.data);
        } else {
          // IndexedDB에 없으면 localStorage에서 시도 (마이그레이션)
          const localData = loadProjectDataFromLocalStorage(projectId);
          if (localData) {
            // 마이그레이션: localStorage → IndexedDB
            saveProjectData(projectId, localData).catch(console.error);
            resolve(localData);
          } else {
            resolve(null);
          }
        }
      };

      request.onerror = () => {
        console.error('[Storage] 프로젝트 데이터 로드 실패:', request.error);
        reject(request.error);
      };
    });
  } catch (e) {
    console.error('[Storage] loadProjectData 오류:', e);
    // 폴백: localStorage
    return loadProjectDataFromLocalStorage(projectId);
  }
};

/**
 * localStorage에서 프로젝트 목록 불러오기 (폴백/마이그레이션용)
 */
const loadProjectsFromLocalStorage = (): Project[] => {
  try {
    const saved = localStorage.getItem('tubegen_projects');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('[Storage] localStorage 프로젝트 로드 실패:', e);
  }
  return [];
};

/**
 * localStorage에서 프로젝트 데이터 불러오기 (폴백/마이그레이션용)
 */
const loadProjectDataFromLocalStorage = (projectId: string): GeneratedAsset[] | null => {
  try {
    const saved = localStorage.getItem(`tubegen_project_data_${projectId}`);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('[Storage] localStorage 프로젝트 데이터 로드 실패:', e);
  }
  return null;
};

/**
 * localStorage 데이터를 IndexedDB로 마이그레이션
 */
export const migrateFromLocalStorage = async (): Promise<number> => {
  let migratedCount = 0;

  try {
    // 1. 프로젝트 목록 마이그레이션
    const localProjects = loadProjectsFromLocalStorage();

    for (const project of localProjects) {
      try {
        await saveProject(project);

        // 2. 프로젝트 데이터 마이그레이션
        const localData = loadProjectDataFromLocalStorage(project.id);
        if (localData) {
          await saveProjectData(project.id, localData);
          // localStorage에서 삭제 (용량 확보)
          localStorage.removeItem(`tubegen_project_data_${project.id}`);
        }

        migratedCount++;
      } catch (e) {
        console.error(`[Storage] 프로젝트 ${project.id} 마이그레이션 실패:`, e);
      }
    }

    // localStorage 프로젝트 목록 삭제
    if (migratedCount > 0) {
      localStorage.removeItem('tubegen_projects');
      console.log(`[Storage] ${migratedCount}개 프로젝트 마이그레이션 완료`);
    }
  } catch (e) {
    console.error('[Storage] 마이그레이션 오류:', e);
  }

  return migratedCount;
};

/**
 * 프로젝트 복제
 */
export const duplicateProject = async (
  sourceProject: Project,
  newProjectId: string
): Promise<Project> => {
  try {
    // 1. 새 프로젝트 메타데이터 생성
    const newProject: Project = {
      ...sourceProject,
      id: newProjectId,
      title: `${sourceProject.title} (복사본)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: sourceProject.status === 'completed' ? 'completed' : 'draft',
    };

    // 2. 프로젝트 메타데이터 저장
    await saveProject(newProject);

    // 3. 프로젝트 데이터 복제 (씬, 이미지, 오디오)
    const sourceData = await loadProjectData(sourceProject.id);
    if (sourceData && sourceData.length > 0) {
      await saveProjectData(newProjectId, sourceData);
    }

    console.log('[Storage] 프로젝트 복제 완료:', sourceProject.id, '→', newProjectId);
    return newProject;
  } catch (e) {
    console.error('[Storage] duplicateProject 오류:', e);
    throw e;
  }
};

/**
 * 저장소 사용량 확인
 */
export const getStorageUsage = async (): Promise<{ used: number; quota: number } | null> => {
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      return {
        used: estimate.usage || 0,
        quota: estimate.quota || 0
      };
    } catch (e) {
      console.error('[Storage] 용량 확인 실패:', e);
    }
  }
  return null;
};
