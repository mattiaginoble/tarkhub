using ForgeModApi.Models;
using System.Net.Http.Headers;
using System.IO.Compression;
using SharpCompress.Archives;
using SharpCompress.Common;

namespace ForgeModApi.Services;

public partial class ModService
{
    #region Mod Download and Installation - Simplified Logic
    
    public async Task<ModDownloadResult> DownloadAndExtractModAsync(string listName, int modId, bool forceDownload = false)
    {
        string? tempDir = null;
        try
        {
            var list = LoadList(listName);
            var mod = list.Mods.FirstOrDefault(m => m.Id == modId);
            
            if (mod == null)
                return new ModDownloadResult { Success = false, Message = "Mod not found in list" };

            _logger.LogInformation("Starting mod download: {ModName} (ID: {ModId})", mod.Name, mod.Id);

            if (!Directory.Exists(_sptServerDir))
            {
                Directory.CreateDirectory(_sptServerDir);
                _logger.LogInformation("Created SPT server directory: {ServerDir}", _sptServerDir);
            }

            if (!forceDownload && IsModInstalled(mod.Id, mod.Name))
            {
                _logger.LogInformation("Mod {ModName} already installed, skipping download", mod.Name);
                return new ModDownloadResult { 
                    Success = true, 
                    Message = $"Mod '{mod.Name}' already installed", 
                    ModName = mod.Name 
                };
            }

            var downloadUrl = mod.DownloadUrl;
            
            if (string.IsNullOrEmpty(downloadUrl))
            {
                _logger.LogWarning("Download URL not available for {ModName}", mod.Name);
                return new ModDownloadResult { Success = false, Message = "Download URL not available for this mod" };
            }

            tempDir = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
            Directory.CreateDirectory(tempDir);

            var fileName = $"{mod.Id}{Path.GetExtension(downloadUrl) ?? ".zip"}";
            var tempFilePath = Path.Combine(tempDir, fileName);
            
            using (var httpClient = new HttpClient())
            {
                httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _apiKey);
                httpClient.DefaultRequestHeaders.Add("User-Agent", "TarkHub/1.0");
                
                var response = await httpClient.GetAsync(downloadUrl);
                
                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogError("Download error: {StatusCode}", response.StatusCode);
                    return new ModDownloadResult { 
                        Success = false, 
                        Message = $"File download error: {response.StatusCode}" 
                    };
                }

                await using var stream = await response.Content.ReadAsStreamAsync();
                await using var fileStream = new FileStream(tempFilePath, FileMode.Create);
                await stream.CopyToAsync(fileStream);
            }

            _logger.LogInformation("Download completed: {FileSize} bytes", new FileInfo(tempFilePath).Length);

            var extractDir = Path.Combine(tempDir, "extract");
            Directory.CreateDirectory(extractDir);

            await ExtractArchiveFile(tempFilePath, extractDir);

            var modType = DetermineModType(extractDir);
            if (modType != "unknown")
            {
                mod.ModType = modType;
                SaveList(list);
                _logger.LogInformation("Detected mod type for '{ModName}': {ModType}", mod.Name, modType);
            }

            var hasSPT = Directory.Exists(Path.Combine(extractDir, "SPT"));
            var hasBepInEx = Directory.Exists(Path.Combine(extractDir, "BepInEx"));
            
            _logger.LogInformation("Mod structure - SPT: {HasSPT}, BepInEx: {HasBepInEx}", hasSPT, hasBepInEx);

