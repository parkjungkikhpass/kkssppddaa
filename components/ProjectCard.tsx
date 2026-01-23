import React from 'react';
import { Project, ProjectStatus } from '../types';
import { CATEGORY_LIST, STYLE_LIST } from '../services/prompts';

interface ProjectCardProps {
  project: Project;
  onClick: (project: Project) => void;
  onDelete?: (projectId: string) => void;
  onDuplicate?: (project: Project) => void;
  isSelectMode?: boolean;
  isSelected?: boolean;
  onSelect?: (projectId: string) => void;
}

// 상태별 스타일
const STATUS_STYLES: Record<ProjectStatus, { bg: string; text: string; label: string }> = {
  draft: { bg: 'bg-gray-500', text: 'text-white', label: '임시저장' },
  in_progress: { bg: 'bg-amber-500', text: 'text-white', label: '작성 중' },
  completed: { bg: 'bg-emerald-500', text: 'text-white', label: '완료' },
  error: { bg: 'bg-red-500', text: 'text-white', label: '오류' },
};

// TTS 엔진 스타일
const TTS_STYLES = {
  gemini: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Gemini' },
  elevenlabs: { bg: 'bg-fuchsia-500/20', text: 'text-fuchsia-400', label: 'ElevenLabs' },
};

// 카테고리 정보 가져오기
const getCategoryInfo = (categoryId?: string) => {
  if (!categoryId) return null;
  return CATEGORY_LIST.find(c => c.id === categoryId);
};

// 스타일 정보 가져오기
const getStyleInfo = (styleId?: string) => {
  if (!styleId) return null;
  return STYLE_LIST.find(s => s.id === styleId);
};

