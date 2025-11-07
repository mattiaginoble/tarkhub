import React from "react";
import {
  PackageIcon,
  Trash2Icon,
  DownloadIcon,
  RefreshCwIcon,
  CheckCircleIcon,
  ServerIcon,
  MonitorIcon,
  CpuIcon,
} from "lucide-react";
import { getVersionMajor } from "../utils/versionUtils";
import { Mod } from "../hooks/types";

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
  const modSptConstraint = mod.sptVersionConstraint || "N/A";
  const isUnknown = modSptConstraint === "N/A";
  const modMajor = isUnknown ? 0 : getVersionMajor(modSptConstraint);
  const selectedSptMajor = getVersionMajor(selectedSptVersion);

  let compatibilityColor;
  if (isUnknown) {
    compatibilityColor = "#f59e0b"; // giallo - sconosciuto
  } else if (modMajor === selectedSptMajor) {
    compatibilityColor = "#10b981"; // verde - compatibile
  } else {
    compatibilityColor = "#dc2626"; // rosso - incompatibile
  }

  const showUpdateIndicator = hasUpdate || mod.updateAvailable;
  const latestVersion = mod.latestVersion || mod.version;

  // Funzione per ottenere le informazioni sul tipo di mod
  const getModTypeInfo = () => {
    switch (mod.modType) {
      case "server":
        return {
          icon: <ServerIcon size={14} />,
          label: "Server Mod",
          color: "#3b82f6", // blue
          bgColor: "rgba(59, 130, 246, 0.1)",
        };
      case "client":
        return {
          icon: <MonitorIcon size={14} />,
          label: "Client Mod",
          color: "#8b5cf6", // purple
          bgColor: "rgba(139, 92, 246, 0.1)",
        };
      case "both":
        return {
          icon: <CpuIcon size={14} />,
          label: "Server & Client",
          color: "#06b6d4", // cyan
          bgColor: "rgba(6, 182, 212, 0.1)",
        };
      default:
        return {
          icon: <PackageIcon size={14} />,
          label: "Unknown Type",
          color: "#6b7280", // gray
          bgColor: "rgba(107, 114, 128, 0.1)",
        };
    }
  };

  const modTypeInfo = getModTypeInfo();

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
                  isInstalled ? "btn-disabled" : "btn-primary"
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
                    <span className="btn-text">Installed</span>
                  </>
                ) : (
                  <>
                    <DownloadIcon size={16} />
                    <span className="btn-text">Download</span>
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
                <span className="btn-text">Update</span>
              </button>

              <button
                onClick={() => removeMod(mod.id, mod.name)}
                className="btn btn-danger"
                title="Remove mod from list"
              >
                <Trash2Icon size={16} />
                <span className="btn-text">Remove</span>
              </button>
            </div>
          </div>
          <div className="mod-teaser">
            <span>{mod.teaser || "No description"}</span>
          </div>
          <div className="mod-meta">
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
                SPT: {modSptConstraint}
              </span>
            </div>
            <div className="mod-status">
              <span
                className="mod-type-tag"
                style={{
                  color: modTypeInfo.color,
                  backgroundColor: modTypeInfo.bgColor,
                }}
              >
                {modTypeInfo.icon}
                {modTypeInfo.label}
              </span>
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
