import React from "react";
import { SptVersion } from "../hooks/types";
import { useModal } from "../components/ModalContext";

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
  const { showModal } = useModal();

  if (!currentList) return null;

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newVersion = e.target.value;
    handleSptVersionChange(e);

    showModal({
      type: "success",
      title: "SPT Version",
      message: `SPT version changed to ${newVersion} for list "${currentList}"`,
      duration: 3000,
    });
  };

  return (
    <div className="version-row">
      <select
        value={selectedSptVersion}
        onChange={handleChange}
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
