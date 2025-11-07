using System.Text.Json;
using System.Text.RegularExpressions;
using ForgeModApi.Models;
using System.Net.Http.Headers;
using System.IO.Compression;
using Microsoft.Extensions.Logging;
using System.Collections.Concurrent;

namespace ForgeModApi.Services;

public partial class ModService : IModService
{
    #region Fields and Constants
    private readonly HttpClient _httpClient;
    private readonly HttpClient _githubHttpClient;
    private readonly ILogger<ModService> _logger;
    private readonly string _apiKey;
    private readonly string _listsDir;
    private readonly string _versionsDir;
    private readonly string _sptServerDir;
    
    private readonly ConcurrentDictionary<string, (string Content, DateTime Expiry)> _apiCache;
    private readonly TimeSpan _cacheDuration = TimeSpan.FromMinutes(30);
    private readonly TimeSpan _githubCacheDuration = TimeSpan.FromHours(2);
    private readonly TimeSpan _modCacheDuration = TimeSpan.FromHours(2);

    private readonly SemaphoreSlim _apiSemaphore = new SemaphoreSlim(2, 2);
    private DateTime _lastApiCall = DateTime.MinValue;

    private readonly string? _githubToken;
    private readonly bool _hasGitHubAuth;
    #endregion

    #region Cache Helper Methods
    private string GetModCacheKey(string modId) => $"mod_{modId}";
    private string GetSptVersionsCacheKey() => "spt_versions_all";
    #endregion

    #region Constructor
    public ModService(HttpClient httpClient, IConfiguration configuration, ILogger<ModService> logger)
    {
        _httpClient = httpClient;
        _logger = logger;
        _apiKey = configuration["FORGE_API_KEY"] ?? throw new Exception("FORGE_API_KEY not found in environment!");
        
        _httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _apiKey);
        _httpClient.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        _githubHttpClient = new HttpClient();
        _githubHttpClient.DefaultRequestHeaders.UserAgent.ParseAdd("TarkHub/1.0");
        _githubHttpClient.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github.v3+json"));
        
        _githubToken = configuration["GITHUB_TOKEN"];
        _hasGitHubAuth = !string.IsNullOrEmpty(_githubToken);
        