            if (hasSPT || hasBepInEx)
            {
                RenameModFolders(extractDir, mod.Name);
                
                CopyDirectoryContents(extractDir, _sptServerDir);
                _logger.LogInformation("Mod '{ModName}' installed with standard structure", mod.Name);
                
                return new ModDownloadResult { 
                    Success = true, 
                    Message = $"Mod '{mod.Name}' downloaded and installed successfully!",
                    ModName = mod.Name
                };
            }
            else
            {
                var pendingDir = Path.Combine(_sptServerDir, "pending_installation", GetSafeFileName(mod.Name));
                SafeDeleteDirectory(pendingDir);
                Directory.CreateDirectory(pendingDir);
                CopyDirectoryContents(extractDir, pendingDir);
                
                _logger.LogWarning("Mod '{ModName}' has non-standard structure, pending user choice", mod.Name);

                return new ModDownloadResult { 
                    Success = true,
                    Message = "MOD_STRUCTURE_CHOICE_NEEDED",
                    ModName = mod.Name,
                    requiresUserChoice = true,
                    TempExtractPath = pendingDir
                };  
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error downloading mod");
            return new ModDownloadResult { Success = false, Message = $"Error: {ex.Message}" };
        }
        finally
        {
            if (tempDir != null && Directory.Exists(tempDir))
            {
                try
                {
                    SafeDeleteDirectory(tempDir);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to clean up temporary directory: {TempDir}", tempDir);
                }
            }
        }
    }

    private string DetermineModType(string extractDir)
    {
        try
        {
            bool hasSPT = Directory.Exists(Path.Combine(extractDir, "SPT"));
            bool hasBepInEx = Directory.Exists(Path.Combine(extractDir, "BepInEx"));

            if (hasSPT && hasBepInEx)
                return "both";
            else if (hasSPT)
                return "server";
            else if (hasBepInEx)
                return "client";
            else
                return "unknown";
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error determining mod type from directory structure");
            return "unknown";
        }
    }

    private async Task ExtractArchiveFile(string archivePath, string extractDir)
    {
        var fileExtension = Path.GetExtension(archivePath).ToLower();
        
        switch (fileExtension)
        {
            case ".zip":
                ZipFile.ExtractToDirectory(archivePath, extractDir, true);
                break;
            
            case ".7z":
                await Extract7zFile(archivePath, extractDir);
                break;
            
            default:
                await ExtractWithSharpCompress(archivePath, extractDir);
                break;
        }
    }

    private async Task Extract7zFile(string archivePath, string extractDir)
    {
        await Task.Run(() =>
        {
            using (var archive = ArchiveFactory.Open(archivePath))
            {
                foreach (var entry in archive.Entries)
                {
                    if (!entry.IsDirectory)
                    {
                        string entryPath = Path.Combine(extractDir, entry.Key);
                        string? entryDir = Path.GetDirectoryName(entryPath);
                        
                        if (!string.IsNullOrEmpty(entryDir) && !Directory.Exists(entryDir))
                        {
                            Directory.CreateDirectory(entryDir);
                        }

                        entry.WriteToFile(entryPath);
                    }
                }
            }
        });
    }

    private async Task ExtractWithSharpCompress(string archivePath, string extractDir)
    {
        await Task.Run(() =>
        {
            using (var archive = ArchiveFactory.Open(archivePath))
            {
                foreach (var entry in archive.Entries)
                {
                    if (!entry.IsDirectory)
                    {
                        string entryPath = Path.Combine(extractDir, entry.Key);
                        string? entryDir = Path.GetDirectoryName(entryPath);
                        
                        if (!string.IsNullOrEmpty(entryDir) && !Directory.Exists(entryDir))
                        {
                            Directory.CreateDirectory(entryDir);
                        }

                        entry.WriteToFile(entryPath);
                    }
                }
            }
        });
    }

    private void CopyDirectoryContents(string sourceDir, string targetDir)
    {
        if (!Directory.Exists(targetDir))
            Directory.CreateDirectory(targetDir);

        foreach (var dir in Directory.GetDirectories(sourceDir))
        {
            var dirName = Path.GetFileName(dir);
            if (!string.IsNullOrEmpty(dirName))
            {
                var destDir = Path.Combine(targetDir, dirName);
                CopyDirectory(dir, destDir, true);
            }
        }

        foreach (var file in Directory.GetFiles(sourceDir))
        {
            var fileName = Path.GetFileName(file);
            if (!string.IsNullOrEmpty(fileName))
            {
                var destFile = Path.Combine(targetDir, fileName);
                File.Copy(file, destFile, true);
            }
        }
    }

    private void RenameModFolders(string extractDir, string modName)
    {
        try
        {
            var safeModName = GetSafeFileName(modName);
            
            var bepinexPluginsPath = Path.Combine(extractDir, "BepInEx", "plugins");
            if (Directory.Exists(bepinexPluginsPath))
            {
                RenameSubdirectories(bepinexPluginsPath, safeModName);
            }

            var sptModsPath = Path.Combine(extractDir, "SPT", "user", "mods");
            if (Directory.Exists(sptModsPath))
            {
                RenameSubdirectories(sptModsPath, safeModName);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error renaming mod folders for {ModName}, continuing with original structure", modName);
        }
    }

    private void RenameSubdirectories(string parentPath, string newName)
    {
        try
        {
            var subDirs = Directory.GetDirectories(parentPath);
            if (subDirs.Length == 1)
            {
                var singleDir = subDirs[0];
                var dirName = Path.GetFileName(singleDir);
                
                if (!string.Equals(dirName, newName, StringComparison.OrdinalIgnoreCase))
                {
                    var newPath = Path.Combine(parentPath, newName);
                    
                    if (Directory.Exists(newPath))
                    {
                        Directory.Delete(newPath, true);
                    }
                    
                    Directory.Move(singleDir, newPath);
                    _logger.LogInformation("Renamed mod folder: {OldName} -> {NewName}", dirName, newName);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error renaming subdirectories in {ParentPath}", parentPath);
        }
    }

    public bool CompleteModInstallation(string modName, string tempExtractPath, bool installAsServerMod)
    {
        try
        {
            var targetBaseDir = installAsServerMod 
                ? Path.Combine(_sptServerDir, "SPT", "user", "mods", GetSafeFileName(modName))
                : Path.Combine(_sptServerDir, "BepInEx", "plugins", GetSafeFileName(modName));

            var parentDir = Path.GetDirectoryName(targetBaseDir);
            if (!string.IsNullOrEmpty(parentDir) && !Directory.Exists(parentDir))
            {
                Directory.CreateDirectory(parentDir);
            }

            SafeDeleteDirectory(targetBaseDir);
            CopyDirectoryContents(tempExtractPath, targetBaseDir);
            
            SafeDeleteDirectory(tempExtractPath);
            
            var modType = installAsServerMod ? "server" : "client";
            UpdateModTypeInAllLists(modName, modType);
            
            _logger.LogInformation("Mod '{ModName}' installed as {ModType} mod", modName, installAsServerMod ? "server" : "client");
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error completing mod installation for {ModName}", modName);
            return false;
        }
    }

    private void UpdateModTypeInAllLists(string modName, string modType)
    {
        try
        {
            var allLists = LoadAllLists();
            foreach (var list in allLists)
            {
                var mod = list.Mods.FirstOrDefault(m => m.Name == modName);
                if (mod != null && mod.ModType == "unknown")
                {
                    mod.ModType = modType;
                    SaveList(list);
                    _logger.LogInformation("Updated mod type for '{ModName}' in list '{ListName}': {ModType}", modName, list.Name, modType);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error updating mod type in lists for {ModName}", modName);
        }
    }

    public async Task<List<ModDownloadResult>> DownloadAllModsAsync(string listName, bool forceDownload = false)
    {
        var list = LoadList(listName);
        var results = new List<ModDownloadResult>();

        foreach (var mod in list.Mods)
        {
            if (!forceDownload && IsModInstalled(mod.Id, mod.Name))
            {
                results.Add(new ModDownloadResult { 
                    Success = true, 
                    Message = $"Mod '{mod.Name}' already installed", 
                    ModName = mod.Name 
                });
                _logger.LogInformation("Mod {ModName} already installed, skipping download", mod.Name);
                continue;
            }

            var result = await DownloadAndExtractModAsync(listName, mod.Id, forceDownload);
            results.Add(result);
            await Task.Delay(1000);
        }

        return results;
    }

    public bool IsModInstalled(int modId, string modName)
    {
        var normalizedModName = GetSafeFileName(modName);
        
        var sptModsDir = Path.Combine(_sptServerDir, "SPT", "user", "mods", normalizedModName);
        if (Directory.Exists(sptModsDir))
            return true;

        var bepinexPluginsDir = Path.Combine(_sptServerDir, "BepInEx", "plugins", normalizedModName);
        if (Directory.Exists(bepinexPluginsDir))
            return true;
        
        return false;
    }

    public bool RemoveModFromInstallation(int modId, string modName)
    {
        try
        {
            _logger.LogInformation("Removing mod: {ModName}", modName);
            var normalizedModName = GetSafeFileName(modName);
            var removed = false;

            var sptModsDir = Path.Combine(_sptServerDir, "SPT", "user", "mods", normalizedModName);
            if (Directory.Exists(sptModsDir))
            {
                Directory.Delete(sptModsDir, true);
                removed = true;
            }

            var bepinexPluginsDir = Path.Combine(_sptServerDir, "BepInEx", "plugins", normalizedModName);
            if (Directory.Exists(bepinexPluginsDir))
            {
                Directory.Delete(bepinexPluginsDir, true);
                removed = true;
            }

            if (removed)
            {
                _logger.LogInformation("Mod '{ModName}' removed successfully", modName);
            }

            return removed;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error removing mod");
            return false;
        }
    }

    private void SafeDeleteDirectory(string directoryPath, int maxRetries = 3)
    {
        if (!Directory.Exists(directoryPath)) return;

        for (int i = 0; i < maxRetries; i++)
        {
            try
            {
                Directory.Delete(directoryPath, true);
                return;
            }
            catch (IOException ex) when (i < maxRetries - 1)
            {
                _logger.LogWarning("Directory delete failed (attempt {Attempt}), retrying: {Message}", i + 1, ex.Message);
                Thread.Sleep(1000 * (i + 1));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to delete directory after {Attempts} attempts: {Directory}", i + 1, directoryPath);
                break;
            }
        }
    }
    
    #endregion
}