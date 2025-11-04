using ForgeModApi.Models;
using System.Text.Json;

namespace ForgeModApi.Services;

public partial class ModService
{
    #region API Calls and Fetch Data

    public async Task<Mod?> FetchModDataAsync(string modId)
    {
        try
        {
            var cacheKey = $"mod_{modId}";
            if (_apiCache.TryGetValue(cacheKey, out var cached) && cached.Expiry > DateTime.UtcNow)
            {
                return JsonSerializer.Deserialize<Mod>(cached.Content);
            }

            var baseUrl = $"https://forge.sp-tarkov.com/api/v0/mod/{modId}";
            var versionPage1Url = $"https://forge.sp-tarkov.com/api/v0/mod/{modId}/versions?page=1";

            var baseContent = await FetchWithCacheAndRetryAsync(baseUrl);
            if (string.IsNullOrEmpty(baseContent))
                return null;

            using var baseDoc = JsonDocument.Parse(baseContent);
            var baseData = baseDoc.RootElement.GetProperty("data");

            var versionContentPage1 = await FetchWithCacheAndRetryAsync(versionPage1Url);
            if (string.IsNullOrEmpty(versionContentPage1))
                return null;

            using var versionDocPage1 = JsonDocument.Parse(versionContentPage1);
            var meta = versionDocPage1.RootElement.GetProperty("meta");
            int lastPage = meta.GetProperty("last_page").GetInt32();

            var versionLastPageUrl = $"https://forge.sp-tarkov.com/api/v0/mod/{modId}/versions?page={lastPage}";
            var versionContentLastPage = await FetchWithCacheAndRetryAsync(versionLastPageUrl);
            if (string.IsNullOrEmpty(versionContentLastPage))
                return null;

            using var versionDocLastPage = JsonDocument.Parse(versionContentLastPage);

            var versions = versionDocLastPage.RootElement.GetProperty("data").EnumerateArray();

            JsonElement latestVersion = default;
            foreach (var v in versions)
            {
                latestVersion = v;
            }

            var latestVersionString = latestVersion.GetProperty("version").GetString() ?? "0.0.0";
            var sptConstraint = latestVersion.TryGetProperty("spt_version_constraint", out var spt)
                ? spt.GetString() ?? "N/A"
                : "N/A";

            var downloadUrl = latestVersion.TryGetProperty("link", out var linkElement)
                ? linkElement.GetString() ?? ""
                : "";

            string contentLengthMB = "0 MB";
            if (latestVersion.TryGetProperty("content_length", out var contentLengthElement))
            {
                var bytes = contentLengthElement.GetInt64();
                var megabytes = bytes / (1024.0 * 1024.0);
                contentLengthMB = $"{megabytes:F1} MB";
            }

            var mod = new Mod
            {
                Id = baseData.GetProperty("id").GetInt32(),
                Name = baseData.GetProperty("name").GetString() ?? "Unknown",
                Version = latestVersionString,
                SptVersionConstraint = sptConstraint,
                DetailUrl = baseData.TryGetProperty("detail_url", out var detail)
                    ? detail.GetString() ?? $"https://forge.sp-tarkov.com/mod/{modId}"
                    : $"https://forge.sp-tarkov.com/mod/{modId}",
                Thumbnail = baseData.TryGetProperty("thumbnail", out var thumb)
                    ? thumb.GetString() ?? ""
                    : "",
                Teaser = baseData.TryGetProperty("teaser", out var teaser)
                    ? teaser.GetString() ?? ""
                    : "",
                DownloadUrl = downloadUrl,
                ContentLength = contentLengthMB
            };

            var modJson = JsonSerializer.Serialize(mod);
            _apiCache[cacheKey] = (modJson, DateTime.UtcNow.Add(_cacheDuration));

            return mod;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching mod data for {ModId}", modId);
            return null;
        }
    }

    public async Task<List<SptVersion>> GetSptVersionsAsync()
    {
        var cacheKey = GetSptVersionsCacheKey();
        
        if (_apiCache.TryGetValue(cacheKey, out var cached) && cached.Expiry > DateTime.UtcNow)
        {
            return JsonSerializer.Deserialize<List<SptVersion>>(cached.Content) ?? new List<SptVersion>();
        }

        try
        {
            var urlPage1 = "https://forge.sp-tarkov.com/api/v0/spt/versions?page=1";
            var contentPage1 = await FetchWithCacheAndRetryAsync(urlPage1);
            if (string.IsNullOrEmpty(contentPage1))
                return new List<SptVersion>();

            using var docPage1 = JsonDocument.Parse(contentPage1);

            var meta = docPage1.RootElement.GetProperty("meta");
            int lastPage = meta.GetProperty("last_page").GetInt32();

            var urlLastPage = $"https://forge.sp-tarkov.com/api/v0/spt/versions?page={lastPage}";
            var contentLastPage = await FetchWithCacheAndRetryAsync(urlLastPage);
            if (string.IsNullOrEmpty(contentLastPage))
                return new List<SptVersion>();

            using var docLastPage = JsonDocument.Parse(contentLastPage);

            var sptList = new List<SptVersion>();
            foreach (var item in docLastPage.RootElement.GetProperty("data").EnumerateArray())
            {
                sptList.Add(new SptVersion
                {
                    Version = item.GetProperty("version").GetString() ?? "N/A",
                    VersionMajor = item.GetProperty("version_major").GetInt32()
                });
            }

            sptList = sptList
                .OrderByDescending(s => s.VersionMajor)
                .ThenByDescending(s => Version.Parse(s.Version))
                .ToList();

            var sptJson = JsonSerializer.Serialize(sptList);
            _apiCache[cacheKey] = (sptJson, DateTime.UtcNow.Add(_modCacheDuration));

            return sptList;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching SPT versions");
            return new List<SptVersion>();
        }
    }

    public async Task<string?> GetLatestModVersionAsync(string modId)
    {
        try
        {
            var versionPage1Url = $"https://forge.sp-tarkov.com/api/v0/mod/{modId}/versions?page=1";
            var versionContentPage1 = await FetchWithCacheAndRetryAsync(versionPage1Url);
            if (string.IsNullOrEmpty(versionContentPage1))
                return null;

            using var versionDocPage1 = JsonDocument.Parse(versionContentPage1);
            var meta = versionDocPage1.RootElement.GetProperty("meta");
            int lastPage = meta.GetProperty("last_page").GetInt32();

            var versionLastPageUrl = $"https://forge.sp-tarkov.com/api/v0/mod/{modId}/versions?page={lastPage}";
            var versionContentLastPage = await FetchWithCacheAndRetryAsync(versionLastPageUrl);
            if (string.IsNullOrEmpty(versionContentLastPage))
                return null;

            using var versionDocLastPage = JsonDocument.Parse(versionContentLastPage);

            var versions = versionDocLastPage.RootElement.GetProperty("data").EnumerateArray();
            
            JsonElement latestVersion = default;
            foreach (var v in versions)
            {
                latestVersion = v;
            }

            return latestVersion.GetProperty("version").GetString();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting latest version for mod {ModId}", modId);
            return null;
        }
    }

    public void ClearCache(string? specificKey = null)
    {
        if (specificKey != null)
        {
            _apiCache.TryRemove(specificKey, out _);
        }
        else
        {
            _apiCache.Clear();
        }
    }
    #endregion
}