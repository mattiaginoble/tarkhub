using ForgeModApi.Models;

namespace ForgeModApi.Services;

public interface IModService
{
    // List management
    List<ModList> LoadAllLists();
    ModList LoadList(string name);
    void CreateNewList(string name);
    bool RenameList(string oldName, string newName);
    bool DeleteList(string name);
    
    // Mod management in lists
    Task<(bool Success, string Message, Mod? Mod)> AddModToListAsync(string listName, string modUrl);
    bool RemoveModFromList(string listName, int modId);
    
    // SPT and Fika versions
    Task<List<SptVersion>> GetSptVersionsAsync();
    string? GetSelectedSptVersion(string listName);
    bool UpdateSelectedSptVersion(string listName, string sptVersion);
    string GetCurrentSptVersion();
    string GetCurrentFikaVersion();
    
    // Download and installation
    Task<DownloadResult> DownloadAndExtractModAsync(string listName, int modId, bool forceDownload = false);
    Task<List<DownloadResult>> DownloadAllModsAsync(string listName, bool forceDownload = false);
    bool IsModInstalled(int modId, string modName);
    bool RemoveModFromInstallation(int modId, string modName);
    bool CompleteModInstallation(string modName, string tempExtractPath, bool installAsServerMod);
    
    // Mod updates
    Task<List<Mod>> CheckModUpdatesAsync(string listName);
    Task<Mod?> CheckSingleModUpdateAsync(string listName, int modId);
    Task<string?> GetLatestModVersionAsync(string modId);
    
    // SPT updates
    Task<SptUpdateInfo> CheckSptUpdateAsync();
    Task<bool> DownloadAndUpdateSptAsync(string downloadUrl);
    
    // Fika updates
    Task<FikaUpdateInfo> CheckFikaUpdateAsync();
    Task<bool> DownloadAndUpdateFikaAsync(string downloadUrl, string version);
    
    // Utilities
    string? ExtractModIdFromUrl(string url);
    Task<Mod?> FetchModDataAsync(string modId);
    bool ValidateSptInstallation();
}

public class DownloadResult
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public string? ModName { get; set; }
    public bool requiresUserChoice { get; set; }
    public string? TempExtractPath { get; set; }
}