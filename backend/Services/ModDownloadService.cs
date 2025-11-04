using ForgeModApi.Models;
using System.Net.Http.Headers;
using System.IO.Compression;
using SharpCompress.Archives;
using SharpCompress.Common;

namespace ForgeModApi.Services;

public partial class ModService
{
    #region Mod Download and Installation
    
    public async Task<ModDownloadResult> DownloadAndExtractModAsync(string listName, int modId, bool forceDownload = false)
    {
        string tempDir = null;
        try
        {
            var list = LoadList(listName);
            var mod = list.Mods.FirstOrDefault(m => m.Id == modId);
            
            if (mod == null)
                return new ModDownloadResult { Success = false, Message = "Mod not found in list" };

            _logger.LogInformation("Starting mod download: {ModName} (ID: {ModId})", mod.Name, mod.Id);

            if (!Directory.Exists(_sptServerDir))
            {
                try
                {
                    Directory.CreateDirectory(_sptServerDir);
                    _logger.LogInformation("Created SPT server directory: {ServerDir}", _sptServerDir);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to create SPT server directory");
                    return new ModDownloadResult { 
                        Success = false, 
                        Message = $"Cannot create SPT server directory: {ex.Message}" 
                    };
                }
            }

            if (!forceDownload && IsModInstalled(modId, mod.Name))
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

            try
            {
                var extractDir = Path.Combine(tempDir, "extract");
                Directory.CreateDirectory(extractDir);

                var fileExtension = Path.GetExtension(tempFilePath).ToLower();
                
                switch (fileExtension)
                {
                    case ".zip":
                        ZipFile.ExtractToDirectory(tempFilePath, extractDir, true);
                        break;
                    
                    case ".7z":
                        await Extract7zFileAsync(tempFilePath, extractDir);
                        break;
                    
                    default:
                        await ExtractArchiveFileAsync(tempFilePath, extractDir);
                        break;
                }

                var userModsDir = Path.Combine(_sptServerDir, "SPT", "user", "mods");
                if (!Directory.Exists(userModsDir))
                    Directory.CreateDirectory(userModsDir);

                ProcessModExtraction(extractDir, mod);
                _logger.LogInformation("Mod '{ModName}' installed successfully", mod.Name);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Extraction error");
                return new ModDownloadResult { Success = false, Message = $"Extraction error: {ex.Message}" };
            }

            return new ModDownloadResult { 
                Success = true, 
                Message = $"Mod '{mod.Name}' downloaded and installed successfully!",
                ModName = mod.Name
            };
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

    private async Task Extract7zFileAsync(string archivePath, string extractDir)
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
                        string entryDir = Path.GetDirectoryName(entryPath);
                        
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

    private async Task ExtractArchiveFileAsync(string archivePath, string extractDir)
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
                        string entryDir = Path.GetDirectoryName(entryPath);
                        
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

    private void ProcessModExtraction(string extractDir, Mod mod)
    {
        if (!ValidateSptDirectoryStructure())
        {
            throw new InvalidOperationException("SPT server directory structure is invalid or incomplete");
        }

        var normalizedModName = GetSafeFileName(mod.Name);
        _logger.LogInformation("Processing mod extraction for: {ModName}", mod.Name);

        var topLevelDirs = Directory.GetDirectories(extractDir);

        foreach (var topDir in topLevelDirs)
        {
            var bepinexPath = Path.Combine(topDir, "BepInEx", "plugins");
            if (Directory.Exists(bepinexPath))
            {
                _logger.LogInformation("Found BepInEx/plugins in: {TopDir}", Path.GetFileName(topDir));
                ProcessBepInExPlugins(bepinexPath, mod);
                return;
            }

            var dllFiles = Directory.GetFiles(topDir, "*.dll", SearchOption.TopDirectoryOnly);
            if (dllFiles.Length > 0)
            {
                _logger.LogInformation("Found DLL files in: {TopDir}", Path.GetFileName(topDir));
                var targetPluginDir = Path.Combine(_sptServerDir, "BepInEx", "plugins", normalizedModName);
                SafeDeleteDirectory(targetPluginDir);
                Directory.CreateDirectory(targetPluginDir);
                
                foreach (var dllFile in dllFiles)
                {
                    var fileName = Path.GetFileName(dllFile);
                    var targetFile = Path.Combine(targetPluginDir, fileName);
                    File.Copy(dllFile, targetFile, true);
                }
                return;
            }
        }

        var actualModDir = FindActualModDirectory(extractDir);
        
        if (actualModDir != null)
        {
            if (actualModDir.Contains("BepInEx") && actualModDir.Contains("plugins"))
            {
                ProcessBepInExPlugins(actualModDir, mod);
            }
            else
            {
                var targetPluginDir = Path.Combine(_sptServerDir, "BepInEx", "plugins", normalizedModName);
                SafeDeleteDirectory(targetPluginDir);
                Directory.CreateDirectory(targetPluginDir);
                
                var dllFiles = Directory.GetFiles(actualModDir, "*.dll");
                foreach (var dllFile in dllFiles)
                {
                    var fileName = Path.GetFileName(dllFile);
                    var targetFile = Path.Combine(targetPluginDir, fileName);
                    File.Copy(dllFile, targetFile, true);
                }
            }
            return;
        }

        _logger.LogWarning("No mod structure found, using fallback method");
        CopyRemainingFilesFallback(extractDir, normalizedModName);
    }

    private void CopyRemainingFilesFallback(string extractDir, string normalizedModName)
    {
        var allFiles = Directory.GetFiles(extractDir, "*.dll", SearchOption.AllDirectories);
        
        if (allFiles.Length == 0)
        {
            _logger.LogWarning("No DLL files found in extraction directory");
            return;
        }

        var targetPluginDir = Path.Combine(_sptServerDir, "BepInEx", "plugins", normalizedModName);
        SafeDeleteDirectory(targetPluginDir);
        Directory.CreateDirectory(targetPluginDir);

        foreach (var file in allFiles)
        {
            try
            {
                var fileName = file.Split(Path.DirectorySeparatorChar).Last();
                
                if (fileName.Contains('\\'))
                {
                    fileName = fileName.Split('\\').Last();
                }
                
                var destPath = Path.Combine(targetPluginDir, fileName);
                File.Copy(file, destPath, true);
                _logger.LogInformation("Copied DLL: {FileName}", fileName);
            }
            catch (Exception ex)
            {
                _logger.LogWarning("Failed to copy DLL {File}: {Message}", file, ex.Message);
            }
        }
    }

    private void ProcessBepInExPlugins(string bepinexPluginsPath, Mod mod)
    {
        var normalizedPluginName = GetSafeFileName(mod.Name);
        var targetPluginDir = Path.Combine(_sptServerDir, "BepInEx", "plugins", normalizedPluginName);

        var pluginDirs = Directory.GetDirectories(bepinexPluginsPath);
        foreach (var pluginDir in pluginDirs)
        {
            var dirName = Path.GetFileName(pluginDir);
            var newPluginDir = Path.Combine(targetPluginDir, dirName);

            if (Directory.Exists(newPluginDir))
                Directory.Delete(newPluginDir, true);

            Directory.CreateDirectory(Path.GetDirectoryName(newPluginDir)!);
            CopyDirectory(pluginDir, newPluginDir, true);
        }
        
        var pluginFiles = Directory.GetFiles(bepinexPluginsPath, "*.dll");
        if (pluginFiles.Length > 0)
        {
            if (!Directory.Exists(targetPluginDir))
            {
                Directory.CreateDirectory(targetPluginDir);
            }

            foreach (var pluginFile in pluginFiles)
            {
                var fileName = Path.GetFileName(pluginFile);
                var newPluginFile = Path.Combine(targetPluginDir, fileName);
                File.Copy(pluginFile, newPluginFile, true);
            }
        }

        var otherFiles = Directory.GetFiles(bepinexPluginsPath)
            .Where(f => !f.EndsWith(".dll") && !f.EndsWith(".tmp"))
            .ToArray();
            
        if (otherFiles.Length > 0)
        {
            foreach (var otherFile in otherFiles)
            {
                var fileName = Path.GetFileName(otherFile);
                var newFile = Path.Combine(targetPluginDir, fileName);
                File.Copy(otherFile, newFile, true);
            }
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
        
        var sptModsDir = Path.Combine(_sptServerDir, "SPT", "user", "mods");
        if (Directory.Exists(sptModsDir))
        {
            var modDir = Path.Combine(sptModsDir, normalizedModName);
            if (Directory.Exists(modDir))
                return true;
        }

        var bepinexPluginsDir = Path.Combine(_sptServerDir, "BepInEx", "plugins");
        if (Directory.Exists(bepinexPluginsDir))
        {
            var pluginDir = Path.Combine(bepinexPluginsDir, normalizedModName);
            if (Directory.Exists(pluginDir))
                return true;
        }
        
        return false;
    }

    public bool RemoveModFromInstallation(int modId, string modName)
    {
        try
        {
            _logger.LogInformation("Removing mod: {ModName}", modName);
            var normalizedModName = GetSafeFileName(modName);
            var removed = false;

            var sptModsDir = Path.Combine(_sptServerDir, "SPT", "user", "mods");
            if (Directory.Exists(sptModsDir))
            {
                var modDir = Path.Combine(sptModsDir, normalizedModName);
                if (Directory.Exists(modDir))
                {
                    Directory.Delete(modDir, true);
                    removed = true;
                }
            }

            var bepinexPluginsDir = Path.Combine(_sptServerDir, "BepInEx", "plugins");
            if (Directory.Exists(bepinexPluginsDir))
            {
                var pluginDir = Path.Combine(bepinexPluginsDir, normalizedModName);
                if (Directory.Exists(pluginDir))
                {
                    Directory.Delete(pluginDir, true);
                    removed = true;
                }
            }

            if (RemoveModConfigFiles(modId, modName))
            {
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

    private bool RemoveModConfigFiles(int modId, string modName)
    {
        try
        {
            var removed = false;
            var normalizedModName = GetSafeFileName(modName);

            var configDirs = new[]
            {
                Path.Combine(_sptServerDir, "SPT", "user", "configs"),
                Path.Combine(_sptServerDir, "BepInEx", "config"),
                Path.Combine(_sptServerDir, "SPT", "Aki_Data", "Server", "configs")
            };

            foreach (var configDir in configDirs)
            {
                if (!Directory.Exists(configDir)) continue;

                var configFiles = Directory.GetFiles(configDir, "*.json", SearchOption.AllDirectories)
                    .Concat(Directory.GetFiles(configDir, "*.cfg", SearchOption.AllDirectories));

                foreach (var configFile in configFiles)
                {
                    try
                    {
                        var content = File.ReadAllText(configFile);
                        if (content.Contains(normalizedModName) || content.Contains(modId.ToString()))
                        {
                            File.Delete(configFile);
                            removed = true;
                        }
                    }
                    catch
                    {
                        // Ignore files that cannot be read
                    }
                }
            }

            return removed;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error removing config files");
            return false;
        }
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

    private string? FindActualModDirectory(string extractDir)
    {
        try
        {
            var allDirectories = Directory.GetDirectories(extractDir, "*", SearchOption.AllDirectories);

            foreach (var dir in allDirectories)
            {
                var relativePath = GetRelativePath(extractDir, dir);

                if (relativePath.Replace('\\', '/').EndsWith("BepInEx/plugins", StringComparison.OrdinalIgnoreCase) ||
                    relativePath.Replace('\\', '/').Contains("BepInEx/plugins/", StringComparison.OrdinalIgnoreCase))
                {
                    var dllFiles = Directory.GetFiles(dir, "*.dll", SearchOption.TopDirectoryOnly);
                    
                    if (dllFiles.Length > 0)
                    {
                        return dir;
                    }
                }
            }

            foreach (var dir in allDirectories)
            {
                var dllFiles = Directory.GetFiles(dir, "*.dll", SearchOption.TopDirectoryOnly);
                if (dllFiles.Length > 0)
                {
                    return dir;
                }
            }

            return null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error finding mod directory");
            return null;
        }
    }

    private string GetRelativePath(string fromPath, string toPath)
    {
        try
        {
            var fromUri = new Uri(fromPath + Path.DirectorySeparatorChar);
            var toUri = new Uri(toPath + Path.DirectorySeparatorChar);
            
            var relativeUri = fromUri.MakeRelativeUri(toUri);
            var relativePath = Uri.UnescapeDataString(relativeUri.ToString());
            
            return relativePath.Replace('/', Path.DirectorySeparatorChar).TrimEnd(Path.DirectorySeparatorChar);
        }
        catch
        {
            return toPath;
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