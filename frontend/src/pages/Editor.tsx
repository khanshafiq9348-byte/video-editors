import React, { useEffect, useState, useRef } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { TopNavigation } from '../components/editor/TopNavigation';
import { MediaPanel } from '../components/editor/MediaPanel';
import { CaptionsPanel } from '../components/captions/CaptionsPanel';
import { PreviewPlayer } from '../components/preview/PreviewPlayer';
import { SceneSettingsPanel } from '../components/editor/SceneSettingsPanel';
import { TimelineTrack } from '../components/timeline/TimelineTrack';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  X,
  PanelLeftClose,
  PanelLeft,
  PanelRightClose,
  PanelRight,
  GripHorizontal,
  Download,
  Clock,
  Image as ImageIcon,
  Type,
} from 'lucide-react';

export const EditorPage: React.FC<{ projectId: string; onBackToProjects: () => void }> = ({
  projectId,
  onBackToProjects,
}) => {
  const {
    loadProject,
    currentProject,
    isLoading,
    statusMessage,
    setStatusMessage,
    errorMessage,
    setErrorMessage,
    activeRenderJob,
  } = useEditorStore();

  const [leftOpen, setLeftOpen] = useState(true);
  const [leftTab, setLeftTab] = useState<'media' | 'captions'>('media');
  const [rightOpen, setRightOpen] = useState(true);
  const [timelineHeight, setTimelineHeight] = useState(250);
  const isDraggingTimeline = useRef(false);
  const startDragY = useRef(0);
  const startHeight = useRef(250);

  useEffect(() => {
    if (projectId) {
      loadProject(projectId);
    }
  }, [projectId]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingTimeline.current) return;
      const deltaY = startDragY.current - e.clientY;
      const newHeight = Math.max(160, Math.min(500, startHeight.current + deltaY));
      setTimelineHeight(newHeight);
    };

    const handleMouseUp = () => {
      isDraggingTimeline.current = false;
      document.body.style.cursor = 'default';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleStartTimelineResize = (e: React.MouseEvent) => {
    isDraggingTimeline.current = true;
    startDragY.current = e.clientY;
    startHeight.current = timelineHeight;
    document.body.style.cursor = 'row-resize';
  };

  if (!currentProject && isLoading) {
    return (
      <div className="min-h-screen bg-[#0F1117] flex items-center justify-center text-gray-400 gap-2">
        <Loader2 className="animate-spin" size={20} /> Loading project...
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0F1117] overflow-hidden select-none">
      {/* Top Navigation */}
      <TopNavigation onBackToProjects={onBackToProjects} />

      {/* Status / Alert Toasts */}
      {(statusMessage || errorMessage || (activeRenderJob && (activeRenderJob.status === 'rendering' || activeRenderJob.status === 'queued'))) && (
        <div className="bg-[#141722] border-b border-[#2A2F3A] px-4 py-1.5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            {isLoading || (activeRenderJob && activeRenderJob.status === 'rendering') ? (
              <Loader2 size={13} className="animate-spin text-indigo-400" />
            ) : (activeRenderJob && activeRenderJob.status === 'queued') ? (
              <Clock size={13} className="animate-pulse text-amber-400" />
            ) : errorMessage ? (
              <AlertCircle size={13} className="text-red-400" />
            ) : (
              <CheckCircle2 size={13} className="text-emerald-400" />
            )}

            <span className={errorMessage ? 'text-red-300' : 'text-gray-300'}>
              {errorMessage || (activeRenderJob && activeRenderJob.status === 'queued'
                ? `Export queued (Position #${activeRenderJob.queue_position || 1}). Waiting for background worker slot...`
                : statusMessage)}
            </span>

            {activeRenderJob && activeRenderJob.status === 'rendering' && (
              <div className="w-32 bg-gray-800 rounded-full h-1.5 overflow-hidden ml-2">
                <div
                  className="bg-indigo-500 h-full transition-all duration-300"
                  style={{ width: `${Math.max(4, activeRenderJob.progress)}%` }}
                />
              </div>
            )}

            {activeRenderJob && activeRenderJob.status === 'completed' && (
              <a
                href={activeRenderJob.download_url || `/api/render-jobs/${activeRenderJob.id}/download`}
                download={`video_${currentProject?.name || 'export'}.mp4`}
                className="ml-3 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold flex items-center gap-1.5 transition-colors shadow cursor-pointer"
                title="Download MP4 video to your PC Downloads folder"
              >
                <Download size={13} /> Download Video
              </a>
            )}
          </div>

          <div className="flex items-center gap-2">
            {errorMessage ? (
              <button
                onClick={() => setErrorMessage(null)}
                className="text-gray-500 hover:text-white cursor-pointer"
                title="Dismiss message"
              >
                <X size={12} />
              </button>
            ) : statusMessage ? (
              <button
                onClick={() => setStatusMessage('')}
                className="text-gray-500 hover:text-white cursor-pointer"
                title="Dismiss message"
              >
                <X size={12} />
              </button>
            ) : null}
          </div>
        </div>
      )}

      {/* Main Workspace: 3-Column Layout with Quick Docking */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left: Media Library & Captions */}
        {leftOpen && (
          <div className="flex h-full select-none z-10">
            {/* Left Nav Dock */}
            <div className="w-12 bg-[#12141C] border-r border-[#242836] flex flex-col items-center py-3 gap-2.5">
              <button
                onClick={() => setLeftTab('media')}
                className={`p-2 rounded-xl transition-all cursor-pointer ${
                  leftTab === 'media'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'text-gray-400 hover:text-white hover:bg-[#1E2230]'
                }`}
                title="Media Library (Images & Voiceover)"
              >
                <ImageIcon size={18} />
              </button>

              <button
                onClick={() => setLeftTab('captions')}
                className={`p-2 rounded-xl transition-all cursor-pointer relative ${
                  leftTab === 'captions'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'text-gray-400 hover:text-white hover:bg-[#1E2230]'
                }`}
                title="Automatic Captions & Presets"
              >
                <Type size={18} />
                {useEditorStore.getState().timeline?.captions?.settings?.enabled && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-emerald-400 rounded-full" />
                )}
              </button>
            </div>

            {/* Panel Content */}
            {leftTab === 'media' ? <MediaPanel /> : <CaptionsPanel />}
          </div>
        )}

        {/* Toggle Left Sidebar Button */}
        <button
          onClick={() => setLeftOpen(!leftOpen)}
          className="absolute left-0 top-3 z-20 bg-[#1e222e] hover:bg-indigo-600 border border-[#2e3444] text-gray-400 hover:text-white p-1 rounded-r-md transition-all shadow-md"
          style={{ left: leftOpen ? '23rem' : '0' }}
          title={leftOpen ? 'Collapse Left Panel' : 'Expand Left Panel'}
        >
          {leftOpen ? <PanelLeftClose size={14} /> : <PanelLeft size={14} />}
        </button>

        {/* Center: Video Preview Player */}
        <PreviewPlayer />

        {/* Toggle Right Sidebar Button */}
        <button
          onClick={() => setRightOpen(!rightOpen)}
          className="absolute right-0 top-3 z-20 bg-[#1e222e] hover:bg-indigo-600 border border-[#2e3444] text-gray-400 hover:text-white p-1 rounded-l-md transition-all shadow-md"
          style={{ right: rightOpen ? '20rem' : '0' }}
          title={rightOpen ? 'Collapse Settings Panel' : 'Expand Settings Panel'}
        >
          {rightOpen ? <PanelRightClose size={14} /> : <PanelRight size={14} />}
        </button>

        {/* Right: Scene / Clip Settings */}
        {rightOpen && <SceneSettingsPanel />}
      </div>

      {/* Draggable Splitter Handle between Workspace & Timeline */}
      <div
        onMouseDown={handleStartTimelineResize}
        className="h-1.5 bg-[#181B24] hover:bg-indigo-500 cursor-row-resize flex items-center justify-center transition-colors border-t border-b border-[#2A2F3A] group z-10"
        title="Drag up or down to resize timeline track"
      >
        <div className="w-8 h-1 bg-gray-600 rounded-full group-hover:bg-white" />
      </div>

      {/* Bottom: Multitrack Timeline with Dynamic Height */}
      <div style={{ height: `${timelineHeight}px` }} className="flex flex-col">
        <TimelineTrack />
      </div>
    </div>
  );
};
