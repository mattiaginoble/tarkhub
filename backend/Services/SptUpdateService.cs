using ForgeModApi.Models;
using System.Text.RegularExpressions;
using System.Text.Json;

namespace ForgeModApi.Services;

public partial class ModService
{
    public async Task<SptUpdateInfo> CheckSptUpdateAsync()
    {
        try
        {
            var currentVersion = GetCurrentSptVersion();
            var releasesJson = await FetchWithCacheAndRetryAsync(
                "https://api.github.com/repos/sp-tarkov/build/releases", 3, false);
            
            if (string.IsNullOrEmpty(releasesJson))
                return NoSptUpdateInfo(currentVersion);

            using var doc = JsonDocument.Parse(releasesJson);
            var releases = doc.RootElement.EnumerateArray();
            
            if (!releases.Any())
                return NoSptUpdateInfo(currentVersion);
            
            var latest = releases.First();
            var downloadUrl = await GetSptDownloadUrlAsync(latest);
            
            if (string.IsNullOrEmpty(downloadUrl))
                return NoSptUpdateInfo(currentVersion);

            var latestVersion = GetSptVersion(latest);
            var updateAvailable = IsNewerSptVersion(latestVersion, currentVersion);
            
            return new SptUpdateInfo
            {
                UpdateAvailable = updateAvailable,
                CurrentVersion = currentVersion,
                LatestVersion = latestVersion,
                DownloadUrl = downloadUrl,
                ReleaseNotes = GetSptReleaseNotes(latest)
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error checking SPT updates");
            return NoSptUpdateInfo(GetCurrentSptVersion());
        }
    }

    public async Task<bool> DownloadAndUpdateSptAsync(string downloadUrl)
    {
        await CreateUpdateFlag();
        return await InstallSptAsync(downloadUrl);
    }

    private async Task<bool> InstallSptAsync(string url)
    {
        var tempFile = Path.Combine(Path.GetTempPath(), $"spt-{Guid.NewGuid()}.7z");
        var extractDir = Path.Combine(Path.GetTempPath(), $"spt-{Guid.NewGuid()}");
        
        try
        {
            await StopSptServerAsync();
            await Task.Delay(5000);

            await DownloadFileAsync(url, tempFile);
            await ExtractArchiveAsync(tempFile, extractDir);
            
            CopyDirectory(extractDir, _sptServerDir, true);

            if (!EnsureSptPermissions())
                throw new Exception("Failed to set SPT permissions");

            await StartSptServerAsync();

            var latestVersion = ExtractVersionFromUrl(url);
            SaveSptVersion(latestVersion);
            
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "SPT install failed");
            return false;
        }
        finally
        {
            Cleanup(tempFile, extractDir);
        }
    }

    private async Task<string> GetSptDownloadUrlAsync(JsonElement release)
    {
        if (release.TryGetProperty("body", out var bodyProp) && bodyProp.ValueKind == JsonValueKind.String)
        {
            var url = ExtractDownloadUrlFromBody(bodyProp.GetString() ?? "");
            if (!string.IsNullOrEmpty(url))
                return url;
        }

        if (release.TryGetProperty("assets", out var assets) && assets.ValueKind == JsonValueKind.Array)
        {
            foreach (var asset in assets.EnumerateArray())
            {
                if (asset.TryGetProperty("name", out var nameProp) && 
                    asset.TryGetProperty("browser_download_url", out var urlProp) &&
                    nameProp.GetString()?.EndsWith(".7z", StringComparison.OrdinalIgnoreCase) == true)
                {
                    return urlProp.GetString() ?? "";
                }
            }
        }

        return "";
    }

    private async Task DownloadFileAsync(string url, string outputPath)
    {
        using var client = new HttpClient { Timeout = TimeSpan.FromMinutes(10) };
        using var response = await client.GetAsync(url);
        
        if (!response.IsSuccessStatusCode)
            throw new Exception($"Download failed: {response.StatusCode}");

        await using var stream = await response.Content.ReadAsStreamAsync();
        await using var file = File.Create(outputPath);
        await stream.CopyToAsync(file);
    }

    private async Task ExtractArchiveAsync(string archivePath, string outputDir)
    {
        Directory.CreateDirectory(outputDir);
        
        var process = System.Diagnostics.Process.Start("7zr", $"x \"{archivePath}\" -o\"{outputDir}\" -y -aoa");
        process.WaitForExit();
        
        if (process.ExitCode != 0)
            throw new Exception($"7z extraction failed with code {process.ExitCode}");
    }

