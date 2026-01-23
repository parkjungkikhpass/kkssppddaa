import React, { useState, useEffect, useMemo } from 'react';
import { Project } from '../types';
import ProjectCard, { NewProjectCard } from './ProjectCard';
import {
  loadProjects as loadProjectsFromDB,
  saveProject as saveProjectToDB,
  deleteProject as deleteProjectFromDB,
  duplicateProject as duplicateProjectFromDB,
  migrateFromLocalStorage
} from '../services/storageService';
import { CATEGORY_LIST, CategoryType } from '../services/prompts';

// 정렬 타입
type SortType = 'latest' | 'oldest' | 'name' | 'status';

interface DashboardProps {
  onNewProject: () => void;
  onOpenProject: (project: Project) => void;
  onSettingsClick?: () => void;
  onAutopilotClick?: () => void;
}

// 외부에서 사용할 수 있도록 export (App.tsx에서 사용)
export const loadProjects = loadProjectsFromDB;
export const saveProject = saveProjectToDB;
export const deleteProject = deleteProjectFromDB;

// 프로젝트 추가/업데이트 (기존 호환성 유지)
export const upsertProject = async (project: Project): Promise<void> => {
  await saveProjectToDB(project);
};

const Dashboard: React.FC<DashboardProps> = ({ onNewProject, onOpenProject, onSettingsClick, onAutopilotClick }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [filter, setFilter] = useState<'all' | 'in_progress' | 'completed'>('all');
  const [isLoading, setIsLoading] = useState(true);

  // 검색 & 필터 상태
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortType>('latest');
  const [categoryFilter, setCategoryFilter] = useState<CategoryType | 'all'>('all');

  // 다중 선택 모드
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 프로젝트 목록 로드 및 마이그레이션
  useEffect(() => {
    const initProjects = async () => {
      setIsLoading(true);
      try {
        // localStorage → IndexedDB 마이그레이션 (최초 1회)
        const migratedCount = await migrateFromLocalStorage();
        if (migratedCount > 0) {
          console.log(`[Dashboard] ${migratedCount}개 프로젝트 마이그레이션 완료`);
        }

        // IndexedDB에서 프로젝트 로드
        const loadedProjects = await loadProjectsFromDB();

        // 중복 ID 필터링 (동일한 ID가 있으면 최신 것만 유지)
        const uniqueProjects = loadedProjects.reduce<Project[]>((acc, project) => {
          const existing = acc.find((p: Project) => p.id === project.id);
          if (!existing) {
            acc.push(project);
          } else if (project.updatedAt > existing.updatedAt) {
            // 더 최신 프로젝트로 교체
            const idx = acc.indexOf(existing);
            acc[idx] = project;
          }
          return acc;
        }, []);

        if (uniqueProjects.length !== loadedProjects.length) {
          console.warn(`[Dashboard] 중복 ID 프로젝트 ${loadedProjects.length - uniqueProjects.length}개 제거됨`);
        }

        setProjects(uniqueProjects);
      } catch (e) {
        console.error('[Dashboard] 프로젝트 로드 실패:', e);
      } finally {
        setIsLoading(false);
      }
    };

    initProjects();
  }, []);

  // 프로젝트 삭제 핸들러
  const handleDeleteProject = async (projectId: string) => {
    try {
      await deleteProjectFromDB(projectId);
      setProjects(prev => prev.filter(p => p.id !== projectId));
    } catch (e) {
      console.error('[Dashboard] 프로젝트 삭제 실패:', e);
    }
  };

  // 프로젝트 복제 핸들러
  const handleDuplicateProject = async (project: Project) => {
    try {
      const newProjectId = `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const newProject = await duplicateProjectFromDB(project, newProjectId);
      setProjects(prev => [newProject, ...prev]);
    } catch (e) {
      console.error('[Dashboard] 프로젝트 복제 실패:', e);
    }
  };

  // 선택 모드 토글
  const toggleSelectMode = () => {
    setIsSelectMode(!isSelectMode);
    if (isSelectMode) {
      setSelectedIds(new Set()); // 선택 모드 종료 시 선택 초기화
    }
  };

  // 프로젝트 선택 토글
  const toggleSelectProject = (projectId: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) {
        newSet.delete(projectId);
      } else {
        newSet.add(projectId);
      }
      return newSet;
    });
  };

  // 전체 선택/해제
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredProjects.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProjects.map(p => p.id)));
    }
  };

  // 선택된 프로젝트 일괄 삭제
  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;

    const count = selectedIds.size;
    if (!confirm(`선택한 ${count}개의 프로젝트를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) {
      return;
    }

    try {
      // 선택된 모든 프로젝트 삭제
      for (const id of selectedIds) {
        await deleteProjectFromDB(id);
      }
      setProjects(prev => prev.filter(p => !selectedIds.has(p.id)));
      setSelectedIds(new Set());
      setIsSelectMode(false);
    } catch (e) {
      console.error('[Dashboard] 일괄 삭제 실패:', e);
    }
  };

  // 필터링 및 정렬된 프로젝트
  const filteredProjects = useMemo(() => {
    let result = [...projects];

    // 1. 검색어 필터
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(p => p.title.toLowerCase().includes(query));
    }

    // 2. 상태 필터
    if (filter === 'in_progress') {
      result = result.filter(p => p.status === 'in_progress' || p.status === 'draft');
    } else if (filter === 'completed') {
      result = result.filter(p => p.status === 'completed');
    }

    // 3. 카테고리 필터
    if (categoryFilter !== 'all') {
      result = result.filter(p => p.category === categoryFilter);
    }

    // 4. 정렬
    switch (sortBy) {
      case 'latest':
        result.sort((a, b) => b.updatedAt - a.updatedAt);
        break;
      case 'oldest':
        result.sort((a, b) => a.updatedAt - b.updatedAt);
        break;
      case 'name':
        result.sort((a, b) => a.title.localeCompare(b.title, 'ko'));
        break;
      case 'status':
        const statusOrder = { completed: 0, in_progress: 1, draft: 2, error: 3 };
        result.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
        break;
    }

    return result;
  }, [projects, searchQuery, filter, categoryFilter, sortBy]);

  // 통계
  const stats = {
    total: projects.length,
    inProgress: projects.filter(p => p.status === 'in_progress' || p.status === 'draft').length,
    completed: projects.filter(p => p.status === 'completed').length,
  };

  // 사용 중인 카테고리 목록 (프로젝트에 있는 것만)
  const usedCategories = useMemo(() => {
    const categoryIds = new Set(projects.map(p => p.category).filter(Boolean));
    return CATEGORY_LIST.filter(c => categoryIds.has(c.id as CategoryType));
  }, [projects]);

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* 헤더 */}
      <header className="sticky top-0 z-50 bg-[#0a0a0f]/95 backdrop-blur-xl border-b border-gray-800/50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* 로고 */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#f06050] to-[#d94a3a] flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-black text-white">
                  TubeGen <span className="text-[#f06050]">Studio</span>
                </h1>
                <p className="text-[10px] text-gray-500 font-medium uppercase tracking-widest">
                  AI Video Automation
                </p>
              </div>
            </div>

            {/* 액션 버튼 */}
            <div className="flex items-center gap-3">
              {onAutopilotClick && (
                <button
                  onClick={onAutopilotClick}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 text-white hover:from-emerald-500 hover:to-cyan-500 transition-all flex items-center gap-2 text-sm font-bold shadow-lg shadow-emerald-500/20"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  오토파일럿
                </button>
              )}
              {onSettingsClick && (
                <button
                  onClick={onSettingsClick}
                  className="px-4 py-2.5 rounded-xl bg-[#1a1a24] text-gray-300 hover:bg-[#252530] hover:text-white transition-colors flex items-center gap-2 text-sm font-bold border border-gray-800/50"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  설정
                </button>
              )}
              <button
                onClick={onNewProject}
                className="px-5 py-2.5 rounded-xl bg-[#f06050] text-white hover:bg-[#e05545] transition-colors flex items-center gap-2 text-sm font-bold shadow-lg shadow-[#f06050]/25"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                새 프로젝트
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <main className="max-w-7xl mx-auto px-6 py-10">
        {/* 타이틀 섹션 */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-white mb-2">내 프로젝트</h2>
            <p className="text-gray-500">AI 영상 자동화 프로젝트를 관리하세요</p>
          </div>
          {projects.length > 0 && (
            <button
              onClick={toggleSelectMode}
              className={`px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 text-sm font-bold ${
                isSelectMode
                  ? 'bg-white text-gray-900'
                  : 'bg-[#1a1a24] text-gray-300 hover:bg-[#252530] hover:text-white border border-gray-800/50'
              }`}
            >
              {isSelectMode ? (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  선택 취소
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  선택 삭제
                </>
              )}
            </button>
          )}
        </div>

        {/* 선택 모드 액션 바 */}
        {isSelectMode && (
          <div className="bg-[#1a1a24] text-white rounded-2xl p-4 mb-6 flex items-center justify-between animate-in slide-in-from-top-2 duration-200 border border-gray-800/50">
            <div className="flex items-center gap-4">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-sm"
              >
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                  selectedIds.size === filteredProjects.length && filteredProjects.length > 0
                    ? 'bg-[#f06050] border-[#f06050]'
                    : 'border-gray-500'
                }`}>
                  {selectedIds.size === filteredProjects.length && filteredProjects.length > 0 && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                전체 선택
              </button>
              <span className="text-sm text-gray-400">
                {selectedIds.size}개 선택됨
              </span>
            </div>
            <button
              onClick={handleDeleteSelected}
              disabled={selectedIds.size === 0}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all ${
                selectedIds.size > 0
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-gray-800 text-gray-600 cursor-not-allowed'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              {selectedIds.size}개 삭제
            </button>
          </div>
        )}

        {/* 검색 & 필터 바 */}
        <div className="bg-[#1a1a24] border border-gray-800/50 rounded-2xl p-5 mb-8">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* 검색창 */}
            <div className="flex-1 relative">
              <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="프로젝트 검색..."
                className="w-full bg-[#12121a] text-white border border-gray-800/50 rounded-xl pl-12 pr-10 py-3 text-sm focus:border-[#f06050] focus:ring-2 focus:ring-[#f06050]/20 outline-none transition-all placeholder:text-gray-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-[#252530] text-gray-500 hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* 필터 그룹 */}
            <div className="flex items-center gap-3">
              {/* 정렬 옵션 */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortType)}
                className="bg-[#12121a] text-gray-300 border border-gray-800/50 rounded-xl px-4 py-3 text-sm cursor-pointer hover:bg-[#1a1a24] focus:border-[#f06050] outline-none transition-all"
              >
                <option value="latest">최신순</option>
                <option value="oldest">오래된순</option>
                <option value="name">이름순</option>
                <option value="status">상태순</option>
              </select>

              {/* 카테고리 필터 */}
              {usedCategories.length > 0 && (
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value as CategoryType | 'all')}
                  className="bg-[#12121a] text-gray-300 border border-gray-800/50 rounded-xl px-4 py-3 text-sm cursor-pointer hover:bg-[#1a1a24] focus:border-[#f06050] outline-none transition-all"
                >
                  <option value="all">모든 카테고리</option>
                  {usedCategories.map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.emoji} {cat.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>

        {/* 상태 필터 탭 */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-1 bg-[#12121a] p-1.5 rounded-xl border border-gray-800/50">
            <button
              onClick={() => setFilter('all')}
              className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                filter === 'all'
                  ? 'bg-[#1a1a24] text-white'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-[#1a1a24]/50'
              }`}
            >
              전체 <span className={`ml-1.5 ${filter === 'all' ? 'text-gray-400' : 'text-gray-500'}`}>{stats.total}</span>
            </button>
            <button
              onClick={() => setFilter('in_progress')}
              className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                filter === 'in_progress'
                  ? 'bg-amber-900/30 text-amber-400'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-[#1a1a24]/50'
              }`}
            >
              작성 중 <span className={`ml-1.5 ${filter === 'in_progress' ? 'text-amber-500' : 'text-gray-500'}`}>{stats.inProgress}</span>
            </button>
            <button
              onClick={() => setFilter('completed')}
              className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                filter === 'completed'
                  ? 'bg-emerald-900/30 text-emerald-400'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-[#1a1a24]/50'
              }`}
            >
              완료 <span className={`ml-1.5 ${filter === 'completed' ? 'text-emerald-500' : 'text-gray-500'}`}>{stats.completed}</span>
            </button>
          </div>

          {/* 검색 결과 수 */}
          {(searchQuery || categoryFilter !== 'all') && (
            <span className="text-gray-400 text-sm font-medium">
              {filteredProjects.length}개 결과
            </span>
          )}
        </div>

        {/* 로딩 상태 */}
        {isLoading ? (
          <div className="text-center py-20">
            <div className="w-12 h-12 border-3 border-[#f06050] border-t-transparent animate-spin rounded-full mx-auto mb-6"></div>
            <p className="text-gray-400 font-medium">프로젝트를 불러오는 중...</p>
          </div>
        ) : (
          <>
            {/* 프로젝트 그리드 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {/* 새 프로젝트 카드 (선택 모드가 아닐 때만) */}
              {!isSelectMode && <NewProjectCard onClick={onNewProject} />}

              {/* 기존 프로젝트 카드들 */}
              {filteredProjects.map(project => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onClick={onOpenProject}
                  onDelete={handleDeleteProject}
                  onDuplicate={handleDuplicateProject}
                  isSelectMode={isSelectMode}
                  isSelected={selectedIds.has(project.id)}
                  onSelect={toggleSelectProject}
                />
              ))}
            </div>

            {/* 빈 상태 */}
            {filteredProjects.length === 0 && projects.length > 0 && (
              <div className="text-center py-20">
                <div className="w-16 h-16 rounded-2xl bg-[#1a1a24] flex items-center justify-center mx-auto mb-6 border border-gray-800/50">
                  <svg className="w-8 h-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  {searchQuery ? `"${searchQuery}" 검색 결과가 없습니다` : '해당 조건의 프로젝트가 없습니다'}
                </h3>
                <p className="text-gray-500 text-sm mb-6">
                  {searchQuery ? '다른 검색어를 시도해보세요' : '필터를 변경해보세요'}
                </p>
                {(searchQuery || categoryFilter !== 'all' || filter !== 'all') && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setCategoryFilter('all');
                      setFilter('all');
                    }}
                    className="px-5 py-2.5 rounded-xl bg-[#1a1a24] text-gray-300 hover:bg-[#252530] hover:text-white transition-colors text-sm font-medium border border-gray-800/50"
                  >
                    필터 초기화
                  </button>
                )}
              </div>
            )}

            {/* 처음 사용자 안내 */}
            {projects.length === 0 && (
              <div className="text-center py-20">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#f06050]/20 to-[#f06050]/10 flex items-center justify-center mx-auto mb-8 border border-[#f06050]/30">
                  <svg className="w-10 h-10 text-[#f06050]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">첫 프로젝트를 만들어보세요</h3>
                <p className="text-gray-400 mb-8 max-w-md mx-auto">
                  AI가 자동으로 영상 대본, 이미지, 음성을 생성합니다.<br />
                  몇 분 만에 전문적인 영상 콘텐츠를 만들어보세요.
                </p>
                <button
                  onClick={onNewProject}
                  className="px-8 py-4 rounded-xl bg-[#f06050] text-white hover:bg-[#e05545] transition-all font-semibold shadow-xl shadow-[#f06050]/30 hover:shadow-[#f06050]/40 hover:-translate-y-0.5"
                >
                  새 프로젝트 시작하기
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
