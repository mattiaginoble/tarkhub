namespace ForgeModApi.Models;

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
    public string ModType { get; set; } = "unknown";
    public bool UpdateAvailable => !string.IsNullOrEmpty(LatestVersion) && LatestVersion != Version;
}

