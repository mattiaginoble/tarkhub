using System.Text.RegularExpressions;
using System.IO.Compression;
using ForgeModApi.Models;
using System.Text.Json;

namespace ForgeModApi.Services;

public partial class ModService
{
    #region Fika Updates
    
    public async Task<FikaUpdateInfo> CheckFikaUpdateAsync()
    {
        try
        {
            var currentVersion = GetCurrentFikaVersion();
            var releasesUrl = "https://api.github.com/repos/project-fika/Fika-Server-CSharp/releases";
            var releasesJson = await FetchWithCacheAndRetryAsync(releasesUrl, 3, false);
            
            if (string.IsNullOrEmpty(releasesJson))
            {
                _logger.LogWarning("Failed to fetch Fika releases from GitHub");
                return new FikaUpdateInfo { 
                    CurrentVersion = currentVersion,
                    LatestVersion = currentVersion, 
                    UpdateAvailable = false
                };
            }

            using var doc = JsonDocument.Parse(releasesJson);
            var releasesArray = doc.RootElement.EnumerateArray();
            
            if (!releasesArray.Any())
            {
                return new FikaUpdateInfo { 
                    CurrentVersion = currentVersion,
                    LatestVersion = currentVersion, 
                    UpdateAvailable = false 
                };
            }
            
            var latestRelease = releasesArray.First();
            
            string tagName = "";
            string name = "";
            string body = "";
            
            if (latestRelease.TryGetProperty("tag_name", out var tagProp) && tagProp.ValueKind == JsonValueKind.String)
            {
                tagName = tagProp.GetString() ?? "";
            }
            
            if (latestRelease.TryGetProperty("name", out var nameProp) && nameProp.ValueKind == JsonValueKind.String)
            {
                name = nameProp.GetString() ?? "";
            }
            
            if (latestRelease.TryGetProperty("body", out var bodyProp) && bodyProp.ValueKind == JsonValueKind.String)
            {
                body = bodyProp.GetString() ?? "";
            }
            
            string downloadUrl = "";
            string targetFileName = $"Fika.Server.Release.{ExtractVersionFromTag(tagName)}.zip";
            
            if (latestRelease.TryGetProperty("assets", out var assets) && assets.ValueKind == JsonValueKind.Array)
            {
                foreach (var asset in assets.EnumerateArray())
                {
                    if (asset.TryGetProperty("name", out var assetNameProp) && assetNameProp.ValueKind == JsonValueKind.String)
                    {
                        var assetName = assetNameProp.GetString() ?? "";
                        
                        if (assetName.Equals(targetFileName, StringComparison.OrdinalIgnoreCase) ||
                            assetName.StartsWith("Fika.Server.Release.", StringComparison.OrdinalIgnoreCase) ||
                            assetName.Contains("Fika") && assetName.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
                        {
                            if (asset.TryGetProperty("browser_download_url", out var urlProp) && 
                                urlProp.ValueKind == JsonValueKind.String)
                            {
                                downloadUrl = urlProp.GetString() ?? "";
                                break;
                            }
                        }
                    }
                }
            }
            
            if (string.IsNullOrEmpty(downloadUrl) && 
                latestRelease.TryGetProperty("assets", out var fallbackAssets) && 
                fallbackAssets.ValueKind == JsonValueKind.Array)
            {
                foreach (var asset in fallbackAssets.EnumerateArray())
                {
                    if (asset.TryGetProperty("name", out var assetNameProp) && assetNameProp.ValueKind == JsonValueKind.String)
                    {
                        var assetName = assetNameProp.GetString() ?? "";
                        if (assetName.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
                        {
                            if (asset.TryGetProperty("browser_download_url", out var fallbackUrl) &&
                                fallbackUrl.ValueKind == JsonValueKind.String)
                            {
                                downloadUrl = fallbackUrl.GetString() ?? "";
                                break;
                            }
                        }
                    }
                }
            }
            
            if (string.IsNullOrEmpty(downloadUrl))
            {
                _logger.LogWarning("No download URL available for Fika");
                return new FikaUpdateInfo { 
                    CurrentVersion = currentVersion,
                    LatestVersion = currentVersion, 
                    UpdateAvailable = false 
                };
            }
                
            var latestVersion = ExtractVersionFromTag(tagName);
            if (latestVersion == "unknown" || latestVersion == "0.0.0")
            {
                latestVersion = ExtractVersionFromFileName(Path.GetFileName(downloadUrl));
            }
            
            var updateAvailable = IsNewerVersion(latestVersion, currentVersion);
            
            if (updateAvailable)
            {
                _logger.LogInformation(
                    "Fika version update available: {CurrentVersion} -> {LatestVersion}", 
                    currentVersion, latestVersion
                );
            }
            
            return new FikaUpdateInfo
            {
                UpdateAvailable = updateAvailable,
                CurrentVersion = currentVersion,
                LatestVersion = latestVersion,
                DownloadUrl = downloadUrl,
                ReleaseNotes = body
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error checking Fika update");
            return new FikaUpdateInfo { 
                CurrentVersion = GetCurrentFikaVersion(),
                LatestVersion = "unknown", 
                UpdateAvailable = false
            };
        }
    }

    public async Task<bool> DownloadAndUpdateFikaAsync(string downloadUrl)
    {
        await File.WriteAllTextAsync("/tmp/updating.flag", "Fika update in progress");
        _logger.LogInformation("Update flag created - Fika update starting");
        _logger.LogInformation("Starting Fika update process: {DownloadUrl}", downloadUrl);
        
        if (!HasSufficientDiskSpace(200 * 1024 * 1024))
        {
            _logger.LogError("Insufficient disk space for Fika update");
            return false;
        }

        var backupDir = CreateBackup();
        if (backupDir != null)
        {
            PreserveFikaConfigurations(backupDir);
        }

        string tempZipPath = null;
        string extractDir = null;
        
        try
        {
            _logger.LogInformation("Stopping SPT server...");
            await StopSptServerAsync();
            await Task.Delay(5000);

            _logger.LogInformation("Downloading Fika update...");
            tempZipPath = Path.Combine(Path.GetTempPath(), $"fika-update-{Guid.NewGuid()}.zip");
            
            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromMinutes(5);
            
            var response = await httpClient.GetAsync(downloadUrl);
            
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError("Download error: {StatusCode}", response.StatusCode);
                return false;
            }
                
            await using var stream = await response.Content.ReadAsStreamAsync();
            await using var fileStream = new FileStream(tempZipPath, FileMode.Create);
            await stream.CopyToAsync(fileStream);
            
            _logger.LogInformation("Download completed: {FileSize} bytes", new FileInfo(tempZipPath).Length);

            if (!ValidateDownloadedFile(tempZipPath, 5000000))
            {
                throw new Exception("Downloaded file validation failed");
            }

            try
            {
                _logger.LogInformation("Extracting Fika update...");
                
                extractDir = Path.Combine(Path.GetTempPath(), $"fika-extract-{Guid.NewGuid()}");
                Directory.CreateDirectory(extractDir);
                
                ZipFile.ExtractToDirectory(tempZipPath, extractDir, true);

                _logger.LogInformation("Installing Fika files...");
                CopyDirectory(extractDir, _sptServerDir, true);

                if (!ValidateFikaInstallation())
                {
                    throw new Exception("Fika installation validation failed");
                }

                if (backupDir != null)
                {
                    RestoreFikaConfigurations(backupDir);
                }

                var fileName = Path.GetFileNameWithoutExtension(downloadUrl);
                var latestVersion = ExtractVersionFromTag(fileName);
                SaveFikaVersion(latestVersion);
                _logger.LogInformation("Fika version updated to: {LatestVersion}", latestVersion);

                _logger.LogInformation("Restarting SPT server...");
                await StartSptServerAsync();

                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error installing Fika");
                return false;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Fika update failed");
            
            if (backupDir != null && !PerformRollback(backupDir))
            {
                _logger.LogError("Rollback also failed - manual intervention required");
            }
            
            return false;
        }
        finally
        {
            try
            {
                if (tempZipPath != null && File.Exists(tempZipPath))
                    File.Delete(tempZipPath);
                    
                if (extractDir != null && Directory.Exists(extractDir))
                    Directory.Delete(extractDir, true);
            }
            catch (Exception cleanEx)
            {
                _logger.LogWarning(cleanEx, "Cleanup error");
            }
            
            if (backupDir != null && Directory.Exists(backupDir))
            {
                try
                {
                    Directory.Delete(backupDir, true);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Error cleaning up backup");
                }
            }
            
            try
            {
                if (File.Exists("/tmp/updating.flag"))
                    File.Delete("/tmp/updating.flag");
                _logger.LogInformation("Update flag removed - Fika update completed");
            }
            catch (Exception cleanEx)
            {
                _logger.LogWarning(cleanEx, "Error removing update flag");
            }
        }
    }
    
    #endregion

    #region Fika Update Validation & Safety
    
    private bool ValidateFikaInstallation()
    {
        try
        {
            var requiredPaths = new[]
            {
                Path.Combine(_sptServerDir, "BepInEx", "plugins", "Fika.Core.dll"),
                Path.Combine(_sptServerDir, "BepInEx", "config", "Fika.Core.cfg"),
                Path.Combine(_sptServerDir, "user", "mods", "fika-server")
            };

            foreach (var path in requiredPaths)
            {
                if (!File.Exists(path) && !Directory.Exists(path))
                {
                    _logger.LogWarning("Fika component missing: {Path}", path);
                }
            }

            var coreDllExists = File.Exists(requiredPaths[0]);
            var modDirExists = Directory.Exists(requiredPaths[2]);
            
            if (!coreDllExists && !modDirExists)
            {
                _logger.LogError("No core Fika components found after installation");
                return false;
            }

            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error validating Fika installation");
            return false;
        }
    }

    private bool PreserveFikaConfigurations(string backupDir)
    {
        try
        {
            var configPaths = new[]
            {
                Path.Combine(_sptServerDir, "BepInEx", "config", "Fika.Core.cfg"),
                Path.Combine(_sptServerDir, "user", "mods", "fika-server", "assets", "configs", "fika.jsonc")
            };

            foreach (var configPath in configPaths)
            {
                if (File.Exists(configPath))
                {
                    var backupConfigPath = configPath.Replace(_sptServerDir, backupDir);
                    var backupDirPath = Path.GetDirectoryName(backupConfigPath);
                    
                    if (!string.IsNullOrEmpty(backupDirPath) && !Directory.Exists(backupDirPath))
                    {
                        Directory.CreateDirectory(backupDirPath);
                    }
                    
                    File.Copy(configPath, backupConfigPath, true);
                }
            }

            return true;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error preserving Fika configurations");
            return false;
        }
    }

    private bool RestoreFikaConfigurations(string backupDir)
    {
        try
        {
            var configPaths = new[]
            {
                Path.Combine("BepInEx", "config", "Fika.Core.cfg"),
                Path.Combine("user", "mods", "fika-server", "assets", "configs", "fika.jsonc")
            };

            foreach (var configPath in configPaths)
            {
                var sourcePath = Path.Combine(backupDir, configPath);
                var destPath = Path.Combine(_sptServerDir, configPath);
                
                if (File.Exists(sourcePath) && File.Exists(destPath))
                {
                    var newConfigBackup = destPath + ".new";
                    File.Copy(destPath, newConfigBackup, true);
                    File.Copy(sourcePath, destPath, true);
                }
            }

            return true;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error restoring Fika configurations");
            return false;
        }
    }
    
    #endregion

    #region Fika Support Methods
    
    private string ExtractVersionFromFileName(string fileName)
    {
        if (string.IsNullOrEmpty(fileName))
            return "unknown";
        
        var match = Regex.Match(fileName, @"Fika\.Server\.Release\.([\d\.]+)\.zip", RegexOptions.IgnoreCase);
        if (match.Success)
        {
            return match.Groups[1].Value;
        }
        
        match = Regex.Match(fileName, @"v?(\d+\.\d+\.\d+)\.zip", RegexOptions.IgnoreCase);
        if (match.Success)
        {
            return match.Groups[1].Value;
        }
        
        _logger.LogWarning("Unable to extract version from: {FileName}", fileName);
        return "unknown";
    }
    
    #endregion
}