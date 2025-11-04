import React from "react";
import {
  PackageIcon,
  Trash2Icon,
  DownloadIcon,
  RefreshCwIcon,
  CheckCircleIcon,
} from "lucide-react";
import { getVersionMajor } from "../utils/versionUtils";

interface Mod {
  id: number;
  name: string;
  version: string;
  latestVersion?: string;
  sptVersionConstraint: string;
  thumbnail?: string;
  detailUrl: string;
  teaser?: string;
  contentLength?: string;
  updateAvailable?: boolean;
}

interface ModItemProps {
  mod: Mod;
  isInstalled: boolean;
  downloadMod: (id: number, name: string) => void;
  handleUpdateAndDownload: (id: number, name: string) => void;
  removeMod: (id: number, name: string) => void;
  selectedSptVersion: string;
  hasUpdate: boolean;
}

const ModItem: React.FC<ModItemProps> = ({
  mod,
  isInstalled,
  downloadMod,
  handleUpdateAndDownload,
  removeMod,
  selectedSptVersion,
  hasUpdate,
}) => {
  const modMajor = getVersionMajor(mod.sptVersionConstraint);
  const selectedSptMajor = getVersionMajor(selectedSptVersion);
  const isCompatible = modMajor === selectedSptMajor;
  const compatibilityColor = isCompatible ? "#10b981" : "#dc2626";

  const showUpdateIndicator = hasUpdate || mod.updateAvailable;
  const latestVersion = mod.latestVersion || mod.version;

  return (
    <div className="mod-card">
      <div className="mod-card-header">
        <div className="mod-image">
          <div className="mod-icon">
            {mod.thumbnail ? (
              <img
                src={mod.thumbnail}
                alt={mod.name}
                className="mod-thumbnail"
              />
            ) : (
              <PackageIcon size={24} color="#a1a1aa" />
            )}
          </div>
        </div>
        <div className="mod-main-info">
          <div className="mod-title-row">
            <h3 className="mod-name">
              <a
                href={mod.detailUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mod-link"
              >
                {mod.name}
              </a>
            </h3>
            <div className="mod-actions">
              <button
                onClick={() => downloadMod(mod.id, mod.name)}
                className={`btn ${
                  isInstalled ? "btn-disabled" : "btn-success"
                }`}
                disabled={isInstalled}
                title={
                  isInstalled
                    ? "Already installed - use Update button"
                    : "Download mod"
                }
              >
                {isInstalled ? (
                  <>
                    <CheckCircleIcon size={16} />
                    Installed
                  </>
                ) : (
                  <>
                    <DownloadIcon size={16} />
                    Download
                  </>
                )}
              </button>

              <button
                onClick={() => handleUpdateAndDownload(mod.id, mod.name)}
                className={`btn ${
                  showUpdateIndicator && isInstalled
                    ? "btn-warning"
                    : "btn-disabled"
                }`}
                disabled={!showUpdateIndicator || !isInstalled}
                title={
                  !isInstalled
                    ? "Mod not installed - download first"
                    : showUpdateIndicator
                    ? `Update to ${latestVersion}`
                    : "No updates available"
                }
              >
                <RefreshCwIcon size={16} />
                Update
              </button>

              <button
                onClick={() => removeMod(mod.id, mod.name)}
                className="btn btn-danger"
              >
                <Trash2Icon size={16} />
                Remove
              </button>
            </div>
          </div>

          <div className="mod-version-info">
            <span>
              Version: {mod.version}
              {showUpdateIndicator && (
                <span className="update-available-text">
                  → {latestVersion} available!
                </span>
              )}
            </span>
            <span style={{ color: compatibilityColor }}>
              SPT: {mod.sptVersionConstraint || "~4.0.0"}
            </span>
          </div>

          <div className="mod-meta">
            <div className="mod-teaser">
              <span>{mod.teaser || "No description"}</span>
            </div>
            <div className="mod-status">
              {isInstalled && <span className="installed-tag">Installed</span>}
              {showUpdateIndicator && isInstalled && (
                <span className="update-tag">Update Available</span>
              )}
              <span className="mod-size">{mod.contentLength || "Unknown"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModItem;
