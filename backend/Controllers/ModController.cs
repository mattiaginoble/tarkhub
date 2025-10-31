using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using ForgeModApi.Services;
using System;
using System.Linq;
using System.Threading.Tasks;

namespace ForgeModApi.Controllers
{
    [ApiController]
    [Route("api")]
    public class ModController : ControllerBase
    {
        private readonly IModService _modService;
        private readonly ILogger<ModController> _logger;

        public ModController(IModService modService, ILogger<ModController> logger)
        {
            _modService = modService;
            _logger = logger;
        }

        [HttpGet("spt_versions")]
        public async Task<IActionResult> GetSptVersions()
        {
            try
            {
                var versions = await _modService.GetSptVersionsAsync();
                if (versions == null || !versions.Any())
                {
                    return StatusCode(503, "Service temporarily unavailable");
                }
                return Ok(versions);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting SPT versions");
                return StatusCode(503, "Service temporarily unavailable");
            }
        }
        
        [HttpGet("mod/{modId}")]
        public async Task<IActionResult> GetMod(string modId)
        {
            try
            {
                var mod = await _modService.FetchModDataAsync(modId);
                if (mod == null)
                {
                    return NotFound($"Mod {modId} not found");
                }
                return Ok(mod);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting mod {ModId}", modId);
                return StatusCode(503, "Service temporarily unavailable");
            }
        }

        [HttpGet("check_updates")]
        public async Task<IActionResult> CheckUpdates()
        {
            try
            {
                var currentSptVersion = _modService.GetCurrentSptVersion();
                var availableVersions = await _modService.GetSptVersionsAsync();
                
                return Ok(new { 
                    currentVersion = currentSptVersion,
                    availableUpdates = availableVersions
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error checking updates");
                return StatusCode(503, "Service temporarily unavailable");
            }
        }
    }
}