// 시간 포맷팅 (상대 시간)
const formatRelativeTime = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  if (hours < 24) return `약 ${hours}시간 전`;
  if (days < 7) return `${days}일 전`;

  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()}`;
};

const ProjectCard: React.FC<ProjectCardProps> = ({ project, onClick, onDelete, onDuplicate, isSelectMode, isSelected, onSelect }) => {
  const [imageError, setImageError] = React.useState(false);
  // 방어 코드: status가 없거나 알 수 없는 값이면 기본값(draft) 사용
  const statusStyle = STATUS_STYLES[project.status] || STATUS_STYLES.draft;
  const categoryInfo = getCategoryInfo(project.category);
  const styleInfo = getStyleInfo(project.style);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete && confirm('이 프로젝트를 삭제하시겠습니까?')) {
      onDelete(project.id);
    }
  };

  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDuplicate) {
      onDuplicate(project);
    }
  };

  const handleCardClick = () => {
    if (isSelectMode && onSelect) {
      onSelect(project.id);
    } else {
      onClick(project);
    }
  };

  return (
    <div
      onClick={handleCardClick}
      className={`group relative bg-[#1a1a24] border rounded-2xl p-4 cursor-pointer transition-all duration-200 ${
        isSelectMode
          ? isSelected
            ? 'border-[#f06050] bg-[#f06050]/10 ring-2 ring-[#f06050]/30'
            : 'border-gray-800/50 hover:border-gray-700'
          : 'border-gray-800/50 hover:border-[#f06050]/50 hover:-translate-y-1'
      }`}
    >
      {/* 선택 모드 체크박스 */}
      {isSelectMode && (
        <div className="absolute top-3 left-3 z-20">
          <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
            isSelected
              ? 'bg-[#f06050] border-[#f06050]'
              : 'bg-[#12121a] border-gray-600 hover:border-[#f06050]'
          }`}>
            {isSelected && (
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
        </div>
      )}

      {/* 액션 버튼들 (선택 모드가 아닐 때만 표시) */}
      {!isSelectMode && (
        <div className="absolute top-3 right-3 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all z-10">
          {/* 복제 버튼 */}
          {onDuplicate && (
            <button
              onClick={handleDuplicate}
              className="p-2 rounded-xl bg-[#252530] text-gray-400 hover:bg-[#f06050]/20 hover:text-[#f06050] transition-all"
              title="프로젝트 복제"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          )}
          {/* 삭제 버튼 */}
          {onDelete && (
            <button
              onClick={handleDelete}
              className="p-2 rounded-xl bg-[#252530] text-gray-400 hover:bg-red-900/30 hover:text-red-400 transition-all"
              title="프로젝트 삭제"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* 썸네일 또는 아이콘 */}
      {project.thumbnail && !imageError ? (
        <div className="mb-4 rounded-xl overflow-hidden aspect-video bg-[#12121a] relative">
          <img
            src={project.thumbnail}
            alt=""
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setImageError(true)}
          />
          {/* 상태 뱃지 - 이미지 위에 */}
          <div className="absolute top-2 left-2">
            <span className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-bold ${statusStyle.bg} ${statusStyle.text} shadow-lg`}>
              {statusStyle.label}
            </span>
          </div>
          {/* 씬 수 - 이미지 우하단 */}
          {project.scenesCount > 0 && (
            <div className="absolute bottom-2 right-2 px-2 py-1 rounded-lg bg-black/70 backdrop-blur-sm">
              <span className="text-xs text-white font-medium">{project.scenesCount}씬</span>
            </div>
          )}
        </div>
      ) : (
        <div className="mb-4 rounded-xl aspect-video bg-gradient-to-br from-[#12121a] to-[#1a1a24] flex flex-col items-center justify-center relative border border-gray-800/30">
          <div className="w-12 h-12 rounded-xl bg-[#252530] flex items-center justify-center mb-2">
            <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <span className="text-xs text-gray-500">썸네일 없음</span>
          {/* 상태 뱃지 */}
          <div className="absolute top-2 left-2">
            <span className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-bold ${statusStyle.bg} ${statusStyle.text}`}>
              {statusStyle.label}
            </span>
          </div>
        </div>
      )}

      {/* 카테고리 */}
      {categoryInfo && (
        <div className="mb-2">
          <span className="text-xs font-medium text-[#f06050]">
            {categoryInfo.emoji} {categoryInfo.name}
          </span>
        </div>
      )}

      {/* 제목 */}
      <h3 className="text-white font-semibold text-base mb-3 line-clamp-2 leading-snug group-hover:text-[#f06050] transition-colors">
        {project.title}
      </h3>

      {/* 하단 메타 정보 */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-800/50">
        <div className="flex items-center gap-3 text-xs text-gray-500">
          {/* 시간 */}
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {formatRelativeTime(project.updatedAt)}
          </span>
          {/* 스타일 */}
          {styleInfo && (
            <span className="text-gray-500">{styleInfo.emoji}</span>
          )}
        </div>

        {/* 진행률 또는 화살표 */}
        {project.status === 'in_progress' ? (
          <span className="text-xs font-bold text-amber-400">
            {Math.round((project.currentStepNumber / project.totalSteps) * 100)}%
          </span>
        ) : (
          <svg className="w-4 h-4 text-gray-600 group-hover:text-[#f06050] group-hover:translate-x-1 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        )}
      </div>

      {/* 진행 바 (작성 중인 경우) */}
      {project.status === 'in_progress' && (
        <div className="mt-3 h-1 bg-[#12121a] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#f06050] to-[#f07060] transition-all duration-500"
            style={{ width: `${(project.currentStepNumber / project.totalSteps) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
};

// 새 프로젝트 카드 (+ 버튼)
export const NewProjectCard: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      className="group bg-[#12121a] border border-dashed border-gray-700 rounded-2xl p-4 cursor-pointer hover:border-[#f06050] hover:border-solid hover:bg-[#f06050]/5 transition-all duration-300 flex flex-col items-center justify-center min-h-[280px]"
    >
      <div className="w-14 h-14 rounded-2xl bg-[#1a1a24] group-hover:bg-[#f06050]/20 group-hover:scale-110 flex items-center justify-center mb-4 transition-all duration-300 border border-gray-800/50">
        <svg className="w-7 h-7 text-gray-500 group-hover:text-[#f06050] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </div>
      <span className="text-gray-400 group-hover:text-white font-semibold text-sm transition-colors mb-1">
        새 프로젝트
      </span>
      <span className="text-gray-600 group-hover:text-gray-400 text-xs transition-colors">
        AI 영상 생성 시작하기
      </span>
    </button>
  );
};

export default ProjectCard;
