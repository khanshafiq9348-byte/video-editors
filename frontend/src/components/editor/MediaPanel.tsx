import React, { useRef, useState } from 'react';
import {
  Upload,
  FolderUp,
  Image as ImageIcon,
  Video as VideoIcon,
  Music,
  Trash2,
  FileText,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Globe,
  Radio,
} from 'lucide-react';
import { useEditorStore } from '../../stores/editorStore';
import { api } from '../../services/api';
import { extractFilesFromDataTransfer } from '../../utils/fileUploadHelper';

export const MediaPanel: React.FC = () => {
  const {
    currentProject,
    loadProject,
    statusMessage,
    setStatusMessage,
    setErrorMessage,
  } = useEditorStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const [scriptText, setScriptText] = useState(currentProject?.script || '');
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    percent: number;
    current: number;
    total: number;
  } | null>(null);
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);

  React.useEffect(() => {
    if (currentProject) {
      setScriptText(currentProject.script || '');
    }
  }, [currentProject?.id]);

  if (!currentProject) return null;

  const isMultiLanguage = currentProject.settings?.project_mode === 'multi_language';
  const visualAssets = currentProject.assets.filter((a) => a.type === 'image' || a.type === 'video');
  const audioAssets = currentProject.assets.filter((a) => a.type === 'audio');
  const activeAudioId = currentProject.settings?.active_audio_id || audioAssets[0]?.id;

  const handleProcessFiles = async (files: File[]) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    setUploadWarning(null);
    setUploadProgress({ percent: 0, current: 0, total: files.length });

    try {
      setStatusMessage(`Processing & uploading ${files.length} file(s)...`);

      // Separate voiceover audio files from visual files if any
      const audioFiles: File[] = [];
      const mediaFiles: File[] = [];

      const audioExts = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.wma'];
      for (const f of files) {
        const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
        if (audioExts.includes(ext)) {
          audioFiles.push(f);
        } else {
          mediaFiles.push(f);
        }
      }

      // Upload visuals in chunked batches
      let skippedUnsupportedCount = 0;
      const skippedNames: string[] = [];

      if (mediaFiles.length > 0) {
        const res = await api.uploadMedia(
          currentProject.id,
          mediaFiles,
          (pct, curr, tot) => {
            setUploadProgress({ percent: pct, current: curr, total: tot + audioFiles.length });
          }
        );

        if (res.unsupported && res.unsupported.length > 0) {
          skippedUnsupportedCount += res.unsupported.length;
          skippedNames.push(...res.unsupported.map((u) => u.filename));
        }
      }

      // Upload audio files if any
      for (let i = 0; i < audioFiles.length; i++) {
        const af = audioFiles[i];
        setStatusMessage(`Uploading audio: ${af.name}...`);
        await api.uploadAudio(currentProject.id, af, {
          replace: !isMultiLanguage && i === 0,
          language: isMultiLanguage ? `Track ${audioAssets.length + i + 1}` : undefined,
        });
      }

      await loadProject(currentProject.id);

      if (skippedUnsupportedCount > 0) {
        setUploadWarning(
          `Uploaded files successfully. Note: ${skippedUnsupportedCount} unsupported file(s) skipped (${skippedNames.slice(0, 3).join(', ')}${skippedNames.length > 3 ? '...' : ''}).`
        );
        setStatusMessage('Upload complete with notes.');
      } else {
        setStatusMessage(`Successfully uploaded ${files.length} file(s)!`);
      }
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || 'Failed to upload files');
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleProcessFiles(Array.from(e.target.files));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFolderInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleProcessFiles(Array.from(e.target.files));
    }
    if (folderInputRef.current) folderInputRef.current.value = '';
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setIsUploading(true);
    try {
      setStatusMessage(`Uploading voiceover ${file.name}...`);
      await api.uploadAudio(currentProject.id, file, {
        replace: !isMultiLanguage,
      });
      await loadProject(currentProject.id);
      setStatusMessage('Voiceover uploaded successfully');
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || 'Failed to upload audio');
    } finally {
      setIsUploading(false);
      if (audioInputRef.current) audioInputRef.current.value = '';
    }
  };

  const handleSelectActiveAudio = async (assetId: string) => {
    try {
      setStatusMessage('Switching active voiceover track...');
      await api.setActiveAudio(currentProject.id, assetId);
      await loadProject(currentProject.id);
      setStatusMessage('Active voiceover track updated!');
    } catch (err: any) {
      setErrorMessage('Failed to set active audio track');
    }
  };

  const handleDeleteAsset = async (assetId: string) => {
    try {
      await api.deleteAsset(currentProject.id, assetId);
      await loadProject(currentProject.id);
    } catch (err: any) {
      setErrorMessage('Failed to delete asset');
    }
  };

  const handleSaveScript = async () => {
    try {
      setStatusMessage('Saving script and aligning voiceover...');
      await api.updateProject(currentProject.id, { script: scriptText });
      const hasAudio = currentProject.assets.some((a) => a.type === 'audio');
      if (hasAudio) {
        setStatusMessage('Re-aligning sentences with script...');
        await api.analyzeAudio(currentProject.id);
        const hasVisuals = currentProject.assets.some((a) => a.type === 'image' || a.type === 'video');
        if (hasVisuals) {
          setStatusMessage('Aligning visuals to script sentences...');
          await api.generateTimeline(currentProject.id);
        }
      }
      await loadProject(currentProject.id);
      setStatusMessage('Script saved & visuals aligned to sentences!');
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || 'Failed to save script');
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    try {
      const extracted = await extractFilesFromDataTransfer(e.dataTransfer);
      if (extracted.length > 0) {
        await handleProcessFiles(extracted);
      }
    } catch (err) {
      setErrorMessage('Failed to read dropped files or folders');
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex flex-col h-full bg-[#181B24] border-r border-[#2A2F3A] w-80 select-none relative ${
        isDragging ? 'ring-2 ring-indigo-500 bg-indigo-950/20' : ''
      }`}
    >
      {/* Drag Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-[#181B24]/90 backdrop-blur-sm flex flex-col items-center justify-center border-2 border-dashed border-indigo-500 text-indigo-400 p-6 text-center">
          <FolderUp size={44} className="mb-3 animate-bounce" />
          <div className="text-sm font-bold text-white mb-1">Drop Files or Folder Here</div>
          <div className="text-xs text-gray-400">
            Accepts images, video clips, and voiceovers. Folders will be traversed automatically.
          </div>
        </div>
      )}

      {/* Header */}
      <div className="p-4 border-b border-[#2A2F3A] flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Media Library</h2>
        <div className="flex items-center gap-1.5">
          {isMultiLanguage ? (
            <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-900/60 border border-purple-500/40 text-purple-300">
              <Globe size={10} /> Multi-Lang
            </span>
          ) : (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">
              Single-Lang
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Upload Buttons & Inputs */}
        <div className="space-y-2">
          {/* Individual & Multiple Files Input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileInputChange}
            multiple
            accept="image/*,video/*,audio/*"
            className="hidden"
          />

          {/* Folder Upload Input with webkitdirectory */}
          <input
            type="file"
            ref={folderInputRef}
            onChange={handleFolderInputChange}
            multiple
            // @ts-ignore
            webkitdirectory=""
            directory=""
            className="hidden"
          />

          {/* Audio Only Input */}
          <input
            type="file"
            ref={audioInputRef}
            onChange={handleAudioUpload}
            accept="audio/*"
            className="hidden"
          />

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex items-center justify-center gap-1.5 py-2 px-3 bg-[#232733] hover:bg-[#2e3343] border border-[#343a49] rounded-lg text-xs font-semibold text-gray-200 transition-colors shadow-sm disabled:opacity-50"
              title="Select multiple images and video clips"
            >
              <Upload size={14} className="text-indigo-400" />
              Upload Files
            </button>

            <button
              onClick={() => folderInputRef.current?.click()}
              disabled={isUploading}
              className="flex items-center justify-center gap-1.5 py-2 px-3 bg-[#232733] hover:bg-[#2e3343] border border-[#343a49] rounded-lg text-xs font-semibold text-gray-200 transition-colors shadow-sm disabled:opacity-50"
              title="Upload an entire folder of images and video clips"
            >
              <FolderUp size={14} className="text-amber-400" />
              Select Folder
            </button>
          </div>

          <button
            onClick={() => audioInputRef.current?.click()}
            disabled={isUploading}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-[#232733] hover:bg-[#2e3343] border border-[#343a49] rounded-lg text-xs font-semibold text-gray-200 transition-colors shadow-sm disabled:opacity-50"
          >
            <Music size={14} className="text-emerald-400" />
            {isMultiLanguage
              ? 'Add Voiceover Track'
              : audioAssets.length > 0
              ? 'Replace Voiceover'
              : 'Upload Voiceover'}
          </button>
        </div>

        {/* Upload Progress Bar */}
        {isUploading && uploadProgress && (
          <div className="p-3 bg-[#11131a] rounded-lg border border-[#2e3343] space-y-2 animate-in fade-in">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-indigo-400 font-medium">
                <Loader2 size={13} className="animate-spin" /> Uploading assets...
              </span>
              <span className="text-gray-400 font-mono text-[11px]">
                {uploadProgress.percent}% ({uploadProgress.current}/{uploadProgress.total})
              </span>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-indigo-500 h-full transition-all duration-300"
                style={{ width: `${Math.max(5, uploadProgress.percent)}%` }}
              />
            </div>
          </div>
        )}

        {/* Upload Warning / Skipped notice */}
        {uploadWarning && (
          <div className="p-2.5 bg-amber-950/40 border border-amber-800/60 rounded-lg text-amber-300 text-[11px] flex items-start gap-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <div className="flex-1 leading-snug">{uploadWarning}</div>
          </div>
        )}

        {/* Dropzone Hint */}
        <div className="border border-dashed border-[#2a2f3a] rounded-lg p-3 text-center text-[11px] text-gray-500 hover:border-gray-500 transition-colors cursor-pointer"
             onClick={() => fileInputRef.current?.click()}>
          Drag & drop images, video clips, or complete folders here
        </div>

        {/* Voiceover Section */}
        <div>
          <div className="text-xs font-semibold text-gray-400 mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Music size={14} /> Voiceover Audio ({audioAssets.length})
            </span>
          </div>

          {audioAssets.length === 0 ? (
            <div className="p-3 bg-[#11131a]/50 rounded-lg border border-dashed border-[#2a2f3a] text-center text-xs text-gray-500">
              No voiceover uploaded
            </div>
          ) : (
            <div className="space-y-2">
              {audioAssets.map((a) => {
                const isActive = a.id === activeAudioId;
                return (
                  <div
                    key={a.id}
                    onClick={() => isMultiLanguage && handleSelectActiveAudio(a.id)}
                    className={`p-2.5 bg-[#11131a] rounded-lg border transition-all flex items-center justify-between ${
                      isActive
                        ? 'border-emerald-500/60 bg-emerald-950/20'
                        : 'border-[#2e3343] hover:border-gray-600 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate flex-1 pr-2">
                      {isMultiLanguage && (
                        <div
                          className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                            isActive
                              ? 'border-emerald-400 bg-emerald-500'
                              : 'border-gray-600'
                          }`}
                        >
                          {isActive && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                        </div>
                      )}
                      <div className="truncate">
                        <div className="text-xs font-medium text-gray-200 truncate flex items-center gap-1">
                          {a.original_name}
                          {isActive && (
                            <span className="text-[9px] px-1.5 py-0.2 bg-emerald-800/80 text-emerald-200 rounded font-bold">
                              ACTIVE
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-gray-500">
                          {a.duration ? `${a.duration.toFixed(1)}s` : 'Audio track'}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteAsset(a.id);
                      }}
                      className="text-gray-500 hover:text-red-400 p-1 rounded transition-colors"
                      title="Delete audio track"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Visual Assets (Images & Video Clips) List */}
        <div>
          <div className="text-xs font-semibold text-gray-400 mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <ImageIcon size={14} /> Visual Media ({visualAssets.length})
            </span>
            <span className="text-[10px] text-gray-500">Naturally sorted (1, 2, 3...)</span>
          </div>

          {visualAssets.length === 0 ? (
            <div className="p-4 bg-[#11131a]/50 rounded-lg border border-dashed border-[#2a2f3a] text-center text-xs text-gray-500">
              Upload images or video clips to construct video scenes
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {visualAssets.map((asset, idx) => {
                const isVideo = asset.type === 'video';
                return (
                  <div
                    key={asset.id}
                    className="group relative aspect-video bg-[#11131a] rounded-md overflow-hidden border border-[#2e3343] hover:border-indigo-500 transition-colors"
                  >
                    {isVideo ? (
                      <video
                        src={asset.url}
                        muted
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <img
                        src={asset.url}
                        alt={asset.original_name}
                        className="w-full h-full object-cover"
                      />
                    )}

                    {/* Type Badge */}
                    <div className="absolute top-1 left-1 z-10">
                      {isVideo ? (
                        <span className="px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[9px] font-bold text-amber-300 flex items-center gap-0.5">
                          <VideoIcon size={9} /> VIDEO
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[9px] font-bold text-gray-300">
                          #{idx + 1}
                        </span>
                      )}
                    </div>

                    {/* Delete hover overlay */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 z-20">
                      <button
                        onClick={() => handleDeleteAsset(asset.id)}
                        className="text-white hover:text-red-400 p-1.5 bg-black/50 rounded-md transition-colors"
                        title="Delete asset"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    {/* Filename caption */}
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-1 text-[10px] text-gray-300 truncate z-10 font-mono">
                      {asset.original_name}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Script Section */}
        <div>
          <div className="text-xs font-semibold text-gray-400 mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <FileText size={14} /> Script (Optional)
            </span>
            <button
              onClick={handleSaveScript}
              className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Save & Align
            </button>
          </div>
          <textarea
            value={scriptText}
            onChange={(e) => setScriptText(e.target.value)}
            placeholder="Paste voiceover script here for sentence alignment..."
            className="w-full h-24 bg-[#11131a] border border-[#2e3343] rounded-lg p-2.5 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none font-mono"
          />
        </div>
      </div>
    </div>
  );
};
