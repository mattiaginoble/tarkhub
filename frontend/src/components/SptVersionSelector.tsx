import React from "react";
import { SptVersion } from "../hooks/useModManager";

interface SptVersionSelectorProps {
  currentList: string;
  sptVersions: SptVersion[];
  selectedSptVersion: string;
  handleSptVersionChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
}

const SptVersionSelector: React.FC<SptVersionSelectorProps> = ({
  currentList,
  sptVersions,
  selectedSptVersion,
  handleSptVersionChange,
}) => {
  if (!currentList) return null;

  return (
    <div className="version-row">
      <span className="version-label">Version installed SPT:</span>
      <select
        value={selectedSptVersion}
        onChange={handleSptVersionChange}
        className="version-input"
      >
        {sptVersions.map((spt) => (
          <option key={spt.version} value={spt.version}>
            {spt.version}
          </option>
        ))}
      </select>
    </div>
  );
};

export default SptVersionSelector;
