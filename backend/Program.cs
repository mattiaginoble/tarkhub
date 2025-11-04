using ForgeModApi.Services;

var builder = WebApplication.CreateBuilder(args);

// Register services
builder.Services.AddHttpClient<ModService>();
builder.Services.AddSingleton<ModService>();

var app = builder.Build();

// Serve static files from "/mod" path
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(
        Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "mod")
    ),
    RequestPath = "/mod"
});

app.UseRouting();

// Map API routes
app.MapModListRoutes();
app.MapModRoutes();
app.MapSptRoutes();
app.MapFikaRoutes();
app.MapServerStatusRoutes();

// SPA fallback
app.MapFallbackToFile("/mod/{*path:nonfile}", "mod/index.html");

app.Run();

app.MapGet("/health", () => 
{
    return Results.Ok(new { 
        status = "healthy", 
        timestamp = DateTime.UtcNow,
        services = new {
            dotnet = "running",
            spt = "checking...",
            nginx = "checking..."
        }
    });
});

app.MapGet("/health/detailed", async (ModService modService) =>
{
    var sptHealth = false;
    var nginxHealth = false;
    
    try
    {
        // Check SPT server
        using var client = new HttpClient();
        var response = await client.GetAsync("http://localhost:6970/");
        sptHealth = response.IsSuccessStatusCode;
    }
    catch { /* SPT might be starting */ }
    
    try
    {
        // Check nginx
        using var client = new HttpClient();
        var response = await client.GetAsync("http://localhost:6969/");
        nginxHealth = response.IsSuccessStatusCode;
    }
    catch { /* nginx might be starting */ }
    
    return Results.Ok(new { 
        status = "healthy", 
        timestamp = DateTime.UtcNow,
        services = new {
            dotnet = "running",
            spt = sptHealth ? "running" : "starting",
            nginx = nginxHealth ? "running" : "starting"
        }
    });
});

// ==================================================
// ROUTE EXTENSION METHODS
// ==================================================

public static class RouteExtensions
{
    // ========== MOD LIST MANAGEMENT ==========
    public static IEndpointRouteBuilder MapModListRoutes(this IEndpointRouteBuilder app)
    {
        // Get all mod list names
        app.MapGet("/api/mod_lists", (ModService modService) =>
        {
            var lists = modService.LoadAllLists();
            var listNames = lists.Select(l => l.Name).ToList();
            return Results.Json(listNames);
        });

        // Get specific mod list
        app.MapGet("/api/mod_list/{name}", (string name, ModService modService) =>
        {
            var list = modService.LoadList(name);
            return Results.Json(list.Mods);
        });

        // Create new mod list
        app.MapPost("/api/mod_list", async (ModService modService, HttpContext context) =>
        {
            var body = await context.Request.ReadFromJsonAsync<Dictionary<string, string>>();
            if (body == null || !body.TryGetValue("name", out var listName) || string.IsNullOrWhiteSpace(listName))
                return Results.BadRequest(new { error = "Missing or invalid list name" });

            modService.CreateNewList(listName.Trim());
            return Results.Ok(new { message = $"List '{listName}' created successfully" });
        });

        // Rename mod list
        app.MapPost("/api/mod_list/rename", async (ModService modService, HttpContext context) =>
        {
            var body = await context.Request.ReadFromJsonAsync<Dictionary<string, string>>();
            if (body == null ||
                !body.TryGetValue("oldName", out var oldName) || string.IsNullOrWhiteSpace(oldName) ||
                !body.TryGetValue("newName", out var newName) || string.IsNullOrWhiteSpace(newName))
            {
                return Results.BadRequest(new { error = "oldName and newName parameters are required" });
            }

            var success = modService.RenameList(oldName.Trim(), newName.Trim());
            if (!success)
                return Results.BadRequest(new { error = "Error renaming list" });

            return Results.Ok(new { message = $"List renamed from '{oldName}' to '{newName}' successfully" });
        });

        // Delete specific mod list
        app.MapDelete("/api/mod_list/{name}", (string name, ModService modService) =>
        {
            var success = modService.DeleteList(name);
            if (!success)
                return Results.NotFound(new { error = "List not found" });
            
            return Results.Ok(new { message = $"List '{name}' deleted successfully" });
        });

        // Get SPT version for list
        app.MapGet("/api/mod_list/{name}/spt_version", (string name, ModService modService) =>
        {
            var sptVersion = modService.GetSelectedSptVersion(name);
            return Results.Json(new { selectedSptVersion = sptVersion });
        });

        // Update SPT version for list
        app.MapPost("/api/mod_list/{name}/spt_version", async (string name, ModService modService, HttpContext context) =>
        {
            var body = await context.Request.ReadFromJsonAsync<Dictionary<string, string>>();
            if (body == null || !body.TryGetValue("sptVersion", out var sptVersion) || string.IsNullOrWhiteSpace(sptVersion))
                return Results.BadRequest(new { error = "Missing or invalid SPT version" });

            var success = modService.UpdateSelectedSptVersion(name, sptVersion);
            if (!success)
                return Results.BadRequest(new { error = "Error updating SPT version" });

            return Results.Ok(new { message = $"SPT version updated to '{sptVersion}'" });
        });

        return app;
    }