        if (_hasGitHubAuth)
        {
            _githubHttpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _githubToken);
            _logger.LogInformation("GitHub authentication enabled");
        }
        else
        {
            _logger.LogWarning("GITHUB_TOKEN not found. GitHub API calls will have lower rate limits.");
        }

        _listsDir = Path.Combine(AppContext.BaseDirectory, "user", "lists");
        _versionsDir = Path.Combine(AppContext.BaseDirectory, "user", "versions");
        _sptServerDir = "/app/spt-server";

        _apiCache = new ConcurrentDictionary<string, (string, DateTime)>();

        EnsureDirectories();
    }
    #endregion

    #region Initialization
    private void EnsureDirectories()
    {
        if (!Directory.Exists(_listsDir))
            Directory.CreateDirectory(_listsDir);
        if (!Directory.Exists(_versionsDir))
            Directory.CreateDirectory(_versionsDir);
        if (!Directory.Exists(_sptServerDir))
            Directory.CreateDirectory(_sptServerDir);
    }

    public bool ValidateSptInstallation()
    {
        return ValidateSptDirectoryStructure();
    }

    private bool ValidateSptDirectoryStructure()
    {
        try
        {
            var requiredDirs = new[]
            {
                Path.Combine(_sptServerDir, "SPT", "user", "mods"),
                Path.Combine(_sptServerDir, "BepInEx", "plugins"),
                Path.Combine(_sptServerDir, "SPT", "Aki_Data")
            };

            foreach (var dir in requiredDirs)
            {
                if (!Directory.Exists(dir))
                {
                    try
                    {
                        Directory.CreateDirectory(dir);
                        _logger.LogInformation("Created missing directory: {Directory}", dir);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Failed to create directory: {Directory}", dir);
                        return false;
                    }
                }
            }
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error validating SPT directory structure");
            return false;
        }
    }
    #endregion

    #region API Throttling and Caching
    private TimeSpan GetCacheDuration(string url, bool useForgeClient)
    {
        if (!useForgeClient && url.Contains("github.com"))
        {
            return _githubCacheDuration;
        }
        
        return _cacheDuration;
    }

    private async Task ThrottleApiCalls()
    {
        await _apiSemaphore.WaitAsync();
        try
        {
            var timeSinceLastCall = DateTime.UtcNow - _lastApiCall;
            if (timeSinceLastCall < TimeSpan.FromMilliseconds(500))
            {
                await Task.Delay(500 - (int)timeSinceLastCall.TotalMilliseconds);
            }
            _lastApiCall = DateTime.UtcNow;
        }
        finally
        {
            _apiSemaphore.Release();
        }
    }

    private void CleanExpiredCache()
    {
        try
        {
            var expiredKeys = _apiCache.Where(kv => kv.Value.Expiry <= DateTime.UtcNow)
                                      .Select(kv => kv.Key)
                                      .ToList();
            
            foreach (var key in expiredKeys)
            {
                _apiCache.TryRemove(key, out _);
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug("Error cleaning cache: {Message}", ex.Message);
        }
    }

    private async Task<string?> FetchWithCacheAndRetryAsync(string url, int maxRetries = 3, bool useForgeClient = true)
    {
        CleanExpiredCache();

        if (_apiCache.TryGetValue(url, out var cached) && cached.Expiry > DateTime.UtcNow)
        {
            _logger.LogDebug("Cache hit for: {Url}", url);
            return cached.Content;
        }

        await ThrottleApiCalls();

        var httpClient = useForgeClient ? _httpClient : _githubHttpClient;

        for (int attempt = 1; attempt <= maxRetries; attempt++)
        {
            try
            {
                var response = await httpClient.GetAsync(url);

                if (response.IsSuccessStatusCode)
                {
                    var content = await response.Content.ReadAsStringAsync();
                    
                    var duration = GetCacheDuration(url, useForgeClient);
                    _apiCache[url] = (content, DateTime.UtcNow.Add(duration));
                    
                    return content;
                }
                else if (response.StatusCode == System.Net.HttpStatusCode.TooManyRequests)
                {
                    _logger.LogWarning("Rate limit hit for {Url}, attempt {Attempt}", url, attempt);
                    
                    if (response.Headers.RetryAfter?.Delta.HasValue == true)
                    {
                        var retryAfter = response.Headers.RetryAfter.Delta.Value;
                        await Task.Delay(retryAfter);
                    }
                    else
                    {
                        var delay = TimeSpan.FromSeconds(Math.Pow(2, attempt));
                        await Task.Delay(delay);
                    }
                    
                    if (attempt == maxRetries) 
                    {
                        _logger.LogError("Rate limit exceeded for {Url} after {Attempt} attempts", url, attempt);
                        return null;
                    }
                }
                else if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized || 
                        response.StatusCode == System.Net.HttpStatusCode.Forbidden)
                {
                    _logger.LogWarning("Access denied for {Url}. Status: {StatusCode}", url, response.StatusCode);
                    
                    if (!useForgeClient && !_hasGitHubAuth)
                    {
                        _logger.LogWarning("Consider adding a GITHUB_TOKEN environment variable for higher rate limits");
                    }
                    
                    return null;
                }
                else
                {
                    _logger.LogError("HTTP {StatusCode} for {Url}", response.StatusCode, url);
                    if (attempt == maxRetries) return null;
                    await Task.Delay(1000 * attempt);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching {Url} (attempt {Attempt})", url, attempt);
                if (attempt == maxRetries) return null;
                await Task.Delay(1000 * attempt);
            }
        }
        
        return null;
    }
    #endregion

    #region GitHub API Specific Methods
    public async Task<List<GitHubRelease>?> FetchGitHubReleasesAsync(string repoUrl, string repoName)
    {
        try
        {
            var apiUrl = ConvertToGitHubApiUrl(repoUrl);
            if (string.IsNullOrEmpty(apiUrl))
            {
                _logger.LogWarning("Invalid GitHub repository URL: {RepoUrl}", repoUrl);
                return null;
            }

            var content = await FetchWithCacheAndRetryAsync(apiUrl, useForgeClient: false);
            if (string.IsNullOrEmpty(content))
            {
                _logger.LogWarning("Failed to fetch releases for {RepoName} from GitHub", repoName);
                return null;
            }

            var releases = JsonSerializer.Deserialize<List<GitHubRelease>>(content);
            _logger.LogInformation("Successfully fetched {Count} releases for {RepoName}", releases?.Count ?? 0, repoName);
            return releases;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching GitHub releases for {RepoName}", repoName);
            return null;
        }
    }

    private string? ConvertToGitHubApiUrl(string repoUrl)
    {
        try
        {
            var match = GitHubUrlRegex().Match(repoUrl);
            if (match.Success)
            {
                var owner = match.Groups["owner"].Value;
                var repo = match.Groups["repo"].Value;
                return $"https://api.github.com/repos/{owner}/{repo}/releases";
            }
            
            _logger.LogWarning("Could not parse GitHub URL: {RepoUrl}", repoUrl);
            return null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error converting GitHub URL to API URL: {RepoUrl}", repoUrl);
            return null;
        }
    }

    [GeneratedRegex(@"https?://github\.com/(?<owner>[^/]+)/(?<repo>[^/]+)")]
    private static partial Regex GitHubUrlRegex();
    #endregion

    #region API Key Validation
    public async Task<bool> ValidateApiKeyAsync()
    {
        try
        {
            var testUrl = "https://forge.sp-tarkov.com/api/v0/spt/versions?page=1";
            var content = await FetchWithCacheAndRetryAsync(testUrl);
            return !string.IsNullOrEmpty(content);
        }
        catch
        {
            return false;
        }
    }

    public bool HasGitHubAuthentication()
    {
        return _hasGitHubAuth;
    }
    #endregion

    #region File System Utilities
    private string GetSafeFileName(string name)
    {
        var invalidChars = Path.GetInvalidFileNameChars();
        foreach (var c in invalidChars)
            name = name.Replace(c, '_');
        return name;
    }

    private void CopyDirectory(string sourceDir, string destinationDir, bool recursive)
    {
        sourceDir = Path.GetFullPath(sourceDir);
        destinationDir = Path.GetFullPath(destinationDir);

        if (!Directory.Exists(sourceDir))
        {
            _logger.LogWarning("Source directory does not exist: {SourceDir}", sourceDir);
            return;
        }

        Directory.CreateDirectory(destinationDir);

        foreach (var file in Directory.GetFiles(sourceDir))
        {
            var normalizedFile = Path.GetFullPath(file);
            var fileName = Path.GetFileName(normalizedFile);
            var destFile = Path.Combine(destinationDir, fileName ?? "unknown");
            
            for (int i = 0; i < 3; i++)
            {
                try
                {
                    File.Copy(normalizedFile, destFile, true);
                    break;
                }
                catch (IOException) when (i < 2)
                {
                    Thread.Sleep(1000);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error copying file: {FilePath}", normalizedFile);
                    throw;
                }
            }
        }

        if (recursive)
        {
            foreach (var subDir in Directory.GetDirectories(sourceDir))
            {
                var normalizedSubDir = Path.GetFullPath(subDir);
                var dirName = Path.GetFileName(normalizedSubDir);
                var destSubDir = Path.Combine(destinationDir, dirName ?? "unknown");
                
                CopyDirectory(normalizedSubDir, destSubDir, true);
            }
        }
    }
    #endregion

    #region Version File Management
    private string GetSptVersionFilePath() => Path.Combine(_versionsDir, "spt_version.txt");
    private string GetFikaVersionFilePath() => Path.Combine(_versionsDir, "fika_version.txt");

    private void SaveSptVersion(string version)
    {
        try
        {
            var versionFile = GetSptVersionFilePath();
            var directory = Path.GetDirectoryName(versionFile);
            if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
            {
                Directory.CreateDirectory(directory);
            }
            File.WriteAllText(versionFile, version);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error saving SPT version");
        }
    }

    private void SaveFikaVersion(string version)
    {
        try
        {
            var versionFile = GetFikaVersionFilePath();
            var directory = Path.GetDirectoryName(versionFile);
            if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
            {
                Directory.CreateDirectory(directory);
            }
            File.WriteAllText(versionFile, version);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error saving Fika version");
        }
    }
    #endregion

    #region SPT Version Management
    public string? GetSelectedSptVersion(string listName)
    {
        var list = LoadList(listName);
        return list.SelectedSptVersion;
    }

    public bool UpdateSelectedSptVersion(string listName, string sptVersion)
    {
        try
        {
            var list = LoadList(listName);
            list.SelectedSptVersion = sptVersion;
            SaveList(list);
            _logger.LogInformation("SPT version updated to {SptVersion} for list '{ListName}'", sptVersion, listName);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating SPT version for list '{ListName}'", listName);
            return false;
        }
    }

    public string GetCurrentSptVersion()
    {
        try
        {
            var versionFile = GetSptVersionFilePath();
            if (File.Exists(versionFile))
            {
                var version = File.ReadAllText(versionFile).Trim();
                if (!string.IsNullOrEmpty(version) && version != "unknown")
                    return version;
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error reading SPT version file");
        }
        
        try
        {
            var sptVersions = GetSptVersionsAsync().GetAwaiter().GetResult();
            if (sptVersions.Count > 0)
            {
                return sptVersions[0].Version;
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error getting SPT versions for fallback");
        }
        
        var envVersion = Environment.GetEnvironmentVariable("SPT_VERSION") ?? "3.9.0";
        return envVersion;
    }
    #endregion

    #region Fika Version Management
    public string GetCurrentFikaVersion()
    {
        try
        {
            var versionFile = GetFikaVersionFilePath();
            if (File.Exists(versionFile))
            {
                var version = File.ReadAllText(versionFile).Trim();
                return version;
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error reading Fika version file");
        }
        
        var envVersion = Environment.GetEnvironmentVariable("FIKA_VERSION") ?? "unknown";
        return envVersion;
    }
    #endregion
}