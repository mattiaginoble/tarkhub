import { NavigateFunction } from "react-router-dom";

export interface UseModManagerProps {
  listName?: string;
  navigate: NavigateFunction;
}

export interface Mod {
  id: number;
  name: string;
  version: string;
  latestVersion?: string;
  updateAvailable?: boolean;
  detailUrl: string;
  sptVersionConstraint?: string;
  thumbnail?: string;
  teaser?: string;
  contentLength?: string;
}

export interface SptVersion {
  version: string;
  displayName: string;
}

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  downloadUrl: string;
  updateAvailable: boolean;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ModDownloadResult {
  modId: number;
  success: boolean;
  error?: string;
}

export interface ModOperationResult {
  success: boolean;
  message?: string;
  mod?: Mod;
}
