using System.Text.Json;
using System.Text.RegularExpressions;
using ForgeModApi.Models;

namespace ForgeModApi.Services;

public partial class ModService
{
    #region List Management

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

    public ModList LoadList(string name)
    {
        var normalizedName = NormalizeListName(name);
        var filePath = Path.Combine(_listsDir, normalizedName + ".json");

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
                throw new FileNotFoundException($"List '{name}' not found");
            }
        }

        try
        {
            var json = File.ReadAllText(filePath);
            var list = JsonSerializer.Deserialize<ModList>(json);
            
            if (list != null && string.IsNullOrEmpty(list.SelectedSptVersion))
            {
                list.SelectedSptVersion = GetCurrentSptVersion();
                SaveList(list);
            }
            
            return list ?? throw new InvalidDataException($"Invalid list data for '{name}'");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error loading list '{ListName}'", name);
            throw;
        }
    }

    public void CreateNewList(string name)
    {
        var normalizedName = NormalizeListName(name);
        
        var filePath = Path.Combine(_listsDir, normalizedName + ".json");
        if (File.Exists(filePath))
        {
            throw new InvalidOperationException($"List '{name}' already exists");
        }
        
        var currentSptVersion = GetCurrentSptVersion();
        
        var newList = new ModList { 
            Name = name.Trim(),
            Mods = new List<Mod>(),
            SelectedSptVersion = currentSptVersion
        };
        
        SaveList(newList);
        
        _logger.LogInformation("Created new list '{ListName}' with SPT version {SptVersion}", name, currentSptVersion);
    }

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

    public bool DeleteList(string name)
    {
        var normalizedName = NormalizeListName(name);
        
        if (string.Equals(normalizedName, "default", StringComparison.OrdinalIgnoreCase))
        {
            var allLists = LoadAllLists();
            if (allLists.Count <= 1)
            {
                _logger.LogWarning("Cannot delete the default list when it's the only list remaining");
                return false;
            }
        }
        
        var file = Path.Combine(_listsDir, normalizedName + ".json");
        if (File.Exists(file))
        {
            try
            {
                File.Delete(file);
                _logger.LogInformation("List '{ListName}' deleted successfully", name);
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting list '{ListName}'", name);
                return false;
            }
        }
        return false;
    }

    public ModList GetDefaultList()
    {
        var allLists = LoadAllLists();
        
        var defaultList = allLists.FirstOrDefault(list => 
            string.Equals(list.Name, "default", StringComparison.OrdinalIgnoreCase));
        
        if (defaultList != null)
        {
            return defaultList;
        }
        
        if (allLists.Count > 0)
        {
            return allLists.First();
        }
        
        return CreateDefaultListSafely();
    }

    private ModList CreateDefaultListSafely()
    {
        var defaultListName = "default";
        var normalizedName = NormalizeListName(defaultListName);
        var filePath = Path.Combine(_listsDir, normalizedName + ".json");
        
        if (File.Exists(filePath))
        {
            try
            {
                var json = File.ReadAllText(filePath);
                return JsonSerializer.Deserialize<ModList>(json) ?? 
                    throw new InvalidDataException("Invalid default list data");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error loading existing default list, creating new one");
            }
        }
        
        var defaultList = new ModList { 
            Name = defaultListName, 
            Mods = new List<Mod>(),
            SelectedSptVersion = GetCurrentSptVersion()
        };
        
        try
        {
            SaveList(defaultList);
            _logger.LogInformation("Default list created successfully");
        }
        catch (IOException ex) when (ex.Message.Contains("already exists", StringComparison.OrdinalIgnoreCase))
        {
            _logger.LogDebug("Default list already exists, loading it");
            var json = File.ReadAllText(filePath);
            return JsonSerializer.Deserialize<ModList>(json) ?? defaultList;
        }
        
        return defaultList;
    }

    private void SaveList(ModList list)
    {
        var normalizedName = NormalizeListName(list.Name);
        var filePath = Path.Combine(_listsDir, normalizedName + ".json");
        
        var directory = Path.GetDirectoryName(filePath);
        if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
        {
            Directory.CreateDirectory(directory);
        }
        
        var json = JsonSerializer.Serialize(list, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(filePath, json);
    }

    private string NormalizeListName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
            return "default";
            
        var normalized = name.Trim().ToLowerInvariant();
        
        foreach (var c in Path.GetInvalidFileNameChars())
        {
            normalized = normalized.Replace(c, '_');
        }
        
        normalized = Regex.Replace(normalized, @"\s+", "_");
        
        return string.IsNullOrEmpty(normalized) ? "default" : normalized;
    }

    #endregion
}