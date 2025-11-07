namespace ForgeModApi.Models;

public class ModList
{
    public string Name { get; set; } = "";
    public string SelectedSptVersion { get; set; } = "unknown";
    public List<Mod> Mods { get; set; } = new();
}

public class Mod
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Version { get; set; } = "";
    public string SptVersionConstraint { get; set; } = "N/A";
    public string DetailUrl { get; set; } = "";
    public string Thumbnail { get; set; } = "";
    public string Teaser { get; set; } = "";
    public string DownloadUrl { get; set; } = "";
    public string ContentLength { get; set; } = "";
    public string LatestVersion { get; set; } = "";
    public bool UpdateAvailable => !string.IsNullOrEmpty(LatestVersion) && LatestVersion != Version;
}

public class SptVersion
{
    public string Version { get; set; } = "";
    public int VersionMajor { get; set; }
}

public class GitHubRelease
{
    public string Url { get; set; } = "";
    public string Tag_Name { get; set; } = "";
    public string Name { get; set; } = "";
    public string Body { get; set; } = "";
    public DateTime Published_At { get; set; }
}

public class SptUpdateInfo
{
    public bool UpdateAvailable { get; set; }
    public string CurrentVersion { get; set; } = "";
    public string LatestVersion { get; set; } = "";
    public string DownloadUrl { get; set; } = "";
    public string ReleaseNotes { get; set; } = "";
}

public class FikaUpdateInfo
{
    public bool UpdateAvailable { get; set; }
    public string CurrentVersion { get; set; } = "";
    public string LatestVersion { get; set; } = "";
    public string DownloadUrl { get; set; } = "";
    public string ReleaseNotes { get; set; } = "";
}

public class ModDownloadResult
{
    public bool Success { get; set; }
    public string Message { get; set; } = "";
    public string ModName { get; set; } = "";
}

public class ServerStatusInfo
{
    public string SptVersion { get; set; } = "";
    public bool IsRunning { get; set; }
    public string Players { get; set; } = "0/0";
    public string Uptime { get; set; } = "0s";
    public DateTime Timestamp { get; set; }
}
