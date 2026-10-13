import React, { useState } from 'react';
import { X, Plus, Trash2, Split, Merge, Clock, Type, Save } from 'lucide-react';
import { useEditorStore } from '../../stores/editorStore';
import { CaptionSegment } from '../../types/captions';

interface CaptionTextEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CaptionTextEditorModal: React.FC<CaptionTextEditorModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    timeline,
    currentFrame,
    setCurrentFrame,
    updateCaptionSegment,
    splitCaptionSegment,
    deleteCaptionSegment,
    mergeCaptionSegments,
    saveTimeline,
  } = useEditorStore();

  const [filterText, setFilterText] = useState('');
  const fps = timeline?.settings?.fps || 30;
  const segments = timeline?.captions?.segments || [];

  if (!isOpen) return null;

  const filteredSegments = segments.filter((s) =>
    s.text.toLowerCase().includes(filterText.toLowerCase())
  );

  const formatTime = (frame: number) => {
    const totalSecs = frame / fps;
    const mins = Math.floor(totalSecs / 60);
    const secs = (totalSecs % 60).toFixed(2);
    return `${mins}:${secs.padStart(5, '0')}`;
  };

  const handleTextChange = (segId: string, newText: string) => {
    updateCaptionSegment(segId, { text: newText });
  };

  const handleTimeChange = (
    segId: string,
    field: 'startFrame' | 'endFrame',
    valSeconds: number
  ) => {
    const f = Math.max(0, Math.round(valSeconds * fps));
    updateCaptionSegment(segId, { [field]: f });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#181B24] border border-[#2A2F3A] rounded-xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-[#2A2F3A] flex items-center justify-between bg-[#141720]">
          <div className="flex items-center gap-2.5">
            <Type className="text-indigo-400" size={20} />
            <div>
              <h3 className="text-sm font-semibold text-white">Caption Text & Timestamp Editor</h3>
              <p className="text-xs text-gray-400">
                Correct transcription text, adjust timing boundaries, split or merge segments.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-[#232734]"
          >
            <X size={18} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-4 py-2.5 bg-[#12141D] border-b border-[#242838] flex items-center justify-between gap-3">
          <input
            type="text"
            placeholder="Search captions..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="bg-[#1E2230] border border-[#2C3246] rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 w-64"
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">
              Total Segments: <strong className="text-indigo-400">{segments.length}</strong>
            </span>
            <button
              onClick={() => {
                saveTimeline();
                onClose();
              }}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 shadow"
            >
              <Save size={13} /> Save Changes
            </button>
          </div>
        </div>

        {/* Caption Segments List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredSegments.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-xs">
              No captions available. Generate captions from your voiceover first.
            </div>
          ) : (
            filteredSegments.map((seg, idx) => {
              const startSec = (seg.startFrame / fps).toFixed(2);
              const endSec = (seg.endFrame / fps).toFixed(2);
              const durationSec = ((seg.endFrame - seg.startFrame) / fps).toFixed(2);
              const nextSeg = filteredSegments[idx + 1];

              return (
                <div
                  key={seg.id}
                  className="bg-[#12141C] border border-[#222634] hover:border-[#32384C] rounded-lg p-3 transition-colors flex flex-col md:flex-row gap-3 items-start md:items-center justify-between"
                >
                  {/* Segment Index & Timing */}
                  <div className="flex items-center gap-3 w-full md:w-64">
                    <span className="text-xs font-mono font-bold text-gray-400 w-6">
                      #{idx + 1}
                    </span>
                    <div className="flex items-center gap-1.5 text-xs text-gray-300">
                      <Clock size={12} className="text-indigo-400" />
                      <input
                        type="number"
                        step="0.05"
                        min="0"
                        value={startSec}
                        onChange={(e) =>
                          handleTimeChange(seg.id, 'startFrame', parseFloat(e.target.value) || 0)
                        }
                        className="w-16 bg-[#1A1E2B] border border-[#2D3346] rounded px-1.5 py-0.5 text-center text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
                        title="Start time in seconds"
                      />
                      <span className="text-gray-500">→</span>
                      <input
                        type="number"
                        step="0.05"
                        min="0"
                        value={endSec}
                        onChange={(e) =>
                          handleTimeChange(seg.id, 'endFrame', parseFloat(e.target.value) || 0)
                        }
                        className="w-16 bg-[#1A1E2B] border border-[#2D3346] rounded px-1.5 py-0.5 text-center text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
                        title="End time in seconds"
                      />
                      <span className="text-[10px] text-gray-500 font-mono">({durationSec}s)</span>
                    </div>
                  </div>

                  {/* Caption Text Input */}
                  <div className="flex-1 w-full">
                    <textarea
                      rows={2}
                      value={seg.text}
                      onChange={(e) => handleTextChange(seg.id, e.target.value)}
                      className="w-full bg-[#181B26] border border-[#2A2F40] rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-500 resize-none"
                      placeholder="Caption text..."
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 self-end md:self-center">
                    <button
                      onClick={() => {
                        setCurrentFrame(seg.startFrame);
                      }}
                      className="px-2 py-1 bg-[#1E2230] hover:bg-indigo-600/40 text-gray-300 hover:text-white rounded text-[11px] font-medium"
                      title="Seek player to start of this caption"
                    >
                      Seek
                    </button>
                    <button
                      onClick={() => {
                        const mid = Math.round((seg.startFrame + seg.endFrame) / 2);
                        splitCaptionSegment(seg.id, mid);
                      }}
                      className="p-1.5 hover:bg-indigo-600/30 text-gray-400 hover:text-indigo-300 rounded"
                      title="Split caption into two"
                    >
                      <Split size={14} />
                    </button>
                    {nextSeg && (
                      <button
                        onClick={() => mergeCaptionSegments(seg.id, nextSeg.id)}
                        className="p-1.5 hover:bg-purple-600/30 text-gray-400 hover:text-purple-300 rounded"
                        title="Merge with next caption"
                      >
                        <Merge size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => deleteCaptionSegment(seg.id)}
                      className="p-1.5 hover:bg-red-600/30 text-gray-400 hover:text-red-400 rounded"
                      title="Delete this caption"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
