using System.Text.RegularExpressions;
using ForgeModApi.Models;
using System.Text.Json;

namespace ForgeModApi.Services;

public partial class ModService
{
    #region SPT Updates

    /// <summary>
    /// Checks for SPT updates by querying GitHub releases
    /// </summary>
    public async Task<SptUpdateInfo> CheckSptUpdateAsync()
    {
        try
        {
            var currentVersion = GetCurrentSptVersion();
            
            var releasesUrl = "https://api.github.com/repos/sp-tarkov/build/releases";
            
            // USA GITHUB CLIENT (useForgeClient: false)
            var releasesJson = await FetchWithCacheAndRetryAsync(releasesUrl, 3, false);
            
            if (string.IsNullOrEmpty(releasesJson))
            {
                _logger.LogWarning("Failed to fetch SPT releases from GitHub");
                return new SptUpdateInfo { 
                    CurrentVersion = currentVersion,
                    LatestVersion = currentVersion, 
                    UpdateAvailable = false
                };
            }

            using var doc = JsonDocument.Parse(releasesJson);
            var releasesArray = doc.RootElement.EnumerateArray();
            
            if (!releasesArray.Any())
            {
                _logger.LogInformation("No SPT releases found");
                return new SptUpdateInfo { 
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
            
            string downloadUrl;
            if (string.IsNullOrEmpty(body))
            {
                _logger.LogInformation("Empty release body, generating URL from tag");
                downloadUrl = GenerateDownloadUrlFromTag(tagName);
            }
            else
            {
                downloadUrl = ExtractDownloadUrlFromBody(body);
            }
            
            if (string.IsNullOrEmpty(downloadUrl))
            {
                _logger.LogWarning("No download URL available for SPT update");
                return new SptUpdateInfo { 
                    CurrentVersion = currentVersion,
                    LatestVersion = currentVersion, 
                    UpdateAvailable = false 
                };
            }
                
            var latestVersion = ExtractVersionFromTag(tagName);
            var updateAvailable = IsNewerVersion(latestVersion, currentVersion);
            
            if (updateAvailable)
            {
                _logger.LogInformation(
                    "SPT update available: {CurrentVersion} → {LatestVersion}", 
                    currentVersion, latestVersion
                );
            }
            else
            {
                _logger.LogDebug("SPT is up to date: {CurrentVersion}", currentVersion);
            }
            
            return new SptUpdateInfo
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
            _logger.LogError(ex, "Error checking SPT update");
            return new SptUpdateInfo { 
                CurrentVersion = GetCurrentSptVersion(),
                LatestVersion = "unknown", 
                UpdateAvailable = false
            };
        }
    }

    /// <summary>
    /// Downloads and installs SPT update with backup and rollback support
    /// </summary>
    public async Task<bool> DownloadAndUpdateSptAsync(string downloadUrl)
    {
        // Create update flag to prevent container shutdown
        await File.WriteAllTextAsync("/tmp/updating.flag", "SPT update in progress");
        _logger.LogInformation("Update flag created - SPT update starting");
        
        _logger.LogInformation("Starting SPT update: {DownloadUrl}", downloadUrl);
        
        try
        {
            _logger.LogInformation("Stopping SPT server...");
            await StopSptServerAsync();
            await Task.Delay(5000);
            
            // Force kill any remaining SPT processes
            var sptProcesses = System.Diagnostics.Process.GetProcessesByName("SPT.Server.Linux");
            if (sptProcesses.Length > 0)
            {
                _logger.LogInformation("SPT processes still active, force killing...");
                foreach (var process in sptProcesses)
                {
                    try
                    {
                        process.Kill(true);
                        process.WaitForExit(5000);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Error terminating process {ProcessId}", process.Id);
                    }
                }
            }

            _logger.LogInformation("Downloading SPT update...");
            var tempFile = Path.Combine(Path.GetTempPath(), $"spt-update-{Guid.NewGuid()}.7z");
            
            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromMinutes(10);
            
            var response = await httpClient.GetAsync(downloadUrl);
            
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError("Download error: {StatusCode}", response.StatusCode);
                return false;
            }
                
            await using var stream = await response.Content.ReadAsStreamAsync();
            await using var fileStream = new FileStream(tempFile, FileMode.Create);
            await stream.CopyToAsync(fileStream);
            
            _logger.LogInformation("Download completed: {FileSize} bytes", new FileInfo(tempFile).Length);

            // Create backup before updating
            var backupDir = $"{_sptServerDir}-backup-{DateTime.Now:yyyyMMdd-HHmmss}";
            _logger.LogInformation("Creating backup: {BackupDir}", backupDir);
            
            if (Directory.Exists(_sptServerDir))
            {
                try
                {
                    CopyDirectory(_sptServerDir, backupDir, true);
                    _logger.LogInformation("Backup created successfully");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Backup error");
                }
            }

            try
            {
                _logger.LogInformation("Extracting SPT update...");
                
                if (!Directory.Exists(_sptServerDir))
                {
                    Directory.CreateDirectory(_sptServerDir);
                }

                // Extract archive directly to target directory
                var process = new System.Diagnostics.Process
                {
                    StartInfo = new System.Diagnostics.ProcessStartInfo
                    {
                        FileName = "7zr",
                        Arguments = $"x \"{tempFile}\" -o\"{_sptServerDir}\" -y -aoa",
                        RedirectStandardOutput = true,
                        RedirectStandardError = true,
                        UseShellExecute = false,
                        CreateNoWindow = true
                    }
                };
                
                process.Start();
                
                string output = await process.StandardOutput.ReadToEndAsync();
                string error = await process.StandardError.ReadToEndAsync();
                
                process.WaitForExit();
                
                if (process.ExitCode != 0)
                {
                    _logger.LogError("Extraction failed with code: {ExitCode}", process.ExitCode);
                    throw new Exception($"7z extraction failed with code {process.ExitCode}");
                }
                
                _logger.LogInformation("Extraction completed");

                // Verify SPT server file exists
                var sptServerFile = Path.Combine(_sptServerDir, "SPT", "SPT.Server.Linux");
                if (!File.Exists(sptServerFile))
                {
                    var allFiles = Directory.GetFiles(_sptServerDir, "SPT.Server.Linux", SearchOption.AllDirectories);
                    if (allFiles.Length == 0)
                    {
                        _logger.LogWarning("SPT.Server.Linux not found after extraction");
                    }
                }

                // Set execute permissions
                _logger.LogInformation("Setting execute permissions...");
                var chmodProcess = new System.Diagnostics.Process
                {
                    StartInfo = new System.Diagnostics.ProcessStartInfo
                    {
                        FileName = "chmod",
                        Arguments = $"+x {_sptServerDir}/SPT/SPT.Server.Linux",
                        UseShellExecute = false,
                        CreateNoWindow = true
                    }
                };
                
                chmodProcess.Start();
                chmodProcess.WaitForExit();
                _logger.LogInformation("Permissions set");

                // Restart SPT server
                _logger.LogInformation("Restarting SPT server...");
                await StartSptServerAsync();

                // Update version info
                var latestVersion = ExtractVersionFromTag(Path.GetFileNameWithoutExtension(downloadUrl));
                SaveSptVersion(latestVersion);
                Environment.SetEnvironmentVariable("SPT_VERSION", latestVersion);
                _logger.LogInformation("SPT version updated to: {LatestVersion}", latestVersion);

                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during SPT update");
                
                // Restore from backup if update failed
                if (Directory.Exists(backupDir))
                {
                    _logger.LogInformation("Restoring backup...");
                    try
                    {
                        if (Directory.Exists(_sptServerDir))
                            Directory.Delete(_sptServerDir, true);
                        Directory.Move(backupDir, _sptServerDir);
                        await StartSptServerAsync();
                        _logger.LogInformation("Backup restored successfully");
                    }
                    catch (Exception restoreEx)
                    {
                        _logger.LogError(restoreEx, "Error restoring backup");
                    }
                }
                return false;
            }
            finally
            {
                // Cleanup temporary file
                try
                {
                    if (File.Exists(tempFile))
                        File.Delete(tempFile);
                }
                catch (Exception cleanEx)
                {
                    _logger.LogWarning(cleanEx, "Error cleaning temporary file");
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "SPT update failed");
            return false;
        }
        finally
        {
            // Remove update flag to resume normal monitoring
            try
            {
                if (File.Exists("/tmp/updating.flag"))
                    File.Delete("/tmp/updating.flag");
                _logger.LogInformation("Update flag removed - SPT update completed");
            }
            catch (Exception cleanEx)
            {
                _logger.LogWarning(cleanEx, "Error removing update flag");
            }
        }
    }

    /// <summary>
    /// Stops the SPT server process
    /// </summary>
    private async Task StopSptServerAsync()
    {
        try
        {
            _logger.LogInformation("Stopping SPT server...");
            
            var processes = System.Diagnostics.Process.GetProcessesByName("SPT.Server.Linux");
            
            foreach (var process in processes)
            {
                try
                {
                    process.Kill();
                    if (!process.WaitForExit(10000))
                    {
                        _logger.LogWarning("Timeout terminating process {ProcessId}", process.Id);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Error terminating process {ProcessId}", process.Id);
                }
            }
            
            await Task.Delay(2000);
            
            // Verify all processes are terminated
            var remainingProcesses = System.Diagnostics.Process.GetProcessesByName("SPT.Server.Linux");
            if (remainingProcesses.Length > 0)
            {
                _logger.LogWarning("SPT processes still active: {Count}", remainingProcesses.Length);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error stopping SPT server");
        }
    }

    /// <summary>
    /// Starts the SPT server process
    /// </summary>
    private async Task StartSptServerAsync()
    {
        try
        {
            var sptPath = Path.Combine(_sptServerDir, "SPT", "SPT.Server.Linux");
            if (!File.Exists(sptPath))
            {
                throw new Exception("SPT.Server.Linux file not found");
            }
            
            // Ensure execute permissions
            var chmodProcess = System.Diagnostics.Process.Start("chmod", $"+x \"{sptPath}\"");
            if (chmodProcess != null)
            {
                chmodProcess.WaitForExit();
            }
            
            // Start SPT server process
            var startProcess = new System.Diagnostics.Process
            {
                StartInfo = new System.Diagnostics.ProcessStartInfo
                {
                    FileName = sptPath,
                    Arguments = "--port 6970 --ip 0.0.0.0",
                    WorkingDirectory = Path.Combine(_sptServerDir, "SPT"),
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true
                }
            };
            
            startProcess.Start();
            
            await Task.Delay(5000);
        }
        catch (Exception ex)
        {
            throw new Exception($"Error starting SPT server: {ex.Message}");
        }
    }

    #endregion

    #region SPT Support Methods

    /// <summary>
    /// Generates download URL from GitHub release tag
    /// </summary>
    private string GenerateDownloadUrlFromTag(string tag)
    {
        if (string.IsNullOrEmpty(tag))
        {
            _logger.LogWarning("Empty tag, cannot generate URL");
            return "";
        }
            
        var cleanTag = tag.Trim();
        var downloadUrl = $"https://spt-releases.modd.in/SPT-{cleanTag}.7z";
        return downloadUrl;
    }

    /// <summary>
    /// Extracts download URL from release body using regex patterns
    /// </summary>
    private string ExtractDownloadUrlFromBody(string body)
    {
        if (string.IsNullOrEmpty(body))
        {
            _logger.LogWarning("Release body is empty");
            return "";
        }
            
        // Multiple patterns to extract download URL from release body
        var patterns = new[]
        {
            @"Direct Download\r\n(https?://[^\s]+)",
            @"Direct Download\s+(https?://[^\s]+)",
            @"## Direct Download\s*(https?://[^\s]+)",
            @"(https?://spt-releases\.modd\.in/SPT-[\w\d\.\-]+\.7z)"
        };
        
        for (int i = 0; i < patterns.Length; i++)
        {
            var match = Regex.Match(body, patterns[i], RegexOptions.IgnoreCase);
            if (match.Success)
            {
                var url = match.Groups[1].Value.Trim();
                return url;
            }
        }
        
        // Fallback: look for any .7z URL
        var fallbackMatch = Regex.Match(body, @"(https?://[^\s]+\.7z)", RegexOptions.IgnoreCase);
        if (fallbackMatch.Success)
        {
            var url = fallbackMatch.Groups[1].Value.Trim();
            return url;
        }
        
        _logger.LogWarning("No download URL found in release body");
        return "";
    }

    /// <summary>
    /// Extracts version number from tag
    /// </summary>
    private string ExtractVersionFromTag(string tag)
    {
        if (string.IsNullOrEmpty(tag))
            return "unknown";
        
        var mainVersion = ExtractMainVersion(tag);
        
        if (mainVersion != "0.0.0")
        {
            return mainVersion;
        }
        
        return tag;
    }

    /// <summary>
    /// Compares version strings to determine if update is available
    /// </summary>
    private bool IsNewerVersion(string latest, string current)
    {
        try
        {
            if (current == "unknown" || latest == "unknown")
            {
                return false;
            }
                
            var normalizedCurrent = ExtractMainVersion(current);
            var normalizedLatest = ExtractMainVersion(latest);
            
            var currentVersion = new Version(normalizedCurrent);
            var latestVersion = new Version(normalizedLatest);
            
            return latestVersion > currentVersion;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error in version comparison");
            
            // Fallback string comparison
            try
            {
                var currentMain = ExtractMainVersion(current);
                var latestMain = ExtractMainVersion(latest);
                return string.Compare(latestMain, currentMain, StringComparison.OrdinalIgnoreCase) > 0;
            }
            catch (Exception fallbackEx)
            {
                _logger.LogWarning(fallbackEx, "Error in fallback version comparison");
                return false;
            }
        }
    }

    /// <summary>
    /// Extracts main version number from string using regex
    /// </summary>
    private string ExtractMainVersion(string version)
    {
        if (string.IsNullOrEmpty(version))
        {
            return "0.0.0";
        }
        
        // Try standard version format (X.X.X)
        var match = Regex.Match(version, @"(\d+\.\d+\.\d+)");
        if (match.Success)
        {
            return match.Groups[1].Value;
        }
        
        // Fallback: extract three consecutive numbers
        var numbers = Regex.Matches(version, @"\d+");
        if (numbers.Count >= 3)
        {
            return $"{numbers[0].Value}.{numbers[1].Value}.{numbers[2].Value}";
        }
        
        return "0.0.0";
    }

    #endregion
}