    // ========== MOD MANAGEMENT ==========
    public static IEndpointRouteBuilder MapModRoutes(this IEndpointRouteBuilder app)
    {
        // Add mod to list
        app.MapPost("/api/mod_list/{listName}/add_mod", async (string listName, ModService modService, HttpContext context) =>
        {
            var body = await context.Request.ReadFromJsonAsync<Dictionary<string, string>>();
            if (body == null || !body.TryGetValue("url", out var url) || string.IsNullOrWhiteSpace(url))
                return Results.BadRequest(new { error = "Missing or invalid URL" });

            var (success, message, mod) = await modService.AddModToListAsync(listName, url);
            if (!success)
                return Results.BadRequest(new { error = message });

            return Results.Ok(new { message, mod });
        });

        // Remove mod from list with optional file deletion
        app.MapDelete("/api/mod_list/{listName}/remove_mod/{id}", (string listName, int id, ModService modService, HttpContext context) =>
        {
            var deleteFiles = context.Request.Query["deleteFiles"].FirstOrDefault()?.ToLower() == "true";
            
            var list = modService.LoadList(listName);
            var mod = list.Mods.FirstOrDefault(m => m.Id == id);
            if (mod == null)
                return Results.NotFound(new { error = "Mod not found" });

            var removed = modService.RemoveModFromList(listName, id);
            if (!removed)
                return Results.BadRequest(new { error = "Error removing mod from list" });

            bool filesRemoved = false;
            if (deleteFiles)
            {
                filesRemoved = modService.RemoveModFromInstallation(id, mod.Name);
            }

            return Results.Ok(new { 
                message = $"Mod removed{(deleteFiles && filesRemoved ? " and installation files deleted" : "")}", 
                mod,
                filesRemoved = deleteFiles && filesRemoved
            });
        });

        // Check if mod is installed
        app.MapGet("/api/mod_list/{listName}/is_installed/{modId}", (string listName, int modId, ModService modService) =>
        {
            var list = modService.LoadList(listName);
            var mod = list.Mods.FirstOrDefault(m => m.Id == modId);
            
            if (mod == null)
                return Results.Json(new { installed = false });

            var isInstalled = modService.IsModInstalled(modId, mod.Name);
            return Results.Json(new { installed = isInstalled });
        });

        // Download and extract a mod
        app.MapPost("/api/mod_list/{listName}/download_mod/{modId}", async (string listName, int modId, ModService modService) =>
        {
            try
            {
                var result = await modService.DownloadAndExtractModAsync(listName, modId);
                if (!result.Success)
                    return Results.BadRequest(new { error = result.Message });

                return Results.Ok(new { message = result.Message });
            }
            catch (Exception ex)
            {
                return Results.BadRequest(new { error = $"Download error: {ex.Message}" });
            }
        });

        // Download and extract all mods in list
        app.MapPost("/api/mod_list/{listName}/download_all", async (string listName, ModService modService) =>
        {
            try
            {
                var results = await modService.DownloadAllModsAsync(listName);
                return Results.Json(results);
            }
            catch (Exception ex)
            {
                return Results.BadRequest(new { error = $"Download error: {ex.Message}" });
            }
        });

        // Check updates for all mods in list
        app.MapGet("/api/mod_list/{name}/check_updates", async (string name, ModService modService) =>
        {
            var updatedMods = await modService.CheckModUpdatesAsync(name);
            return Results.Json(updatedMods);
        });

        // Check update for specific mod
        app.MapGet("/api/mod_list/{listName}/check_update/{modId}", async (string listName, int modId, ModService modService) =>
        {
            var updatedMod = await modService.CheckSingleModUpdateAsync(listName, modId);
            if (updatedMod == null)
                return Results.NotFound(new { message = "No update available" });
            
            return Results.Json(updatedMod);
        });

        // Force update and download a mod
        app.MapPost("/api/mod_list/{listName}/force_update/{modId}", async (string listName, int modId, ModService modService) =>
        {
            try
            {
                // 1. Update mod data
                var updatedMod = await modService.CheckSingleModUpdateAsync(listName, modId);
                
                if (updatedMod == null)
                {
                    // If update fails, use current data
                    var list = modService.LoadList(listName);
                    updatedMod = list.Mods.FirstOrDefault(m => m.Id == modId);
                    if (updatedMod == null)
                        return Results.NotFound(new { message = "Mod not found" });
                }

                // 2. FORCE download
                var result = await modService.DownloadAndExtractModAsync(listName, modId, true);
                if (!result.Success)
                    return Results.BadRequest(new { error = result.Message });

                return Results.Ok(new { 
                    message = $"Mod '{updatedMod.Name}' updated and downloaded successfully!",
                    mod = updatedMod
                });
            }
            catch (Exception ex)
            {
                return Results.BadRequest(new { error = $"Update error: {ex.Message}" });
            }
        });

        return app;
    }

