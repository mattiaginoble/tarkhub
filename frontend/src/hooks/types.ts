import { NavigateFunction } from "react-router-dom";

export interface UseModManagerProps {
  listName?: string;
  navigate: NavigateFunction;
  showModal?: (options: any) => void;
  showConfirmation?: (options: any) => void;
}

export interface Mod {
  id: number;
  name: string;
  version: string;
  latestVersion?: string;
  updateAvailable?: boolean;
  detailUrl: string;
  downloadUrl?: string;
  sptVersionConstraint?: string;
  thumbnail?: string;
  teaser?: string;
  contentLength?: string;
  author?: string;
  updatedAt?: string;
  description?: string;
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
  message?: string;
  ModName?: string;
  requiresUserChoice?: boolean;
  TempExtractPath?: string;
}

export interface ModOperationResult {
  success: boolean;
  message?: string;
  mod?: Mod;
}

export interface DownloadModResponse {
  success: boolean;
  message?: string;
  requiresUserChoice?: boolean;
  TempExtractPath?: string;
  ModName?: string;
  error?: string;
}

export interface CompleteInstallationResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface AddModResponse {
  success: boolean;
  message?: string;
  mod?: Mod;
  error?: string;
}

export interface RemoveModResponse {
  success: boolean;
  message?: string;
  mod?: Mod;
  filesRemoved?: boolean;
  error?: string;
}
