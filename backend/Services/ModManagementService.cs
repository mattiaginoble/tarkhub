using System.Text.RegularExpressions;
using ForgeModApi.Models;

namespace ForgeModApi.Services;

public partial class ModService
{
    #region Mod List Management

    public async Task<(bool Success, string Message, Mod? Mod)> AddModToListAsync(string listName, string modUrl)
    {
        var modId = ExtractModIdFromUrl(modUrl);
        if (modId == null)
            return (false, "Invalid URL", null);

        var mod = await FetchModDataAsync(modId);
        if (mod == null)
            return (false, "Mod not found or API error", null);

        var list = LoadList(listName);
        
        if (list.Mods.Any(m => m.Id == mod.Id))
            return (true, "Mod already exists in list", mod);

        mod.ModType = "unknown";
        
        list.Mods.Add(mod);
        SaveList(list);

        _logger.LogInformation("Mod '{ModName}' added to list '{ListName}'", mod.Name, listName);
        return (true, "Mod added successfully", mod);
    }

    public bool RemoveModFromList(string listName, int modId)
    {
        var list = LoadList(listName);
        var mod = list.Mods.FirstOrDefault(m => m.Id == modId);
        if (mod != null)
        {
            list.Mods.Remove(mod);
            SaveList(list);
            _logger.LogInformation("Mod '{ModName}' removed from list '{ListName}'", mod.Name, listName);
            return true;
        }
        return false;
    }

    public string? ExtractModIdFromUrl(string url)
    {
        var match = Regex.Match(url, @"/mod/(\d+)");
        return match.Success ? match.Groups[1].Value : null;
    }

    #endregion

    #region Mod Update Checking

    public async Task<List<Mod>> CheckModUpdatesAsync(string listName)
    {
        var list = LoadList(listName);
        var updatedMods = new List<Mod>();

        foreach (var mod in list.Mods)
        {
            var updatedModData = await FetchModDataAsync(mod.Id.ToString());
            if (updatedModData != null && updatedModData.Version != mod.Version)
            {
                mod.LatestVersion = updatedModData.Version;
                mod.DownloadUrl = updatedModData.DownloadUrl;
                updatedMods.Add(mod);
                _logger.LogInformation(
                    "Mod update found: {ModName} {CurrentVersion} -> {LatestVersion}", 
                    mod.Name, mod.Version, mod.LatestVersion
                );
            }
        }

        if (updatedMods.Any())
        {
            SaveList(list);
            _logger.LogInformation("Found {Count} mod updates in list '{ListName}'", updatedMods.Count, listName);
        }

        return updatedMods;
    }

    public async Task<Mod?> CheckSingleModUpdateAsync(string listName, int modId)
    {
        var list = LoadList(listName);
        var mod = list.Mods.FirstOrDefault(m => m.Id == modId);
        
        if (mod != null)
        {
            var updatedMod = await FetchModDataAsync(modId.ToString());
            if (updatedMod != null)
            {
                var originalVersion = mod.Version;
                
                mod.Name = updatedMod.Name;
                mod.Version = updatedMod.Version;
                mod.SptVersionConstraint = updatedMod.SptVersionConstraint;
                mod.DetailUrl = updatedMod.DetailUrl;
                mod.Thumbnail = updatedMod.Thumbnail;
                mod.Teaser = updatedMod.Teaser;
                mod.LatestVersion = updatedMod.Version;
                mod.DownloadUrl = updatedMod.DownloadUrl;
                mod.ContentLength = updatedMod.ContentLength;
                
                SaveList(list);
                
                _logger.LogInformation(
                    "Mod update: {ModId} {OriginalVersion} -> {NewVersion}", 
                    modId, originalVersion, mod.Version
                );
                
                return mod;
            }
        }
        
        return null;
    }

    #endregion
}