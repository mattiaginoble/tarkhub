import React from "react";
import { Info } from "lucide-react";

interface SPTUpdateBannerProps {
  sptUpdate?: {
    updateAvailable: boolean;
    currentVersion: string;
    latestVersion: string;
  };
  isUpdatingSpt?: boolean;
  updateSpt?: () => void;
}

const SPTUpdateBanner: React.FC<SPTUpdateBannerProps> = ({
  sptUpdate,
  isUpdatingSpt,
  updateSpt,
}) => {
  if (!sptUpdate?.updateAvailable) return null;

  return (
    <div className="update-banner spt-banner top-banner">
      <div className="banner-content">
        <Info className="banner-icon" size={24} />
        <div className="banner-text">
          <h3>SPT Update Available!</h3>
          <p>
            Current: {sptUpdate.currentVersion} → New: {sptUpdate.latestVersion}
          </p>
        </div>
        <button
          onClick={updateSpt}
          disabled={isUpdatingSpt}
          className="btn-primary"
        >
          {isUpdatingSpt ? "Updating..." : "Update SPT"}
        </button>
      </div>
    </div>
  );
};

export default SPTUpdateBanner;