    private async Task CreateUpdateFlag()
    {
        await File.WriteAllTextAsync("/tmp/updating.flag", "SPT update in progress");
    }

    private void Cleanup(params string[] paths)
    {
        foreach (var path in paths)
        {
            try
            {
                if (File.Exists(path)) File.Delete(path);
                if (Directory.Exists(path)) Directory.Delete(path, true);
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Cleanup failed for {Path}", path);
            }
        }
        
        try { File.Delete("/tmp/updating.flag"); } catch { }
    }

    private string ExtractDownloadUrlFromBody(string body)
    {
        if (string.IsNullOrEmpty(body))
            return "";

        var patterns = new[]
        {
            @"Direct Download\r\n(https?://[^\s]+\.7z)",
            @"Direct Download\s+(https?://[^\s]+\.7z)",
            @"## Direct Download\s*(https?://[^\s]+\.7z)",
            @"(https?://spt-releases\.modd\.in/SPT-[\w\d\.\-]+\.7z)"
        };
        
        foreach (var pattern in patterns)
        {
            var match = Regex.Match(body, pattern, RegexOptions.IgnoreCase);
            if (match.Success)
                return match.Groups[1].Value.Trim();
        }
        
        return "";
    }

    private string GetSptVersion(JsonElement release)
    {
        if (release.TryGetProperty("tag_name", out var tagProp) && tagProp.ValueKind == JsonValueKind.String)
            return ExtractMainVersion(tagProp.GetString() ?? "unknown");
        return "unknown";
    }

    private string GetSptReleaseNotes(JsonElement release)
    {
        if (release.TryGetProperty("body", out var bodyProp) && bodyProp.ValueKind == JsonValueKind.String)
            return bodyProp.GetString() ?? "";
        return "";
    }

    private string ExtractVersionFromUrl(string url)
    {
        var fileName = Path.GetFileNameWithoutExtension(url);
        return ExtractMainVersion(fileName);
    }

    private string ExtractMainVersion(string version)
    {
        if (string.IsNullOrEmpty(version))
            return "0.0.0";
        
        var match = Regex.Match(version, @"(\d+\.\d+\.\d+)");
        return match.Success ? match.Groups[1].Value : "0.0.0";
    }

    private bool IsNewerSptVersion(string latest, string current)
    {
        try
        {
            if (current == "unknown" || latest == "unknown")
                return false;
            
            var currentVersion = new Version(ExtractMainVersion(current));
            var latestVersion = new Version(ExtractMainVersion(latest));
            
            return latestVersion > currentVersion;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error in SPT version comparison");
            return false;
        }
    }

    private SptUpdateInfo NoSptUpdateInfo(string current) => new()
    {
        CurrentVersion = current,
        LatestVersion = current, 
        UpdateAvailable = false
    };

    private async Task StopSptServerAsync()
    {
        try
        {
            var processes = System.Diagnostics.Process.GetProcessesByName("SPT.Server.Linux");
            foreach (var process in processes)
            {
                try
                {
                    process.Kill();
                    process.WaitForExit(5000);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Error terminating SPT process");
                }
            }
            await Task.Delay(2000);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error stopping SPT server");
        }
    }

    private async Task StartSptServerAsync()
    {
        try
        {
            var sptPath = Path.Combine(_sptServerDir, "SPT", "SPT.Server.Linux");
            if (!File.Exists(sptPath))
                throw new Exception("SPT.Server.Linux not found");

            var process = new System.Diagnostics.Process
            {
                StartInfo = new System.Diagnostics.ProcessStartInfo
                {
                    FileName = sptPath,
                    Arguments = "--port 6970 --ip 0.0.0.0",
                    WorkingDirectory = Path.Combine(_sptServerDir, "SPT"),
                    UseShellExecute = false,
                    CreateNoWindow = true
                }
            };
            
            process.Start();
            await Task.Delay(5000);
        }
        catch (Exception ex)
        {
            throw new Exception($"Error starting SPT server: {ex.Message}");
        }
    }

    private bool EnsureSptPermissions()
    {
        try
        {
            var sptPath = Path.Combine(_sptServerDir, "SPT", "SPT.Server.Linux");
            if (!File.Exists(sptPath))
                return false;

            var process = System.Diagnostics.Process.Start("chmod", $"+x \"{sptPath}\"");
            process?.WaitForExit(5000);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error ensuring SPT permissions");
            return false;
        }
    }
}