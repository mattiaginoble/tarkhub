using System.Text.Json;
using System.Text.RegularExpressions;
using ForgeModApi.Models;

namespace ForgeModApi.Services;

public partial class ModService
{
    #region List Management

    /// <summary>
    /// Loads all mod lists from the lists directory
    /// </summary>
    public List<ModList> LoadAllLists()
    {
        var lists = new List<ModList>();

        foreach (var file in Directory.GetFiles(_listsDir, "*.json"))
        {
            try
            {
                var json = File.ReadAllText(file);
                var list = JsonSerializer.Deserialize<ModList>(json);
                if (list != null)
                {
                    lists.Add(list);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning("Skipping invalid list file: {FileName}", Path.GetFileName(file));
            }
        }

        return lists;
    }

    /// <summary>
    /// Loads a specific mod list by name
    /// </summary>
    public ModList LoadList(string name)
    {
        var normalizedName = NormalizeListName(name);
        var filePath = Path.Combine(_listsDir, normalizedName + ".json");

        // Search for file with case-insensitive matching
        if (!File.Exists(filePath))
        {
            var allFiles = Directory.GetFiles(_listsDir, "*.json");
            var matchingFile = allFiles.FirstOrDefault(f => 
                Path.GetFileNameWithoutExtension(f).ToLowerInvariant() == normalizedName
            );
            
            if (matchingFile != null)
            {
                filePath = matchingFile;
            }
            else
            {
                // Return empty list if file doesn't exist
                return new ModList { Name = name.Trim(), Mods = new List<Mod>() };
            }
        }

        try
        {
            var json = File.ReadAllText(filePath);
            var list = JsonSerializer.Deserialize<ModList>(json);
            return list ?? new ModList { Name = name.Trim(), Mods = new List<Mod>() };
        }
        catch
        {
            // Return empty list on deserialization error
            return new ModList { Name = name.Trim(), Mods = new List<Mod>() };
        }
    }

    /// <summary>
    /// Creates a new empty mod list
    /// </summary>
    public void CreateNewList(string name)
    {
        var normalizedName = NormalizeListName(name);
        var newList = new ModList { 
            Name = name.Trim(),
            Mods = new List<Mod>() 
        };
        SaveList(newList);
    }

    /// <summary>
    /// Renames an existing mod list
    /// </summary>
    public bool RenameList(string oldName, string newName)
    {
        var oldNormalized = NormalizeListName(oldName);
        var newNormalized = NormalizeListName(newName);
        var oldFile = Path.Combine(_listsDir, oldNormalized + ".json");
        var newFile = Path.Combine(_listsDir, newNormalized + ".json");

        bool isOnlyCaseChange = oldNormalized == newNormalized && oldName.Trim() != newName.Trim();

        if (!File.Exists(oldFile))
            return false;

        if (!isOnlyCaseChange && File.Exists(newFile))
            return false;

        try
        {
            var json = File.ReadAllText(oldFile);
            var list = JsonSerializer.Deserialize<ModList>(json);
            if (list == null)
                return false;

            list.Name = newName.Trim();
            var newJson = JsonSerializer.Serialize(list, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(newFile, newJson);
            
            if (!isOnlyCaseChange || oldFile != newFile)
            {
                File.Delete(oldFile);
            }

            return true;
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// Deletes a mod list
    /// </summary>
    public bool DeleteList(string name)
    {
        var normalizedName = NormalizeListName(name);
        var file = Path.Combine(_listsDir, normalizedName + ".json");
        if (File.Exists(file))
        {
            File.Delete(file);
            return true;
        }
        return false;
    }

    /// <summary>
    /// Saves a mod list to disk
    /// </summary>
    private void SaveList(ModList list)
    {
        var normalizedName = NormalizeListName(list.Name);
        var filePath = Path.Combine(_listsDir, normalizedName + ".json");
        var json = JsonSerializer.Serialize(list, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(filePath, json);
    }

    /// <summary>
    /// Normalizes list name for use as filename
    /// </summary>
    private string NormalizeListName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
            return "default";
            
        var normalized = name.Trim().ToLowerInvariant();
        
        // Replace invalid filename characters
        foreach (var c in Path.GetInvalidFileNameChars())
        {
            normalized = normalized.Replace(c, '_');
        }
        
        // Replace spaces with underscores
        normalized = Regex.Replace(normalized, @"\s+", "_");
        
        return string.IsNullOrEmpty(normalized) ? "default" : normalized;
    }

    #endregion
}