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
                _logger.LogInformation("No releases found");
                return new FikaUpdateInfo { 
                    CurrentVersion = currentVersion,
                    LatestVersion = currentVersion, 
                    UpdateAvailable = false 
                };
            }
            
            // Get the latest release
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
            
            // Search for Fika download asset
            string downloadUrl = "";
            string targetFileName = $"Fika.Server.Release.{ExtractVersionFromTag(tagName)}.zip";
            
            if (latestRelease.TryGetProperty("assets", out var assets) && assets.ValueKind == JsonValueKind.Array)
            {
                foreach (var asset in assets.EnumerateArray())
                {
                    if (asset.TryGetProperty("name", out var assetNameProp) && assetNameProp.ValueKind == JsonValueKind.String)
                    {
                        var assetName = assetNameProp.GetString() ?? "";
                        
                        // Look for specific Fika asset names
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
            
            // Fallback: use any ZIP file if no Fika-specific asset found
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
                                _logger.LogInformation("Using fallback ZIP asset: {DownloadUrl}", downloadUrl);
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
                
            // Extract version information
            var latestVersion = ExtractVersionFromTag(tagName);
            if (latestVersion == "unknown" || latestVersion == "0.0.0")
            {
                latestVersion = ExtractVersionFromFileName(Path.GetFileName(downloadUrl));
            }
            
            var updateAvailable = IsNewerVersion(latestVersion, currentVersion);
            
            if (updateAvailable)
            {
                _logger.LogInformation(
                    "Fika version update available: {CurrentVersion} → {LatestVersion}", 
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
        // Create update flag to prevent container shutdown
        await File.WriteAllTextAsync("/tmp/updating.flag", "Fika update in progress");
        _logger.LogInformation("Update flag created - Fika update starting");
        
        _logger.LogInformation("Starting Fika update process: {DownloadUrl}", downloadUrl);
        
        try
        {
            // Stop SPT server before update
            _logger.LogInformation("Stopping SPT server...");
            await StopSptServerAsync();
            await Task.Delay(5000);

            // Download the update
            _logger.LogInformation("Downloading Fika update...");
            var tempZipPath = Path.Combine(Path.GetTempPath(), $"fika-update-{Guid.NewGuid()}.zip");
            
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

            try
            {
                // Extract and install the update
                _logger.LogInformation("Extracting Fika update...");
                
                var extractDir = Path.Combine(Path.GetTempPath(), $"fika-extract-{Guid.NewGuid()}");
                Directory.CreateDirectory(extractDir);
                
                ZipFile.ExtractToDirectory(tempZipPath, extractDir, true);
                _logger.LogInformation("Extracted to: {ExtractDir}", extractDir);

                // Copy files to SPT directory
                _logger.LogInformation("Installing Fika files...");
                CopyDirectory(extractDir, _sptServerDir, true);
                _logger.LogInformation("Fika files installed successfully");

                // Update version information
                var fileName = Path.GetFileNameWithoutExtension(downloadUrl);
                var latestVersion = ExtractVersionFromTag(fileName);
                SaveFikaVersion(latestVersion);
                _logger.LogInformation("Fika version updated to: {LatestVersion}", latestVersion);

                // Restart SPT server
                _logger.LogInformation("Restarting SPT server...");
                await StartSptServerAsync();

                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error installing Fika");
                return false;
            }
            finally
            {
                // Cleanup temporary files
                try
                {
                    if (File.Exists(tempZipPath))
                        File.Delete(tempZipPath);
                }
                catch (Exception cleanEx)
                {
                    _logger.LogWarning(cleanEx, "Cleanup error");
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Fika update failed");
            return false;
        }
        finally
        {
            // Remove update flag to resume normal monitoring
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

    /// <summary>
    /// Extracts version number from filename using regex patterns
    /// </summary>
    private string ExtractVersionFromFileName(string fileName)
    {
        if (string.IsNullOrEmpty(fileName))
            return "unknown";
        
        // Try specific Fika filename pattern first
        var match = Regex.Match(fileName, @"Fika\.Server\.Release\.([\d\.]+)\.zip", RegexOptions.IgnoreCase);
        if (match.Success)
        {
            return match.Groups[1].Value;
        }
        
        // Fallback to generic version pattern
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