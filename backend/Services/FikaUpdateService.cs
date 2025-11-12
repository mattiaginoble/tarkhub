using ForgeModApi.Models;
using System.IO.Compression;
using System.Text.Json;

namespace ForgeModApi.Services;

public partial class ModService
{
    public async Task<FikaUpdateInfo> CheckFikaUpdateAsync()
    {
        try
        {
            var current = GetCurrentFikaVersion();
            var releasesJson = await FetchWithCacheAndRetryAsync(
                "https://api.github.com/repos/project-fika/Fika-Server-CSharp/releases", 3, false);
            
            if (string.IsNullOrEmpty(releasesJson))
            {
                _logger.LogWarning("Failed to fetch Fika releases");
                return NoUpdateInfo(current);
            }

            using var doc = JsonDocument.Parse(releasesJson);
            var releases = doc.RootElement.EnumerateArray();
            
            if (!releases.Any())
                return NoUpdateInfo(current);
            
            var latest = releases.First();
            var url = FindDownloadUrl(latest);
            
            if (string.IsNullOrEmpty(url))
            {
                _logger.LogWarning("No download URL found");
                return NoUpdateInfo(current);
            }
                
            var latestVersion = GetVersion(latest);
            var updateAvailable = latestVersion != current && latestVersion != "unknown" && current != "unknown";
            
            if (updateAvailable)
                _logger.LogInformation("Fika update: {Current} -> {Latest}", current, latestVersion);
            
            return new FikaUpdateInfo
            {
                UpdateAvailable = updateAvailable,
                CurrentVersion = current,
                LatestVersion = latestVersion,
                DownloadUrl = url,
                ReleaseNotes = ""
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error checking Fika updates");
            return NoUpdateInfo(GetCurrentFikaVersion());
        }
    }

    public async Task<bool> DownloadAndUpdateFikaAsync(string downloadUrl, string version)
    {
        return await InstallAsync(downloadUrl, version);
    }

    private async Task<bool> InstallAsync(string url, string version)
    {
        try
        {
            _logger.LogInformation("Installing Fika update to v{Version}: {Url}", version, url);
            
            var tempFile = Path.Combine(Path.GetTempPath(), $"fika-{Guid.NewGuid()}.zip");
            var extractDir = Path.Combine(Path.GetTempPath(), $"fika-{Guid.NewGuid()}");
            
            try
            {
                using var client = new HttpClient { Timeout = TimeSpan.FromMinutes(5) };
                var response = await client.GetAsync(url);
                
                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogError("Download failed: {StatusCode}", response.StatusCode);
                    return false;
                }
                    
                await using (var stream = await response.Content.ReadAsStreamAsync())
                await using (var file = File.Create(tempFile))
                {
                    await stream.CopyToAsync(file);
                }
                
                Directory.CreateDirectory(extractDir);
                ZipFile.ExtractToDirectory(tempFile, extractDir, true);
                CopyDirectory(extractDir, _sptServerDir, true);

                SaveFikaVersion(version);
                _logger.LogInformation("Fika updated to v{Version}", version);
                return true;
            }
            finally
            {
                try { if (File.Exists(tempFile)) File.Delete(tempFile); } catch { }
                try { if (Directory.Exists(extractDir)) Directory.Delete(extractDir, true); } catch { }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Install failed");
            return false;
        }
    }

    private string FindDownloadUrl(JsonElement release)
    {
        if (release.TryGetProperty("assets", out var assets) && assets.ValueKind == JsonValueKind.Array)
        {
            foreach (var asset in assets.EnumerateArray())
            {
                if (asset.TryGetProperty("name", out var nameProp) && nameProp.ValueKind == JsonValueKind.String &&
                    asset.TryGetProperty("browser_download_url", out var urlProp) && urlProp.ValueKind == JsonValueKind.String)
                {
                    var name = nameProp.GetString() ?? "";
                    if (name.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
                        return urlProp.GetString() ?? "";
                }
            }
        }
        return "";
    }

    private string GetVersion(JsonElement release)
    {
        if (release.TryGetProperty("tag_name", out var tagProp) && tagProp.ValueKind == JsonValueKind.String)
            return tagProp.GetString() ?? "unknown";
        return "unknown";
    }

    private FikaUpdateInfo NoUpdateInfo(string current) => new()
    {
        CurrentVersion = current,
        LatestVersion = current, 
        UpdateAvailable = false
    };
}