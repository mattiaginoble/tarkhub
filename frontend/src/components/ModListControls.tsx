import React, { useRef, useEffect, useState } from "react";
import {
  PlusIcon,
  EditIcon,
  Trash2Icon,
  DownloadIcon,
  UploadIcon,
} from "lucide-react";
import SptVersionSelector from "./SptVersionSelector";

interface ModListControlsProps {
  currentList: string;
  modLists: string[];
  onListChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  onAddList: (newListName?: string) => void;
  onRenameList: (newName?: string) => void;
  onDeleteList: () => void;
  onExportList: () => void;
  onImportList: () => void;
  selectedSptVersion: string;
  sptVersions: any[];
  handleSptVersionChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
}

const ModListControls: React.FC<ModListControlsProps> = ({
  currentList,
  modLists,
  onListChange,
  onAddList,
  onRenameList,
  onDeleteList,
  onExportList,
  onImportList,
  selectedSptVersion,
  sptVersions,
  handleSptVersionChange,
}) => {
  const selectRef = useRef<HTMLSelectElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [selectWidth, setSelectWidth] = useState<number>(120);

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

  const hasCurrentList = Boolean(currentList);

  return (
    <div className="modlist-controls-card">
      <span ref={measureRef} className="text-measure" aria-hidden="true" />

      <div className="modlist-controls-row">
        <div className="control-group control-group-main">
          <select
            ref={selectRef}
            id="mod-list-select"
            value={currentList}
            onChange={onListChange}
            className="list-select-input"
            style={{ width: `${selectWidth}px` }}
            aria-label="Select mod list"
            title="Choose which mod list to display"
          >
            <option value="" disabled>
              -- Select a list --
            </option>
            {modLists.map((listName) => (
              <option key={listName} value={listName}>
                {listName}
              </option>
            ))}
          </select>

          <SptVersionSelector
            currentList={currentList}
            sptVersions={sptVersions}
            selectedSptVersion={selectedSptVersion}
            handleSptVersionChange={handleSptVersionChange}
          />
        </div>

        <div className="control-group control-group-buttons">
          <button onClick={() => onAddList()} className="btn btn-primary">
            <PlusIcon size={18} aria-hidden="true" />
            <span className="btn-text">New List</span>
          </button>

          <button
            onClick={() => onRenameList()}
            disabled={!hasCurrentList}
            className="btn btn-secondary"
          >
            <EditIcon size={18} aria-hidden="true" />
            <span className="btn-text">Rename</span>
          </button>
          <button
            onClick={onDeleteList}
            disabled={!hasCurrentList}
            className="btn btn-secondary"
          >
            <Trash2Icon size={18} aria-hidden="true" />
            <span className="btn-text">Delete</span>
          </button>
          <button
            onClick={onExportList}
            disabled={!hasCurrentList}
            className="btn btn-secondary"
          >
            <DownloadIcon size={18} aria-hidden="true" />
            <span className="btn-text">Export</span>
          </button>
          <button onClick={() => onImportList()} className="btn btn-secondary">
            <UploadIcon size={18} aria-hidden="true" />
            <span className="btn-text">Import</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModListControls;
