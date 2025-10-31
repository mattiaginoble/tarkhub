import React from "react";
import { Info } from "lucide-react";

interface FikaUpdateBannerProps {
  fikaUpdate?: {
    updateAvailable: boolean;
    currentVersion: string;
    latestVersion: string;
  };
  isUpdatingFika?: boolean;
  updateFika?: () => void;
}

const FikaUpdateBanner: React.FC<FikaUpdateBannerProps> = ({
  fikaUpdate,
  isUpdatingFika,
  updateFika,
}) => {
  if (!fikaUpdate?.updateAvailable) return null;

  return (
    <div className="update-banner fika-banner top-banner">
      <div className="banner-content">
        <Info className="banner-icon" size={24} />
        <div className="banner-text">
          <h3>Fika Update Available!</h3>
          <p>
            Current: {fikaUpdate.currentVersion} → New:{" "}
            {fikaUpdate.latestVersion}
          </p>
        </div>
        <button
          onClick={updateFika}
          disabled={isUpdatingFika}
          className="btn-primary"
        >
          {isUpdatingFika ? "Updating..." : "Update Fika"}
        </button>
      </div>
    </div>
  );
};

export default FikaUpdateBanner;
