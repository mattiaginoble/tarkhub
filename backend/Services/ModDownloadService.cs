using ForgeModApi.Models;
using System.Net.Http.Headers;
using System.IO.Compression;

namespace ForgeModApi.Services;

public partial class ModService
{
    #region Mod Download and Installation

    /// <summary>
    /// Downloads and extracts a mod to the SPT server directory
    /// </summary>
    public async Task<ModDownloadResult> DownloadAndExtractModAsync(string listName, int modId, bool forceDownload = false)
    {
        try
        {
            var list = LoadList(listName);
            var mod = list.Mods.FirstOrDefault(m => m.Id == modId);
            
            if (mod == null)
                return new ModDownloadResult { Success = false, Message = "Mod not found in list" };

            _logger.LogInformation("Starting mod download: {ModName} (ID: {ModId})", mod.Name, mod.Id);

            // Skip download if mod is already installed and forceDownload is false
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

            // Create temporary directory
            var tempDir = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
            Directory.CreateDirectory(tempDir);

            // Ensure SPT server directory exists
            if (!Directory.Exists(_sptServerDir))
            {
                Directory.CreateDirectory(_sptServerDir);
            }

            // Download the file
            var tempZipPath = Path.Combine(tempDir, $"{mod.Id}.zip");
            
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
                await using var fileStream = new FileStream(tempZipPath, FileMode.Create);
                await stream.CopyToAsync(fileStream);
            }

            _logger.LogInformation("Download completed: {FileSize} bytes", new FileInfo(tempZipPath).Length);

            // Extract the file
            try
            {
                var extractDir = Path.Combine(tempDir, "extract");
                ZipFile.ExtractToDirectory(tempZipPath, extractDir, true);

                // Create user/mods directory if it doesn't exist
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
            finally
            {
                // Cleanup temporary files
                try
                {
                    if (Directory.Exists(tempDir))
                        Directory.Delete(tempDir, true);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Cleanup error");
                }
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
    }

    /// <summary>
    /// Processes mod extraction by handling different directory structures
    /// </summary>
    private void ProcessModExtraction(string extractDir, Mod mod)
    {
        // Handle SPT/user/mods/ folder
        var sptModsPath = Path.Combine(extractDir, "SPT", "user", "mods");
        if (Directory.Exists(sptModsPath))
        {
            var modDirs = Directory.GetDirectories(sptModsPath);
            if (modDirs.Length > 0)
            {
                var originalModDir = modDirs[0];
                var normalizedModName = GetSafeFileName(mod.Name);
                var newModDir = Path.Combine(_sptServerDir, "SPT", "user", "mods", normalizedModName);

                _logger.LogInformation("Renaming SPT mod to: {NormalizedModName}", normalizedModName);

                if (Directory.Exists(newModDir))
                    Directory.Delete(newModDir, true);

                CopyDirectory(originalModDir, newModDir, true);
            }
        }

        // Handle BepInEx/plugins/ folder
        var bepinexPluginsPath = Path.Combine(extractDir, "BepInEx", "plugins");
        if (Directory.Exists(bepinexPluginsPath))
        {
            ProcessBepInExPlugins(bepinexPluginsPath, mod);
        }

        // Copy all remaining content
        CopyRemainingFiles(extractDir);
    }

    /// <summary>
    /// Processes BepInEx plugins by renaming and organizing them
    /// </summary>
    private void ProcessBepInExPlugins(string bepinexPluginsPath, Mod mod)
    {
        var pluginDirs = Directory.GetDirectories(bepinexPluginsPath);
        foreach (var pluginDir in pluginDirs)
        {
            var normalizedPluginName = GetSafeFileName(mod.Name);
            var newPluginDir = Path.Combine(_sptServerDir, "BepInEx", "plugins", normalizedPluginName);

            _logger.LogInformation("Renaming BepInEx plugin to: {NormalizedPluginName}", normalizedPluginName);

            if (Directory.Exists(newPluginDir))
                Directory.Delete(newPluginDir, true);

            CopyDirectory(pluginDir, newPluginDir, true);
        }
        
        // Handle .dll files directly in plugins/
        var pluginFiles = Directory.GetFiles(bepinexPluginsPath, "*.dll");
        foreach (var pluginFile in pluginFiles)
        {
            var normalizedPluginName = GetSafeFileName(mod.Name);
            var pluginFolder = Path.Combine(_sptServerDir, "BepInEx", "plugins", normalizedPluginName);

            if (Directory.Exists(pluginFolder))
                Directory.Delete(pluginFolder, true);
                
            Directory.CreateDirectory(pluginFolder);
            
            var newPluginFile = Path.Combine(pluginFolder, Path.GetFileName(pluginFile));
            File.Copy(pluginFile, newPluginFile, true);
        }
    }

    /// <summary>
    /// Copies remaining files from extraction directory to SPT server
    /// </summary>
    private void CopyRemainingFiles(string extractDir)
    {
        var allFiles = Directory.GetFiles(extractDir, "*.*", SearchOption.AllDirectories);
        foreach (var file in allFiles)
        {
            // Skip files that were already processed in specific folders
            if (file.Contains(Path.Combine("SPT", "user", "mods") + Path.DirectorySeparatorChar))
                continue;
                
            if (file.Contains(Path.Combine("BepInEx", "plugins") + Path.DirectorySeparatorChar))
                continue;

            var relativePath = file.Substring(extractDir.Length + 1);
            var destPath = Path.Combine(_sptServerDir, relativePath);

            var destDir = Path.GetDirectoryName(destPath);
            if (!string.IsNullOrEmpty(destDir))
            {
                Directory.CreateDirectory(destDir);
            }

            File.Copy(file, destPath, true);
        }
    }

    /// <summary>
    /// Downloads all mods in a list with optional force download
    /// </summary>
    public async Task<List<ModDownloadResult>> DownloadAllModsAsync(string listName, bool forceDownload = false)
    {
        var list = LoadList(listName);
        var results = new List<ModDownloadResult>();

        foreach (var mod in list.Mods)
        {
            // Skip already installed mods unless force download is enabled
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
            
            // Add delay between downloads to avoid rate limiting
            await Task.Delay(1000);
        }

        return results;
    }

    /// <summary>
    /// Checks if a mod is already installed in the SPT server directory
    /// </summary>
    public bool IsModInstalled(int modId, string modName)
    {
        var normalizedModName = GetSafeFileName(modName);
        
        // Check in SPT/user/mods/
        var sptModsDir = Path.Combine(_sptServerDir, "SPT", "user", "mods");
        if (Directory.Exists(sptModsDir))
        {
            var modDir = Path.Combine(sptModsDir, normalizedModName);
            if (Directory.Exists(modDir))
                return true;
        }

        // Check in BepInEx/plugins/
        var bepinexPluginsDir = Path.Combine(_sptServerDir, "BepInEx", "plugins");
        if (Directory.Exists(bepinexPluginsDir))
        {
            var pluginDir = Path.Combine(bepinexPluginsDir, normalizedModName);
            if (Directory.Exists(pluginDir))
                return true;
        }
        
        return false;
    }

    /// <summary>
    /// Removes a mod from the SPT server installation
    /// </summary>
    public bool RemoveModFromInstallation(int modId, string modName)
    {
        try
        {
            _logger.LogInformation("Removing mod: {ModName}", modName);
            var normalizedModName = GetSafeFileName(modName);
            var removed = false;

            // Remove from SPT/user/mods/
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

            // Remove from BepInEx/plugins/
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

            // Remove configuration files
            if (RemoveModConfigFiles(modId, modName))
            {
                removed = true;
            }

            if (removed)
            {
                _logger.LogInformation("Mod '{ModName}' removed successfully", modName);
            }
            else
            {
                _logger.LogInformation("No installation found for mod '{ModName}'", modName);
            }

            return removed;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error removing mod");
            return false;
        }
    }

    /// <summary>
    /// Removes configuration files associated with a mod
    /// </summary>
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
                        // Check if config file belongs to this mod
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

    #endregion
}