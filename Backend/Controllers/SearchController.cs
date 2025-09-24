using Microsoft.AspNetCore.Mvc;
using Backend.Models;

namespace Backend.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SearchController : ControllerBase
{
    [HttpGet]
    public IActionResult Search([FromQuery] string projectID, [FromQuery] string keyword)
    {
        if (string.IsNullOrWhiteSpace(projectID))
            return BadRequest(new { error = "Missing projectID." });
        if (string.IsNullOrWhiteSpace(keyword))
            return BadRequest(new { error = "Missing search keyword." });

        if (!UploadController.Projects.TryGetValue(projectID, out var files))
            return NotFound(new { error = "Invalid projectID." });

        var results = new List<FunctionMetadata>();
        foreach (var file in files)
        {
            results.AddRange(file.Value
                .Where(fn => fn.Name.Contains(keyword, StringComparison.OrdinalIgnoreCase)
                          || fn.Code.Contains(keyword, StringComparison.OrdinalIgnoreCase)));
        }
        return Ok(results);
    }
}