    // ========== SPT MANAGEMENT ==========
    public static IEndpointRouteBuilder MapSptRoutes(this IEndpointRouteBuilder app)
    {
        // Get available SPT versions
        app.MapGet("/api/spt_versions", async (ModService modService) =>
        {
            var versions = await modService.GetSptVersionsAsync();
            return Results.Json(versions);
        });

        // Check SPT update
        app.MapGet("/api/spt/check-update", async (ModService modService) =>
        {
            var updateInfo = await modService.CheckSptUpdateAsync();
            return Results.Json(updateInfo);
        });

        // Download and install SPT update
        app.MapPost("/api/spt/update", async (ModService modService, HttpContext context) =>
        {
            try
            {
                var body = await context.Request.ReadFromJsonAsync<Dictionary<string, string>>();
                
                if (body == null || !body.TryGetValue("downloadUrl", out var downloadUrl) || string.IsNullOrWhiteSpace(downloadUrl))
                {
                    return Results.BadRequest(new { error = "Download URL missing" });
                }

                var success = await modService.DownloadAndUpdateSptAsync(downloadUrl);
                
                if (success)
                {
                    return Results.Ok(new { message = "SPT updated successfully! Server will restart automatically." });
                }
                else
                {
                    return Results.BadRequest(new { error = "Error updating SPT" });
                }
            }
            catch (Exception ex)
            {
                return Results.BadRequest(new { error = $"Error: {ex.Message}" });
            }
        });

        return app;
    }

    // ========== FIKA MANAGEMENT ==========
    public static IEndpointRouteBuilder MapFikaRoutes(this IEndpointRouteBuilder app)
    {
        // Check Fika update
        app.MapGet("/api/fika/check-update", async (ModService modService) =>
        {
            var updateInfo = await modService.CheckFikaUpdateAsync();
            return Results.Json(updateInfo);
        });

        // Download and install Fika update
        app.MapPost("/api/fika/update", async (ModService modService, HttpContext context) =>
        {
            try
            {
                var body = await context.Request.ReadFromJsonAsync<Dictionary<string, string>>();
                
                if (body == null || !body.TryGetValue("downloadUrl", out var downloadUrl) || string.IsNullOrWhiteSpace(downloadUrl))
                {
                    return Results.BadRequest(new { error = "Download URL missing" });
                }

                var success = await modService.DownloadAndUpdateFikaAsync(downloadUrl);
                
                if (success)
                {
                    return Results.Ok(new { message = "Fika updated successfully! Server will restart automatically." });
                }
                else
                {
                    return Results.BadRequest(new { error = "Error updating Fika" });
                }
            }
            catch (Exception ex)
            {
                return Results.BadRequest(new { error = $"Error: {ex.Message}" });
            }
        });

        return app;
    }

    // ========== SERVER STATUS ==========
    public static IEndpointRouteBuilder MapServerStatusRoutes(this IEndpointRouteBuilder app)
    {
        // Get server status
        app.MapGet("/api/server/status", async (ModService modService) =>
        {
            try
            {
                var status = await modService.GetServerStatusAsync();
                return Results.Json(status);
            }
            catch (Exception ex)
            {
                return Results.Json(
                    new { error = $"Error getting server status: {ex.Message}" },
                    statusCode: 500
                );
            }
        });

        return app;
    }
}