import React, { useState } from 'react';
import {
  Sparkles,
  Type,
  Sliders,
  Palette,
  Play,
  RotateCcw,
  Download,
  Check,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Edit3,
  BookmarkPlus,
  FileText,
} from 'lucide-react';
import { useEditorStore } from '../../stores/editorStore';
import {
  BUILTIN_CAPTION_PRESETS,
  CaptionCategory,
  CaptionMode,
  CaptionAnimationType,
  CaptionPreset,
} from '../../types/captions';
import { CaptionTextEditorModal } from './CaptionTextEditorModal';

export const CaptionsPanel: React.FC = () => {
  const {
    timeline,
    currentProject,
    selectedCaptionId,
    isLoading,
    generateCaptions,
    toggleCaptionsEnabled,
    setCaptionMode,
    applyCaptionPreset,
    updateGlobalCaptionStyle,
    updateSegmentStyleOverride,
    addCustomPreset,
    deleteCustomPreset,
    exportSrt,
    exportVtt,
    saveTimeline,
  } = useEditorStore();

  const [activeTab, setActiveTab] = useState<'presets' | 'style' | 'individual'>('presets');
  const [selectedCategory, setSelectedCategory] = useState<CaptionCategory>('all');
  const [isEditorModalOpen, setIsEditorModalOpen] = useState(false);
  const [customPresetName, setCustomPresetName] = useState('');
  const [showSaveCustomModal, setShowSaveCustomModal] = useState(false);

  const captions = timeline?.captions;
  const isEnabled = captions?.settings?.enabled ?? true;
  const currentMode = captions?.settings?.mode || 'karaoke';
  const selectedPresetId = captions?.settings?.selectedPresetId || 'preset_yellow_karaoke';
  const globalStyle = captions?.settings?.globalStyle || BUILTIN_CAPTION_PRESETS[2].style;

  const allPresets: CaptionPreset[] = [
    ...BUILTIN_CAPTION_PRESETS,
    ...(captions?.settings?.customPresets || []),
  ];

  const filteredPresets = allPresets.filter(
    (p) => selectedCategory === 'all' || p.category === selectedCategory
  );

  const selectedSegment = captions?.segments?.find((s) => s.id === selectedCaptionId);

  const fontOptions = [
    'Inter',
    'Impact',
    'Arial',
    'Georgia',
    'Montserrat',
    'Courier New',
    'Comic Sans MS',
    'Trebuchet MS',
  ];

  const animationOptions: { value: CaptionAnimationType; label: string }[] = [
    { value: 'none', label: 'None' },
    { value: 'fade_in', label: 'Fade In' },
    { value: 'fade_out', label: 'Fade Out' },
    { value: 'pop', label: 'Pop Entrance' },
    { value: 'scale_up', label: 'Scale Up' },
    { value: 'slide_up', label: 'Slide Up' },
    { value: 'slide_down', label: 'Slide Down' },
    { value: 'bounce', label: 'Bounce' },
    { value: 'word_highlight', label: 'Word Glow / Highlight' },
    { value: 'typewriter', label: 'Typewriter Reveal' },
    { value: 'smooth_zoom', label: 'Smooth Zoom' },
    { value: 'word_pulse', label: 'Active Word Pulse' },
  ];

  const handleSaveCustomPreset = () => {
    if (!customPresetName.trim()) return;
    const newPreset: CaptionPreset = {
      id: `custom_${Date.now()}`,
      name: customPresetName.trim(),
      category: 'all',
      mode: currentMode,
      style: { ...globalStyle },
      isCustom: true,
    };
    addCustomPreset(newPreset);
    setCustomPresetName('');
    setShowSaveCustomModal(false);
  };

  return (
    <div className="flex flex-col h-full bg-[#181B24] border-r border-[#2A2F3A] w-80 select-none overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-[#2A2F3A] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Type size={16} className="text-indigo-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-200">
            Captions
          </h2>
        </div>
        {captions && (
          <button
            onClick={() => toggleCaptionsEnabled()}
            className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 transition-colors ${
              isEnabled
                ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
                : 'bg-gray-800 border-gray-700 text-gray-400'
            }`}
            title={isEnabled ? 'Disable Captions' : 'Enable Captions'}
          >
            {isEnabled ? <Eye size={13} /> : <EyeOff size={13} />}
            <span>{isEnabled ? 'On' : 'Off'}</span>
          </button>
        )}
      </div>

      {/* Primary Actions: Generate & Edit text */}
      <div className="p-3 border-b border-[#2A2F3A] space-y-2 bg-[#141720]">
        <button
          onClick={() => generateCaptions()}
          disabled={isLoading}
          className="w-full py-2 px-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
        >
          <Sparkles size={14} className={isLoading ? 'animate-spin' : ''} />
          {captions ? 'Re-Generate Automatic Captions' : 'Generate Automatic Captions'}
        </button>

        {captions && (
          <div className="flex gap-2">
            <button
              onClick={() => setIsEditorModalOpen(true)}
              className="flex-1 py-1.5 px-2 bg-[#202534] hover:bg-[#2A3044] text-gray-300 hover:text-white rounded-md text-xs font-medium flex items-center justify-center gap-1.5 border border-[#2F354A] transition-colors"
            >
              <Edit3 size={12} /> Edit Text & Timing
            </button>
            <button
              onClick={() => setShowSaveCustomModal(true)}
              className="py-1.5 px-2.5 bg-[#202534] hover:bg-[#2A3044] text-gray-300 hover:text-white rounded-md text-xs font-medium flex items-center gap-1 border border-[#2F354A] transition-colors"
              title="Save current styling as a custom preset"
            >
              <BookmarkPlus size={12} /> Save Preset
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#2A2F3A] bg-[#12141D] text-xs font-medium text-gray-400">
        <button
          onClick={() => setActiveTab('presets')}
          className={`flex-1 py-2 text-center border-b-2 transition-colors ${
            activeTab === 'presets'
              ? 'border-indigo-500 text-white font-semibold'
              : 'border-transparent hover:text-gray-200'
          }`}
        >
          Presets (15)
        </button>
        <button
          onClick={() => setActiveTab('style')}
          className={`flex-1 py-2 text-center border-b-2 transition-colors ${
            activeTab === 'style'
              ? 'border-indigo-500 text-white font-semibold'
              : 'border-transparent hover:text-gray-200'
          }`}
        >
          Global Style
        </button>
        {selectedSegment && (
          <button
            onClick={() => setActiveTab('individual')}
            className={`flex-1 py-2 text-center border-b-2 transition-colors ${
              activeTab === 'individual'
                ? 'border-indigo-500 text-white font-semibold'
                : 'border-transparent hover:text-gray-200'
            }`}
          >
            Clip Style
          </button>
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* TAB 1: PRESETS */}
        {activeTab === 'presets' && (
          <div className="space-y-3">
            {/* Mode Selector */}
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
                Display Mode
              </label>
              <select
                value={currentMode}
                onChange={(e) => setCaptionMode(e.target.value as CaptionMode)}
                className="w-full bg-[#11131a] border border-[#2e3343] rounded-lg px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="karaoke">Karaoke Highlight (Word by Word Highlighting)</option>
                <option value="word_pop">Active Word Pop (Scale + Color Pop)</option>
                <option value="word_by_word">Word by Word (Current Spoken Word Only)</option>
                <option value="classic">Classic Subtitles (Clean Phrase Lines)</option>
                <option value="phrase">Phrase by Phrase (Short Clauses)</option>
              </select>
            </div>

            {/* Category Pills */}
            <div className="flex flex-wrap gap-1 pb-1">
              {(
                [
                  'all',
                  'classic',
                  'youtube',
                  'karaoke',
                  'cinematic',
                  'animated',
                  'minimal',
                ] as CaptionCategory[]
              ).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium capitalize transition-colors ${
                    selectedCategory === cat
                      ? 'bg-indigo-600 text-white'
                      : 'bg-[#202534] text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Presets Grid */}
            <div className="grid grid-cols-1 gap-2.5">
              {filteredPresets.map((preset) => {
                const isSelected = selectedPresetId === preset.id;
                const pStyle = preset.style;

                return (
                  <div
                    key={preset.id}
                    onClick={() => applyCaptionPreset(preset.id)}
                    className={`relative p-3 rounded-xl border transition-all cursor-pointer group flex flex-col justify-between overflow-hidden ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-950/40 ring-1 ring-indigo-500'
                        : 'border-[#282E40] bg-[#141722] hover:border-[#3D4560] hover:bg-[#181C2A]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-200 flex items-center gap-1.5">
                        {preset.name}
                        {preset.isCustom && (
                          <span className="text-[9px] bg-purple-900/60 text-purple-300 px-1.5 py-0.2 rounded border border-purple-700">
                            Custom
                          </span>
                        )}
                      </span>
                      {isSelected && (
                        <span className="text-[10px] text-indigo-400 font-bold flex items-center gap-0.5">
                          <Check size={12} /> Active
                        </span>
                      )}
                      {preset.isCustom && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteCustomPreset(preset.id);
                          }}
                          className="text-gray-500 hover:text-red-400 p-0.5"
                          title="Delete custom preset"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>

                    {/* Visual Styled Preview Card */}
                    <div
                      className="w-full py-2.5 px-3 rounded-lg bg-black/60 flex items-center justify-center text-center overflow-hidden"
                      style={{
                        backgroundColor: pStyle.backgroundEnabled
                          ? pStyle.backgroundColor
                          : 'rgba(0,0,0,0.7)',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: pStyle.fontFamily || 'Inter',
                          fontSize: '13px',
                          fontWeight: pStyle.fontWeight || 700,
                          fontStyle: pStyle.italic ? 'italic' : 'normal',
                          textTransform: pStyle.uppercase ? 'uppercase' : 'none',
                          color: pStyle.textColor || '#FFFFFF',
                          WebkitTextStroke: pStyle.strokeEnabled
                            ? `1px ${pStyle.strokeColor || '#000000'}`
                            : undefined,
                          textShadow: pStyle.shadowEnabled
                            ? `0 2px 4px ${pStyle.shadowColor || 'rgba(0,0,0,0.8)'}`
                            : undefined,
                        }}
                      >
                        Sample{' '}
                        <span
                          style={{
                            color: pStyle.highlightColor || '#FFE500',
                            textShadow:
                              preset.category === 'animated'
                                ? `0 0 8px ${pStyle.highlightColor}`
                                : undefined,
                          }}
                        >
                          Caption
                        </span>{' '}
                        Style
                      </span>
                    </div>

                    <div className="flex items-center justify-between mt-2 text-[10px] text-gray-500 font-mono">
                      <span>{preset.mode.replace('_', ' ')}</span>
                      <span>{pStyle.animationType}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: GLOBAL STYLING */}
        {activeTab === 'style' && (
          <div className="space-y-4">
            {/* Font Family & Size */}
            <div className="p-3 bg-[#131620] rounded-xl border border-[#252A3C] space-y-3">
              <span className="text-[11px] font-semibold text-gray-300 block">Typography</span>

              <div>
                <label className="text-[10px] text-gray-500 block mb-1">Font Family</label>
                <select
                  value={globalStyle.fontFamily}
                  onChange={(e) => updateGlobalCaptionStyle({ fontFamily: e.target.value })}
                  className="w-full bg-[#181B26] border border-[#2E3448] rounded px-2 py-1 text-xs text-white"
                >
                  {fontOptions.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-gray-500 block mb-1">
                    Font Size ({globalStyle.fontSize}px)
                  </label>
                  <input
                    type="range"
                    min={20}
                    max={90}
                    value={globalStyle.fontSize}
                    onChange={(e) =>
                      updateGlobalCaptionStyle({ fontSize: parseInt(e.target.value, 10) })
                    }
                    className="w-full accent-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-gray-500 block mb-1">Font Weight</label>
                  <select
                    value={globalStyle.fontWeight}
                    onChange={(e) =>
                      updateGlobalCaptionStyle({ fontWeight: parseInt(e.target.value, 10) })
                    }
                    className="w-full bg-[#181B26] border border-[#2E3448] rounded px-2 py-1 text-xs text-white"
                  >
                    <option value={400}>Regular (400)</option>
                    <option value={600}>Semi-Bold (600)</option>
                    <option value={700}>Bold (700)</option>
                    <option value={800}>Extra Bold (800)</option>
                    <option value={900}>Black (900)</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => updateGlobalCaptionStyle({ uppercase: !globalStyle.uppercase })}
                  className={`flex-1 py-1 rounded text-xs border ${
                    globalStyle.uppercase
                      ? 'bg-indigo-600/40 border-indigo-500 text-white font-bold'
                      : 'bg-[#181B26] border-[#2E3448] text-gray-400'
                  }`}
                >
                  UPPERCASE
                </button>
                <button
                  onClick={() => updateGlobalCaptionStyle({ italic: !globalStyle.italic })}
                  className={`flex-1 py-1 rounded text-xs border italic ${
                    globalStyle.italic
                      ? 'bg-indigo-600/40 border-indigo-500 text-white font-bold'
                      : 'bg-[#181B26] border-[#2E3448] text-gray-400'
                  }`}
                >
                  Italic
                </button>
              </div>
            </div>

            {/* Colors */}
            <div className="p-3 bg-[#131620] rounded-xl border border-[#252A3C] space-y-3">
              <span className="text-[11px] font-semibold text-gray-300 block">Colors</span>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-gray-500 block mb-1">Text Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={globalStyle.textColor}
                      onChange={(e) => updateGlobalCaptionStyle({ textColor: e.target.value })}
                      className="w-7 h-7 rounded border-none bg-transparent cursor-pointer"
                    />
                    <input
                      type="text"
                      value={globalStyle.textColor}
                      onChange={(e) => updateGlobalCaptionStyle({ textColor: e.target.value })}
                      className="w-16 bg-[#181B26] border border-[#2E3448] rounded px-1.5 py-0.5 text-xs text-white uppercase font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-gray-500 block mb-1">Highlight Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={globalStyle.highlightColor}
                      onChange={(e) => updateGlobalCaptionStyle({ highlightColor: e.target.value })}
                      className="w-7 h-7 rounded border-none bg-transparent cursor-pointer"
                    />
                    <input
                      type="text"
                      value={globalStyle.highlightColor}
                      onChange={(e) => updateGlobalCaptionStyle({ highlightColor: e.target.value })}
                      className="w-16 bg-[#181B26] border border-[#2E3448] rounded px-1.5 py-0.5 text-xs text-white uppercase font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Stroke / Outline */}
            <div className="p-3 bg-[#131620] rounded-xl border border-[#252A3C] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-gray-300">Stroke / Outline</span>
                <input
                  type="checkbox"
                  checked={globalStyle.strokeEnabled}
                  onChange={(e) => updateGlobalCaptionStyle({ strokeEnabled: e.target.checked })}
                  className="accent-indigo-500 cursor-pointer"
                />
              </div>

              {globalStyle.strokeEnabled && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-[10px] text-gray-500 block mb-1">Outline Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={globalStyle.strokeColor}
                        onChange={(e) => updateGlobalCaptionStyle({ strokeColor: e.target.value })}
                        className="w-6 h-6 rounded bg-transparent cursor-pointer"
                      />
                      <input
                        type="text"
                        value={globalStyle.strokeColor}
                        onChange={(e) => updateGlobalCaptionStyle({ strokeColor: e.target.value })}
                        className="w-16 bg-[#181B26] border border-[#2E3448] rounded px-1 text-xs text-white uppercase font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] text-gray-500 block mb-1">
                      Width ({globalStyle.strokeWidth}px)
                    </label>
                    <input
                      type="range"
                      min={1}
                      max={12}
                      value={globalStyle.strokeWidth}
                      onChange={(e) =>
                        updateGlobalCaptionStyle({ strokeWidth: parseInt(e.target.value, 10) })
                      }
                      className="w-full accent-indigo-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Shadow / Glow */}
            <div className="p-3 bg-[#131620] rounded-xl border border-[#252A3C] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-gray-300">Shadow & Glow</span>
                <input
                  type="checkbox"
                  checked={globalStyle.shadowEnabled}
                  onChange={(e) => updateGlobalCaptionStyle({ shadowEnabled: e.target.checked })}
                  className="accent-indigo-500 cursor-pointer"
                />
              </div>

              {globalStyle.shadowEnabled && (
                <div className="space-y-2 pt-1">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-500 block mb-1">
                        Blur ({globalStyle.shadowBlur}px)
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={30}
                        value={globalStyle.shadowBlur}
                        onChange={(e) =>
                          updateGlobalCaptionStyle({ shadowBlur: parseInt(e.target.value, 10) })
                        }
                        className="w-full accent-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 block mb-1">
                        Offset Y ({globalStyle.shadowOffsetY}px)
                      </label>
                      <input
                        type="range"
                        min={-15}
                        max={20}
                        value={globalStyle.shadowOffsetY}
                        onChange={(e) =>
                          updateGlobalCaptionStyle({ shadowOffsetY: parseInt(e.target.value, 10) })
                        }
                        className="w-full accent-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Background Box */}
            <div className="p-3 bg-[#131620] rounded-xl border border-[#252A3C] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-gray-300">Background Box</span>
                <input
                  type="checkbox"
                  checked={globalStyle.backgroundEnabled}
                  onChange={(e) =>
                    updateGlobalCaptionStyle({ backgroundEnabled: e.target.checked })
                  }
                  className="accent-indigo-500 cursor-pointer"
                />
              </div>

              {globalStyle.backgroundEnabled && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="text-[10px] text-gray-500 block mb-1">Box Color</label>
                    <input
                      type="color"
                      value={globalStyle.backgroundColor}
                      onChange={(e) =>
                        updateGlobalCaptionStyle({ backgroundColor: e.target.value })
                      }
                      className="w-7 h-7 rounded bg-transparent cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 block mb-1">
                      Opacity ({Math.round(globalStyle.backgroundOpacity * 100)}%)
                    </label>
                    <input
                      type="range"
                      min={0.1}
                      max={1.0}
                      step={0.05}
                      value={globalStyle.backgroundOpacity}
                      onChange={(e) =>
                        updateGlobalCaptionStyle({ backgroundOpacity: parseFloat(e.target.value) })
                      }
                      className="w-full accent-indigo-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Position & Alignment */}
            <div className="p-3 bg-[#131620] rounded-xl border border-[#252A3C] space-y-2.5">
              <span className="text-[11px] font-semibold text-gray-300 block">
                Position & Alignment
              </span>

              {/* Quick placement buttons */}
              <div className="flex gap-1.5">
                <button
                  onClick={() => updateGlobalCaptionStyle({ positionY: 15 })}
                  className="flex-1 py-1 bg-[#181B26] hover:bg-indigo-600/30 rounded text-[11px] text-gray-300"
                >
                  Top (15%)
                </button>
                <button
                  onClick={() => updateGlobalCaptionStyle({ positionY: 50 })}
                  className="flex-1 py-1 bg-[#181B26] hover:bg-indigo-600/30 rounded text-[11px] text-gray-300"
                >
                  Center (50%)
                </button>
                <button
                  onClick={() => updateGlobalCaptionStyle({ positionY: 82 })}
                  className="flex-1 py-1 bg-[#181B26] hover:bg-indigo-600/30 rounded text-[11px] text-gray-300"
                >
                  Bottom (82%)
                </button>
              </div>

              <div>
                <label className="text-[10px] text-gray-500 block mb-1">
                  Vertical Y ({Math.round(globalStyle.positionY)}%)
                </label>
                <input
                  type="range"
                  min={10}
                  max={92}
                  value={globalStyle.positionY}
                  onChange={(e) =>
                    updateGlobalCaptionStyle({ positionY: parseInt(e.target.value, 10) })
                  }
                  className="w-full accent-indigo-500"
                />
              </div>

              <div>
                <label className="text-[10px] text-gray-500 block mb-1">
                  Horizontal X ({Math.round(globalStyle.positionX)}%)
                </label>
                <input
                  type="range"
                  min={10}
                  max={90}
                  value={globalStyle.positionX}
                  onChange={(e) =>
                    updateGlobalCaptionStyle({ positionX: parseInt(e.target.value, 10) })
                  }
                  className="w-full accent-indigo-500"
                />
              </div>
            </div>

            {/* Animation Settings */}
            <div className="p-3 bg-[#131620] rounded-xl border border-[#252A3C] space-y-2.5">
              <span className="text-[11px] font-semibold text-gray-300 block">Animations</span>

              <div>
                <label className="text-[10px] text-gray-500 block mb-1">Animation Type</label>
                <select
                  value={globalStyle.animationType}
                  onChange={(e) =>
                    updateGlobalCaptionStyle({
                      animationType: e.target.value as CaptionAnimationType,
                    })
                  }
                  className="w-full bg-[#181B26] border border-[#2E3448] rounded px-2 py-1 text-xs text-white"
                >
                  {animationOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] text-gray-500 block mb-1">
                  Animation Intensity ({globalStyle.animationIntensity.toFixed(1)}x)
                </label>
                <input
                  type="range"
                  min={0.5}
                  max={2.0}
                  step={0.1}
                  value={globalStyle.animationIntensity}
                  onChange={(e) =>
                    updateGlobalCaptionStyle({
                      animationIntensity: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-indigo-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: INDIVIDUAL CAPTION STYLING */}
        {activeTab === 'individual' && selectedSegment && (
          <div className="space-y-3">
            <div className="p-3 bg-indigo-950/40 rounded-xl border border-indigo-800 space-y-2">
              <span className="text-[10px] font-mono text-indigo-400 block font-bold">
                Selected Clip: {selectedSegment.id}
              </span>
              <p className="text-xs text-gray-200 italic">"{selectedSegment.text}"</p>
              <button
                onClick={() => updateSegmentStyleOverride(selectedSegment.id, null)}
                className="w-full py-1 bg-[#1E2230] hover:bg-indigo-600/40 text-gray-300 hover:text-white rounded text-[11px] font-medium flex items-center justify-center gap-1 transition-colors"
              >
                <RotateCcw size={12} /> Reset to Global Style
              </button>
            </div>

            {/* Individual Overrides */}
            <div className="p-3 bg-[#131620] rounded-xl border border-[#252A3C] space-y-3">
              <span className="text-[11px] font-semibold text-gray-300 block">Clip Overrides</span>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-gray-500 block mb-1">Text Color</label>
                  <input
                    type="color"
                    value={selectedSegment.styleOverride?.textColor || globalStyle.textColor}
                    onChange={(e) =>
                      updateSegmentStyleOverride(selectedSegment.id, {
                        textColor: e.target.value,
                      })
                    }
                    className="w-7 h-7 rounded bg-transparent cursor-pointer"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 block mb-1">Highlight Color</label>
                  <input
                    type="color"
                    value={
                      selectedSegment.styleOverride?.highlightColor || globalStyle.highlightColor
                    }
                    onChange={(e) =>
                      updateSegmentStyleOverride(selectedSegment.id, {
                        highlightColor: e.target.value,
                      })
                    }
                    className="w-7 h-7 rounded bg-transparent cursor-pointer"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-gray-500 block mb-1">
                  Font Size ({selectedSegment.styleOverride?.fontSize || globalStyle.fontSize}px)
                </label>
                <input
                  type="range"
                  min={20}
                  max={90}
                  value={selectedSegment.styleOverride?.fontSize || globalStyle.fontSize}
                  onChange={(e) =>
                    updateSegmentStyleOverride(selectedSegment.id, {
                      fontSize: parseInt(e.target.value, 10),
                    })
                  }
                  className="w-full accent-indigo-500"
                />
              </div>

              <div>
                <label className="text-[10px] text-gray-500 block mb-1">Clip Animation</label>
                <select
                  value={
                    selectedSegment.styleOverride?.animationType || globalStyle.animationType
                  }
                  onChange={(e) =>
                    updateSegmentStyleOverride(selectedSegment.id, {
                      animationType: e.target.value as CaptionAnimationType,
                    })
                  }
                  className="w-full bg-[#181B26] border border-[#2E3448] rounded px-2 py-1 text-xs text-white"
                >
                  {animationOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer: Export Subtitle Files */}
      {captions && captions.segments?.length > 0 && (
        <div className="p-3 border-t border-[#2A2F3A] bg-[#141720] flex items-center justify-between gap-2">
          <span className="text-[11px] text-gray-400 font-medium">Export Subtitles:</span>
          <div className="flex gap-2">
            <button
              onClick={() => exportSrt()}
              className="px-2.5 py-1 bg-[#1E2230] hover:bg-[#282E40] text-gray-200 hover:text-white rounded text-xs font-mono font-medium flex items-center gap-1 border border-[#2D3346] shadow transition-colors cursor-pointer"
              title="Download standard SRT subtitle file"
            >
              <Download size={11} /> .SRT
            </button>
            <button
              onClick={() => exportVtt()}
              className="px-2.5 py-1 bg-[#1E2230] hover:bg-[#282E40] text-gray-200 hover:text-white rounded text-xs font-mono font-medium flex items-center gap-1 border border-[#2D3346] shadow transition-colors cursor-pointer"
              title="Download standard WebVTT subtitle file"
            >
              <Download size={11} /> .VTT
            </button>
          </div>
        </div>
      )}

      {/* Custom Preset Name Modal */}
      {showSaveCustomModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#1A1D27] border border-[#2D3244] rounded-xl p-4 w-80 shadow-2xl space-y-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Save Custom Preset
            </h3>
            <p className="text-xs text-gray-400">
              Save current typography, colors, animations, and layout as a reusable preset.
            </p>
            <input
              type="text"
              placeholder="e.g. My Viral Gradient Pop"
              value={customPresetName}
              onChange={(e) => setCustomPresetName(e.target.value)}
              className="w-full bg-[#12141C] border border-[#2D3244] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              autoFocus
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowSaveCustomModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCustomPreset}
                disabled={!customPresetName.trim()}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow"
              >
                Save Preset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Caption Text & Timings Editor Modal */}
      <CaptionTextEditorModal
        isOpen={isEditorModalOpen}
        onClose={() => setIsEditorModalOpen(false)}
      />
    </div>
  );
};
