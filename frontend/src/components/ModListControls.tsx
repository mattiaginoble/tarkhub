import React, { useRef, useEffect, useState } from "react";
import {
  PlusIcon,
  EditIcon,
  Trash2Icon,
  DownloadIcon,
  UploadIcon,
  XCircleIcon,
} from "lucide-react";

interface ModListControlsProps {
  currentList: string;
  modLists: string[];
  handleListChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  addList: () => void;
  renameList: () => void;
  deleteList: () => void;
  downloadList: () => void;
  importList: () => void;
  clearInstalledCache: () => void;
}

const ModListControls: React.FC<ModListControlsProps> = ({
  currentList,
  modLists,
  handleListChange,
  addList,
  renameList,
  deleteList,
  downloadList,
  importList,
  clearInstalledCache,
}) => {
  const selectRef = useRef<HTMLSelectElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [selectWidth, setSelectWidth] = useState<number | null>(null);

  // Calculate dynamic width for select based on content
  useEffect(() => {
    if (measureRef.current && selectRef.current) {
      const text = currentList || "-- Select a list --";
      measureRef.current.textContent = text;

      const textWidth = measureRef.current.offsetWidth;
      const paddingLeft = 12;
      const paddingRight = 32;
      const border = 2;

      const totalWidth = textWidth + paddingLeft + paddingRight + border;
      const finalWidth = Math.min(Math.max(totalWidth, 120), 300);

      setSelectWidth(finalWidth);
    }
  }, [currentList, modLists]);

  return (
    <div className="modlist-controls-card">
      {/* Hidden element for text measurement */}
      <span
        ref={measureRef}
        style={{
          position: "absolute",
          visibility: "hidden",
          whiteSpace: "nowrap",
          fontSize: "0.875rem",
          fontFamily: "inherit",
          fontWeight: "inherit",
          letterSpacing: "inherit",
        }}
      />

      <div className="modlist-controls-row">
        <div className="control-group control-group-main">
          <span className="control-label">Load List:</span>
          <select
            ref={selectRef}
            value={currentList}
            onChange={handleListChange}
            className="list-select-input"
            style={selectWidth ? { width: `${selectWidth}px` } : {}}
          >
            <option value="" style={{ display: "none" }}>
              -- Select a list --
            </option>
            {modLists.map((listName: string) => (
              <option key={listName} value={listName}>
                {listName}
              </option>
            ))}
          </select>
        </div>

        <div className="control-group control-group-buttons">
          <button onClick={addList} className="btn-secondary">
            <PlusIcon size={18} />
            New List
          </button>
          <button
            onClick={renameList}
            disabled={!currentList}
            className="btn-secondary"
          >
            <EditIcon size={18} />
            Rename
          </button>
          <button
            onClick={deleteList}
            disabled={!currentList}
            className="btn-secondary"
          >
            <Trash2Icon size={18} />
            Delete
          </button>
          <button
            onClick={downloadList}
            disabled={!currentList}
            className="btn-secondary"
          >
            <DownloadIcon size={18} />
            Export
          </button>
          <button onClick={importList} className="btn-secondary">
            <UploadIcon size={18} />
            Import
          </button>
          <button onClick={clearInstalledCache} className="btn-secondary">
            <XCircleIcon size={18} />
            Clear Cache
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModListControls;
